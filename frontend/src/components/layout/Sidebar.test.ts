/**
 * Todo ícono que nombra el menú tiene que existir en el mapa del Sidebar.
 *
 * Un nombre que no está da `undefined` como componente de React (error #130) y
 * la pantalla entera queda en blanco. `ICONS` es un `Record<string, …>`, así
 * que `tsc` no lo detecta: pasó con "Receipt" (el ítem Cobros de la Caja).
 */
import { describe, it, expect } from 'vitest';
import { ICONS } from './Sidebar';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/constants';

describe('íconos del menú', () => {
  it('todos los ítems del menú lateral tienen su ícono', () => {
    const faltan = NAV_SECTIONS.flatMap(s => s.items).filter(i => !ICONS[i.icon]).map(i => `${i.label} (${i.icon})`);
    expect(faltan).toEqual([]);
  });

  it('los de la barra de abajo en el celular también', () => {
    const faltan = NAV_ITEMS.filter(i => !ICONS[i.icon]).map(i => `${i.label} (${i.icon})`);
    expect(faltan).toEqual([]);
  });
});
