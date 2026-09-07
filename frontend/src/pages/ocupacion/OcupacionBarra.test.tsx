/**
 * Lo que dice la barra de una reserva en el calendario.
 *
 * **Tres reportes del mostrador, todos sobre la misma barra de 180 píxeles:**
 *
 * > *"Ya entendí qué está pasando con la del aeropuerto: el nombre es tan largo
 * > que no me deja ver el horario."*
 *
 * > *"Es más importante entrega/devolución (lugar y horario) que el nombre."*
 *
 * > *"Ese cambio de horario no figura cuando haces la reserva en el calendario"*
 * > / *"aparecen mal los horarios de devolución"*.
 *
 * Y uno más sobre las filas:
 *
 * > *"La categoría Uber de un auto se debe ver en el calendario de ocupación,
 * > pero los autos debajo del todo, no entre medio de los otros."*
 *
 * Lo que se fija acá es que la barra muestre **la devolución que se pactó** y no
 * el fin del período facturado, que son cosas distintas y se veían mezcladas.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = {
  ocupacion: null as any,
  categorias: [] as any[],
};

vi.mock('@/hooks/useOcupacion', () => ({
  useOcupacion: () => ({ data: estado.ocupacion, isLoading: false, error: null, refetch: vi.fn() }),
  useResumenAnual: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useCategorias', () => ({ useCategorias: () => ({ data: estado.categorias }) }));
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

const COMPACTO = { id: 1, nombre: 'Compacto', orden: 1 };

function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function evento(over: Partial<any> = {}) {
  return {
    id: 1,
    vehiculo_id: 10,
    tipo: 'reserva',
    estado: 'confirmada',
    fecha_inicio: enDias(2),
    hora_inicio: '16:30:00',
    fecha_fin: enDias(4),
    hora_fin: '16:30:00',
    cliente_nombre: 'Juan Pérez',
    lugar_entrega: 'Aeropuerto Comandante Espora',
    lugar_devolucion: 'Paraguay 241',
    late_checkout: false,
    hora_devolucion_acordada: null,
    fecha_devolucion_acordada: null,
    origen: 'mostrador',
    ...over,
  };
}

function ocupacion(eventos: any[], vehiculos?: any[]) {
  return {
    vehiculos: vehiculos ?? [
      { id: 10, patente: 'AA111AA', marca: 'Fiat', modelo: 'Cronos', categoria_id: 1, orden: 0, destino: 'alquiler' },
    ],
    eventos,
    sin_asignar: [],
    fechas_especiales: [],
  };
}

async function montarTimeline() {
  const user = userEvent.setup();
  render(<OcupacionPage />);
  await user.click(screen.getByTitle('Vista timeline'));
  return user;
}

/** La barra de la reserva, con todo lo que dice adentro. */
function barra(): HTMLElement {
  return screen.getByTitle(/Juan Pérez/).closest('div') as HTMLElement;
}

beforeEach(() => {
  estado.categorias = [COMPACTO];
  estado.ocupacion = ocupacion([evento()]);
});

describe('El lugar en la barra', () => {
  it('abrevia el aeropuerto para que entre el horario', async () => {
    await montarTimeline();
    const texto = barra().textContent ?? '';

    expect(texto).toContain('AERO');
    expect(texto).not.toContain('Aeropuerto Comandante Espora');
    // Y el horario, que era lo que quedaba tapado, se ve.
    expect(texto).toContain('16:30');
  });

  it('deja entera una dirección corta', async () => {
    await montarTimeline();
    expect(barra().textContent).toContain('Paraguay 241');
  });

  it('el tooltip sí dice el nombre completo', async () => {
    // La abreviatura es por espacio. Al pasar el mouse hay lugar de sobra, y es
    // donde se confirma qué quiere decir "AERO".
    await montarTimeline();
    expect(screen.getByTitle(/Aeropuerto Comandante Espora/)).toBeInTheDocument();
  });
});

describe('El horario de devolución', () => {
  it('sin acuerdo, es el fin del período', async () => {
    await montarTimeline();
    expect(barra().textContent).toContain('16:30');
  });

  it('con late check-in, muestra la hora acordada y no la del período', async () => {
    // **El bug.** La barra mostraba `hora_fin` —el fin de lo que se factura— y
    // no la hora a la que el cliente tiene que estar en el mostrador.
    estado.ocupacion = ocupacion([evento({
      late_checkout: true,
      hora_devolucion_acordada: '08:30:00',
      fecha_devolucion_acordada: enDias(5),
    })]);
    await montarTimeline();

    expect(barra().textContent).toContain('08:30');
  });

  it('y avisa cuando la devolución cae al día siguiente', async () => {
    // Sin el "+1", una barra que termina el 06 mostrando "08:30" se lee como
    // una devolución más temprano — justo al revés de lo que pasa.
    estado.ocupacion = ocupacion([evento({
      late_checkout: true,
      hora_devolucion_acordada: '08:30:00',
      fecha_devolucion_acordada: enDias(5),
    })]);
    await montarTimeline();

    expect(barra().textContent).toContain('08:30 +1');
  });
});

describe('Los autos de Uber', () => {
  it('van en su propio grupo y al final', async () => {
    estado.ocupacion = ocupacion([], [
      { id: 10, patente: 'AA111AA', marca: 'Fiat', modelo: 'Cronos', categoria_id: 1, orden: 0, destino: 'alquiler' },
      { id: 11, patente: 'BB222BB', marca: 'Toyota', modelo: 'Etios', categoria_id: 1, orden: 1, destino: 'uber' },
    ]);
    await montarTimeline();

    const encabezados = screen.getAllByText(/Compacto|Uber/).map(e => e.textContent ?? '');
    const iCompacto = encabezados.findIndex(t => t.includes('Compacto'));
    const iUber = encabezados.findIndex(t => t.includes('Uber'));

    expect(iUber).toBeGreaterThan(-1);
    expect(iUber).toBeGreaterThan(iCompacto);
  });

  it('el grupo dice que no se alquilan', async () => {
    // Un auto de Uber "libre" en la grilla no es un auto que se pueda vender.
    estado.ocupacion = ocupacion([], [
      { id: 11, patente: 'BB222BB', marca: 'Toyota', modelo: 'Etios', categoria_id: 1, orden: 1, destino: 'uber' },
    ]);
    await montarTimeline();

    expect(screen.getByText(/Uber — no se alquilan/)).toBeInTheDocument();
  });
});

describe('El botón de nueva operación', () => {
  it('ofrece las dos puertas', async () => {
    // *"Sería genial que cuando lo aprieto me dé 2 opciones: nuevo contrato y
    // nueva reserva."*
    const user = await montarTimeline();
    await user.click(screen.getByRole('button', { name: /Nueva operación/i }));

    expect(await screen.findByText('Nueva reserva')).toBeInTheDocument();
    expect(screen.getByText(/Nuevo contrato/)).toBeInTheDocument();
  });
});
