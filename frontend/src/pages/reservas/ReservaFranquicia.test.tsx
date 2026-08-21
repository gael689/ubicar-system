/**
 * La franquicia que se muestra es la del auto que se entrega.
 *
 * Reportado con el Fiat Argo: es Compacto (base $1.500.000) y el paso 4
 * mostraba **$3.000.000**, que es la base de Pick-up. El dato en la base estaba
 * bien, así que el error es de la pantalla resolviendo la categoría.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const CATEGORIAS = [
  { id: 1, codigo: 'compacto', nombre: 'Compacto', orden: 1, franquicia_base: 1500000 },
  { id: 5, codigo: 'pickup', nombre: 'Pick-up', orden: 5, franquicia_base: 3000000 },
];
const ARGO = {
  id: 14, patente: 'AH762UL', marca: 'Fiat', modelo: 'Argo Drive MT',
  categoria_id: 1, activo: true, estado: 'disponible',
};
const HILUX = {
  id: 1, patente: 'AF977FD', marca: 'Toyota', modelo: 'Hilux Dx',
  categoria_id: 5, activo: true, estado: 'disponible',
};

vi.mock('@/hooks/useReservas', () => ({
  useReservas: () => ({ createReserva: vi.fn(), updateReserva: vi.fn(), loading: false, error: null }),
  descargarPdfReserva: vi.fn(),
}));
vi.mock('@/hooks/useVehiculos', () => ({
  useVehiculos: () => ({ data: { data: [HILUX, ARGO] } }),
}));
vi.mock('@/hooks/useClientes', () => ({
  useClientes: () => ({ data: { data: [{ id: 1, nombre_completo: 'Juan Pérez', activo: true }] } }),
  useConductores: () => ({ data: [] }),
}));
// El aviso de franquicia vive dentro del bloque "Cobertura (elegi una)": sin
// coberturas en el catalogo ese bloque no se dibuja.
vi.mock('@/hooks/useAdicionales', () => ({
  useAdicionales: () => ({
    data: [
      { id: 1, codigo: 'cob_red', nombre: 'Cobertura reducida', grupo: 'cobertura',
        precio: 0, unidad_cobro: 'por_dia', porcentaje_sobre_alquiler: 10,
        franquicia_descuento: 500000, max_cantidad: 1, incluido: false },
      { id: 2, codigo: 'cob_tot', nombre: 'Cobertura total', grupo: 'cobertura',
        precio: 0, unidad_cobro: 'por_dia', porcentaje_sobre_alquiler: 30,
        franquicia_descuento: 1000000, max_cantidad: 1, incluido: false },
    ],
  }),
}));
vi.mock('@/hooks/usePrecios', () => ({ useCalcularPrecio: () => ({ data: null }) }));
vi.mock('@/hooks/useConfiguracion', () => ({ useConfiguracion: () => ({ data: [] }) }));
vi.mock('@/hooks/useCategorias', () => ({ useCategorias: () => ({ data: CATEGORIAS }) }));
// El desplegable del paso 3 se arma con los libres del rango, no con la flota
// entera: sin esto el select sale vacio y no hay auto que elegir.
vi.mock('@/hooks/useDisponibilidad', () => ({
  useDisponibilidadInterna: () => ({ data: null, isLoading: false }),
  useVehiculosLibres: () => ({
    data: {
      vehiculos: [
        { id: 1, patente: 'AF977FD', marca: 'Toyota', modelo: 'Hilux Dx',
          categoria_nombre: 'Pick-up', es_downgrade: false },
        { id: 14, patente: 'AH762UL', marca: 'Fiat', modelo: 'Argo Drive MT',
          categoria_nombre: 'Compacto', es_downgrade: false },
      ],
    },
  }),
}));
vi.mock('@/hooks/useSemaforo', () => ({ usePreCheckoutPrevio: () => ({ data: null }) }));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<any>()), useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/lib/api', () => ({
  default: { post: vi.fn(), get: vi.fn() }, api: { post: vi.fn(), get: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReservaModal } from './ReservaModal';

beforeEach(() => { localStorage.clear(); cleanup(); });
const siguiente = () => screen.getByRole('button', { name: /Siguiente/ });

async function hastaElPaso4(user: ReturnType<typeof userEvent.setup>, patente: string) {
  await user.click(screen.getByPlaceholderText(/Buscar por nombre/i));
  await user.click(await screen.findByText('Juan Pérez'));
  await user.click(siguiente());
  await user.click(screen.getAllByRole('button', { name: 'Paraguay 241' })[0]);
  await user.click(screen.getAllByRole('button', { name: 'Alsina 350' })[1]);
  await user.click(siguiente());
  // Paso 3: el auto, elegido por patente en el desplegable de la flota.
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  const opcion = Array.from(select.options).find(o => o.textContent?.includes(patente))!;
  await user.selectOptions(select, opcion.value);
  await user.click(siguiente());
}

describe('La franquicia del paso 4', () => {
  it('el Fiat Argo es Compacto: $1.500.000, no $3.000.000', async () => {
    const user = userEvent.setup();
    render(<ReservaModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await hastaElPaso4(user, 'AH762UL');

    expect(screen.getByText(/\$1\.500\.000/)).toBeTruthy();
    expect(screen.queryByText(/\$3\.000\.000/)).toBeNull();
  });

  it('la Hilux es Pick-up: $3.000.000', async () => {
    const user = userEvent.setup();
    render(<ReservaModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await hastaElPaso4(user, 'AF977FD');

    expect(screen.getByText(/\$3\.000\.000/)).toBeTruthy();
  });
});
