import { describe, expect, it } from 'vitest';

import { aplicarModo, type FormItem } from './CotizadorPage';

/**
 * Apretar "Por unidad" tiene que cambiar el ítem a unidades.
 *
 * Es el caso más común del cotizador —abrirlo y elegir una unidad— y era
 * justamente el que no funcionaba: el botón se pintaba y el desplegable seguía
 * mostrando Sedán/SUV/Pick up. El modo era global, el tipo era por ítem, y el
 * toggle no tocaba los ítems.
 *
 * Lo que decide qué desplegable se dibuja es `item.unidad`: con valor, el de
 * unidades; vacío, el de categorías (`CotizadorPage.tsx`, fila 1 del ítem).
 * Por eso los tests miran ese campo — es literalmente la condición del render.
 *
 * No se testea contra el DOM porque el `Select` de Radix no expone su valor
 * seleccionado en jsdom sin abrir el menú: la aserción quedaría atada al
 * portal y no a la lógica, que es lo que se rompió.
 */

const VACIO: FormItem = {
  id: 'item-1',
  categoria: 'sedan',
  unidad: '',
  modalidad: 'mensual',
  dias: '30',
  precio: '',
  fecha_desde: '',
  fecha_hasta: '',
};

describe('aplicarModo', () => {
  it('a "unidad" pone una unidad y su categoría equivalente', () => {
    const r = aplicarModo(VACIO, 'unidad');
    expect(r.unidad).toBeTruthy();
    expect(r.categoria).toBeTruthy();
  });

  it('a "categoria" vacía la unidad, que es lo que dibuja el otro desplegable', () => {
    const porUnidad = aplicarModo(VACIO, 'unidad');
    const r = aplicarModo(porUnidad, 'categoria');
    expect(r.unidad).toBe('');
  });

  it('conserva el precio, los días y las fechas', () => {
    const cargado: FormItem = {
      ...VACIO,
      precio: '850000',
      dias: '15',
      modalidad: 'dias',
      fecha_desde: '2026-09-01',
      fecha_hasta: '2026-09-15',
    };
    const r = aplicarModo(cargado, 'unidad');

    expect(r.precio).toBe('850000');
    expect(r.dias).toBe('15');
    expect(r.modalidad).toBe('dias');
    expect(r.fecha_desde).toBe('2026-09-01');
    expect(r.fecha_hasta).toBe('2026-09-15');
  });

  it('no toca un ítem que ya está en el modo pedido', () => {
    const porUnidad = aplicarModo(VACIO, 'unidad');
    expect(aplicarModo(porUnidad, 'unidad')).toBe(porUnidad);
    expect(aplicarModo(VACIO, 'categoria')).toBe(VACIO);
  });

  it('ida y vuelta deja el ítem como estaba', () => {
    const ida = aplicarModo(VACIO, 'unidad');
    const vuelta = aplicarModo(ida, 'categoria');
    expect(vuelta.unidad).toBe(VACIO.unidad);
    expect(vuelta.precio).toBe(VACIO.precio);
  });
});
