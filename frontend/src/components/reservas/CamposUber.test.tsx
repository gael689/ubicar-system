/**
 * Tipo de contrato y condiciones de Uber (04/10/2026).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { CamposUber, UBER_VACIO, type DatosUber } from './CamposUber';

let ultimo: DatosUber = UBER_VACIO;

function Caso({ inicial = UBER_VACIO, dias = 14 }: { inicial?: DatosUber; dias?: number }) {
  const [v, setV] = useState(inicial);
  ultimo = v;
  return <CamposUber value={v} onChange={setV} fechaInicio="2026-10-05" dias={dias} />;
}

describe('CamposUber', () => {
  it('arranca como alquiler común, sin campos de Uber', () => {
    render(<Caso />);
    expect(screen.queryByText('Valor semana *')).toBeNull();
  });

  it('al elegir Uber aparecen los cinco datos del contrato', async () => {
    const user = userEvent.setup();
    render(<Caso />);
    await user.click(screen.getByRole('button', { name: 'Uber' }));
    expect(screen.getByText('Valor semana *')).toBeTruthy();
    expect(screen.getByText('Km permitidos por semana')).toBeTruthy();
    expect(screen.getByText('Precio del km extra')).toBeTruthy();
    expect(screen.getByText('Condición de pago')).toBeTruthy();
    expect(screen.getByText(/Fechas de pago/)).toBeTruthy();
  });

  it('propone una fecha de pago por semana', async () => {
    const user = userEvent.setup();
    render(<Caso dias={21} />);
    await user.click(screen.getByRole('button', { name: 'Uber' }));
    expect(ultimo.fechasPago).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('muestra el total prorrateado a partir del valor de la semana', () => {
    render(<Caso inicial={{ ...UBER_VACIO, tipo: 'uber', valorSemana: 200000 }} dias={14} />);
    expect(screen.getByText(/400\.000/)).toBeTruthy();
  });

  it('las fechas se pueden sacar y agregar', async () => {
    const user = userEvent.setup();
    render(<Caso dias={14} />);
    await user.click(screen.getByRole('button', { name: 'Uber' }));
    await user.click(screen.getAllByRole('button', { name: 'Sacar esta fecha' })[0]);
    expect(ultimo.fechasPago).toEqual(['2026-10-12']);
    await user.click(screen.getByRole('button', { name: /agregar fecha/i }));
    expect(ultimo.fechasPago.length).toBe(2);
  });
});
