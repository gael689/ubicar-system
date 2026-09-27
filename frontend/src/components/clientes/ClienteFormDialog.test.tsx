/**
 * El alta de cliente con sus conductores (plan 27/09, A3).
 *
 * La causa raíz de "cargué el conductor y no impactó en el contrato": el
 * conductor se mandaba aparte, con el vencimiento vacío, y la API lo
 * rechazaba después de haber creado el cliente. Ahora viaja todo junto.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const crear = vi.fn();
vi.mock('@/hooks/useClientes', () => ({
  useCreateCliente: () => ({ mutateAsync: crear, isPending: false }),
  useUpdateCliente: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddConductor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConductores: () => ({ data: [] }),
}));
const post = vi.fn();
vi.mock('@/lib/api', () => ({ default: { post: (...a: unknown[]) => post(...a), delete: vi.fn() }, api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ClienteFormDialog } from './ClienteFormDialog';

function renderizar() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ClienteFormDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

// Sin `cleanup` quedan dos diálogos abiertos, y sus trampas de foco se pelean
// el foco para siempre: el test no falla, se cuelga.
beforeEach(() => {
  cleanup();
  crear.mockReset();
  post.mockReset();
});

describe('Alta de empresa', () => {
  it('representante, empresa y conductores, en ese orden y en una sola llamada', async () => {
    const user = userEvent.setup();
    let resolver: (v: unknown) => void = () => {};
    crear.mockImplementation(() => new Promise(r => { resolver = r; }));
    renderizar();

    await user.click(screen.getByRole('button', { name: /Empresa/ }));

    const titulos = screen.getAllByText(/^[123]\. /).map(e => e.textContent);
    expect(titulos).toEqual(['1. Representante', '2. Datos de la empresa', '3. Conductores']);

    await user.type(screen.getByPlaceholderText('Laura Díaz'), 'Laura Díaz');
    await user.type(screen.getByPlaceholderText('Transportes del Sur'), 'Logística Norte');
    const telefonos = screen.getAllByPlaceholderText('2914123456');
    // El primero es el del representante; el segundo, el de la empresa.
    await user.type(telefonos[1], '2915000000');
    await user.type(screen.getByPlaceholderText('María García'), 'Juan Chofer');

    const guardar = screen.getByRole('button', { name: 'Crear cliente' });
    await user.click(guardar);
    // Doble clic mientras viaja: no se manda dos veces.
    await user.click(guardar);
    resolver({ id: 1 });

    await waitFor(() => expect(crear).toHaveBeenCalledTimes(1));
    const payload = crear.mock.calls[0][0];
    expect(payload.tipo).toBe('empresa');
    expect(payload.nombre_completo).toBe('Logística Norte');
    expect(payload.representante_nombre).toBe('Laura Díaz');
    expect(payload.conductores).toEqual([{
      nombre_completo: 'Juan Chofer', dni: null, licencia_numero: null,
      // Vacío viaja como null: '' era lo que daba 422.
      licencia_vencimiento: null, fecha_nacimiento: null,
    }]);
  });

  it('un conductor sin nombre no deja guardar', async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole('button', { name: /Empresa/ }));
    await user.type(screen.getByPlaceholderText('Transportes del Sur'), 'Logística Norte');
    await user.type(screen.getAllByPlaceholderText('2914123456')[1], '2915000000');
    await user.type(screen.getByPlaceholderText('30123456'), '30111000');
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }));
    expect(await screen.findByText('Escribí el nombre del conductor')).toBeInTheDocument();
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('Alta de particular', () => {
  it('sin conductores extra, viaja la lista vacía', async () => {
    const user = userEvent.setup();
    crear.mockResolvedValue({ id: 2 });
    renderizar();
    await user.click(screen.getByRole('button', { name: /Particular/ }));
    await user.type(screen.getByPlaceholderText('Juan Pérez'), 'Ana Gómez');
    await user.type(screen.getByPlaceholderText('2914123456'), '2915111111');
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }));
    await waitFor(() => expect(crear).toHaveBeenCalled());
    expect(crear.mock.calls[0][0].conductores).toEqual([]);
    expect(crear.mock.calls[0][0].representante_nombre).toBeNull();
  });
});

describe('Edición con conductores nuevos', () => {
  it('si falla uno a mitad, reintentar no duplica los que ya se guardaron', async () => {
    const user = userEvent.setup();
    const cliente: any = {
      id: 7, nombre_completo: 'Juan Pérez', dni_cuit: '30111222', telefono: '2915550000',
      tipo: 'particular', es_frecuente: false, conductores_adicionales: [],
    };
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ClienteFormDialog open onOpenChange={vi.fn()} cliente={cliente} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Agregar conductor/ }));
    await user.click(screen.getByRole('button', { name: /Agregar conductor/ }));
    const nombres = screen.getAllByPlaceholderText('María García');
    await user.type(nombres[0], 'Ana Uno');
    await user.type(nombres[1], 'Beto Dos');

    post.mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(new Error('se cortó'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    post.mockResolvedValue({ data: {} });
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    // El reintento manda sólo el que faltaba.
    expect(post.mock.calls[2][1]).toEqual(expect.objectContaining({ nombre_completo: 'Beto Dos' }));
  });
});
