/**
 * El aviso de que el auto se pisa o vuelve justo. Un auto que vuelve a las 9:00
 * se puede entregar a las 10:00, y uno pisado de verdad se puede cargar igual:
 * el sistema avisa, no bloquea (06/10/2026). Sólo el taller impide guardar.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AvisosDeSolape, SolapeWarning } from '@/types';
import { AvisoSolape, hayAvisos, textoAvisoSolape, textoVuelve } from './AvisoSolape';

afterEach(cleanup);

const ocupada: SolapeWarning = {
  tipo: 'solape_con_ocupado', reserva_id: 12, estado: 'activa', cliente: 'Juan Pérez',
  fecha_inicio: '2026-10-05', hora_inicio: '10:00', fecha_fin: '2026-10-06', hora_fin: '10:00',
};
const sinNada: AvisosDeSolape = {
  solapes: [], bloqueo: null, vuelve_a: null, minutos_para_prepararlo: null,
};

describe('textoAvisoSolape', () => {
  it('dice con qué reserva se pisa y cuándo', () => {
    expect(textoAvisoSolape(ocupada))
      .toBe('Se pisa con la reserva #12 de Juan Pérez (activa), del 05/10 10:00 al 06/10 10:00.');
  });

  it('una pendiente se dice como pendiente', () => {
    expect(textoAvisoSolape({
      tipo: 'solape_con_pendiente', reserva_id: 7, estado: 'pendiente', cliente: 'Ana Gómez',
      fecha_inicio: '2026-10-05', hora_inicio: '10:00', fecha_fin: '2026-10-06', hora_fin: '10:00',
    })).toBe('Hay una reserva pendiente (#7, Ana Gómez) del 05/10 10:00 al 06/10 10:00.');
  });
});

describe('textoVuelve', () => {
  it('una hora justa', () => {
    expect(textoVuelve('09:00', 60)).toBe('Vuelve a las 09:00: queda 1 h para prepararlo.');
  });
  it('horas y minutos', () => {
    expect(textoVuelve('07:50', 70)).toBe('Vuelve a las 07:50: quedan 1 h 10 min para prepararlo.');
  });
  it('sólo minutos', () => {
    expect(textoVuelve('09:15', 45)).toBe('Vuelve a las 09:15: quedan 45 min para prepararlo.');
  });
  it('sin margen', () => {
    expect(textoVuelve('10:00', 0)).toBe('Vuelve a las 10:00: no queda tiempo para prepararlo.');
  });
});

describe('AvisoSolape', () => {
  it('no muestra nada si no hay nada que avisar', () => {
    const { container } = render(<AvisoSolape avisos={sinNada} />);
    expect(container.innerHTML).toBe('');
    expect(hayAvisos(sinNada)).toBe(false);
  });

  it('lista lo que se pisa y dice que se puede cargar igual', () => {
    render(<AvisoSolape avisos={{ ...sinNada, solapes: [ocupada] }} />);
    expect(screen.getByText(/Podés cargarla igual/)).toBeTruthy();
    expect(screen.getByText(/Se pisa con la reserva #12/)).toBeTruthy();
  });

  it('avisa cuando el auto vuelve justo antes', () => {
    render(<AvisoSolape avisos={{ ...sinNada, vuelve_a: '09:00', minutos_para_prepararlo: 60 }} />);
    expect(screen.getByText('Vuelve a las 09:00: queda 1 h para prepararlo.')).toBeTruthy();
  });

  it('el taller se muestra aparte, en rojo', () => {
    render(<AvisoSolape avisos={{
      ...sinNada,
      bloqueo: { motivo: 'Mantenimiento', fecha_desde: '2026-10-06', fecha_hasta: '2026-10-07' },
    }} />);
    expect(screen.getByText(/Este auto no está disponible \(Mantenimiento\) del 06\/10 al 07\/10/)).toBeTruthy();
  });
});
