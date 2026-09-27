/**
 * La regla del día extra por horario, del lado de la pantalla (A1).
 *
 * Tiene que dar lo mismo que `backend/app/domain/tarifas.py::dias_facturables`
 * — los mismos casos que `tests/domain/test_dias_facturables.py`. Si divergen,
 * la pantalla muestra una duración y el backend cobra otra.
 */
import { describe, it, expect } from 'vitest';
import { avisoDiaExtra, diasFacturables } from './dias';

describe('diasFacturables', () => {
  it('misma hora: los días de calendario', () => {
    expect(diasFacturables('2026-10-05', '10:00', '2026-10-07', '10:00')).toBe(2);
  });
  it('hasta 59 minutos después no suma', () => {
    expect(diasFacturables('2026-10-05', '10:00', '2026-10-07', '10:59')).toBe(2);
  });
  it('una hora después suma un día', () => {
    expect(diasFacturables('2026-10-05', '10:00', '2026-10-07', '11:00')).toBe(3);
  });
  it('devolver más temprano no descuenta', () => {
    expect(diasFacturables('2026-10-05', '10:00', '2026-10-07', '08:00')).toBe(2);
  });
  it('el mismo día es un día', () => {
    expect(diasFacturables('2026-10-05', '07:30', '2026-10-05', '18:40')).toBe(1);
  });
  it('devolución antes del retiro: cero', () => {
    expect(diasFacturables('2026-10-07', '10:00', '2026-10-05', '10:00')).toBe(0);
  });
  it('cruza el cambio de mes sin corrimientos', () => {
    expect(diasFacturables('2026-10-30', '10:00', '2026-11-02', '10:00')).toBe(3);
  });
});

describe('avisoDiaExtra', () => {
  it('dice cuánto se pasa y que se cobra un día más', () => {
    expect(avisoDiaExtra('2026-10-05', '10:00', '2026-10-07', '12:00'))
      .toBe('Devuelve 2 h después del horario de retiro: se cobra 1 día más.');
  });
  it('no dice nada dentro de la tolerancia ni el mismo día', () => {
    expect(avisoDiaExtra('2026-10-05', '10:00', '2026-10-07', '10:30')).toBeNull();
    expect(avisoDiaExtra('2026-10-05', '07:30', '2026-10-05', '18:40')).toBeNull();
  });
});
