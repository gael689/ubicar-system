/**
 * La devolución y el parte de daños.
 *
 * Reproduce el reporte del mostrador (10/09) sobre el modal real: con el KM
 * cargado y sin saldo, tocar "Registrar daño" **cerraba el alquiler** —
 * `checkin` se llamaba una vez al abrir el formulario del daño y otra al
 * guardarlo. Ver `DaniosTab.test.tsx` para el detalle.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkin = vi.fn();
const crearDanio = vi.fn();
// Referencias estables: el modal las usa como dependencias de efectos, y una
// función nueva por render lo mete en un loop.
const previewExcedente = vi.fn();
const getAlquiler = vi.fn();
const mut = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
const pagos = { data: [] };
let daniosEnServidor: any[] = [];

vi.mock('@/hooks/useAlquileres', () => ({
  useAlquileres: () => ({ checkin, previewExcedente, getAlquiler, loading: false, error: null }),
}));
vi.mock('@/hooks/useGastos', () => ({ useCreateGasto: () => mut }));
vi.mock('@/hooks/usePagos', () => ({ usePagosPendientes: () => pagos }));
vi.mock('@/hooks/useDanios', () => ({
  useDanios: () => ({ data: daniosEnServidor, isLoading: false }),
  useDaniosPreexistentes: () => ({ data: daniosEnServidor, isLoading: false }),
  useCrearDanio: () => ({ mutateAsync: crearDanio, isPending: false }),
  useActualizarDanio: () => mut, useImputarDanio: () => mut, useCobrarDanio: () => mut,
  useBonificarDanio: () => mut, useDarDeBajaDanio: () => mut,
  useSubirFotoDanio: () => mut, useEliminarFotoDanio: () => mut,
}));
vi.mock('@/lib/api', () => ({ default: {}, api: {}, resolveAssetUrl: (x: string) => x }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CheckinModal } from './CheckinModal';

const reserva: any = { id: 9, vehiculo_id: 7, hora_fin: '10:00:00', precio_total: '100', anticipo_monto: '100' };

function abrir(onSuccess = vi.fn()) {
  render(
    <CheckinModal
      alquilerId={5} vehiculoInfo="Fiat Cronos" clienteNombre="Juan" kmCheckout={1000}
      reserva={reserva} onClose={vi.fn()} onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

const inputKm = () =>
  screen.getAllByRole('spinbutton').find(i => (i as HTMLInputElement).min === '1000') as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  daniosEnServidor = [];
  checkin.mockReset().mockResolvedValue({});
  crearDanio.mockReset();
  previewExcedente.mockReset().mockResolvedValue({ dentro_de_gracia: true });
  getAlquiler.mockReset().mockResolvedValue({ checkout_km: 1000 });
});

describe('Registrar un daño no registra la devolución', () => {
  it('con el KM cargado y sin saldo: abrir, cargar y guardar un daño no llama a checkin', async () => {
    const user = userEvent.setup();
    crearDanio.mockResolvedValue({ data: { data: { id: 3, momento: 'checkin', alquiler_id: 5 } } });
    const onSuccess = abrir();

    await user.type(inputKm(), '1200');
    await user.click(screen.getByRole('button', { name: /Registrar daño/i }));
    await user.type(screen.getByPlaceholderText('Ej: Puerta trasera izq.'), 'Puerta');
    await user.click(screen.getByRole('button', { name: /Guardar daño/i }));

    await waitFor(() => expect(crearDanio).toHaveBeenCalledTimes(1));
    expect(checkin).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('el botón de la devolución sigue funcionando', async () => {
    const user = userEvent.setup();
    const onSuccess = abrir();
    await user.type(inputKm(), '1200');
    await user.click(screen.getByRole('button', { name: /Registrar la devolución/i }));
    await waitFor(() => expect(checkin).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('un daño cargado en esta devolución no aparece como "ya estaba"', () => {
    daniosEnServidor = [{
      id: 3, vehiculo_id: 7, alquiler_id: 5, momento: 'checkin', zona: 'Capó', tipo: 'rayon',
      severidad: 'leve', estado: 'detectado', responsable: 'sin_definir', fecha_deteccion: '2026-09-10',
      fotos: [], descripcion: null,
    }];
    abrir();
    expect(screen.queryByText(/no son responsabilidad de este cliente/i)).not.toBeInTheDocument();
    expect(screen.getByText('Capó')).toBeInTheDocument();
  });
});

describe('Lo cargado sobrevive a una recarga de la página', () => {
  it('si el navegador recarga (la cámara en Android), el KM y el combustible vuelven', async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(inputKm(), '1350');
    await user.click(screen.getByRole('button', { name: '½' }));

    document.body.innerHTML = '';
    abrir();
    expect(inputKm().value).toBe('1350');
    expect(screen.getByText(/Recuperamos lo que habías cargado/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Empezar de cero/i }));
    expect(inputKm().value).toBe('');
  });

  it('al registrar la devolución el borrador se borra', async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(inputKm(), '1200');
    await user.click(screen.getByRole('button', { name: /Registrar la devolución/i }));
    await waitFor(() => expect(checkin).toHaveBeenCalled());
    expect(localStorage.getItem('ubicar:checkin-borrador:5')).toBeNull();
  });
});
