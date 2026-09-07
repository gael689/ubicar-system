import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, DollarSign, CalendarClock } from 'lucide-react';
import { useAlquileres } from '@/hooks/useAlquileres';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError, formatMiles, redondear2 } from '@/lib/utils';
import { InputMoneda } from '@/components/shared/InputMoneda';
import type { ExtenderResponse } from '@/types';

interface Props {
  alquilerId: number;
  /**
   * La reserva del alquiler. Hace falta para poder regenerar el contrato con
   * las fechas nuevas — el contrato cuelga de la reserva, no del alquiler.
   */
  reservaId: number;
  vehiculoInfo: string;
  clienteNombre: string;
  fechaInicioActual: string;
  fechaFinActual: string;
  horaFinActual: string;
  precioTotalActual: string | number | null;
  onClose: () => void;
  onSuccess: () => void;
}

// `formatMiles` y no un `toLocaleString` suelto: sin `maximumFractionDigits`
// el default del `Intl` son **tres decimales**, y la tarifa por día de una
// extensión se deriva de una división que casi nunca da exacta — por eso salía
// escrita `$33.333,333`.
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

export function ExtenderModal({
  alquilerId,
  reservaId,
  vehiculoInfo,
  clienteNombre,
  fechaInicioActual,
  fechaFinActual,
  horaFinActual,
  precioTotalActual,
  onClose,
  onSuccess,
}: Props) {
  const { extender, loading, error } = useAlquileres();

  const [nuevaFecha, setNuevaFecha] = useState(fechaFinActual);
  const [nuevaHora, setNuevaHora] = useState(horaFinActual.slice(0, 5));
  const [resultado, setResultado] = useState<ExtenderResponse | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [contratoRegenerado, setContratoRegenerado] = useState(false);

  /**
   * Anula el contrato vigente y emite uno con las fechas nuevas.
   *
   * Si la reserva todavía no tenía contrato, esto simplemente lo emite — que
   * también es lo correcto: recién ahora se sabe hasta cuándo va el alquiler.
   */
  async function regenerarContrato() {
    setRegenerando(true);
    try {
      const { data } = await api.get('/contratos', { params: { reserva_id: reservaId } });
      const vigente = (data?.data ?? []).find((c: { anulado?: boolean }) => !c.anulado);
      // El nuevo primero: si esto falla, el viejo sigue siendo válido.
      await api.post('/contratos', { reserva_id: reservaId });
      if (vigente) {
        await api.post(`/contratos/${vigente.id}/anular`, {
          motivo: 'Se extendió el alquiler: las fechas del contrato cambiaron',
        });
      }
      setContratoRegenerado(true);
      toast.success('Contrato regenerado con las fechas nuevas.');
    } catch (err) {
      toast.error(extractError(err) || 'No pudimos regenerar el contrato. Probá desde la ficha de la reserva.');
    } finally {
      setRegenerando(false);
    }
  }
  const [localError, setLocalError] = useState<string | null>(null);

  // El cliente paga la diferencia **al devolver el auto** — ése es el default y
  // por eso arranca apagado. Si la paga en el momento, se registra acá y no hay
  // que ir a Caja por separado, igual que en el check-out y el check-in.
  const [cobrarAhora, setCobrarAhora] = useState(false);
  const [medioCobro, setMedioCobro] = useState('efectivo');
  const hoyISO = new Date().toISOString().slice(0, 10);

  const duracionActual = Math.max(1, diasEntre(fechaInicioActual, fechaFinActual));
  const precioActualNum = precioTotalActual ? parseFloat(String(precioTotalActual)) : 0;
  // Redondeada: sin esto, `200000 / 3` se pinta como `66666.66666666667`.
  const tarifaDiariaSugerida = precioActualNum > 0 ? redondear2(precioActualNum / duracionActual) : 0;
  const duracionNueva = Math.max(0, diasEntre(fechaInicioActual, nuevaFecha));
  const diasAgregados = Math.max(0, duracionNueva - duracionActual);

  // Lo editable es el EXTRA por los días que se agregan — no el total del
  // alquiler. El precio total nuevo se muestra aparte, sólo informativo.
  const [precioExtraPorDia, setPrecioExtraPorDia] = useState<number | ''>(tarifaDiariaSugerida || '');
  const [precioExtraTotal, setPrecioExtraTotal] = useState<number | ''>(
    tarifaDiariaSugerida ? Math.round(tarifaDiariaSugerida * diasAgregados) : ''
  );
  const lastEditedRef = useRef<'dia' | 'total'>('dia');

  useEffect(() => {
    if (diasAgregados > 0) {
      if (lastEditedRef.current === 'dia' && precioExtraPorDia !== '') {
        setPrecioExtraTotal(Math.round((precioExtraPorDia as number) * diasAgregados));
      } else if (lastEditedRef.current === 'total' && precioExtraTotal !== '') {
        setPrecioExtraPorDia(redondear2((precioExtraTotal as number) / diasAgregados));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasAgregados]);

  function handlePrecioExtraPorDiaChange(val: number | '') {
    lastEditedRef.current = 'dia';
    if (val === '') { setPrecioExtraPorDia(''); setPrecioExtraTotal(''); return; }
    setPrecioExtraPorDia(val);
    if (diasAgregados > 0) setPrecioExtraTotal(Math.round(val * diasAgregados));
  }

  function handlePrecioExtraTotalChange(val: number | '') {
    lastEditedRef.current = 'total';
    if (val === '') { setPrecioExtraTotal(''); setPrecioExtraPorDia(''); return; }
    setPrecioExtraTotal(val);
    if (diasAgregados > 0) setPrecioExtraPorDia(redondear2(val / diasAgregados));
  }

  const precioTotalNuevoInformativo = precioActualNum + (precioExtraTotal === '' ? 0 : precioExtraTotal);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (nuevaFecha <= fechaFinActual) {
      setLocalError('La nueva fecha debe ser posterior a la fecha actual de fin');
      return;
    }

    try {
      const res = await extender(alquilerId, {
        nueva_fecha_fin: nuevaFecha,
        nueva_hora_fin: nuevaHora + ':00',
        precio_total: precioExtraTotal === '' ? null : precioTotalNuevoInformativo,
        pago_inmediato:
          cobrarAhora && precioExtraTotal !== '' && precioExtraTotal > 0
            ? {
                monto: precioExtraTotal as number,
                medio_pago: medioCobro,
                fecha: hoyISO,
                notas: 'Cobro de la extensión',
              }
            : undefined,
      });
      setResultado(res);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.code === 'solapamiento_extension' && detail?.conflicto) {
        const c = detail.conflicto;
        setLocalError(
          `El vehículo ya tiene una reserva de ${c.cliente_nombre} desde el ${formatDate(c.fecha_inicio)} hasta el ${formatDate(c.fecha_fin)}. Debés reasignar ese cliente antes de extender.`
        );
      } else {
        setLocalError(detail?.message || (typeof detail === 'string' ? detail : 'Error al extender el alquiler'));
      }
    }
  }

  if (resultado) {
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
                <div className="text-xs text-slate-500 mb-1">Fecha anterior</div>
                <div className="text-slate-800 font-medium">{formatDate(resultado.fecha_fin_anterior)}</div>
                <div className="text-xs text-slate-400">{resultado.duracion_dias_anterior} días</div>
              </div>
              <div className="rounded-xl bg-success/10 border border-success/30 p-3 text-center">
                <div className="text-xs text-success mb-1">Nueva fecha fin</div>
                <div className="text-success font-bold">{formatDate(resultado.fecha_fin_nueva)}</div>
                <div className="text-xs text-success">{resultado.duracion_dias_nueva} días</div>
              </div>
              {resultado.diferencia != null && (
                <div className="col-span-2 rounded-xl bg-warning p-3 flex justify-between items-center">
                  <span className="text-white/90 text-sm">
                    {cobrarAhora ? 'Cargo adicional (cobrado)' : 'Cargo adicional (a la cuenta)'}
                  </span>
                  <span className="text-white font-bold text-base">{formatMoney(resultado.diferencia)}</span>
                </div>
              )}
              {resultado.precio_nuevo != null && (
                <div className="col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3 flex justify-between items-center">
                  <span className="text-slate-500">Precio total nuevo</span>
                  <span className="text-slate-800 font-semibold">{formatMoney(resultado.precio_nuevo)}</span>
                </div>
              )}
            </div>

            {/* **La renovación del contrato, que es lo que se pidió.**
                El dueño preguntó por "nuevo contrato o la renovación del
                contrato"; alargar el alquiler ya existía, pero el papel seguía
                diciendo la fecha vieja — y un contrato que nombra una fecha que
                no es sirve para poco cuando hay un reclamo.

                Reusa la lógica de `AccionesContrato`: **primero se emite el
                nuevo y después se anula el viejo**. Ese orden es deliberado —
                al revés, si el POST falla, la reserva queda sin contrato válido
                y el auto sale con un papel anulado en la mano. */}
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
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex justify-between text-sm">
            <span className="text-slate-500">Fecha fin actual</span>
            <span className="text-slate-800 font-medium">{formatDate(fechaFinActual)} · {horaFinActual.slice(0, 5)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
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

          <p className="text-xs text-slate-400">
            El sistema verifica automáticamente que el vehículo esté libre esos días antes de confirmar.
          </p>

          {/* Precio de la extensión */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" /> Precio de la extensión
            </h3>
            {diasAgregados > 0 ? (
              <p className="text-xs text-slate-500">
                Se suman <strong>{diasAgregados} día{diasAgregados === 1 ? '' : 's'}</strong> — sugerido siguiendo la misma tarifa diaria actual ({formatMoney(tarifaDiariaSugerida)}/día). Es el precio extra por lo agregado, editable por día o en total.
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">Elegí la nueva fecha de fin para ver el precio sugerido.</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              {/* Con el puntito de los miles, igual que en la reserva. */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio extra x Día</label>
                <InputMoneda
                  value={precioExtraPorDia}
                  onChange={handlePrecioExtraPorDiaChange}
                  placeholder="35.000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio extra Total</label>
                <InputMoneda
                  value={precioExtraTotal}
                  onChange={handlePrecioExtraTotalChange}
                  placeholder="70.000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
              <span className="text-slate-500">Precio total nuevo (informativo)</span>
              <span className="text-slate-800 font-semibold">{formatMoney(precioTotalNuevoInformativo)}</span>
            </div>
          </div>

          {/* La diferencia se asienta siempre en la cuenta corriente del
              cliente. Cobrarla ahora es opcional: el default del negocio es que
              se pague al devolver el auto. */}
          {precioExtraTotal !== '' && (precioExtraTotal as number) > 0 && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-xs text-slate-500 leading-snug">
                Se suman <strong>{formatMoney(precioExtraTotal)}</strong> a la cuenta corriente
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
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="mercado_pago">Mercado Pago</option>
                    <option value="wapa">Wapa (Patagonia)</option>
                    <option value="echeq">Echeq</option>
                    <option value="cheque">Cheque</option>
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Entra a la caja de hoy.
                  </p>
                </div>
              )}
            </div>
          )}

          {(error || localError) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              ⚠️ {localError || error}
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
