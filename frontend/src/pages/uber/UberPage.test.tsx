/**
 * Tablero de Uber: quién pagó la semana y quién debe, y cobrar en dos clics.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { ContratoUber, TableroUber } from '@/hooks/useUber';

function contrato(cambios: Partial<ContratoUber>): ContratoUber {
  return {
    tipo_fila: 'contrato', alquiler_id: 1, reserva_id: 11, cliente_id: 5,
    chofer: 'Juan Pérez', telefono: '291 4180554',
    vehiculo_id: 7, patente: 'AB123CD', vehiculo: 'Fiat Cronos',
    fecha_inicio: '2026-11-02', fecha_fin: '2026-11-30', dias_para_terminar: 9,
    semana: { numero: 3, total: 4, desde: '2026-11-16', hasta: '2026-11-22' },
    valor_semana: 200000, modalidad: 'adelantado', nota_condicion: null,
    estado: 'al_dia', dias_atraso: 0, semanas_adeudadas: 0, adeudado: 0, exigible: 0,
    proxima_fecha: '2026-11-23', proximo_monto: 200000, saldo_total: 200000,
    cuota_a_cobrar: { numero: 4, monto: 200000, vencimiento: '2026-11-23' },
    km: null,
    cuotas: [
      { numero: 1, vencimiento: '2026-11-02', monto: 200000, pagado: 200000, saldo: 0, estado: 'paga', fecha_pago: '2026-11-02', medio_pago: 'efectivo' },
      { numero: 4, vencimiento: '2026-11-23', monto: 200000, pagado: 0, saldo: 200000, estado: 'pendiente', fecha_pago: null, medio_pago: null },
    ],
    lecturas: [],
    ...cambios,
  };
}

const AL_DIA = contrato({});
const ATRASADO = contrato({
  alquiler_id: 2, reserva_id: 12, cliente_id: 6, chofer: 'María Gómez', patente: 'ZZ999ZZ',
  estado: 'atrasado', dias_atraso: 9, semanas_adeudadas: 2, adeudado: 400000, exigible: 400000,
  saldo_total: 600000, cuota_a_cobrar: { numero: 2, monto: 200000, vencimiento: '2026-11-09' },
  km: {
    km_semana: 1500, precio_km_extra: 150, km_inicial: 10000, permitidos_hoy: 4000,
    ultima_fecha: '2026-11-16', ultimo_km: 13400,
    consumo: { recorridos: 3400, permitidos: 3000, excedidos: 400, porcentaje: 113, costo_estimado: 60000 },
  },
  cuotas: [
    { numero: 2, vencimiento: '2026-11-09', monto: 200000, pagado: 0, saldo: 200000, estado: 'vencida', fecha_pago: null, medio_pago: null },
  ],
  lecturas: [{ id: 1, fecha: '2026-11-16', km: 13400, recorridos: 3400, permitidos: 3000, excedidos: 400, porcentaje: 113, costo_estimado: 60000 }],
});
const VENCE_HOY = contrato({
  alquiler_id: 3, reserva_id: 13, chofer: 'Pedro Ruiz', patente: 'CC333CC', telefono: 'A COMPLETAR',
  estado: 'vence_hoy', exigible: 200000, cuota_a_cobrar: { numero: 3, monto: 200000, vencimiento: '2026-11-21' },
});
const A_ENTREGAR = contrato({
  tipo_fila: 'reserva', alquiler_id: null, reserva_id: 14, chofer: 'Ana Díaz', patente: 'DD444DD',
  estado: 'a_entregar', fecha_inicio: '2026-11-25',
});

const TABLERO: TableroUber = {
  hoy: '2026-11-21',
  resumen: { activos: 3, al_dia: 1, vence_hoy: 1, atrasados: 1, adeudado: 400000, a_cobrar_semana: 600000, a_entregar: 1 },
  // El orden por urgencia lo da el servidor.
  contratos: [ATRASADO, VENCE_HOY, AL_DIA, A_ENTREGAR],
  libres: [{ vehiculo_id: 40, patente: 'LI111BR', vehiculo: 'Toyota Etios', estado: 'disponible' }],
  pie: { ingreso_semanal: 600000, vencio_mes: 1000000, cobrado_mes: 600000, cobranza_mes_pct: 60, autos_ocupados: 3, autos_libres: 1 },
};

const cobrar = { mutate: vi.fn(), isPending: false };
const cargarKm = { mutate: vi.fn(), isPending: false };
const renovar = { mutate: vi.fn(), isPending: false };
let respuesta: { data?: TableroUber; isLoading: boolean; isError: boolean; refetch: () => void };

vi.mock('@/hooks/useUber', () => ({
  useTableroUber: () => respuesta,
  useCobrarSemanaUber: () => cobrar,
  useCargarKmUber: () => cargarKm,
  useRenovarUber: () => renovar,
}));
vi.mock('@/pages/reservas/ContratoRapidoModal', () => ({
  ContratoRapidoModal: ({ tipo, initialVehiculoId }: { tipo: string; initialVehiculoId?: number }) => (
    <div>contrato nuevo {tipo} auto {initialVehiculoId ?? 'sin elegir'}</div>
  ),
}));
vi.mock('@/pages/reservas/ReservaInfoModal', () => ({
  ReservaInfoModal: ({ reservaId }: { reservaId: number }) => <div>ficha de la reserva {reservaId}</div>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { UberPage } from './UberPage';

function abrir() {
  return render(<MemoryRouter><UberPage /></MemoryRouter>);
}
const tarjeta = (reservaId: number) => screen.getByTestId(`contrato-${reservaId}`);

beforeEach(() => {
  respuesta = { data: TABLERO, isLoading: false, isError: false, refetch: vi.fn() };
  cobrar.mutate.mockClear();
  cargarKm.mutate.mockClear();
  renovar.mutate.mockClear();
});

describe('Tablero de Uber', () => {
  it('muestra los cuatro números de arriba', () => {
    abrir();
    expect(screen.getByText('Choferes activos').nextSibling?.textContent).toBe('3');
    expect(screen.getByText('Con atraso').nextSibling?.textContent).toBe('1');
    expect(screen.getByText('$400.000 adeudados')).toBeTruthy();
    expect(screen.getByText('A cobrar esta semana').nextSibling?.textContent).toBe('$600.000');
  });

  it('cada chofer se ve con su estado, en el orden de urgencia', () => {
    abrir();
    const estados = screen.getAllByRole('listitem')
      .filter(li => li.dataset.estado)
      .map(li => li.dataset.estado);
    expect(estados).toEqual(['atrasado', 'vence_hoy', 'al_dia', 'a_entregar']);

    expect(within(tarjeta(12)).getByText('Debe 2 semanas · $400.000 · 9 días de atraso')).toBeTruthy();
    expect(within(tarjeta(13)).getByText('Hoy paga la semana 3 · $200.000')).toBeTruthy();
    expect(within(tarjeta(11)).getByText('Próximo pago: lun 23/11 · $200.000')).toBeTruthy();
    expect(within(tarjeta(11)).getByText(/Semana 3 de 4/)).toBeTruthy();
    expect(within(tarjeta(14)).getByText('Se entrega el mié 25/11')).toBeTruthy();
  });

  it('avisa del km pasado en la misma tarjeta', () => {
    abrir();
    expect(within(tarjeta(12)).getByText(/3\.400 de 3\.000 km · 400 de más/)).toBeTruthy();
  });

  it('una reserva sin entregar no se cobra ni se renueva desde acá', () => {
    abrir();
    expect(within(tarjeta(14)).queryByRole('button', { name: /Cobrar semana/ })).toBeNull();
    expect(within(tarjeta(14)).queryByRole('button', { name: /Renovar/ })).toBeNull();
    expect(within(tarjeta(11)).getByRole('button', { name: /Cobrar semana/ })).toBeTruthy();
  });

  it('el filtro rápido y el buscador acotan la lista', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('button', { name: /Atrasados 1/ }));
    expect(screen.queryByTestId('contrato-11')).toBeNull();
    expect(screen.getByTestId('contrato-12')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Todos 4/ }));
    await user.type(screen.getByLabelText('Buscar chofer o patente'), 'cc333');
    expect(screen.getByTestId('contrato-13')).toBeTruthy();
    expect(screen.queryByTestId('contrato-12')).toBeNull();
  });

  it('el WhatsApp sale con el número internacional y el mensaje según el estado', () => {
    abrir();
    const link = within(tarjeta(12)).getByRole('link', { name: 'WhatsApp a María Gómez' }) as HTMLAnchorElement;
    expect(link.href).toContain('https://wa.me/5492914180554?text=');
    expect(decodeURIComponent(link.href)).toContain('Hola María, te escribimos de Ubicar Rent. Tenés pendiente 2 semanas del Fiat Cronos ZZ999ZZ: $400.000');
    // Sin teléfono válido no hay link.
    expect(within(tarjeta(13)).queryByRole('link', { name: /WhatsApp/ })).toBeNull();
  });

  it('"Cobrar semana" abre el diálogo ya precargado y registra el cobro', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(tarjeta(11)).getByRole('button', { name: /Cobrar semana/ }));

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Cobrar semana 4')).toBeTruthy();
    expect(within(dialogo).getByText(/Juan Pérez · Fiat Cronos AB123CD/)).toBeTruthy();
    expect((within(dialogo).getByLabelText('Monto') as HTMLInputElement).value).toBe('200.000');
    expect((within(dialogo).getByLabelText('Medio de pago') as HTMLSelectElement).value).toBe('efectivo');
    // "Cuenta corriente" y echeq no son formas de cobrar la semana.
    const medios = Array.from((within(dialogo).getByLabelText('Medio de pago') as HTMLSelectElement).options).map(o => o.value);
    expect(medios).not.toContain('cuenta_corriente');
    expect(medios).not.toContain('echeq');
    expect((within(dialogo).getByLabelText('Fecha') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await user.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    expect(cobrar.mutate).toHaveBeenCalledTimes(1);
    expect(cobrar.mutate.mock.calls[0][0]).toMatchObject({ alquilerId: 1, monto: 200000, medio_pago: 'efectivo' });
  });

  it('si debe varias semanas ofrece cobrar todo lo atrasado', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(tarjeta(12)).getByRole('button', { name: /Cobrar semana/ }));
    const dialogo = screen.getByRole('dialog');
    expect((within(dialogo).getByLabelText('Monto') as HTMLInputElement).value).toBe('200.000');

    await user.click(within(dialogo).getByRole('button', { name: 'Cobrar todo lo atrasado ($400.000)' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    expect(cobrar.mutate.mock.calls[0][0]).toMatchObject({ alquilerId: 2, monto: 400000 });
  });

  it('no deja cobrar más de lo que queda del contrato', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(tarjeta(11)).getByRole('button', { name: /Cobrar semana/ }));
    const dialogo = screen.getByRole('dialog');
    const monto = within(dialogo).getByLabelText('Monto');
    await user.clear(monto);
    await user.type(monto, '900000');
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));
    expect(within(dialogo).getByRole('alert').textContent).toMatch(/Le quedan \$200\.000/);
    expect(cobrar.mutate).not.toHaveBeenCalled();
  });

  it('"Cargar km" muestra el consumo contra el tope mientras se tipea', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(tarjeta(12)).getByRole('button', { name: /Cargar km/ }));
    const dialogo = screen.getByRole('dialog');
    // Contrato desde el 02/11; a los 7 días el tope es 1.500 km.
    const fecha = within(dialogo).getByLabelText('Fecha');
    await user.clear(fecha);
    await user.type(fecha, '2026-11-09');
    await user.type(within(dialogo).getByLabelText('Km del odómetro'), '11800');
    expect(within(dialogo).getByTestId('consumo-km').textContent)
      .toBe('Lleva 1.800 de 1.500 km permitidos a esa fecha: se está pasando ~300 km ≈ $45.000 al cierre.');

    await user.click(within(dialogo).getByRole('button', { name: 'Guardar lectura' }));
    expect(cargarKm.mutate.mock.calls[0][0]).toEqual({ alquilerId: 2, fecha: '2026-11-09', km: 11800 });
  });

  it('"Renovar semanas" dice cuándo termina y cuántas cuotas genera', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(tarjeta(11)).getByRole('button', { name: /Renovar semanas/ }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByTestId('resumen-renovacion').textContent)
      .toBe('Termina el lun 28/12. Se agregan 4 cuotas de $200.000, una por semana ($800.000 en total).');

    await user.click(within(dialogo).getByRole('button', { name: '2' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Renovar' }));
    expect(renovar.mutate.mock.calls[0][0]).toEqual({
      alquilerId: 1, semanas: 2, valor_semana: 200000, permitir_solape: false,
    });
  });

  it('el detalle muestra las semanas con su pago, el km y los links', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('button', { name: 'Ver el detalle de Juan Pérez' }));
    expect(within(tarjeta(11)).getByText(/Paga el lun 02\/11 · Efectivo/)).toBeTruthy();
    expect(within(tarjeta(11)).getByText('Pendiente')).toBeTruthy();
    expect(within(tarjeta(11)).getByRole('link', { name: 'Cuenta corriente' }).getAttribute('href'))
      .toBe('/clientes/5?tab=cuenta-corriente');

    await user.click(within(tarjeta(11)).getByRole('button', { name: /Ver contrato \/ reserva #11/ }));
    expect(screen.getByText('ficha de la reserva 11')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Ver el detalle de María Gómez' }));
    expect(within(tarjeta(12)).getByText(/Vencida · debe \$200\.000/)).toBeTruthy();
    expect(within(tarjeta(12)).getByText(/13\.400 km/)).toBeTruthy();
  });

  it('los autos de Uber sin chofer se asignan con el auto ya elegido', async () => {
    const user = userEvent.setup();
    abrir();
    const libres = screen.getByRole('region', { name: 'Libres para asignar' });
    expect(within(libres).getByText('LI111BR')).toBeTruthy();
    await user.click(within(libres).getByRole('button', { name: 'Nuevo contrato Uber con LI111BR' }));
    expect(screen.getByText('contrato nuevo uber auto 40')).toBeTruthy();
  });

  it('el pie resume el negocio', () => {
    abrir();
    const pie = screen.getByRole('contentinfo');
    expect(pie.textContent).toContain('Ingreso semanal comprometido: $600.000');
    expect(pie.textContent).toContain('Cobranza del mes: 60 % ($600.000 de $1.000.000)');
    expect(pie.textContent).toContain('3 ocupados · 1 libres');
  });

  it('sin contratos invita a crear el primero', () => {
    respuesta = {
      data: { ...TABLERO, contratos: [], libres: [], resumen: { ...TABLERO.resumen, activos: 0, atrasados: 0, al_dia: 0, vence_hoy: 0, a_entregar: 0 } },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
    abrir();
    expect(screen.getByText('Todavía no hay contratos de Uber vigentes.')).toBeTruthy();
  });
});
