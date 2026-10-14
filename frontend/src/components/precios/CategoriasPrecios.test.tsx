/**
 * La tabla de Categorías arriba de Precios (14/10): precio por día, En web,
 * franquicia y si la web la puede vender.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { CategoriasPrecios } from './CategoriasPrecios';

const actualizar = { mutate: vi.fn(), isPending: false };
const crear = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({ isLoading: false, data: [
    { id: 1, codigo: 'compacto', nombre: 'Compacto', visible_web: true, franquicia_base: 1500000, foto_url: null },
    { id: 2, codigo: 'suv', nombre: 'SUV', visible_web: false, franquicia_base: null, foto_url: null },
  ] }),
  useTarifasCategoria: (id: number) => ({ data: id === 1 ? [] : [{ id: 9, tipo: 'diaria', monto: '60000' }] }),
  useCreateTarifaCategoria: () => crear,
  useUpdateCategoria: () => actualizar,
  useUploadFotoCategoria: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/usePrecios', () => ({
  useCoberturaPrecios: () => ({ data: [
    { categoria_id: 1, categoria_nombre: 'Compacto', visible_web: true, con_flota: true,
      dias_sin_precio: 120, primer_dia_sin_precio: '2099-10-20', ultimo_dia_sin_precio: '2100-02-11' },
    { categoria_id: 2, categoria_nombre: 'SUV', visible_web: false, con_flota: true,
      dias_sin_precio: 0, primer_dia_sin_precio: null, ultimo_dia_sin_precio: null },
  ] }),
}));

function renderizar() {
  render(<QueryClientProvider client={new QueryClient()}><CategoriasPrecios /></QueryClientProvider>);
}

describe('Categorías en Precios', () => {
  it('avisa qué categoría publicada no tiene definido el precio por día', () => {
    renderizar();
    expect(screen.getByText(/no tiene definido el precio por día/)).toBeInTheDocument();
    expect(screen.getAllByText('Sin cargar').length).toBeGreaterThan(0);
  });

  it('dice hasta cuándo tiene precio: el día anterior al primer hueco', () => {
    renderizar();
    expect(screen.getByText(/Tiene precio hasta el 19\/10\/2099/)).toBeInTheDocument();
  });

  it('la que no se ofrece en la web lo dice, y se publica con un click', async () => {
    renderizar();
    expect(screen.getByText('No se ofrece en la web')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'SUV en la web' }));
    expect(actualizar.mutate).toHaveBeenCalledWith({ id: 2, body: { visible_web: true } }, expect.anything());
  });
});
