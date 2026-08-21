import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CalendarioAnual, MESES_NOMBRE, ordenDeMeses } from './CalendarioAnual';

/**
 * El cuadro de doce meses arranca por el mes en curso.
 *
 * Antes empezaba siempre en enero. Nadie abre esta pantalla para mirar febrero
 * pasado: se abre para ver lo que viene, y con el orden fijo eso quedaba en la
 * mitad de abajo, detrás de siete meses muertos.
 */

const AGOSTO_2026 = new Date(2026, 7, 21); // mes 7 = agosto

describe('ordenDeMeses', () => {
  it('en el año en curso arranca por el mes de hoy', () => {
    expect(ordenDeMeses(2026, AGOSTO_2026)).toEqual([7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6]);
  });

  it('los meses que ya pasaron van al final, no se esconden', () => {
    const orden = ordenDeMeses(2026, AGOSTO_2026);
    expect(orden).toHaveLength(12);
    expect(new Set(orden).size).toBe(12);
  });

  it('en enero no rota nada: el mes en curso ya es el primero', () => {
    expect(ordenDeMeses(2026, new Date(2026, 0, 15))).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
  });

  it('en diciembre queda diciembre primero y enero segundo', () => {
    expect(ordenDeMeses(2026, new Date(2026, 11, 3))).toEqual(
      [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  });

  it('otro año no rota: no hay "mes actual" que poner primero', () => {
    const derecho = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(ordenDeMeses(2027, AGOSTO_2026)).toEqual(derecho);
    expect(ordenDeMeses(2025, AGOSTO_2026)).toEqual(derecho);
  });
});

describe('CalendarioAnual', () => {
  function montar(anio: number) {
    return render(
      <CalendarioAnual
        anio={anio}
        onAnioChange={() => {}}
        hoy={AGOSTO_2026}
        renderDia={() => null}
      />,
    );
  }

  it('dibuja los doce meses, empezando por agosto', () => {
    const { container } = montar(2026);
    // Sólo los títulos de mes: el `querySelectorAll` de botones agarra también
    // los 365 días.
    const titulos = Array.from(container.querySelectorAll('button'))
      .map(b => b.textContent?.replace('· ya pasó', '').trim() ?? '')
      .filter(t => MESES_NOMBRE.includes(t));

    expect(titulos).toHaveLength(12);
    expect(titulos[0]).toBe('Agosto');
    expect(titulos[4]).toBe('Diciembre');
    expect(titulos[5]).toBe('Enero');
    expect(titulos[11]).toBe('Julio');
  });

  it('marca los meses de este año que ya pasaron', () => {
    montar(2026);
    // Enero quedó después de diciembre por la rotación: sin la marca se lee
    // como enero del año que viene.
    expect(screen.getByTitle('Enero de 2026 — ya pasó')).toBeInTheDocument();
    // Y los que vienen no la llevan.
    expect(screen.queryByTitle('Septiembre de 2026 — ya pasó')).not.toBeInTheDocument();
  });

  it('en otro año no marca ninguno como pasado', () => {
    montar(2027);
    for (const nombre of MESES_NOMBRE) {
      expect(screen.queryByTitle(`${nombre} de 2027 — ya pasó`)).not.toBeInTheDocument();
    }
  });
});
