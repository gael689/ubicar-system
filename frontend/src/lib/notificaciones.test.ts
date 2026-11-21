import { describe, expect, it } from 'vitest';
import {
  antiguedad, iconoDeOportunidad, MODULOS, MODULOS_DE_AVISOS, moduloVisual, pesosRedondos, porUrgencia,
} from './notificaciones';
import { NAV_SECTIONS } from './constants';
import type { NotificacionItem } from '@/types';

const aviso = (urgencia: string, created_at: string) => ({ urgencia, created_at }) as NotificacionItem;

describe('antigüedad de un aviso', () => {
  const ahora = new Date('2026-11-21T15:00:00Z');

  it('la hora sin zona del backend se lee como UTC, no como hora local', () => {
    expect(antiguedad('2026-11-21T13:00:00', ahora)).toBe('hace 2 h');
  });

  it('minutos, días y meses', () => {
    expect(antiguedad('2026-11-21T14:59:30Z', ahora)).toBe('recién');
    expect(antiguedad('2026-11-21T14:20:00Z', ahora)).toBe('hace 40 min');
    expect(antiguedad('2026-11-20T15:00:00Z', ahora)).toBe('hace 1 día');
    expect(antiguedad('2026-11-11T15:00:00Z', ahora)).toBe('hace 10 días');
    expect(antiguedad('2026-09-01T15:00:00Z', ahora)).toBe('hace 2 meses');
  });
});

describe('orden y módulos', () => {
  it('lo urgente primero y, a igual urgencia, lo más nuevo', () => {
    const items = [
      aviso('baja', '2026-11-21T10:00:00'),
      aviso('critica', '2026-11-20T10:00:00'),
      aviso('alta', '2026-11-19T10:00:00'),
      aviso('alta', '2026-11-21T09:00:00'),
    ].sort(porUrgencia);
    expect(items.map(i => `${i.urgencia}@${i.created_at.slice(8, 10)}`))
      .toEqual(['critica@20', 'alta@21', 'alta@19', 'baja@21']);
  });

  it('los módulos van en el orden del catálogo del backend y la campana no tiene oportunidades', () => {
    expect(MODULOS.map(m => m.clave)).toEqual([
      'operacion', 'cobranzas', 'flota', 'clientes', 'web', 'uber', 'configuracion', 'oportunidades',
    ]);
    expect(MODULOS_DE_AVISOS.some(m => m.clave === 'oportunidades')).toBe(false);
  });

  it('un módulo que esta pantalla no conoce se muestra con la etiqueta que mandó el backend', () => {
    expect(moduloVisual('nuevo', 'Algo nuevo').label).toBe('Algo nuevo');
    expect(moduloVisual('flota').label).toBe('Flota');
  });

  it('una oportunidad sin ícono propio lleva la bombita', () => {
    expect(iconoDeOportunidad('op_que_no_existe')).toBe(MODULOS[MODULOS.length - 1].icono);
  });

  it('los montos van redondos, sin centavos', () => {
    expect(pesosRedondos(1240000.4)).toMatch(/^\$1\.?240\.?000$/);
  });
});

describe('menú', () => {
  it('tiene el acceso a Oportunidades, que abre esa pestaña del Centro de avisos', () => {
    const item = NAV_SECTIONS.flatMap(s => s.items).find(i => i.label === 'Oportunidades');
    expect(item).toMatchObject({ path: '/notificaciones', tab: 'oportunidades', icon: 'Lightbulb' });
  });
});
