/**
 * "Hoy", el hover de fila/columna y el zoom del calendario (pedido del 27/09).
 *
 * > *"Que 'Hoy' me lleve directo al día y se vea un poco más."*
 * > *"Cuando paso por una fila que se resalte, lo mismo con las columnas."*
 *
 * Dos bugs viejos se fijan acá: "hoy" se calculaba en UTC —después de las 21
 * en Argentina marcaba el día siguiente— y el botón "Hoy" no hacía nada desde
 * la vista anual, que es la que abre por defecto.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = { ocupacion: null as any };

vi.mock('@/hooks/useOcupacion', () => ({
  useOcupacion: () => ({ data: estado.ocupacion, isLoading: false, error: null, refetch: vi.fn() }),
  useResumenAnual: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useCategorias', () => ({ useCategorias: () => ({ data: [{ id: 1, nombre: 'Compacto', orden: 1 }] }) }));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<any>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock('../reservas/ReservaModal', () => ({ ReservaModal: () => null }));
vi.mock('../reservas/ContratoRapidoModal', () => ({ ContratoRapidoModal: () => null }));
vi.mock('../reservas/CheckoutModal', () => ({ CheckoutModal: () => null }));
vi.mock('../reservas/ReservaInfoModal', () => ({ ReservaInfoModal: () => null }));
vi.mock('@/components/reservas/PanelResolverReserva', () => ({ PanelResolverReserva: () => null }));
vi.mock('@/components/shared/CalendarioAnual', () => ({ CalendarioAnual: () => null }));

import { OcupacionPage } from './OcupacionPage';

// La grilla son 120 columnas: con toda la suite corriendo en paralelo, montarla
// y hacer un par de clicks pasa a veces los 5 s por defecto.
vi.setConfig({ testTimeout: 20_000 });

// Sin `@types/node` en el proyecto: se llega a `process` por `globalThis`.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const TZ_ORIGINAL = env.TZ;

beforeAll(() => {
  // Argentina (UTC-3): a las 23:30 del 27, en UTC ya es el 28.
  env.TZ = 'America/Argentina/Buenos_Aires';
});
afterAll(() => {
  if (TZ_ORIGINAL === undefined) delete env.TZ;
  else env.TZ = TZ_ORIGINAL;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 27, 23, 30)); // 27/09/2026 23:30 local
  try { window.localStorage.clear(); } catch { /* sin storage */ }
  estado.ocupacion = {
    vehiculos: [
      { id: 10, patente: 'AA111AA', marca: 'Fiat', modelo: 'Cronos', categoria_id: 1, orden: 0, destino: 'alquiler' },
    ],
    eventos: [],
    sin_asignar: [],
    fechas_especiales: [],
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Hoy', () => {
  it('se marca con la fecha local, no la de UTC', async () => {
    const user = userEvent.setup();
    render(<OcupacionPage />);
    await user.click(screen.getByTitle('Vista timeline'));

    const encabezado = screen.getByText('HOY').closest('th') as HTMLElement;
    expect(encabezado.textContent).toContain('27/9');
    expect(encabezado.textContent).not.toContain('28/9');
    // Sólido: la clase inválida de antes (`bg-primary/10/90`) no pintaba nada.
    expect(encabezado.className).toContain('bg-primary');
  });

  it('desde la vista anual, "Hoy" lleva al timeline', async () => {
    const user = userEvent.setup();
    render(<OcupacionPage />);
    // Arranca en la anual (escritorio): no hay grilla por vehículo.
    expect(screen.queryByText('AA111AA')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoy' }));

    expect(screen.getByText('AA111AA')).toBeInTheDocument();
    expect(screen.getByText('HOY')).toBeInTheDocument();
  });

  it('la columna de hoy parpadea después de apretar "Hoy"', async () => {
    const user = userEvent.setup();
    const { container } = render(<OcupacionPage />);
    await user.click(screen.getByRole('button', { name: 'Hoy' }));

    expect(container.querySelector('table.ocup-flash')).not.toBeNull();
  });
});

describe('Hover de columna', () => {
  it('resalta la columna escribiendo una regla, sin re-dibujar la grilla', async () => {
    const user = userEvent.setup();
    const { container } = render(<OcupacionPage />);
    await user.click(screen.getByTitle('Vista timeline'));

    const celda = container.querySelector('td[data-col="3"]') as HTMLElement;
    fireEvent.mouseOver(celda);

    const reglas = Array.from(container.querySelectorAll('style')).map(s => s.textContent ?? '').join('\n');
    expect(reglas).toContain('[data-col="3"]');

    fireEvent.mouseLeave(container.querySelector('table.ocup-grid') as HTMLElement);
    const despues = Array.from(container.querySelectorAll('style')).map(s => s.textContent ?? '').join('\n');
    expect(despues).not.toContain('[data-col="3"]');
  });
});

describe('Zoom', () => {
  it('cambia el ancho de todas las columnas y queda guardado', async () => {
    const user = userEvent.setup();
    const { container } = render(<OcupacionPage />);
    await user.click(screen.getByTitle('Vista timeline'));

    await user.click(screen.getByRole('button', { name: 'Amplio' }));

    const cols = Array.from(container.querySelectorAll('colgroup col')).slice(1) as HTMLElement[];
    expect(cols.length).toBeGreaterThan(0);
    expect(new Set(cols.map(c => c.style.width))).toEqual(new Set(['220px']));
    expect(window.localStorage.getItem('ocupacion.zoom')).toBe('amplio');
  });

  it('arranca con el zoom guardado', async () => {
    window.localStorage.setItem('ocupacion.zoom', 'compacto');
    const user = userEvent.setup();
    render(<OcupacionPage />);
    await user.click(screen.getByTitle('Vista timeline'));

    expect(screen.getByRole('button', { name: 'Compacto' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('un valor basura en el storage no rompe nada', async () => {
    window.localStorage.setItem('ocupacion.zoom', 'gigante');
    const user = userEvent.setup();
    render(<OcupacionPage />);
    await user.click(screen.getByTitle('Vista timeline'));

    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  });
});
