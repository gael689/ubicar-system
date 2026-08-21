/**
 * Llegar al resumen no puede guardar la reserva.
 *
 * **El bug.** Los dos botones del pie del wizard vivían en la misma posición
 * del JSX, uno u otro según el paso:
 *
 *     {paso < 6 ? <button type="button" onClick={siguientePaso}>Siguiente</button>
 *               : <button type="submit" form="reserva-form">Crear reserva</button>}
 *
 * Al apretar "Siguiente" en el paso 5, React actualiza el estado de forma
 * sincrónica —un click es un evento discreto— y como los dos son `<button>` en
 * la misma posición, **reusa el nodo del DOM**: en vez de reemplazarlo le muta
 * `type="button"` por `type="submit"`. Recién entonces el navegador ejecuta la
 * acción por defecto del click, sobre un botón que ahora es de submit. El form
 * se mandaba solo.
 *
 * Y el guard de `handleSubmit` no lo ataja, porque justamente comprueba
 * `paso < 6` y para ese momento el paso ya es 6.
 *
 * Se veía como "el resumen se cierra apenas aparece". En realidad la reserva se
 * creaba entera sin que nadie la mirara, que era el único propósito del paso 6.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createReserva = vi.fn(async () => ({ id: 1 }));

vi.mock('@/hooks/useReservas', () => ({
  useReservas: () => ({ createReserva, updateReserva: vi.fn(), loading: false, error: null }),
  descargarPdfReserva: vi.fn(),
}));
vi.mock('@/hooks/useVehiculos', () => ({
  useVehiculos: () => ({ data: { data: [] } }),
}));
vi.mock('@/hooks/useClientes', () => ({
  useClientes: () => ({ data: { data: [{ id: 1, nombre_completo: 'Juan Pérez', activo: true }] } }),
  useConductores: () => ({ data: [] }),
}));
vi.mock('@/hooks/useAdicionales', () => ({ useAdicionales: () => ({ data: [] }) }));
vi.mock('@/hooks/usePrecios', () => ({ useCalcularPrecio: () => ({ data: null }) }));
vi.mock('@/hooks/useConfiguracion', () => ({ useConfiguracion: () => ({ data: [] }) }));
vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({ data: [{ id: 1, nombre: 'Compacto', orden: 1, franquicia_base: 1500000 }] }),
}));
vi.mock('@/hooks/useDisponibilidad', () => ({
  useDisponibilidadInterna: () => ({ data: null, isLoading: false }),
  useVehiculosLibres: () => ({ data: null }),
}));
vi.mock('@/hooks/useSemaforo', () => ({ usePreCheckoutPrevio: () => ({ data: null }) }));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<any>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/lib/api', () => ({
  default: { post: vi.fn(), get: vi.fn() }, api: { post: vi.fn(), get: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReservaModal } from './ReservaModal';

beforeEach(() => {
  localStorage.clear();
  createReserva.mockClear();
  cleanup();
});

const siguiente = () => screen.getByRole('button', { name: /Siguiente/ });

/** Los cinco pasos previos, con lo mínimo de cada uno. */
async function llegarAlPaso5(user: ReturnType<typeof userEvent.setup>) {
  // 1 — un cliente que ya existe: el alta rápida dispara un `api.post` que
  // acá está mockeado y haría fallar el guardado por un motivo que no es el
  // que se está probando.
  await user.click(screen.getByPlaceholderText(/Buscar por nombre/i));
  await user.click(await screen.findByText('Juan Pérez'));
  await user.click(siguiente());
  // 2 — las fechas vienen con default; faltan los lugares.
  await user.click(screen.getAllByRole('button', { name: 'Paraguay 241' })[0]);
  await user.click(screen.getAllByRole('button', { name: 'Alsina 350' })[1]);
  await user.click(siguiente());
  // 3 — sin auto, sólo la categoría.
  await user.click(screen.getByRole('button', { name: /Compacto/ }));
  await user.click(siguiente());
  // 4 — el precio.
  const total = screen.getByPlaceholderText('Ej: 140000');
  await user.clear(total);
  await user.type(total, '140000');
  await user.click(siguiente());
  // 5 — cuándo se cobra.
  await user.click(screen.getByRole('button', { name: /Al entregar el auto/ }));
}

describe('El paso 6 se puede mirar', () => {
  it('llegar al resumen no crea la reserva ni cierra el modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<ReservaModal onClose={onClose} onSuccess={onSuccess} />);

    await llegarAlPaso5(user);
    await user.click(siguiente());

    // El resumen tiene que estar en pantalla...
    expect(screen.getByText(/Paso 6 de 6/)).toBeTruthy();
    // ...y nada más tiene que haber pasado.
    expect(createReserva).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('recién el botón de guardar crea la reserva', async () => {
    const user = userEvent.setup();
    render(<ReservaModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    await llegarAlPaso5(user);
    await user.click(siguiente());
    await user.click(screen.getByRole('button', { name: /Crear reserva/ }));

    expect(createReserva).toHaveBeenCalled();
  });
});
