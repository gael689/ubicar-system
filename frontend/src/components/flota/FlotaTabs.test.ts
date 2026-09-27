import { describe, expect, it } from 'vitest';
import { pestanaFlotaActiva } from './FlotaTabs';

describe('pestaña activa de Flota', () => {
  it('marca una sola, la más específica', () => {
    expect(pestanaFlotaActiva('/flota')).toBe('/flota');
    expect(pestanaFlotaActiva('/flota/12')).toBe('/flota');
    expect(pestanaFlotaActiva('/flota/categorias')).toBe('/flota/categorias');
    expect(pestanaFlotaActiva('/multas')).toBe('/multas');
    expect(pestanaFlotaActiva('/reservas')).toBeNull();
  });
});
