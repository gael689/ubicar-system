import { describe, it, expect } from 'vitest';
import { cantidadDeSemanas, fechasDePagoUber, totalUber } from './uber';

describe('contrato de Uber', () => {
  it('cuenta las semanas enteras o empezadas', () => {
    expect(cantidadDeSemanas(7)).toBe(1);
    expect(cantidadDeSemanas(8)).toBe(2);
    expect(cantidadDeSemanas(28)).toBe(4);
    expect(cantidadDeSemanas(0)).toBe(1);
  });

  it('el total de semanas completas es exacto y el resto se prorratea', () => {
    expect(totalUber(200000, 28)).toBe(800000);
    expect(totalUber(210000, 10)).toBe(300000);
  });

  it('propone una fecha de pago por semana desde el retiro', () => {
    expect(fechasDePagoUber('2026-10-05', 21)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(fechasDePagoUber('2026-10-28', 14)).toEqual(['2026-10-28', '2026-11-04']);
  });

  it('sin fecha de retiro no propone nada', () => {
    expect(fechasDePagoUber('', 14)).toEqual([]);
  });
});
