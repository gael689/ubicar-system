/**
 * La caja de Franco: la compensación del mes se dice con nombres y montos.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const mut = { mutate: vi.fn(), isPending: false };
const mes = {
  mes: '2026-10-01',
  socios: [
    { id: 1, nombre: 'Franco Marchese', porcentaje: 50, usuario_id: 1 },
    { id: 2, nombre: 'Martín González', porcentaje: 50, usuario_id: 2 },
  ],
  medios: ['transferencia'],
  por_medio: { transferencia: { '1': 600000, '2': 400000 } },
  total_cobrado: 1000000, cobrado_por_socio: { '1': 600000, '2': 400000 }, sin_socio: 0,
  distribuible: 900000, parte_por_socio: { '1': 450000, '2': 450000 },
  compensacion: {
    total_cobrado: 1000000, corresponde: {}, saldo: {},
    transferencias: [{ de: 1, a: 2, de_nombre: 'Franco', a_nombre: 'Martín', monto: 100000 }],
  },
  gastos: { total: 50000, cantidad: 2 }, cobros: [], reparto: null,
};

vi.mock('@/hooks/useCajaSocios', () => ({
  exportarAlquileres: vi.fn(),
  useAlquileresDeCaja: () => ({ data: { items: [{
    reserva_id: 1, patente: 'AH482YF', cliente: 'Santiago Quiroga', retiro_fecha: '2026-10-01', retiro_hora: '07:00',
    devolucion_fecha: '2026-10-02', devolucion_hora: '08:00', dias: 1, precio_dia: 160000, facturado: 0, caja: 160000,
    total: 160000, tipo: 'alquiler', estado: 'confirmada', medios: ['transferencia'], cobrado: true,
    cobrado_monto: 160000, saldo: 0, fecha_cobro: '2026-10-01', cobro_socios: ['Martín'], cobro_sin_socio: false,
    repartido: false, distribuible: 160000,
  }], total: 1 }, isLoading: false }),
  useCambiarFacturado: () => mut,
  useACobrar: () => ({ data: { total_pendiente: 440000, cantidad: 1, por_medio: { transferencia: 440000 }, items: [] }, isLoading: false }),
  useMesDeCaja: () => ({ data: mes, isLoading: false }),
  useRepartirMes: () => mut,
  useAnularReparto: () => mut,
  useSocioDelPago: () => mut,
  useSocios: () => ({ data: [] }),
  useGuardarSocios: () => mut,
  usePropios: () => ({ data: { entra: 0, sale: 0, saldo: 0, items: [] }, isLoading: false }),
  useAnotarPropio: () => mut,
  useAnularPropio: () => mut,
}));

import { CajaSociosPage } from './CajaSociosPage';

describe('Caja', () => {
  it('muestra la fila del alquiler como la planilla', () => {
    render(<CajaSociosPage />);
    expect(screen.getByText('AH482YF')).toBeTruthy();
    expect(screen.getByText('Santiago Quiroga')).toBeTruthy();
    expect(screen.getAllByText('Distribuible').length).toBeGreaterThan(1); // tarjeta y columna
  });

  it('el mes dice quién le pasa a quién', async () => {
    const user = userEvent.setup();
    render(<CajaSociosPage />);
    await user.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByText('Franco', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Martín', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Registrar reparto/ })).toBeTruthy();
  });

  it('lo propio avisa que es privado', async () => {
    const user = userEvent.setup();
    render(<CajaSociosPage />);
    await user.click(screen.getByRole('button', { name: /Propio/ }));
    expect(screen.getByText(/nadie más la ve/)).toBeTruthy();
  });
});
