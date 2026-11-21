/**
 * "Nueva campaña": quiénes → mensaje → mandar, con la vista previa de una
 * empresa real y el estado "todavía no hay casilla".
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const crear = { mutate: vi.fn(), isPending: false };
const prueba = { mutate: vi.fn(), isPending: false };
const pedidos: Record<string, unknown>[] = [];
let listo = true;

const plantillas = [
  {
    id: 'obra', nombre: 'Obra e industria', descripcion: 'Para constructoras.', segmentos: ['Constructoras'],
    asuntos: ['Camionetas para la obra', 'Otro asunto'], cuerpo: 'Hola {{empresa}}, ¿cómo va?',
    seguimientos: [{ dias: 5, cuerpo: 'Segundo' }, { dias: 12, cuerpo: 'Último' }],
  },
  {
    id: 'general', nombre: 'General', descripcion: 'Para cualquiera.', segmentos: [],
    asuntos: ['Autos para la empresa'], cuerpo: 'Buen día {{empresa}}', seguimientos: [],
  },
];
const empresas = [
  { id: 1, nombre: 'Constructora Sur', email: 'compras@sur.com.ar', segmento: 'Constructoras', ciudad: 'Bahía Blanca',
    notas: 'Tienen obra en el puerto' },
  { id: 2, nombre: 'Montajes Norte', email: 'info@norte.com.ar', segmento: 'Constructoras', ciudad: 'Bahía Blanca',
    notas: null },
];

function calculo(pedido: Record<string, unknown>) {
  const i = Number(pedido.indice ?? 0) % empresas.length;
  const e = empresas[i];
  const filtro = (pedido.filtro ?? {}) as Record<string, unknown>;
  const salen = filtro.segmento === 'Turismo' ? 0 : 2;
  return {
    total: salen + 3, salen, no_salen: { 'Ya son clientes': 2, 'Pidieron que no los contacten': 1 },
    segmentos: [{ segmento: 'Constructoras', cantidad: 2 }],
    plantilla_sugerida: 'obra', nombre_sugerido: 'Constructoras · 21/11',
    muestra: salen ? {
      indice: i, de: empresas.length, prospecto: e,
      asunto: String(pedido.asunto ?? ''), cuerpo: String(pedido.cuerpo ?? '').replace('{{empresa}}', e.nombre),
      faltantes: [], avisos: [], seguimientos: [],
    } : null,
    plan: {
      listo, motivo: listo ? null : 'No hay ninguna casilla activa.', casillas_activas: listo ? 2 : 0,
      simulado: false, solo_a: [], en_horario: true,
      cantidad: salen, por_dia: 30, dias: 1, termina: '2026-11-23', termina_texto: 'el lunes 23/11',
    },
  };
}

vi.mock('@/hooks/useProspectos', () => ({
  useAudiencias: () => ({ data: {
    todos: 5, nunca_contactados: 4, no_se_les_escribe: {},
    segmentos: [{ segmento: 'Constructoras', cantidad: 2 }, { segmento: 'Turismo', cantidad: 0 }],
    ciudades: [{ ciudad: 'Bahía Blanca', cantidad: 5 }, { ciudad: 'Punta Alta', cantidad: 1 }],
  } }),
  usePlantillasProspeccion: () => ({ data: {
    plantillas, variables: [{ nombre: 'empresa', ayuda: 'El nombre' }], firma: { nombre: 'Franco', telefono: '291 418-0554' },
  } }),
  useCalcularCampana: (pedido: Record<string, unknown> | null) => {
    if (pedido) pedidos.push(pedido);
    return { data: pedido ? calculo(pedido) : undefined, isFetching: false };
  },
  useCrearCampanaRapida: () => crear,
  useEnviarPrueba: () => prueba,
}));

import { NuevaCampana } from './NuevaCampana';

function abrir(props: Partial<React.ComponentProps<typeof NuevaCampana>> = {}) {
  const onIrACasillas = vi.fn();
  const onClose = vi.fn();
  render(<NuevaCampana onClose={onClose} onIrACasillas={onIrACasillas} {...props} />);
  return { onIrACasillas, onClose };
}

const ultimoPedido = () => pedidos[pedidos.length - 1];

describe('Nueva campaña', () => {
  beforeEach(() => {
    listo = true; pedidos.length = 0; crear.mutate.mockClear(); prueba.mutate.mockClear();
  });

  it('muestra los tres pasos', () => {
    abrir();
    expect(screen.getByRole('region', { name: 'Quiénes' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mensaje' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mandar' })).toBeTruthy();
  });

  it('quiénes: audiencias de un clic con el número y a quiénes no se les escribe', async () => {
    const user = userEvent.setup();
    abrir();
    expect(screen.getByRole('button', { name: /Todos los que tienen mail \(5\)/ })).toBeTruthy();
    expect(screen.getByTestId('salen').textContent).toBe('2');
    expect(screen.getByText(/A 3 no se les escribe/)).toBeTruthy();
    expect(screen.getByText(/Ya son clientes/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Los que nunca contactamos \(4\)/ }));
    await vi.waitFor(() => expect((ultimoPedido().filtro as Record<string, unknown>).nunca_contactados).toBe(true));
    await user.click(screen.getByRole('button', { name: /Constructoras \(2\)/ }));
    await vi.waitFor(() => expect((ultimoPedido().filtro as Record<string, unknown>).segmento).toBe('Constructoras'));
    // Siempre a los que se les puede escribir y tienen mail.
    expect(ultimoPedido().filtro).toMatchObject({ solo_contactables: true, con_mail: true });
  });

  it('con una selección de la tabla, la ofrece primero', async () => {
    abrir({ seleccion: { ids: [1, 2] }, cantidadSeleccionada: 2 });
    expect(screen.getByRole('button', { name: /Lo que elegiste en la tabla \(2\)/ }).getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(ultimoPedido().ids).toEqual([1, 2]));
  });

  it('mensaje: elige sola la plantilla del rubro y muestra la vista previa de una empresa real', async () => {
    const user = userEvent.setup();
    abrir();
    await vi.waitFor(() => expect((screen.getByLabelText('Asunto') as HTMLInputElement).value).toBe('Camionetas para la obra'));
    expect(screen.getByText(/· sugerida/)).toBeTruthy();
    const previa = await screen.findByTestId('vista-previa');
    await vi.waitFor(() => expect(within(previa).getByText(/Hola Constructora Sur/)).toBeTruthy());
    expect(within(previa).getByText('compras@sur.com.ar')).toBeTruthy();

    // La nota interna se ve al lado, nunca dentro del mail.
    expect(screen.getByText(/Nota interna \(no va en el mail\)/)).toBeTruthy();
    expect(within(previa).queryByText(/Tienen obra en el puerto/)).toBeNull();

    // Las flechas pasan a la próxima empresa.
    await user.click(screen.getByRole('button', { name: 'Empresa siguiente' }));
    await vi.waitFor(() => expect(within(screen.getByTestId('vista-previa')).getByText(/Hola Montajes Norte/)).toBeTruthy());
    expect(screen.getByText(/2 de 2/)).toBeTruthy();

    // Los seguimientos a 5 y 12 días vienen activados.
    expect((screen.getByLabelText('Sumar seguimiento a los 5 días') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Y un último a los 12 días') as HTMLInputElement).checked).toBe(true);
    await vi.waitFor(() => expect(ultimoPedido().seguimientos).toEqual([
      { dias: 5, cuerpo: 'Segundo' }, { dias: 12, cuerpo: 'Último' },
    ]));
  });

  it('editar el asunto se refleja en la vista previa', async () => {
    const user = userEvent.setup();
    abrir();
    const asunto = screen.getByLabelText('Asunto') as HTMLInputElement;
    await vi.waitFor(() => expect(asunto.value).toBe('Camionetas para la obra'));
    await user.clear(asunto);
    await user.type(asunto, 'Pick-ups para la parada');
    await vi.waitFor(() => expect(within(screen.getByTestId('vista-previa')).getByText('Pick-ups para la parada')).toBeTruthy());
  });

  it('mandar: resumen, nombre propuesto, prueba y confirmación antes de enviar', async () => {
    const user = userEvent.setup();
    abrir();
    await vi.waitFor(() => expect((screen.getByLabelText('Nombre de la campaña') as HTMLInputElement).value)
      .toBe('Constructoras · 21/11'));
    const resumen = screen.getByTestId('resumen-envio').textContent ?? '';
    expect(resumen).toMatch(/Salen 2 mails desde 2 casillas/);
    expect(resumen).toMatch(/termina el lunes 23\/11/);

    await user.click(screen.getByRole('button', { name: /Enviarme una prueba/ }));
    expect(prueba.mutate).toHaveBeenCalledWith(expect.objectContaining({ prospecto_id: 1 }), expect.anything());

    await user.click(screen.getByRole('button', { name: /^Enviar a 2/ }));
    expect(crear.mutate).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /Sí, enviar 2 mails/ }));
    expect(crear.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ enviar: true, nombre: 'Constructoras · 21/11', asunto: 'Camionetas para la obra' }),
      expect.anything(),
    );
  });

  it('sin casilla activa: guarda la lista y lleva a Casillas', async () => {
    listo = false;
    const user = userEvent.setup();
    const { onIrACasillas } = abrir();
    expect(screen.getByText(/Todavía no se puede enviar/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Enviar( a |$)/ })).toBeNull();

    const guardar = screen.getByRole('button', { name: 'Guardar lista para enviar' });
    await vi.waitFor(() => expect((guardar as HTMLButtonElement).disabled).toBe(false));
    await user.click(guardar);
    expect(crear.mutate).toHaveBeenCalledWith(expect.objectContaining({ enviar: false }), expect.anything());

    await user.click(screen.getByRole('button', { name: /Configurar casillas/ }));
    expect(onIrACasillas).toHaveBeenCalled();
  });

  it('una audiencia vacía no deja mandar', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('button', { name: /Turismo \(0\)/ }));
    await vi.waitFor(() => expect(screen.getByTestId('salen').textContent).toBe('0'));
    expect(screen.getByText(/No hay ninguna empresa a la que mandarle/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Enviar( a |$)/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
