/**
 * Nueva operación: tres opciones — Contrato Uber, Alquiler y Nueva reserva.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MenuNuevaOperacion } from './MenuNuevaOperacion';

function abrir() {
  const onNuevaReserva = vi.fn();
  const onNuevoContrato = vi.fn();
  render(<MenuNuevaOperacion onNuevaReserva={onNuevaReserva} onNuevoContrato={onNuevoContrato} />);
  return { onNuevaReserva, onNuevoContrato, user: userEvent.setup() };
}

describe('Nueva operación', () => {
  it('ofrece las tres opciones', async () => {
    const { user } = abrir();
    await user.click(screen.getByRole('button', { name: /Nueva operación/ }));
    expect(screen.getByText('Contrato Uber')).toBeTruthy();
    expect(screen.getByText('Alquiler')).toBeTruthy();
    expect(screen.getByText('Nueva reserva')).toBeTruthy();
  });

  it('Contrato Uber abre el contrato rápido de tipo uber', async () => {
    const { user, onNuevoContrato } = abrir();
    await user.click(screen.getByRole('button', { name: /Nueva operación/ }));
    await user.click(screen.getByText('Contrato Uber'));
    expect(onNuevoContrato).toHaveBeenCalledWith('uber');
  });

  it('Alquiler abre el contrato rápido de siempre', async () => {
    const { user, onNuevoContrato } = abrir();
    await user.click(screen.getByRole('button', { name: /Nueva operación/ }));
    await user.click(screen.getByText('Alquiler'));
    expect(onNuevoContrato).toHaveBeenCalledWith('alquiler');
  });

  it('Nueva reserva abre el wizard', async () => {
    const { user, onNuevaReserva } = abrir();
    await user.click(screen.getByRole('button', { name: /Nueva operación/ }));
    await user.click(screen.getByText('Nueva reserva'));
    expect(onNuevaReserva).toHaveBeenCalled();
  });
});
