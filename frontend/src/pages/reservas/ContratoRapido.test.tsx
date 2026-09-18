/**
 * El contrato rápido: el lugar "Otro", y la respuesta que no llega.
 *
 * Dos reportes del mostrador, del mismo día:
 *
 * > *"Cuando estoy en el contrato rápido no puedo poner 'otro' lugar de retiro
 * > y devolución como en nueva reserva."*
 *
 * > *"Hago el contrato rápido, me dice Sin conexión, pero cuando llego a la PC
 * > me aparece para terminar de editarlo."*
 *
 * El segundo no era la conexión: el pedido llegaba, la reserva se creaba, y lo
 * que se perdía era la respuesta. La pantalla afirmaba lo contrario de lo que
 * había pasado, y quien lo lee vuelve a cargar todo — que es como se terminan
 * teniendo dos reservas del mismo alquiler.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';

const createReserva = vi.fn();
const listReservas = vi.fn();

vi.mock('@/hooks/useReservas', () => ({
  useReservas: () => ({ createReserva, listReservas, loading: false, error: null }),
  descargarPdfReserva: vi.fn(),
}));
vi.mock('@/hooks/useVehiculos', () => ({
  useVehiculos: () => ({ data: { data: [{ id: 7, patente: 'AB123CD', marca: 'Fiat', modelo: 'Cronos', destino: 'flota' }] } }),
}));
vi.mock('@/hooks/useClientes', () => ({
  useClientes: () => ({ data: { data: [{ id: 3, nombre_completo: 'Juan Pérez', dni_cuit: '30111222' }] } }),
}));
vi.mock('@/hooks/useAdicionales', () => ({ useAdicionales: () => ({ data: [] }) }));
vi.mock('@/hooks/usePrecios', () => ({ useCalcularPrecio: () => ({ data: null }) }));
vi.mock('@/hooks/useConfiguracion', () => ({
  useConfiguracion: () => ({
    data: [{ clave: 'web.lugares_retiro', valor: 'Paraguay 241, Alsina 350' }],
  }),
}));
// El panel del contrato tiene su propio árbol de queries: acá sólo importa que
// aparezca, que es la señal de que la reserva quedó y el camino sigue.
vi.mock('@/components/alquileres/ContratoPanel', () => ({
  ContratoPanel: ({ reservaId }: { reservaId: number }) => <div>panel del contrato {reservaId}</div>,
}));
vi.mock('@/lib/api', () => ({ default: { post: vi.fn(), get: vi.fn() }, api: { post: vi.fn(), get: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContratoRapidoModal } from './ContratoRapidoModal';

/** Lo que devuelve axios cuando el pedido salió y nunca volvió nada. */
const sinRespuesta = () => new AxiosError('Network Error', 'ERR_NETWORK');

beforeEach(() => {
  cleanup();
  createReserva.mockReset();
  listReservas.mockReset();
});

/** Todo lo obligatorio menos el lugar, que es lo que cada test decide. */
async function cargarLoMinimo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/Buscar por nombre/i), 'Juan');
  await user.click(await screen.findByText('Juan Pérez'));
  // El primero es el auto; el segundo, la cobertura.
  await user.selectOptions(screen.getAllByRole('combobox')[0], '7');
  const precio = screen.getByPlaceholderText('140.000');
  await user.clear(precio);
  await user.type(precio, '140000');
}

describe('El lugar de retiro y devolución', () => {
  it('"Otro" abre un campo libre y es lo que viaja en la reserva', async () => {
    const user = userEvent.setup();
    createReserva.mockResolvedValue({ reserva: { id: 41 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: 'Otro' }));
    await user.type(
      screen.getByPlaceholderText('Dirección específica'),
      'Villa Bordeu, ruta 33 km 4',
    );
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    await waitFor(() => expect(createReserva).toHaveBeenCalled());
    const payload = createReserva.mock.calls[0][0];
    expect(payload.lugar_entrega).toBe('Villa Bordeu, ruta 33 km 4');
    expect(payload.lugar_devolucion).toBe('Villa Bordeu, ruta 33 km 4');
  });

  it('"Otro" vacío no deja crear: el contrato tiene que decir dónde', async () => {
    const user = userEvent.setup();
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: 'Otro' }));
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    expect(await screen.findByText(/Escribí el lugar de retiro/)).toBeTruthy();
    expect(createReserva).not.toHaveBeenCalled();
  });

  it('sin tocar nada sigue usando el primero de la lista', async () => {
    const user = userEvent.setup();
    createReserva.mockResolvedValue({ reserva: { id: 42 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    await waitFor(() => expect(createReserva).toHaveBeenCalled());
    expect(createReserva.mock.calls[0][0].lugar_entrega).toBe('Paraguay 241');
  });
});

describe('Cuando no llega la respuesta', () => {
  it('busca la reserva y, si está, sigue con el contrato', async () => {
    const user = userEvent.setup();
    createReserva.mockRejectedValue(sinRespuesta());
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    const hoy = (document.querySelector('input[type="date"]') as HTMLInputElement).value;
    const fin = (document.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value;
    listReservas.mockResolvedValue({
      data: [{ id: 77, estado: 'confirmada', fecha_inicio: hoy, fecha_fin: fin }],
      total: 1, page: 1, page_size: 20,
    });

    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    // No dice "sin conexión": dice que está, y muestra el panel del contrato.
    expect(await screen.findByText(/panel del contrato 77/)).toBeTruthy();
  });

  it('si no aparece, avisa sin afirmar que no se hizo', async () => {
    const user = userEvent.setup();
    createReserva.mockRejectedValue(sinRespuesta());
    listReservas.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20 });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    const aviso = await screen.findByText(/Puede que haya quedado hecho igual/);
    expect(aviso.textContent).toMatch(/no aparece/);
  });
});

/** El 409 tal como lo arma `_parse_conflicto` en el backend. */
function solapamiento() {
  const err = new AxiosError('Request failed with status code 409', 'ERR_BAD_REQUEST');
  err.response = {
    status: 409, statusText: 'Conflict', headers: {}, config: {} as never,
    data: { detail: {
      code: 'solapamiento',
      message: 'El vehículo tiene una reserva confirmada en ese rango',
      conflicto: { reserva_id: 55, estado: 'confirmada', fecha_inicio: '2026-09-18', fecha_fin: '2026-09-20' },
    } },
  };
  return err;
}

describe('Cuando el auto ya está ocupado (409)', () => {
  it('dice qué reserva lo ocupa, no "Request failed with status code 409"', async () => {
    const user = userEvent.setup();
    createReserva.mockRejectedValue(solapamiento());
    listReservas.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20 });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    const aviso = await screen.findByText(/reserva #55/);
    expect(aviso.textContent).toMatch(/18\/09\/2026 al 20\/09\/2026/);
    expect(screen.queryByText(/status code 409/)).toBeNull();
  });

  it('si lo que lo ocupa es esta misma reserva, sigue con el contrato', async () => {
    const user = userEvent.setup();
    createReserva.mockRejectedValue(solapamiento());
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    const hoy = (document.querySelector('input[type="date"]') as HTMLInputElement).value;
    const fin = (document.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value;
    listReservas.mockResolvedValue({
      data: [{ id: 55, estado: 'confirmada', fecha_inicio: hoy, fecha_fin: fin }],
      total: 1, page: 1, page_size: 20,
    });

    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    expect(await screen.findByText(/panel del contrato 55/)).toBeTruthy();
  });
});
