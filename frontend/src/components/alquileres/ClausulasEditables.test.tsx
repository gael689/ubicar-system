/**
 * Editar las cláusulas del contrato antes de generarlo (04/10/2026).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { ClausulasEditables } from './ClausulasEditables';
import type { ClausulaContrato } from '@/types';

const ORIGINALES: ClausulaContrato[] = [
  { numero: 1, titulo: 'Objeto', parrafos: [{ texto: 'Texto uno.' }] },
  { numero: 2, titulo: 'Uso', parrafos: [{ texto: 'Texto dos.' }] },
];

function Caso() {
  const [v, setV] = useState(ORIGINALES);
  return <ClausulasEditables originales={ORIGINALES} value={v} onChange={setV} />;
}

describe('ClausulasEditables', () => {
  it('arranca cerrado y dice que se imprime como siempre', () => {
    render(<Caso />);
    expect(screen.getByText('Se imprimen como siempre.')).toBeTruthy();
    expect(screen.queryByDisplayValue('Texto uno.')).toBeNull();
  });

  it('al editar un párrafo marca la cláusula como modificada y cuenta', async () => {
    const user = userEvent.setup();
    render(<Caso />);
    await user.click(screen.getByRole('button', { name: /revisar o editar/i }));
    const area = screen.getByDisplayValue('Texto dos.');
    await user.clear(area);
    await user.type(area, 'Otro texto.');
    expect(screen.getByText('Modificada')).toBeTruthy();
    expect(screen.getByText(/1 cláusula modificada/)).toBeTruthy();
  });

  it('"Volver al original" restaura el texto', async () => {
    const user = userEvent.setup();
    render(<Caso />);
    await user.click(screen.getByRole('button', { name: /revisar o editar/i }));
    const area = screen.getByDisplayValue('Texto dos.');
    await user.clear(area);
    await user.type(area, 'Cambiado');
    await user.click(screen.getByRole('button', { name: /volver al original/i }));
    expect(screen.getByDisplayValue('Texto dos.')).toBeTruthy();
    expect(screen.getByText('Se imprimen como siempre.')).toBeTruthy();
  });
});
