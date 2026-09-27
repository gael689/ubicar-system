import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, DollarSign, CalendarClock, ArrowRight } from 'lucide-react';
import { useAlquileres } from '@/hooks/useAlquileres';
import { useTarifasCategoria } from '@/hooks/useCategorias';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn, extractError, formatMiles, hoyLocal, irAlError, redondear2 } from '@/lib/utils';
import { useResumenPago } from '@/hooks/usePagos';
import { InputMoneda } from '@/components/shared/InputMoneda';
import type { ExtenderResponse, Reserva } from '@/types';

interface Props {
  alquilerId: number;
  /**
   * La reserva del alquiler. Hace falta para regenerar el contrato con las
   * fechas nuevas —el contrato cuelga de la reserva, no del alquiler—, para
   * mostrar cómo está pagado el alquiler original y para sugerir la tarifa
   * diaria de su categoría.
   */
  reserva: Reserva;
  vehiculoInfo: string;
  clienteNombre: string;
  fechaFinActual: string;
  horaFinActual: string;
  onClose: () => void;
  onSuccess: () => void;
}

// `formatMiles` y no un `toLocaleString` suelto: sin `maximumFractionDigits`
// el default del `Intl` son **tres decimales** y salía `$33.333,333`.
function formatMoney(v: string | number | null | undefined) {
  if (v == null) return '—';
  return `$${formatMiles(Number(v))}`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diasEntre(desde: string, hasta: string) {
  if (!desde || !hasta) return 0;
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000);
}

// Los medios que son plata de verdad. "Anotar en la cuenta" no va: la
// extensión ya queda en la cuenta corriente si no se cobra ahora.
const MEDIOS_COBRO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'wapa', label: 'Wapa (Patagonia)' },
  { value: 'echeq', label: 'E-cheq' },
  { value: 'cheque', label: 'Cheque' },
];

/**
 * Extender un alquiler = venderle días nuevos.
 *
 * Pedido del mostrador (27/09): *"la extensión es un alquiler nuevo"*. Antes la
 * pantalla mostraba el precio del alquiler entero y un "precio total nuevo",
 * y el operador terminaba discutiendo con el cliente un número que no era el
 * que se estaba cobrando. Ahora se ve sólo la extensión: de qué fecha a qué
 * fecha, cuántos días, el precio por día y el total —los dos obligatorios— y
 * cómo quedó pagado el alquiler original, para saber si hay que reclamar algo.
 */
export function ExtenderModal({
  alquilerId,
  reserva,
  vehiculoInfo,
  clienteNombre,
  fechaFinActual,
  horaFinActual,
  onClose,
  onSuccess,
}: Props) {
  const { extender, loading } = useAlquileres();

  const [nuevaFecha, setNuevaFecha] = useState(fechaFinActual);
  const [nuevaHora, setNuevaHora] = useState(horaFinActual.slice(0, 5));
  const [resultado, setResultado] = useState<ExtenderResponse | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [contratoRegenerado, setContratoRegenerado] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Anula el contrato vigente y emite uno con las fechas nuevas.
   *
   * Si la reserva todavía no tenía contrato, esto simplemente lo emite — que
   * también es lo correcto: recién ahora se sabe hasta cuándo va el alquiler.
   */
  async function regenerarContrato() {
    setRegenerando(true);
    try {
      const { data } = await api.get('/contratos', { params: { reserva_id: reserva.id } });
      const vigente = (data?.data ?? []).find((c: { anulado?: boolean }) => !c.anulado);
      // El nuevo primero: si esto falla, el viejo sigue siendo válido.
      await api.post('/contratos', { reserva_id: reserva.id });
      if (vigente) {
        await api.post(`/contratos/${vigente.id}/anular`, {
          motivo: 'Se extendió el alquiler: las fechas del contrato cambiaron',
        });
      }
      setContratoRegenerado(true);
      toast.success('Contrato regenerado con las fechas nuevas.');
    } catch (err) {
      toast.error(extractError(err, 'No pudimos regenerar el contrato. Probá desde la ficha de la reserva.'));
    } finally {
      setRegenerando(false);
    }
  }

  // El cliente paga la extensión **al devolver el auto** — ése es el default y
  // por eso arranca apagado. Si la paga en el momento, se registra acá.
  const [cobrarAhora, setCobrarAhora] = useState(false);
  const [medioCobro, setMedioCobro] = useState('efectivo');

  const diasAgregados = Math.max(0, diasEntre(fechaFinActual, nuevaFecha));

  // La tarifa diaria sugerida sale de la categoría, no del precio anterior:
  // dividir el total viejo por los días arrastraba descuentos y promociones
  // que eran de ese alquiler, no de la extensión. Sin tarifa real cargada (o
  // con la genérica de relleno), el campo arranca vacío y se escribe a mano.
  const { data: tarifasCategoria } = useTarifasCategoria(reserva.categoria_id ?? 0);
  const tarifaDiariaCategoria = (() => {
    const t = tarifasCategoria?.find(x => x.activo && x.tipo === 'diaria' && !x.es_generica);
    return t ? Number(t.monto) : 0;
  })();

  const [precioPorDia, setPrecioPorDia] = useState<number | ''>('');
  const [precioTotal, setPrecioTotal] = useState<number | ''>('');
  const lastEditedRef = useRef<'dia' | 'total'>('dia');
  const tocadoRef = useRef(false);

  // Llega la tarifa de la categoría: se precarga si nadie escribió todavía.
  useEffect(() => {
    if (tocadoRef.current || !tarifaDiariaCategoria) return;
    setPrecioPorDia(tarifaDiariaCategoria);
    if (diasAgregados > 0) setPrecioTotal(Math.round(tarifaDiariaCategoria * diasAgregados));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifaDiariaCategoria]);

  // Cambian los días: se recalcula lo que no se editó a mano por última vez.
  useEffect(() => {
    if (diasAgregados <= 0) return;
    if (lastEditedRef.current === 'dia' && precioPorDia !== '') {
      setPrecioTotal(Math.round(precioPorDia * diasAgregados));
    } else if (lastEditedRef.current === 'total' && precioTotal !== '') {
      setPrecioPorDia(redondear2(precioTotal / diasAgregados));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasAgregados]);

  function handlePrecioPorDiaChange(val: number | '') {
    tocadoRef.current = true;
    lastEditedRef.current = 'dia';
    if (val === '') { setPrecioPorDia(''); setPrecioTotal(''); return; }
    setPrecioPorDia(val);
    if (diasAgregados > 0) setPrecioTotal(Math.round(val * diasAgregados));
  }

  function handlePrecioTotalChange(val: number | '') {
    tocadoRef.current = true;
    lastEditedRef.current = 'total';
    if (val === '') { setPrecioTotal(''); setPrecioPorDia(''); return; }
    setPrecioTotal(val);
    if (diasAgregados > 0) setPrecioPorDia(redondear2(val / diasAgregados));
  }

  const pagoOriginal = useResumenPago(reserva);

  function fallar(mensaje: string, campo?: string) {
    setLocalError(mensaje);
    irAlError(campo);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (nuevaFecha <= fechaFinActual) {
      return fallar('La nueva fecha tiene que ser posterior a la fecha de fin actual.', 'nueva_fecha');
    }
    if (precioPorDia === '' || precioPorDia <= 0) {
      return fallar('Falta el precio por día de la extensión.', 'precio_por_dia');
    }
    if (precioTotal === '' || precioTotal <= 0) {
      return fallar('Falta el precio total de la extensión.', 'precio_total');
    }

    try {
      const res = await extender(alquilerId, {
        nueva_fecha_fin: nuevaFecha,
        nueva_hora_fin: nuevaHora + ':00',
        precio_extension: precioTotal,
        pago_inmediato: cobrarAhora
          ? {
              monto: precioTotal,
              medio_pago: medioCobro,
              fecha: hoyLocal(),
              notas: 'Cobro de la extensión',
            }
          : undefined,
      });
      setResultado(res);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.code === 'solapamiento_extension' && detail?.conflicto) {
        const c = detail.conflicto;
        fallar(
          `El vehículo ya tiene una reserva de ${c.cliente_nombre} desde el ${formatDate(c.fecha_inicio)} hasta el ${formatDate(c.fecha_fin)}. Reasigná esa reserva antes de extender.`,
          'nueva_fecha',
        );
      } else {
        fallar(extractError(err, 'No se pudo extender el alquiler.'));
      }
    }
  }

  if (resultado) {
    const montoExtension = resultado.precio_extension ?? resultado.diferencia;
    const dias = resultado.dias_agregados ?? diasAgregados;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
          <div className="px-6 py-5 flex flex-col items-center gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-success/15 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Alquiler extendido</h2>
              <p className="text-sm text-slate-500 mt-1">{vehiculoInfo} · {clienteNombre}</p>
            </div>

            <div className="w-full grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">Terminaba el</div>
                <div className="text-slate-800 font-medium">{formatDate(resultado.fecha_fin_anterior)}</div>
              </div>
              <div className="rounded-xl bg-success/10 border border-success/30 p-3 text-center">
                <div className="text-xs text-success mb-1">Ahora termina el</div>
                <div className="text-success font-bold">{formatDate(resultado.fecha_fin_nueva)}</div>
                <div className="text-xs text-success">+{dias} día{dias === 1 ? '' : 's'}</div>
              </div>
              {montoExtension != null && (
                <div className="col-span-2 rounded-xl bg-warning p-3 flex justify-between items-center">
                  <span className="text-white/90 text-sm">
                    {cobrarAhora ? 'Extensión (cobrada)' : 'Extensión (a la cuenta corriente)'}
                  </span>
                  <span className="text-white font-bold text-base">{formatMoney(montoExtension)}</span>
                </div>
              )}
              {/* Los adicionales por día también se estiran con el alquiler:
                  si no se dice, el operador cree que cobró todo con la
                  extensión y el seguro de los días nuevos aparece después. */}
              {Number(resultado.adicionales_extension ?? 0) > 0 && (
                <div className="col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3 flex justify-between items-center">
                  <span className="text-slate-600 text-sm">Adicionales por los días nuevos</span>
                  <span className="text-slate-800 font-bold text-base">{formatMoney(resultado.adicionales_extension!)}</span>
                </div>
              )}
            </div>

            {/* **La renovación del contrato, que es lo que se pidió.**
                Alargar el alquiler ya existía, pero el papel seguía diciendo
                la fecha vieja. Primero se emite el nuevo y después se anula el
                viejo: al revés, si el POST falla, la reserva queda sin
                contrato válido. */}
            <button
              onClick={regenerarContrato}
              disabled={regenerando || contratoRegenerado}
              className="w-full px-5 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-medium transition-colors hover:bg-primary/10 disabled:opacity-60"
            >
              {contratoRegenerado
                ? 'Contrato actualizado ✓'
                : regenerando ? 'Actualizando el contrato…' : 'Regenerar el contrato con las fechas nuevas'}
            </button>
            <p className="text-[11px] leading-snug text-slate-500 text-center">
              El contrato vigente quedó con la fecha anterior. Regenerarlo lo
              anula y emite uno nuevo, que el cliente vuelve a firmar.
            </p>

            <button
              onClick={onSuccess}
              className="w-full px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> Extender alquiler
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{vehiculoInfo} · {clienteNombre}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Cómo está pagado el alquiler original. No se muestra su precio:
              lo que se decide acá es la extensión. */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">Alquiler original</span>
            {pagoOriginal.pagado ? (
              <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">Pagado</span>
            ) : pagoOriginal.saldo != null && pagoOriginal.saldo > 0 ? (
              <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-foreground">
                Saldo {formatMoney(pagoOriginal.saldo)}
              </span>
            ) : pagoOriginal.fuente === 'cuenta_corriente' ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Ver cuenta corriente</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Sin precio cargado</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5" data-campo="nueva_fecha">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Nueva fecha fin *
              </label>
              <input
                type="date"
                value={nuevaFecha}
                min={fechaFinActual}
                onChange={e => setNuevaFecha(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Hora *</label>
              <input
                type="time"
                value={nuevaHora}
                onChange={e => setNuevaHora(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
          </div>

          {/* El resumen de la extensión sola: de dónde a dónde y cuántos días. */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between text-sm">
            <div>
              <div className="text-xs text-slate-500">Termina hoy</div>
              <div className="font-medium text-slate-800">{formatDate(fechaFinActual)} · {horaFinActual.slice(0, 5)}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <div className="text-right">
              <div className="text-xs text-slate-500">Pasa a terminar</div>
              <div className="font-semibold text-slate-800">{formatDate(nuevaFecha)} · {nuevaHora}</div>
            </div>
          </div>
          <p className={cn('text-sm', diasAgregados > 0 ? 'text-slate-700' : 'text-slate-400 italic')}>
            {diasAgregados > 0
              ? <>Se agregan <strong>{diasAgregados} día{diasAgregados === 1 ? '' : 's'}</strong>.</>
              : 'Elegí la nueva fecha de fin.'}
            {' '}El sistema verifica que el vehículo esté libre esos días.
          </p>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" /> Precio de la extensión
            </h3>
            <p className="text-xs text-slate-500">
              {tarifaDiariaCategoria
                ? <>Sugerido con la tarifa diaria de la categoría ({formatMoney(tarifaDiariaCategoria)}/día). </>
                : null}
              Cargá el precio por día o el total: el otro se calcula solo.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5" data-campo="precio_por_dia">
                <label className="text-xs font-medium text-slate-600">Precio por día *</label>
                <InputMoneda
                  value={precioPorDia}
                  onChange={handlePrecioPorDiaChange}
                  placeholder="35.000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1.5" data-campo="precio_total">
                <label className="text-xs font-medium text-slate-600">Total de la extensión *</label>
                <InputMoneda
                  value={precioTotal}
                  onChange={handlePrecioTotalChange}
                  placeholder="70.000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* La extensión se asienta siempre en la cuenta corriente del
              cliente. Cobrarla ahora es opcional: el default del negocio es que
              se pague al devolver el auto. */}
          {precioTotal !== '' && precioTotal > 0 && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-xs text-slate-500 leading-snug">
                Se suman <strong>{formatMoney(precioTotal)}</strong> a la cuenta corriente
                de {clienteNombre}. Por default los paga al devolver el auto.
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cobrarAhora}
                  onChange={e => setCobrarAhora(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Los está pagando ahora
              </label>
              {cobrarAhora && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Medio de pago</label>
                  <select
                    value={medioCobro}
                    onChange={e => setMedioCobro(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {MEDIOS_COBRO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500">Entra a la caja de hoy.</p>
                </div>
              )}
            </div>
          )}

          {localError && (
            <div data-error-banner className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              ⚠️ {localError}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm"
          >
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
            Confirmar extensión
          </button>
        </div>
      </div>
    </div>
  );
}
