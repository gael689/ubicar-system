/**
 * El resumen de Reportes: lo ingresado contra el mes anterior, lo que falta
 * cobrar y la ocupación.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => {
  const Nada = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Nada, AreaChart: Nada, BarChart: Nada, Area: Nada, Bar: Nada,
    CartesianGrid: Nada, XAxis: Nada, YAxis: Nada, Tooltip: Nada, Cell: Nada,
  };
});

const mesBase = {
  mes: '2026-10-01', socios: [
    { id: 1, nombre: 'Franco Marchese', porcentaje: 50, usuario_id: 1 },
    { id: 2, nombre: 'Martín González', porcentaje: 50, usuario_id: 2 },
  ],
  medios: [], por_medio: {}, cobrado_por_socio: {}, sin_socio: 0, cobros: [], reparto: null,
  parte_por_socio: { '1': 50000, '2': 50000 }, gastos: { total: 20000, cantidad: 1 }, compensacion: null,
};

vi.mock('@/hooks/useCajaSocios', () => ({
  // El mes actual (el primero que se pide) y el anterior.
  useMesDeCaja: (mes: string) => ({
    data: mes.endsWith('-10-01')
      ? { ...mesBase, total_cobrado: 150000, distribuible: 100000 }
      : { ...mesBase, total_cobrado: 100000, distribuible: 100000 },
    isLoading: false,
  }),
  useACobrar: () => ({ data: { total_pendiente: 300000, cantidad: 2, por_medio: {}, items: [
    { reserva_id: 1, cliente: 'A', patente: 'X', retiro_fecha: '', devolucion_fecha: '', total: 1, saldo: 100000, medio_previsto: 'x', dias_desde_devolucion: 3 },
    { reserva_id: 2, cliente: 'B', patente: 'Y', retiro_fecha: '', devolucion_fecha: '', total: 1, saldo: 200000, medio_previsto: 'x', dias_desde_devolucion: 40 },
  ] } }),
}));
vi.mock('@/hooks/useReportes', () => ({
  useReporteIngresos: () => ({ data: { anio: 2026, meses: [{ mes_label: 'Oct', ingresos: 150000, egresos: 20000, margen: 130000 }] } }),
  useReporteFlota: () => ({ data: [
    { vehiculo_id: 1, patente: 'AH482YF', marca: '', modelo: '', tipo: '', alquileres_count: 3, dias_alquilados: 20, ocupacion_porcentaje: 80, ingresos: 0, gastos: 0, margen: 0 },
    { vehiculo_id: 2, patente: 'AG902AQ', marca: '', modelo: '', tipo: '', alquileres_count: 1, dias_alquilados: 10, ocupacion_porcentaje: 40, ingresos: 0, gastos: 0, margen: 0 },
  ] }),
}));
vi.mock('@/lib/utils', async orig => ({ ...(await orig<typeof import('@/lib/utils')>()), hoyLocal: () => '2026-10-04' }));

import { TableroDeReportes } from './TableroDeReportes';

describe('Tablero de reportes', () => {
  it('muestra lo ingresado y cuánto subió contra el mes anterior', () => {
    render(<TableroDeReportes />);
    expect(screen.getByText('Ingresado')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy(); // 150.000 contra 100.000
  });

  it('muestra lo que falta cobrar y la cantidad de alquileres', () => {
    render(<TableroDeReportes />);
    expect(screen.getByText('Falta cobrar')).toBeTruthy();
    expect(screen.getByText('2 alquileres')).toBeTruthy();
  });

  it('calcula la ocupación promedio de la flota', () => {
    render(<TableroDeReportes />);
    expect(screen.getByText('60%')).toBeTruthy(); // (80 + 40) / 2
    expect(screen.getByText('2 autos con alquileres')).toBeTruthy();
  });

  it('muestra la parte de cada socio', () => {
    render(<TableroDeReportes />);
    expect(screen.getByText('Reparto entre socios')).toBeTruthy();
    expect(screen.getByText(/Franco/)).toBeTruthy();
  });
});
