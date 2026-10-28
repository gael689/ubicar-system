import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CalendarioAnual, MESES_NOMBRE, inicioDeVentana, mesesDeLaVentana, nombreDeLaVentana, rangoDeLaVentana,
} from './CalendarioAnual';

/**
 * El cuadro muestra doce meses seguidos desde el mes en curso, **cruzando el
 * año** (28/10).
 *
 * Antes era un año calendario rotado: en octubre se veía octubre → diciembre
 * y después enero → septiembre del mismo año, que ya pasaron. Pedido del
 * mostrador: *"después de diciembre, un enero 2027, y que continúe el año"*.
 */

const OCTUBRE_2026 = new Date(2026, 9, 28); // mes 9 = octubre

describe('la ventana de doce meses', () => {
  it('arranca el 1° del mes en curso', () => {
    expect(inicioDeVentana(OCTUBRE_2026)).toEqual(new Date(2026, 9, 1));
  });

  it('después de diciembre sigue enero del año que viene', () => {
    const meses = mesesDeLaVentana(inicioDeVentana(OCTUBRE_2026));
    expect(meses).toHaveLength(12);
    expect(meses[0]).toEqual({ anio: 2026, mes: 9 });
    expect(meses[2]).toEqual({ anio: 2026, mes: 11 });
    expect(meses[3]).toEqual({ anio: 2027, mes: 0 });
    expect(meses[11]).toEqual({ anio: 2027, mes: 8 });
  });

  it('en enero es el año calendario entero', () => {
    const meses = mesesDeLaVentana(new Date(2027, 0, 1));
    expect(meses.every(m => m.anio === 2027)).toBe(true);
    expect(meses.map(m => m.mes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('el rango para pedir los datos cubre los doce meses enteros', () => {
    expect(rangoDeLaVentana(new Date(2026, 9, 1))).toEqual({ desde: '2026-10-01', hasta: '2027-09-30' });
  });

  it('el nombre dice de dónde a dónde', () => {
    expect(nombreDeLaVentana(new Date(2026, 9, 1))).toBe('Octubre 2026 – Septiembre 2027');
  });
});

describe('CalendarioAnual', () => {
  function montar(inicio = inicioDeVentana(OCTUBRE_2026), onInicioChange = () => {}) {
    return render(
      <CalendarioAnual
        inicio={inicio}
        onInicioChange={onInicioChange}
        hoy={OCTUBRE_2026}
        renderDia={() => null}
      />,
    );
  }

  /** Sólo los títulos de mes: los botones de los días también son botones. */
  function titulos(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('button'))
      .map(b => b.textContent?.trim() ?? '')
      .filter(t => MESES_NOMBRE.some(m => t.startsWith(m)));
  }

  it('dibuja octubre 2026 a septiembre 2027, con el año en cada mes', () => {
    const t = titulos(montar().container);
    expect(t).toHaveLength(12);
    expect(t[0]).toBe('Octubre2026');
    expect(t[2]).toBe('Diciembre2026');
    expect(t[3]).toBe('Enero2027');
    expect(t[11]).toBe('Septiembre2027');
  });

  it('las flechas mueven doce meses y "Hoy" vuelve al mes en curso', () => {
    const cambio = vi.fn();
    montar(new Date(2027, 9, 1), cambio);
    fireEvent.click(screen.getByTitle('12 meses después'));
    expect(cambio).toHaveBeenLastCalledWith(new Date(2028, 9, 1));
    fireEvent.click(screen.getByTitle('12 meses antes'));
    expect(cambio).toHaveBeenLastCalledWith(new Date(2026, 9, 1));
    fireEvent.click(screen.getByText('Hoy'));
    expect(cambio).toHaveBeenLastCalledWith(new Date(2026, 9, 1));
  });

  it('al tocar un mes dice de qué año es', () => {
    const elegir = vi.fn();
    const { container } = render(
      <CalendarioAnual
        inicio={inicioDeVentana(OCTUBRE_2026)}
        onInicioChange={() => {}}
        onSelectMes={elegir}
        hoy={OCTUBRE_2026}
        renderDia={() => null}
      />,
    );
    const enero = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Enero2027')!;
    fireEvent.click(enero);
    expect(elegir).toHaveBeenCalledWith(2027, 0);
  });

  it('el tamaño grande agranda los días y marca hoy más fuerte; el default no cambia', () => {
    // La vista anual de Ocupación es el calendario principal y pide celdas
    // más grandes. Fechas especiales usa el default y tiene que quedar igual.
    const hoyEn = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === '28' && b.className.includes('ring'),
      ) as HTMLElement;

    const { container, unmount } = montar();
    expect(hoyEn(container).className).toContain('ring-2');
    expect(hoyEn(container).className).toContain('text-[10px]');
    unmount();

    const grande = render(
      <CalendarioAnual
        inicio={inicioDeVentana(OCTUBRE_2026)} onInicioChange={() => {}}
        hoy={OCTUBRE_2026} renderDia={() => null} tamano="grande"
      />,
    );
    expect(hoyEn(grande.container).className).toContain('ring-[3px]');
    expect(hoyEn(grande.container).className).toContain('text-sm');
  });
});
