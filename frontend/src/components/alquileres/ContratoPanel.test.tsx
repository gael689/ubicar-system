/**
 * El panel del contrato con el pagaré abajo.
 *
 * Pedido de Ubicar (12/09): "que dice generar contrato, también abajo debe
 * salir generar pagaré; si se generan los dos comparten el mismo link".
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const crearContrato = vi.fn();
const crearPagare = vi.fn();
const mut = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
let contratoActual: any = null;
let pagareActual: any = null;
let preparadoPagare: any = null;

vi.mock('@/hooks/useContratos', () => ({
  useContratoDeReserva: () => ({ data: contratoActual, isLoading: false }),
  usePrepararContrato: () => ({ data: { snapshot: SNAPSHOT, falta_datos_fiscales: false } }),
  useCrearContrato: () => ({ mutate: crearContrato, isPending: false }),
  useFirmarContrato: () => mut,
  useAnularContrato: () => mut,
  useGenerarLinkFirma: () => mut,
  useRevocarLinkFirma: () => mut,
  useSubirEscaneoContrato: () => mut,
  descargarPdfContrato: vi.fn(),
  verEscaneoContrato: vi.fn(),
  contratoYaFirmado: vi.fn(),
}));
vi.mock('@/hooks/usePagares', () => ({
  usePagareDeReserva: () => ({ data: pagareActual, isLoading: false }),
  usePrepararPagare: () => ({ data: preparadoPagare }),
  useCrearPagare: () => ({ mutate: crearPagare, isPending: false }),
  useAnularPagare: () => mut,
  useSubirEscaneoPagare: () => mut,
  descargarPdfPagare: vi.fn(),
  verEscaneoPagare: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ default: {}, api: { get: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContratoPanel } from './ContratoPanel';

const SNAPSHOT: any = {
  empresa: {}, reserva_id: 9, alquiler_id: null, cliente: { telefono: '2915550000' },
  conductor_adicional: {},
  vehiculo: { descripcion: 'FIAT CRONOS', patente: 'AB123CD' },
  servicio: {}, cargos: { lineas: [], valor_estimado: 140000 },
  coberturas: { franquicia: 500000, contratadas: [], rechazadas: [] },
};

const PREPARADO = {
  monto_sugerido: 140000, franquicia: 500000,
  deudor: { nombre: 'Juan Pérez', dni: '30111222', domicilio: '' },
  codeudor_sugerido: { nombre: 'Ana Gómez', dni: '30999888', domicilio: '' },
  beneficiario: 'FINAR GRUPO FINANCIERO S.R.L.', lugar_emision: 'Bahía Blanca',
  lugar_pago: 'Paraguay 241', interes_compensatorio: '60%', interes_punitorio: '30%',
  faltantes: [], tiene_contrato: false,
};

const contrato = (over: any = {}) => ({
  id: 4, numero_formateado: 'C-00000004', reserva_id: 9, snapshot: SNAPSHOT, firmado: false,
  anulado: false, fecha_generacion: '2026-09-12T12:00:00', link_prellenado: null, ...over,
});

const pagare = (over: any = {}) => ({
  id: 12, numero_formateado: 'P-00000012', reserva_id: 9, contrato_id: 4, firmado: false, anulado: false,
  fecha_generacion: '2026-09-12T12:00:00', tiene_escaneo: false, firmas_codeudores: null,
  snapshot: { monto_numerico: '140.000,00', deudor: { nombre: 'Juan Pérez', dni: '30111222' }, codeudores: [] },
  ...over,
});

beforeEach(() => {
  contratoActual = null;
  pagareActual = null;
  preparadoPagare = { ...PREPARADO };
  crearContrato.mockReset();
  crearPagare.mockReset();
});

describe('Generar contrato y garantía', () => {
  it('un click genera los dos, con el monto y el co-deudor elegidos', async () => {
    const user = userEvent.setup();
    crearContrato.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(<ContratoPanel reservaId={9} />);

    expect(screen.getByLabelText(/Generar también la garantía/)).toBeChecked();
    const monto = screen.getByDisplayValue('140000');
    await user.clear(monto);
    await user.type(monto, '500000');
    await user.click(screen.getByRole('button', { name: /Sumar al conductor adicional/ }));

    await user.click(screen.getByRole('button', { name: 'Generar contrato y garantía' }));

    expect(crearContrato).toHaveBeenCalledWith({ reserva_id: 9, snapshot: SNAPSHOT }, expect.anything());
    expect(crearPagare).toHaveBeenCalledWith(
      { reserva_id: 9, monto: 500000, codeudores: [PREPARADO.codeudor_sugerido] },
      expect.anything(),
    );
  });

  it('destildado, sale el contrato solo', async () => {
    const user = userEvent.setup();
    crearContrato.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(<ContratoPanel reservaId={9} />);
    await user.click(screen.getByLabelText(/Generar también la garantía/));
    await user.click(screen.getByRole('button', { name: 'Generar contrato' }));
    expect(crearContrato).toHaveBeenCalled();
    expect(crearPagare).not.toHaveBeenCalled();
  });

  it('sin las tasas cargadas avisa dónde y no intenta el pagaré', async () => {
    const user = userEvent.setup();
    preparadoPagare = { ...PREPARADO, faltantes: ['la tasa de interés punitorio (Configuración → Pagaré)'] };
    crearContrato.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(<ContratoPanel reservaId={9} />);
    expect(screen.getByText(/falta cargar la tasa de interés punitorio/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generar contrato' }));
    expect(crearPagare).not.toHaveBeenCalled();
  });
});

describe('Con el contrato emitido', () => {
  it('sin pagaré, abajo del contrato se ofrece generarlo', () => {
    contratoActual = contrato();
    render(<ContratoPanel reservaId={9} />);
    expect(screen.getByRole('button', { name: /Generar garantía/ })).toBeInTheDocument();
  });

  it('con el contrato firmado y el pagaré pendiente, el link y la firma siguen disponibles', () => {
    contratoActual = contrato({ firmado: true, firmado_por_nombre: 'Juan', firmado_por_dni: '30111222' });
    pagareActual = pagare();
    render(<ContratoPanel reservaId={9} />);
    expect(screen.getByText('Que firme la garantía')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Firmar la garantía en el mostrador/ })).toBeInTheDocument();
    expect(screen.getByText('Garantía P-00000012')).toBeInTheDocument();
  });

  it('con los dos firmados, no queda nada para firmar', () => {
    contratoActual = contrato({ firmado: true });
    pagareActual = pagare({ firmado: true, firmado_por_nombre: 'Juan', firmado_por_dni: '30111222', firma_medio: 'link' });
    render(<ContratoPanel reservaId={9} />);
    expect(screen.queryByRole('button', { name: /Firmar/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Firmado')).toHaveLength(2);
  });

  it('la firma en el mostrador pide un recuadro por co-deudor', async () => {
    const user = userEvent.setup();
    contratoActual = contrato();
    pagareActual = pagare({ snapshot: { ...pagare().snapshot, codeudores: [{ nombre: 'Ana Gómez', dni: '30999888' }] } });
    render(<ContratoPanel reservaId={9} />);
    await user.click(screen.getByRole('button', { name: /^Firmar en el mostrador/ }));
    expect(screen.getByText('Firmar contrato y garantía')).toBeInTheDocument();
    expect(screen.getByLabelText(/Firma del co-deudor: Ana Gómez/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar firma' })).toBeDisabled());
  });
});
