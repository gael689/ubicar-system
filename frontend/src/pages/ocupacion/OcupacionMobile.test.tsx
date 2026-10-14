/**
 * La vista simple del teléfono (14/10): el mes, y el día partido en Salen,
 * Vuelven y En la calle. Tocar una reserva abre su ficha.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcupacionMobile } from './OcupacionMobile';
import type { EventoOcupacion, VehiculoOcupacion } from '@/types';

const vehiculos = [
  { id: 1, patente: 'AA111AA', marca: 'Fiat', modelo: 'Cronos' },
  { id: 2, patente: 'BB222BB', marca: 'VW', modelo: 'Amarok' },
  { id: 3, patente: 'CC333CC', marca: 'Toyota', modelo: 'Hilux' },
] as unknown as VehiculoOcupacion[];

const ev = (p: Partial<EventoOcupacion>): EventoOcupacion => ({
  id: 1, vehiculo_id: 1, tipo: 'reserva', estado: 'confirmada',
  fecha_inicio: '2026-10-14', hora_inicio: '09:00:00',
  fecha_fin: '2026-10-20', hora_fin: '09:00:00',
  cliente_nombre: 'Ana', tiene_alquiler: true, ...p,
});

const eventos = [
  ev({ id: 1, cliente_nombre: 'Sale Hoy' }),
  ev({ id: 2, vehiculo_id: 2, fecha_inicio: '2026-10-10', fecha_fin: '2026-10-14', hora_fin: '18:00:00', estado: 'activa', cliente_nombre: 'Vuelve Hoy' }),
  ev({ id: 3, vehiculo_id: 3, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-30', estado: 'activa', cliente_nombre: 'En Curso' }),
];

function renderizar(extra: Partial<React.ComponentProps<typeof OcupacionMobile>> = {}) {
  const props = {
    eventos, vehiculos, sinAsignar: 0, loading: false,
    fecha: new Date(2026, 9, 14),
    onFecha: vi.fn(), onReserva: vi.fn(), onCheckoutPrompt: vi.fn(),
    onNuevaReserva: vi.fn(), onNuevoContrato: vi.fn(), onVerSinAsignar: vi.fn(), onGrilla: vi.fn(),
    ...extra,
  };
  render(<OcupacionMobile {...props} />);
  return props;
}

describe('Ocupación en el teléfono, vista simple', () => {
  it('parte el día en Salen y Vuelven, y pliega lo que está en la calle', () => {
    renderizar();
    expect(screen.getByText('Sale Hoy')).toBeInTheDocument();
    expect(screen.getByText('Vuelve Hoy')).toBeInTheDocument();
    expect(screen.queryByText('En Curso')).not.toBeInTheDocument();
    expect(screen.getByText(/En la calle · 1/)).toBeInTheDocument();
    expect(screen.getByText('3 de 3 autos ocupados')).toBeInTheDocument();
  });

  it('tocar una reserva abre su ficha', async () => {
    const props = renderizar();
    await userEvent.click(screen.getByText('Sale Hoy'));
    expect(props.onReserva).toHaveBeenCalledWith(1);
  });

  it('no muestra la leyenda ni los filtros; la grilla está a un toque', async () => {
    const props = renderizar();
    expect(screen.queryByText('Mostrador')).not.toBeInTheDocument();
    expect(screen.queryByText('Compacto')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Autos en fila' }));
    expect(props.onGrilla).toHaveBeenCalled();
  });

  it('avisa las reservas sin auto y abre la lista', async () => {
    const props = renderizar({ sinAsignar: 2 });
    await userEvent.click(screen.getByText('2 reservas sin auto asignado'));
    expect(props.onVerSinAsignar).toHaveBeenCalled();
  });

  it('el late check-in vuelve el día acordado, no el del fin facturado', () => {
    renderizar({
      eventos: [ev({ id: 9, fecha_inicio: '2026-10-05', fecha_fin: '2026-10-13', fecha_devolucion_acordada: '2026-10-14', hora_devolucion_acordada: '10:00:00', cliente_nombre: 'Tarde' })],
    });
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });
});
