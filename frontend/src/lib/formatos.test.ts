/**
 * Los formatos que el mostrador pidió, y el que los rompía.
 *
 * Tres pedidos distintos que resultaron ser el mismo problema de fondo — que
 * los números se muestren como los escribe una persona:
 *
 * - *"Estaría bueno que cuando escribimos precios aparezca el puntito de los
 *   miles: 200.000, así."*
 * - *"Cuando pones un precio y te sale precio por día y es justo un número
 *   irracional, poner sólo 2 decimales."*
 * - *"Lo mismo de los puntos en los DNI. Cuando uno lee muchos números al día,
 *   esto te ahorra problemas."*
 */
import { describe, it, expect } from 'vitest';

import { formatMiles, parseMiles, redondear2, formatDocumento } from './utils';
import { abreviarLugar } from './lugares';

describe('formatMiles', () => {
  it('pone el punto de los miles', () => {
    expect(formatMiles(200000)).toBe('200.000');
  });

  it('no inventa decimales en un número redondo', () => {
    // "$200.000,00" no es como lo escribe nadie a mano.
    expect(formatMiles(200000)).not.toContain(',');
  });

  it('corta en dos decimales', () => {
    // **El bug.** `toLocaleString('es-AR')` a secas usa el default del Intl,
    // que son TRES decimales: `100000/3` salía escrito "$33.333,333".
    expect(formatMiles(100000 / 3)).toBe('33.333,33');
  });

  it('un campo vacío no se muestra como cero', () => {
    expect(formatMiles('')).toBe('');
    expect(formatMiles(null)).toBe('');
    expect(formatMiles(undefined)).toBe('');
  });
});

describe('parseMiles', () => {
  it('entiende el punto como separador de miles, no como decimal', () => {
    // `parseFloat('200.000')` da 200. Es el error que haría que un precio de
    // doscientos mil se guarde como doscientos.
    expect(parseMiles('200.000')).toBe(200000);
  });

  it('y la coma como decimal', () => {
    expect(parseMiles('200.000,50')).toBe(200000.5);
  });

  it('distingue vacío de cero', () => {
    // No es lo mismo "no hubo anticipo" que "el anticipo fue cero".
    expect(parseMiles('')).toBeNull();
    expect(parseMiles('0')).toBe(0);
  });

  it('ignora el símbolo de peso y los espacios', () => {
    expect(parseMiles('$ 140.000')).toBe(140000);
  });
});

describe('redondear2', () => {
  it('mata el float feo que se escribía en el formulario', () => {
    expect(100000 / 3).toBe(33333.333333333336);
    expect(redondear2(100000 / 3)).toBe(33333.33);
  });

  it('no toca un número que ya es exacto', () => {
    expect(redondear2(35000)).toBe(35000);
  });
});

describe('formatDocumento', () => {
  it('le pone los puntos a un DNI', () => {
    expect(formatDocumento('46901745')).toBe('46.901.745');
  });

  it('formatea un CUIT con guiones', () => {
    expect(formatDocumento('20469017453')).toBe('20-46901745-3');
  });

  it('deja el marcador de pendiente como está', () => {
    // `A COMPLETAR` es la marca del alta rápida y **no es un documento**:
    // formatearla la disfrazaría de dato cargado.
    expect(formatDocumento('A COMPLETAR')).toBe('A COMPLETAR');
  });

  it('no rompe con vacío', () => {
    expect(formatDocumento('')).toBe('');
    expect(formatDocumento(null)).toBe('');
  });

  it('deja pasar lo que no reconoce', () => {
    // Un pasaporte, o un documento extranjero: mejor mostrarlo tal cual que
    // partirlo con puntos donde no van.
    expect(formatDocumento('AB-1234')).toBe('AB-1234');
  });
});

describe('abreviarLugar', () => {
  it('abrevia el aeropuerto, que es el que tapaba el horario', () => {
    // *"El nombre es tan largo que no me deja ver el horario."*
    expect(abreviarLugar('Aeropuerto Comandante Espora')).toBe('AERO');
  });

  it('lo abrevia aunque lo escriban distinto', () => {
    // La lista sale de Configuración y se edita sin deploy: un mapa cerrado
    // dejaría de funcionar en cuanto alguien le cambie una palabra.
    expect(abreviarLugar('aeropuerto cte. espora')).toBe('AERO');
  });

  it('no toca una dirección que ya es corta', () => {
    expect(abreviarLugar('Paraguay 241')).toBe('Paraguay 241');
    expect(abreviarLugar('Alsina 350')).toBe('Alsina 350');
  });

  it('con un nombre largo nuevo, deja la primera palabra y las iniciales', () => {
    expect(abreviarLugar('Terminal de Ómnibus Bahía Blanca')).toBe('Terminal Ó.B.B.');
  });

  it('no rompe con vacío', () => {
    expect(abreviarLugar('')).toBe('');
    expect(abreviarLugar(null)).toBe('');
  });
});
