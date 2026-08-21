/**
 * Tests del calendario de ocupación.
 *
 * **Por qué existen.** Los dos bugs que la revisión del 21/08 encontró acá eran
 * de composición de pantalla y ningún test del backend podía verlos: la fila
 * "Por asignar" ignoraba los filtros, y dos reservas sin asignar que se pisaban
 * se dibujaban una encima de la otra. Los dos hacían que la grilla dijera algo
 * distinto de lo que pasaba, en la pantalla que se mira todo el día.
 *
 * Lo que se fija acá es eso: **que la grilla no mienta**. No se prueba el
 * cálculo de ocupación —eso vive en el backend y ya tiene sus tests—, sino que
 * lo que llega se muestre entero y coherente con los filtros puestos.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = {
  ocupacion: null as any,
  categorias: [] as any[],
};

vi.mock('@/hooks/useOcupacion', () => ({
  useOcupacion: () => ({
    data: estado.ocupacion,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useResumenAnual: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({ data: estado.categorias }),
}));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<any>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), put: vi.fn() },
  api: { get: vi.fn(), put: vi.fn() },
}));
// Los modales que la página puede abrir no aportan nada acá y arrastran medio
// árbol de dependencias con ellos.
vi.mock('../reservas/ReservaModal', () => ({ ReservaModal: () => null }));
vi.mock('../reservas/CheckoutModal', () => ({ CheckoutModal: () => null }));
vi.mock('../reservas/ReservaInfoModal', () => ({ ReservaInfoModal: () => null }));
vi.mock('@/components/reservas/PanelResolverReserva', () => ({
  PanelResolverReserva: () => null,
}));
vi.mock('@/components/shared/CalendarioAnual', () => ({ CalendarioAnual: () => null }));

import { OcupacionPage } from './OcupacionPage';

// ─── Datos ────────────────────────────────────────────────────────────────────

const COMPACTO = { id: 1, nombre: 'Compacto', orden: 1 };
const SUV = { id: 2, nombre: 'SUV', orden: 5 };

/** Un rango que cae dentro de los 120 días que dibuja la grilla. */
function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function reservaSinAsignar(over: Partial<any> = {}) {
  return {
    id: 1,
    estado: 'confirmada',
    fecha_inicio: enDias(2),
    hora_inicio: '10:00:00',
    fecha_fin: enDias(5),
    hora_fin: '10:00:00',
    vehiculo_id: null,
    categoria_id: 1,
    categoria: { id: 1, nombre: 'Compacto' },
    cliente: { nombre_completo: 'Ana Gómez' },
    lugar_entrega: 'Paraguay 241',
    lugar_devolucion: 'Paraguay 241',
    origen: 'mostrador',
    ...over,
  };
}

function ocupacion(sinAsignar: any[]) {
  return {
    vehiculos: [
      { id: 10, patente: 'AA111AA', marca: 'Fiat', modelo: 'Cronos', categoria_id: 1, orden: 0 },
    ],
    eventos: [],
    sin_asignar: sinAsignar,
    fechas_especiales: [],
  };
}

/**
 * Monta el calendario y lo pone en la vista timeline.
 *
 * El modo por defecto es el anual, que es un resumen del año y no tiene filas
 * por vehículo — la grilla con la fila "Por asignar" es la timeline.
 */
async function montarTimeline(user: ReturnType<typeof userEvent.setup>) {
  render(<OcupacionPage />);
  await user.click(screen.getByTitle('Vista timeline'));
}

/** La fila "Por asignar", con todo lo que hay dentro. */
function filaPorAsignar(): HTMLElement {
  return screen.getByText('Por asignar').closest('tr') as HTMLElement;
}

beforeEach(() => {
  estado.categorias = [COMPACTO, SUV];
  estado.ocupacion = ocupacion([reservaSinAsignar()]);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('La fila "Por asignar"', () => {
  it('muestra las reservas vendidas que todavía no tienen auto', async () => {
    // El bug original era el opuesto: el frontend descartaba las reservas sin
    // vehículo aunque el backend las mandaba. Eran sobreventa invisible.
    await montarTimeline(userEvent.setup());

    expect(screen.getByText('Por asignar')).toBeInTheDocument();
    expect(within(filaPorAsignar()).getByText('Ana Gómez')).toBeInTheDocument();
  });

  it('no aparece cuando no hay ninguna sin asignar', async () => {
    // Una fila vacía permanente sería ruido en la pantalla de inicio.
    estado.ocupacion = ocupacion([]);
    await montarTimeline(userEvent.setup());

    expect(screen.queryByText('Por asignar')).not.toBeInTheDocument();
  });

  it('respeta el filtro de canal', async () => {
    // **El bug.** La fila nacía de `sinAsignar` crudo: con el filtro en
    // "Mostrador" seguía mostrando las reservas web. Es la fila desde la que se
    // arrastra para asignar, o sea justo donde equivocarse cuesta.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({ id: 1, cliente: { nombre_completo: 'Ana Gómez' }, origen: 'mostrador' }),
      reservaSinAsignar({ id: 2, cliente: { nombre_completo: 'Web Cliente' }, origen: 'web' }),
    ]);
    const user = userEvent.setup();
    await montarTimeline(user);

    expect(within(filaPorAsignar()).getByText('Ana Gómez')).toBeInTheDocument();
    expect(within(filaPorAsignar()).getByText('Web Cliente')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Mostrador$/i }));

    expect(within(filaPorAsignar()).getByText('Ana Gómez')).toBeInTheDocument();
    expect(within(filaPorAsignar()).queryByText('Web Cliente')).not.toBeInTheDocument();
  });

  it('respeta el filtro de categoría', async () => {
    estado.ocupacion = ocupacion([
      reservaSinAsignar({ id: 1, cliente: { nombre_completo: 'De Compacto' }, categoria_id: 1 }),
      reservaSinAsignar({
        id: 2, cliente: { nombre_completo: 'De SUV' },
        categoria_id: 2, categoria: { id: 2, nombre: 'SUV' },
      }),
    ]);
    const user = userEvent.setup();
    await montarTimeline(user);

    expect(within(filaPorAsignar()).getByText('De SUV')).toBeInTheDocument();

    // Por `title` y no por posición: la barra tiene otros selects (el mes,
    // entre ellos) y elegir "1" en el equivocado movía el calendario de mes,
    // que hacía desaparecer las dos reservas por un motivo que no era el filtro.
    await user.selectOptions(
      screen.getByTitle('Mostrar sólo los autos de una categoría'), '1'
    );

    expect(within(filaPorAsignar()).getByText('De Compacto')).toBeInTheDocument();
    expect(within(filaPorAsignar()).queryByText('De SUV')).not.toBeInTheDocument();
  });

  it('una reserva sin origen cuenta como de mostrador', async () => {
    // `origen` es opcional en el tipo. Un `undefined` no puede hacer
    // desaparecer una reserva al filtrar por mostrador: el default del backend
    // es justamente ese.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({ cliente: { nombre_completo: 'Sin Origen' }, origen: undefined }),
    ]);
    const user = userEvent.setup();
    await montarTimeline(user);

    await user.click(screen.getByRole('button', { name: /^Mostrador$/i }));
    expect(within(filaPorAsignar()).getByText('Sin Origen')).toBeInTheDocument();
  });
});

describe('Dos reservas sin asignar que se pisan', () => {
  it('se ven las dos, en carriles distintos', async () => {
    // **El bug.** La fila es una sola para N reservas, y a diferencia de las
    // filas de vehículo —donde dos simultáneas serían sobreventa— acá lo normal
    // es que convivan. Con posicionamiento absoluto y sin carriles, la segunda
    // tapaba a la primera y la fila decía que había una sola pendiente.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({
        id: 1, cliente: { nombre_completo: 'Primera' },
        fecha_inicio: enDias(2), fecha_fin: enDias(6),
      }),
      reservaSinAsignar({
        id: 2, cliente: { nombre_completo: 'Segunda' },
        fecha_inicio: enDias(3), fecha_fin: enDias(7),
      }),
    ]);
    await montarTimeline(userEvent.setup());

    const fila = filaPorAsignar();
    const primera = within(fila).getByText('Primera').closest('[draggable]') as HTMLElement;
    const segunda = within(fila).getByText('Segunda').closest('[draggable]') as HTMLElement;

    expect(primera).toBeTruthy();
    expect(segunda).toBeTruthy();
    // Distinto `top`: es lo que hace que no se tapen.
    expect(primera.style.top).not.toBe(segunda.style.top);
  });

  it('dos que no se pisan comparten carril', async () => {
    // El carril crece con los solapamientos, no con la cantidad de reservas:
    // si no se pisan, la fila no tiene por qué ocupar el doble de alto.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({
        id: 1, cliente: { nombre_completo: 'Primera' },
        fecha_inicio: enDias(2), fecha_fin: enDias(4),
      }),
      reservaSinAsignar({
        id: 2, cliente: { nombre_completo: 'Segunda' },
        fecha_inicio: enDias(10), fecha_fin: enDias(12),
      }),
    ]);
    await montarTimeline(userEvent.setup());

    const fila = filaPorAsignar();
    const primera = within(fila).getByText('Primera').closest('[draggable]') as HTMLElement;
    const segunda = within(fila).getByText('Segunda').closest('[draggable]') as HTMLElement;

    expect(primera.style.top).toBe(segunda.style.top);
  });

  it('el botón de asignar está a la vista en cada una', async () => {
    // Que la acción esté sólo en el arrastre la vuelve invisible: hay que
    // saber que está.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({ id: 1, cliente: { nombre_completo: 'Primera' } }),
      reservaSinAsignar({
        id: 2, cliente: { nombre_completo: 'Segunda' },
        fecha_inicio: enDias(3), fecha_fin: enDias(7),
      }),
    ]);
    await montarTimeline(userEvent.setup());

    expect(
      within(filaPorAsignar()).getAllByRole('button', { name: /Asignar auto/i })
    ).toHaveLength(2);
  });
});


describe('La lista de las sin asignar', () => {
  it('se abre desde la etiqueta y las muestra todas, caigan donde caigan', async () => {
    // **El problema que resuelve.** Las barras se dibujan en la columna de su
    // fecha: con 120 días de grilla y 180px por día, una reserva de dentro de
    // dos meses está a más de diez mil píxeles a la derecha. La fila decía
    // "2 reservas sin auto" y no se veía ninguna.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({
        id: 1, cliente: { nombre_completo: 'Cerca' },
        fecha_inicio: enDias(2), fecha_fin: enDias(4),
      }),
      reservaSinAsignar({
        id: 2, cliente: { nombre_completo: 'Lejos' },
        fecha_inicio: enDias(85), fecha_fin: enDias(90),
      }),
    ]);
    const user = userEvent.setup();
    await montarTimeline(user);

    await user.click(screen.getByRole('button', { name: /Por asignar/i }));

    const dialogo = screen.getByText('Reservas sin auto asignado').closest('div')!
      .parentElement!.parentElement as HTMLElement;
    expect(within(dialogo).getByText('Cerca')).toBeInTheDocument();
    expect(within(dialogo).getByText('Lejos')).toBeInTheDocument();
  });

  it('ofrece Ir, Detalle y Asignar en cada una', async () => {
    const user = userEvent.setup();
    await montarTimeline(user);

    await user.click(screen.getByRole('button', { name: /Por asignar/i }));

    expect(screen.getByRole('button', { name: /^Ir$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Detalle$/ })).toBeInTheDocument();
    // "Asignar auto" ya existe en la barra de la fila, así que hay dos.
    expect(screen.getAllByRole('button', { name: /Asignar auto/i }).length).toBeGreaterThan(1);
  });

  it('"Ir" cierra la lista', async () => {
    // Cerrarla es parte de la acción: el punto de "Ir" es mirar el calendario,
    // y dejarla abierta encima lo tapa.
    const user = userEvent.setup();
    await montarTimeline(user);

    await user.click(screen.getByRole('button', { name: /Por asignar/i }));
    await user.click(screen.getByRole('button', { name: /^Ir$/ }));

    expect(screen.queryByText('Reservas sin auto asignado')).not.toBeInTheDocument();
  });

  it('respeta los filtros, igual que la fila', async () => {
    // Que el botón mostrara cosas que la grilla esconde sería otra forma de
    // que la pantalla mienta.
    estado.ocupacion = ocupacion([
      reservaSinAsignar({ id: 1, cliente: { nombre_completo: 'De Mostrador' }, origen: 'mostrador' }),
      reservaSinAsignar({ id: 2, cliente: { nombre_completo: 'De Web' }, origen: 'web' }),
    ]);
    const user = userEvent.setup();
    await montarTimeline(user);

    await user.click(screen.getByRole('button', { name: /^Mostrador$/i }));
    await user.click(screen.getByRole('button', { name: /Por asignar/i }));

    // Aparece dos veces —en la barra de la fila y en la lista—, que es lo
    // correcto: son la misma reserva vista de dos formas.
    expect(screen.getAllByText('De Mostrador').length).toBeGreaterThan(0);
    expect(screen.queryByText('De Web')).not.toBeInTheDocument();
  });
});
