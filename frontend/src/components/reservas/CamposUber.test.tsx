/**
 * Tipo de contrato y condiciones de Uber (04/10/2026), y las fechas de pago
 * alineadas: una por semana, siempre (21/11/2026).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { CamposUber, UBER_VACIO, type DatosUber, type SugeridosUber } from './CamposUber';

let ultimo: DatosUber = UBER_VACIO;

function Caso({
  inicial = UBER_VACIO, dias = 14, sugeridos,
}: { inicial?: DatosUber; dias?: number; sugeridos?: SugeridosUber | null }) {
  const [v, setV] = useState(inicial);
  ultimo = v;
  // 2026-10-05 es lunes.
  return <CamposUber value={v} onChange={setV} fechaInicio="2026-10-05" dias={dias} sugeridos={sugeridos} />;
}

const UBER: DatosUber = { ...UBER_VACIO, tipo: 'uber' };

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
    render(<Caso inicial={{ ...UBER, valorSemana: 200000 }} dias={14} />);
    expect(screen.getByText(/400\.000/)).toBeTruthy();
  });

  it('lista cada semana con su día y lo que vale', () => {
    render(<Caso inicial={{ ...UBER, valorSemana: 200000 }} dias={14} />);
    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Semana 1 · lun 05/10 · $200.000');
    expect(filas[1].textContent).toContain('Semana 2 · lun 12/10 · $200.000');
  });

  it('"Paga los: viernes" realinea todas las fechas con un solo control', async () => {
    const user = userEvent.setup();
    render(<Caso inicial={UBER} dias={21} />);
    await user.selectOptions(screen.getByLabelText('Paga los'), 'viernes');
    // La primera se paga al retirar; las demás, el viernes anterior a su semana.
    expect(ultimo.fechasPago).toEqual(['2026-10-05', '2026-10-09', '2026-10-16']);
  });

  it('semanal vencido corre los pagos al cierre de cada semana', async () => {
    const user = userEvent.setup();
    render(<Caso inicial={UBER} dias={14} />);
    await user.selectOptions(screen.getByLabelText('Condición de pago'), 'Semanal vencido');
    expect(ultimo.modalidad).toBe('vencido');
    expect(ultimo.fechasPago).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('no se pueden sacar ni agregar fechas: siempre hay una por semana', () => {
    render(<Caso inicial={UBER} dias={14} />);
    expect(screen.queryByRole('button', { name: /sacar esta fecha/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /agregar fecha/i })).toBeNull();
    expect(ultimo.fechasPago).toHaveLength(2);
  });

  it('se puede mover una fecha puntual', () => {
    render(<Caso inicial={UBER} dias={14} />);
    fireEvent.change(screen.getByLabelText('Fecha de pago de la semana 2'), { target: { value: '2026-10-14' } });
    expect(ultimo.fechasPago).toEqual(['2026-10-05', '2026-10-14']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('avisa si una fecha movida queda fuera de orden', () => {
    render(<Caso inicial={UBER} dias={14} />);
    fireEvent.change(screen.getByLabelText('Fecha de pago de la semana 2'), { target: { value: '2026-10-05' } });
    expect(screen.getByRole('alert').textContent).toMatch(/en orden y no repetirse/);
  });

  it('si cambia la duración, las fechas se vuelven a alinear con las semanas', () => {
    const { rerender } = render(<Caso inicial={UBER} dias={14} />);
    fireEvent.change(screen.getByLabelText('Fecha de pago de la semana 2'), { target: { value: '2026-10-14' } });
    rerender(<Caso inicial={UBER} dias={28} />);
    expect(ultimo.fechasPago).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('precarga los valores del último contrato si no se cargó nada', () => {
    render(<Caso inicial={UBER} sugeridos={{ valor_semana: 210000, km_semana: 1500, precio_km_extra: 150 }} />);
    expect(ultimo.valorSemana).toBe(210000);
    expect(ultimo.kmSemana).toBe(1500);
    expect(ultimo.precioKmExtra).toBe(150);
    expect(ultimo.fechasPago).toEqual(['2026-10-05', '2026-10-12']);
    expect(screen.getByText(/valores del último contrato/)).toBeTruthy();
  });

  it('no pisa lo que ya se escribió', () => {
    render(<Caso inicial={{ ...UBER, valorSemana: 180000 }}
      sugeridos={{ valor_semana: 210000, km_semana: 1500, precio_km_extra: 150 }} />);
    expect(ultimo.valorSemana).toBe(180000);
  });
});
