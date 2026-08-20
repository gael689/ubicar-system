/**
 * Tests del wizard de reserva.
 *
 * **Por qué existen.** Los dos bugs de frontend de la jornada del 21/08
 * estaban acá y en el calendario, y los 474 tests del backend no podían verlos:
 * eran de composición de pantalla, no de dominio. Lo que se fija acá es el
 * comportamiento por el que el paso 3 se reescribió — que el cupo sea el del
 * rango elegido, que la rotación se pueda tomar, y que elegir categoría no
 * deje puesto un auto de otra.
 *
 * **Los hooks van mockeados, la red no se toca.** Lo que se está probando es
 * la lógica de la pantalla; que el endpoint devuelva bien el cupo ya lo prueban
 * los tests del backend, y duplicar esa verificación acá sólo agregaría un
 * lugar más donde el criterio puede divergir.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Se declaran antes del import del componente: `vi.mock` se iza, pero los datos
// que devuelven se leen en tiempo de render, así que viven en objetos mutables
// que cada test ajusta.

const estado = {
  categorias: [] as any[],
  cupo: null as any,
  libres: null as any,
  semaforo: null as any,
  vehiculos: [] as any[],
};

vi.mock('@/hooks/useReservas', () => ({
  useReservas: () => ({
    createReserva: vi.fn(),
    updateReserva: vi.fn(),
    loading: false,
    error: null,
  }),
  descargarPdfReserva: vi.fn(),
}));
vi.mock('@/hooks/useVehiculos', () => ({
  useVehiculos: () => ({ data: { data: estado.vehiculos } }),
}));
vi.mock('@/hooks/useClientes', () => ({
  useClientes: () => ({ data: { data: [{ id: 1, nombre_completo: 'Juan Pérez', activo: true }] } }),
  useConductores: () => ({ data: [] }),
}));
vi.mock('@/hooks/useAdicionales', () => ({ useAdicionales: () => ({ data: [] }) }));
vi.mock('@/hooks/usePrecios', () => ({ useCalcularPrecio: () => ({ data: null }) }));
vi.mock('@/hooks/useConfiguracion', () => ({ useConfiguracion: () => ({ data: [] }) }));
vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({ data: estado.categorias }),
}));
vi.mock('@/hooks/useDisponibilidad', () => ({
  useDisponibilidadInterna: () => ({ data: estado.cupo, isLoading: false }),
  useVehiculosLibres: () => ({ data: estado.libres }),
}));
vi.mock('@/hooks/useSemaforo', () => ({
  usePreCheckoutPrevio: () => ({ data: estado.semaforo }),
}));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<any>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/lib/api', () => ({ default: { post: vi.fn(), get: vi.fn() }, api: { post: vi.fn(), get: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReservaModal } from './ReservaModal';

// ─── Datos de base ────────────────────────────────────────────────────────────

const COMPACTO = { id: 1, nombre: 'Compacto', orden: 1, franquicia_base: 1500000 };
const SUV = { id: 2, nombre: 'SUV', orden: 5, franquicia_base: 3000000 };

const AUTO_COMPACTO = {
  id: 10, patente: 'AA111AA', marca: 'Fiat', modelo: 'Cronos',
  categoria_id: 1, activo: true, estado: 'disponible',
};
const AUTO_SUV = {
  id: 20, patente: 'BB222BB', marca: 'Jeep', modelo: 'Renegade',
  categoria_id: 2, activo: true, estado: 'disponible',
};

/**
 * La fecha con la que arranca el formulario.
 *
 * El wizard abre con el retiro en **hoy**, así que la rotación tiene que
 * proponer una entrega de hoy para que `aplicarRotacion` la acepte: si cae
 * otro día no se automatiza, y ese es justamente otro de los tests.
 */
const HOY = new Date().toISOString().split('T')[0];

function cupo(categorias: any[]) {
  return { fecha_inicio: HOY, fecha_fin: HOY, dias: 2, categorias };
}

function filaCupo(over: Partial<any> = {}) {
  return {
    categoria_id: 1, codigo: 'COMP', nombre: 'Compacto',
    disponibles: 3, hay_cupo: true, ultima_unidad: false,
    franquicia_base: 1500000, rotacion: null,
    precio: { total: '100000', precio_dia_promedio: '50000', dias: 2 },
    ...over,
  };
}

function abrir(props: Partial<React.ComponentProps<typeof ReservaModal>> = {}) {
  return render(
    <ReservaModal onClose={vi.fn()} onSuccess={vi.fn()} {...props} />
  );
}

/**
 * Lleva el wizard hasta el paso pedido, completando lo mínimo de cada uno.
 *
 * Los lugares son chips (dos grupos con las mismas etiquetas: entrega y
 * devolución), así que se toma el primero y el segundo de cada nombre.
 */
async function avanzarHasta(user: ReturnType<typeof userEvent.setup>, paso: number) {
  // Paso 1: el cliente
  await user.click(screen.getByPlaceholderText(/Buscar por nombre/i));
  await user.click(await screen.findByText('Juan Pérez'));
  await user.click(screen.getByRole('button', { name: /Siguiente/ }));
  if (paso === 2) return;
  // Paso 2: los lugares. Las fechas ya vienen con un default usable.
  await user.click(screen.getAllByRole('button', { name: 'Paraguay 241' })[0]);
  await user.click(screen.getAllByRole('button', { name: 'Alsina 350' })[1]);
  await user.click(screen.getByRole('button', { name: /Siguiente/ }));
}

/** El desplegable de vehículo del paso 3 (el único combobox de ese paso). */
function selectDeVehiculo(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement;
}

beforeEach(() => {
  // El borrador vive en `localStorage`: sin limpiarlo, el de un test le
  // aparece al siguiente como un cartel de "retomar" que nadie pidió.
  localStorage.clear();
  estado.categorias = [COMPACTO, SUV];
  estado.vehiculos = [AUTO_COMPACTO, AUTO_SUV];
  estado.cupo = cupo([
    filaCupo(),
    filaCupo({ categoria_id: 2, nombre: 'SUV', codigo: 'SUV', disponibles: 2 }),
  ]);
  estado.libres = { categoria_id: null, categoria_nombre: null, vehiculos: [] };
  estado.semaforo = null;
});

// ─────────────────────────────────────────────────────────────────────────────

describe('El orden de los pasos', () => {
  it('abre en el paso 1 y pide el cliente antes de dejar avanzar', async () => {
    const user = userEvent.setup();
    abrir();

    expect(screen.getByText(/Paso 1 de 6/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText(/Elegí un cliente para seguir/)).toBeInTheDocument();
    expect(screen.getByText(/Paso 1 de 6/)).toBeInTheDocument();
  });

  it('muestra lo que vino precargado del calendario, ya en el paso 1', () => {
    // El bug: se clickeaba una celda del calendario, llegaban el auto y la
    // fecha, y no se veían hasta el paso 3 — como si el click no hubiera hecho
    // nada.
    abrir({ initialVehiculoId: 10, initialFechaInicio: '2026-09-10' });

    expect(screen.getByText(/Desde el calendario/)).toBeInTheDocument();
    expect(screen.getByText(/AA111AA/)).toBeInTheDocument();
    expect(screen.getByText(/retiro 10\/09\/2026/)).toBeInTheDocument();
  });
});

describe('Paso 3 — el cupo de las fechas elegidas', () => {
  it('muestra cuántas unidades quedan libres por categoría', async () => {
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    expect(screen.getByText('3 libres')).toBeInTheDocument();
    expect(screen.getByText('2 libres')).toBeInTheDocument();
  });

  it('avisa cuando queda una sola unidad', async () => {
    estado.cupo = cupo([filaCupo({ disponibles: 1, ultima_unidad: true })]);
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    expect(screen.getByText(/Última unidad/i)).toBeInTheDocument();
  });

  it('marca sin cupo la categoría que no tiene unidades', async () => {
    estado.cupo = cupo([filaCupo({ disponibles: 0, hay_cupo: false })]);
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    expect(screen.getByText(/Sin cupo/i)).toBeInTheDocument();
  });

  it('distingue "sin precio cargado" de "no hay unidades"', async () => {
    // El caso real de hoy: `tarifas` está vacía, así que la categoría no puede
    // cotizar. Decir "no hay autos" cuando el problema es que falta el precio
    // manda a buscar el problema al lugar equivocado.
    estado.cupo = cupo([filaCupo({ hay_cupo: false, precio: null })]);
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    expect(screen.getByText(/Sin precio cargado/i)).toBeInTheDocument();
  });
});

describe('Paso 3 — la entrega por rotación', () => {
  const CON_ROTACION = filaCupo({
    disponibles: 0,
    hay_cupo: false,
    rotacion: {
      fecha_entrega: HOY,
      hora_entrega: '14:00',
      hora_devolucion_unidad: '10:00',
      margen_horas: 2,
    },
  });

  it('ofrece la entrega más tarde, y explica de dónde sale la hora', async () => {
    estado.cupo = cupo([CON_ROTACION]);
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    expect(screen.getByText(/vuelve a las 10:00/)).toBeInTheDocument();
    expect(screen.getByText(/entregar a las 14:00/)).toBeInTheDocument();
  });

  it('tomarla mueve la hora de retiro', async () => {
    estado.cupo = cupo([CON_ROTACION]);
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    await user.click(screen.getByText(/entregar a las 14:00/));

    // Volver al paso 2 para ver la hora ya cambiada. Son **dos** campos: por
    // D-18 el auto se devuelve a la misma hora en que se entrega, así que
    // `horaFin` se deriva de `horaInicio` y las dos tienen que moverse juntas.
    await user.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(screen.getAllByDisplayValue('14:00')).toHaveLength(2);
  });

  it('una unidad que se libera otro día se muestra pero no se aplica sola', async () => {
    // Mover la fecha de retiro no es "entregar más tarde", es otra reserva:
    // esa decisión no se automatiza.
    estado.cupo = cupo([filaCupo({
      disponibles: 0, hay_cupo: false,
      rotacion: {
        fecha_entrega: '2099-01-01', hora_entrega: '14:00',
        hora_devolucion_unidad: '10:00', margen_horas: 2,
      },
    })]);
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    await user.click(screen.getByText(/entregar a las 14:00/));
    await user.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(screen.queryByDisplayValue('14:00')).not.toBeInTheDocument();
  });

  it('no ofrece rotación cuando hay cupo', async () => {
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    expect(screen.queryByText(/entregar a las/)).not.toBeInTheDocument();
  });
});

describe('Paso 3 — el auto', () => {
  it('ofrece sólo los que están libres en esas fechas', async () => {
    // El bug original: listaba la flota entera sin mirar el rango, así que se
    // podía elegir un auto ya comprometido y el conflicto salía después de
    // crear la reserva.
    estado.libres = {
      categoria_id: 1, categoria_nombre: 'Compacto',
      vehiculos: [{
        ...AUTO_COMPACTO, categoria_nombre: 'Compacto',
        es_categoria_pedida: true, es_downgrade: false,
      }],
    };
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    const select = selectDeVehiculo();
    expect(within(select).getByText(/AA111AA/)).toBeInTheDocument();
    expect(within(select).queryByText(/BB222BB/)).not.toBeInTheDocument();
  });

  it('"Ver toda la flota" trae el resto, marcando los comprometidos', async () => {
    estado.libres = {
      categoria_id: 1, categoria_nombre: 'Compacto',
      vehiculos: [{
        ...AUTO_COMPACTO, categoria_nombre: 'Compacto',
        es_categoria_pedida: true, es_downgrade: false,
      }],
    };
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    await user.click(screen.getByRole('button', { name: /Ver toda la flota/ }));

    expect(screen.getByText(/BB222BB.*comprometido/)).toBeInTheDocument();
  });

  it('elegir otra categoría suelta el auto que ya no le corresponde', async () => {
    // Dejarlo puesto sería reservar un compacto diciendo SUV: el precio, la
    // franquicia y el cupo saldrían de categorías distintas.
    estado.libres = {
      categoria_id: null, categoria_nombre: null,
      vehiculos: [
        { ...AUTO_COMPACTO, categoria_nombre: 'Compacto', es_categoria_pedida: false, es_downgrade: false },
        { ...AUTO_SUV, categoria_nombre: 'SUV', es_categoria_pedida: false, es_downgrade: false },
      ],
    };
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    const select = selectDeVehiculo();
    await user.selectOptions(select, '10');
    expect(select.value).toBe('10');

    // Ahora se elige SUV, que no es la categoría de ese auto.
    await user.click(screen.getByText('SUV'));
    expect(select.value).toBe('');
  });

  it('no exige auto: alcanza con la categoría', async () => {
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    await user.click(screen.getByText('Compacto'));
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    expect(screen.getByText(/Paso 4 de 6/)).toBeInTheDocument();
  });

  it('sin auto ni categoría no deja avanzar', async () => {
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 3);

    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText(/Elegí un auto, o al menos la categoría/)).toBeInTheDocument();
  });
});

describe('Paso 6 — el semáforo lo trae el backend', () => {
  async function llegarAlResumen(user: ReturnType<typeof userEvent.setup>) {
    await avanzarHasta(user, 3);
    await user.click(screen.getByText('Compacto'));
    await user.click(screen.getByRole('button', { name: /Siguiente/ })); // → 4
    await user.type(screen.getByPlaceholderText('Ej: 140000'), '100000');
    await user.click(screen.getByRole('button', { name: /Siguiente/ })); // → 5
    // El ancla es lo único obligatorio del paso 5 al crear.
    await user.click(screen.getByRole('button', { name: /Al entregar el auto/ }));
  }

  it('separa lo que frena la entrega de lo que sólo avisa', async () => {
    estado.semaforo = {
      semaforo: 'rojo',
      items: [
        { codigo: 'vtv_vencida', mensaje: 'La VTV del vehículo venció el 2026-01-01', severidad: 'bloqueante' },
        { codigo: 'sin_garantia', mensaje: 'La reserva no tiene garantía/depósito definido', severidad: 'advertencia' },
      ],
    };
    const user = userEvent.setup();
    abrir();
    await llegarAlResumen(user);
    await user.click(screen.getByRole('button', { name: /Siguiente/ })); // → 6

    expect(screen.getByText(/Esto va a frenar la entrega/)).toBeInTheDocument();
    expect(screen.getByText(/La VTV del vehículo venció/)).toBeInTheDocument();
    expect(screen.getByText(/Se puede guardar igual, pero/)).toBeInTheDocument();
    expect(screen.getByText(/no tiene garantía/)).toBeInTheDocument();
  });

  it('sin bloqueantes no muestra el bloque rojo', async () => {
    estado.semaforo = {
      semaforo: 'amarillo',
      items: [
        { codigo: 'sin_garantia', mensaje: 'La reserva no tiene garantía/depósito definido', severidad: 'advertencia' },
      ],
    };
    const user = userEvent.setup();
    abrir();
    await llegarAlResumen(user);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    expect(screen.queryByText(/Esto va a frenar la entrega/)).not.toBeInTheDocument();
    expect(screen.getByText(/Se puede guardar igual, pero/)).toBeInTheDocument();
  });

  it('el semáforo no duplica lo que ya calcula el formulario', async () => {
    // La garantía la reporta el backend. Si el resumen la agregara además por
    // su cuenta, aparecería dos veces — que es el síntoma de tener dos
    // criterios en paralelo, justo lo que este refactor vino a sacar.
    estado.semaforo = {
      semaforo: 'amarillo',
      items: [
        { codigo: 'sin_garantia', mensaje: 'La reserva no tiene garantía/depósito definido', severidad: 'advertencia' },
      ],
    };
    const user = userEvent.setup();
    abrir();
    await llegarAlResumen(user);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    expect(screen.getAllByText(/garantía/i).filter(
      el => el.tagName === 'LI'
    )).toHaveLength(1);
  });
});


describe('El borrador de lo que quedó a medio cargar', () => {
  it('no muestra nada cuando no hay borrador', () => {
    abrir();
    expect(screen.queryByText(/a medio cargar/)).not.toBeInTheDocument();
  });

  it('ofrece retomar lo que quedó, sin aplicarlo solo', async () => {
    // Aplicar sin preguntar pisaría lo que la persona acaba de empezar a
    // cargar, que es peor que perder el borrador.
    const user = userEvent.setup();
    const { unmount } = abrir();
    await avanzarHasta(user, 2);
    unmount();

    abrir();
    expect(screen.getByText(/Quedó una reserva a medio cargar/)).toBeInTheDocument();
    // Todavía no se aplicó: sigue en el paso 1 y sin cliente.
    expect(screen.getByText(/Paso 1 de 6/)).toBeInTheDocument();
  });

  it('retomarlo repone los datos y el paso', async () => {
    const user = userEvent.setup();
    const { unmount } = abrir();
    await avanzarHasta(user, 3);
    unmount();

    abrir();
    await user.click(screen.getByRole('button', { name: /Retomarla/ }));

    expect(screen.getByText(/Paso 3 de 6/)).toBeInTheDocument();
    expect(screen.queryByText(/a medio cargar/)).not.toBeInTheDocument();

    // Y el cliente sigue puesto: se ve volviendo al paso 1, que es donde vive
    // ese campo.
    await user.click(screen.getByRole('button', { name: /Atrás/ }));
    await user.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(screen.getByDisplayValue('Juan Pérez')).toBeInTheDocument();
  });

  it('"Empezar de cero" lo descarta y no vuelve', async () => {
    const user = userEvent.setup();
    const { unmount } = abrir();
    await avanzarHasta(user, 2);
    unmount();

    abrir();
    await user.click(screen.getByRole('button', { name: /Empezar de cero/ }));
    expect(screen.queryByText(/a medio cargar/)).not.toBeInTheDocument();

    // Y sigue descartado al volver a abrir.
    cleanup();
    abrir();
    expect(screen.queryByText(/a medio cargar/)).not.toBeInTheDocument();
  });

  it('nunca guarda los datos de la tarjeta', async () => {
    // El sistema ya tiene un problema abierto por guardar datos de tarjeta;
    // meterlos además en el navegador de una máquina compartida sería
    // empeorarlo por comodidad.
    const user = userEvent.setup();
    abrir();
    await avanzarHasta(user, 2);

    const crudo = localStorage.getItem('ubicar:borrador-reserva') ?? '';
    expect(crudo).not.toContain('garantiaTarjetaNumero');
    expect(crudo).not.toContain('garantia_tarjeta_numero');
    expect(crudo).not.toContain('garantiaTarjetaTitular');
  });

  it('un borrador de más de 24 horas no se ofrece', () => {
    // Un borrador de anteayer no es trabajo a medio hacer, es basura: ofrecerlo
    // enseña a descartar sin leer.
    localStorage.setItem('ubicar:borrador-reserva', JSON.stringify({
      guardadoEn: Date.now() - 25 * 60 * 60 * 1000,
      datos: { paso: 3, clienteId: '1' },
    }));
    abrir();
    expect(screen.queryByText(/a medio cargar/)).not.toBeInTheDocument();
  });

  it('un borrador corrupto no rompe el formulario', () => {
    localStorage.setItem('ubicar:borrador-reserva', 'esto no es json');
    abrir();
    expect(screen.getByText(/Paso 1 de 6/)).toBeInTheDocument();
    expect(screen.queryByText(/a medio cargar/)).not.toBeInTheDocument();
  });
});
