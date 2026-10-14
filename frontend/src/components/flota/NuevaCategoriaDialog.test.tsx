/** Alta de categoría desde Flota (14/10). */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

const crear = { mutateAsync: vi.fn(async () => ({ id: 7 })), isPending: false };
vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({ data: [{ id: 1, orden: 3 }] }),
  useCreateCategoria: () => crear,
}));
const post = vi.fn(async () => ({}));
vi.mock('@/lib/api', () => ({ default: { post: (...a: unknown[]) => post(...a) } }));

import { NuevaCategoriaDialog } from './NuevaCategoriaDialog';

describe('Nueva categoría', () => {
  it('crea con código derivado, al final de la lista, y carga el precio por día', async () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <NuevaCategoriaDialog open onOpenChange={() => {}} />
    </QueryClientProvider>);
    await userEvent.type(screen.getByPlaceholderText('SUV'), 'Sedán Superior');
    await userEvent.type(screen.getByPlaceholderText('60.000'), '60000');
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));
    expect(crear.mutateAsync).toHaveBeenCalledWith({
      codigo: 'sedan-superior', nombre: 'Sedán Superior', orden: 4, visible_web: true,
    });
    expect(post).toHaveBeenCalledWith('/categorias/7/tarifas', { tipo: 'diaria', monto: 60000 });
  });
});
