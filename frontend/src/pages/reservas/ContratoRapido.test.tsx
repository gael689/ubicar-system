/**
 * El contrato rápido: el lugar, el motivo de un precio menor, y la respuesta
 * que no llega.
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
// El selector de conductores tiene sus propias queries; acá alcanza con un
// botón que elige al conductor 9, para ver que la elección viaja en la reserva.
vi.mock('@/components/clientes/SelectorConductores', () => ({
  SelectorConductores: ({ onChange }: { onChange: (ids: number[]) => void }) => (
    <button type="button" onClick={() => onChange([9])}>elegir conductor 9</button>
  ),
}));
vi.mock('@/lib/api', () => ({ default: { post: vi.fn(), get: vi.fn() }, api: { post: vi.fn(), get: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// Lo que se pisa, antes de guardar: cada test decide qué responde.
const avisosDeSolape = vi.fn();
vi.mock('@/hooks/useAvisosDeSolape', () => ({ useAvisosDeSolape: () => ({ data: avisosDeSolape() }) }));

import api from '@/lib/api';
import { ContratoRapidoModal } from './ContratoRapidoModal';

/** Lo que devuelve axios cuando el pedido salió y nunca volvió nada. */
const sinRespuesta = () => new AxiosError('Network Error', 'ERR_NETWORK');

beforeEach(() => {
  cleanup();
  createReserva.mockReset();
  listReservas.mockReset();
  avisosDeSolape.mockReset();
  avisosDeSolape.mockReturnValue(undefined);
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
  // Plan 27/09 (txt 4): ya no hay botón "Otro". El campo de texto está siempre
  // a la vista, los botones lo completan, y cualquier otra dirección se
  // escribe directo.
  it('una dirección escrita a mano es lo que viaja en la reserva', async () => {
    const user = userEvent.setup();
    createReserva.mockResolvedValue({ reserva: { id: 41 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    expect(screen.queryByRole('button', { name: 'Otro' })).toBeNull();
    const campo = screen.getByPlaceholderText(/O escribí otra dirección/);
    await user.clear(campo);
    await user.type(campo, 'Villa Bordeu, ruta 33 km 4');
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    await waitFor(() => expect(createReserva).toHaveBeenCalled());
    const payload = createReserva.mock.calls[0][0];
    expect(payload.lugar_entrega).toBe('Villa Bordeu, ruta 33 km 4');
    expect(payload.lugar_devolucion).toBe('Villa Bordeu, ruta 33 km 4');
  });

  it('los botones completan el campo', async () => {
    const user = userEvent.setup();
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Alsina 350' }));
    expect((screen.getByPlaceholderText(/O escribí otra dirección/) as HTMLInputElement).value)
      .toBe('Alsina 350');
  });

  it('el campo vacío no deja crear: el contrato tiene que decir dónde', async () => {
    const user = userEvent.setup();
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.clear(screen.getByPlaceholderText(/O escribí otra dirección/));
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    expect(await screen.findByText(/Escribí el lugar de retiro/)).toBeTruthy();
    expect(createReserva).not.toHaveBeenCalled();
  });

  it('la devolución en otro lugar viaja aparte (plan 27/09, A4)', async () => {
    const user = userEvent.setup();
    createReserva.mockResolvedValue({ reserva: { id: 43 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByLabelText(/Se devuelve en otro lugar/));
    await user.click(screen.getByRole('button', { name: 'Devolución en Alsina 350' }));
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    await waitFor(() => expect(createReserva).toHaveBeenCalled());
    const payload = createReserva.mock.calls[0][0];
    expect(payload.lugar_entrega).toBe('Paraguay 241');
    expect(payload.lugar_devolucion).toBe('Alsina 350');
  });

  it('los conductores elegidos viajan en la reserva', async () => {
    const user = userEvent.setup();
    createReserva.mockResolvedValue({ reserva: { id: 44 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: 'elegir conductor 9' }));
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    await waitFor(() => expect(createReserva).toHaveBeenCalled());
    expect(createReserva.mock.calls[0][0].conductor_ids).toEqual([9]);
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

describe('El motivo de un precio menor', () => {
  function descuentoSinMotivo() {
    const err = new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST');
    err.response = {
      status: 422, statusText: 'Unprocessable', headers: {}, config: {} as never,
      data: { detail: '[descuento_sin_motivo] El precio es menor al de lista: indicá el motivo.' },
    };
    return err;
  }

  it('si el backend lo pide, aparece el campo y viaja en el reintento', async () => {
    // Antes el contrato rápido no tenía dónde escribirlo: bajar el precio
    // terminaba en un rechazo sin salida.
    const user = userEvent.setup();
    createReserva
      .mockRejectedValueOnce(descuentoSinMotivo())
      .mockResolvedValueOnce({ reserva: { id: 43 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    // El mensaje, sin el código entre corchetes.
    expect(await screen.findByText('El precio es menor al de lista: indicá el motivo.')).toBeTruthy();
    const motivo = screen.getByPlaceholderText(/Motivo del precio menor/);
    await user.type(motivo, 'Cliente frecuente');
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));

    await waitFor(() => expect(createReserva).toHaveBeenCalledTimes(2));
    expect(createReserva.mock.calls[1][0].descuento_motivo).toBe('Cliente frecuente');
  });
});

describe('Guardas del botón', () => {
  it('el motivo pedido por el servidor se retira si cambia el precio', async () => {
    const user = userEvent.setup();
    const err = new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST');
    err.response = {
      status: 422, statusText: 'Unprocessable', headers: {}, config: {} as never,
      data: { detail: '[descuento_sin_motivo] El precio es menor al de lista: indicá el motivo.' },
    };
    createReserva.mockRejectedValueOnce(err);
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);
    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: /Crear y generar contrato/ }));
    expect(await screen.findByPlaceholderText(/Motivo del precio menor/)).toBeTruthy();

    const precio = screen.getByPlaceholderText('140.000');
    await user.clear(precio);
    await user.type(precio, '200000');
    expect(screen.queryByPlaceholderText(/Motivo del precio menor/)).toBeNull();
  });

  it('dos clics rápidos con un cliente nuevo lo dan de alta una sola vez', async () => {
    const user = userEvent.setup();
    let soltarAlta: (v: unknown) => void = () => {};
    const post = vi.mocked(api.post);
    post.mockReset();
    post.mockImplementation(() => new Promise(r => { soltarAlta = r; }) as never);
    createReserva.mockResolvedValue({ reserva: { id: 50 }, warnings: [] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Buscar por nombre/i), 'Carla Nueva');
    await user.selectOptions(screen.getAllByRole('combobox')[0], '7');
    const precio = screen.getByPlaceholderText('140.000');
    await user.clear(precio);
    await user.type(precio, '140000');

    const boton = screen.getByRole('button', { name: /Crear y generar contrato/ });
    await user.click(boton);
    await user.click(boton);
    soltarAlta({ data: { data: { id: 99 } } });

    await waitFor(() => expect(createReserva).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(1);
    expect(createReserva.mock.calls[0][0].cliente_id).toBe(99);
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


describe('Un auto que se pisa avisa y deja seguir', () => {
  // 06/10/2026: un auto volvía a las 9:00, querían el contrato rápido para las
  // 10:00 y el sistema no los dejaba. Ahora avisa, y sólo el taller frena.
  const ocupada = {
    tipo: 'solape_con_ocupado', reserva_id: 12, estado: 'activa', cliente: 'Ana Gómez',
    fecha_inicio: '2026-10-05', hora_inicio: '10:00', fecha_fin: '2026-10-06', hora_fin: '10:00',
  };

  it('muestra con qué se pisa y el botón dice "Crear igual", habilitado', async () => {
    const user = userEvent.setup();
    avisosDeSolape.mockReturnValue({
      solapes: [ocupada], bloqueo: null, vuelve_a: null, minutos_para_prepararlo: null,
    });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);
    await cargarLoMinimo(user);

    expect(screen.getByText(/Se pisa con la reserva #12 de Ana Gómez/)).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Crear igual' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('crea igual, y después del alta lo vuelve a decir', async () => {
    const user = userEvent.setup();
    avisosDeSolape.mockReturnValue({
      solapes: [ocupada], bloqueo: null, vuelve_a: null, minutos_para_prepararlo: null,
    });
    createReserva.mockResolvedValue({ reserva: { id: 50 }, warnings: [ocupada] });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);
    await cargarLoMinimo(user);
    await user.click(screen.getByRole('button', { name: 'Crear igual' }));

    expect(await screen.findByText('panel del contrato 50')).toBeTruthy();
    const { toast } = await import('sonner');
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Se pisa con la reserva #12/));
  });

  it('sin nada que avisar, el botón es el de siempre', async () => {
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Crear y generar contrato/ })).toBeTruthy();
  });

  it('un auto en el taller no se puede crear: es lo único que sigue frenando', async () => {
    const user = userEvent.setup();
    avisosDeSolape.mockReturnValue({
      solapes: [], vuelve_a: null, minutos_para_prepararlo: null,
      bloqueo: { motivo: 'Mantenimiento', fecha_desde: '2026-10-06', fecha_hasta: '2026-10-07' },
    });
    render(<ContratoRapidoModal onClose={vi.fn()} onCreada={vi.fn()} />);
    await cargarLoMinimo(user);

    expect(screen.getByText(/Este auto no está disponible \(Mantenimiento\)/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Crear y generar contrato/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
