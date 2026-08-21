import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, DollarSign, CalendarClock } from 'lucide-react';
import { useAlquileres } from '@/hooks/useAlquileres';
import type { ExtenderResponse } from '@/types';

interface Props {
  alquilerId: number;
  vehiculoInfo: string;
  clienteNombre: string;
  fechaInicioActual: string;
  fechaFinActual: string;
  horaFinActual: string;
  precioTotalActual: string | number | null;
  onClose: () => void;
  onSuccess: () => void;
}

function formatMoney(v: string | number | null | undefined) {
  if (v == null) return '—';
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
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
  const [localError, setLocalError] = useState<string | null>(null);

  // El cliente paga la diferencia **al devolver el auto** — ése es el default y
  // por eso arranca apagado. Si la paga en el momento, se registra acá y no hay
  // que ir a Caja por separado, igual que en el check-out y el check-in.
  const [cobrarAhora, setCobrarAhora] = useState(false);
  const [medioCobro, setMedioCobro] = useState('efectivo');
  const hoyISO = new Date().toISOString().slice(0, 10);

  const duracionActual = Math.max(1, diasEntre(fechaInicioActual, fechaFinActual));
  const precioActualNum = precioTotalActual ? parseFloat(String(precioTotalActual)) : 0;
  const tarifaDiariaSugerida = precioActualNum > 0 ? precioActualNum / duracionActual : 0;
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
        setPrecioExtraPorDia((precioExtraTotal as number) / diasAgregados);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasAgregados]);

  function handlePrecioExtraPorDiaChange(val: string) {
    lastEditedRef.current = 'dia';
    if (val === '') { setPrecioExtraPorDia(''); setPrecioExtraTotal(''); return; }
    const num = parseFloat(val);
    setPrecioExtraPorDia(num);
    if (diasAgregados > 0) setPrecioExtraTotal(Math.round(num * diasAgregados));
  }

  function handlePrecioExtraTotalChange(val: string) {
    lastEditedRef.current = 'total';
    if (val === '') { setPrecioExtraTotal(''); setPrecioExtraPorDia(''); return; }
    const num = parseFloat(val);
    setPrecioExtraTotal(num);
    if (diasAgregados > 0) setPrecioExtraPorDia(num / diasAgregados);
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio extra x Día ($)</label>
                <input
                  type="number"
                  value={precioExtraPorDia === '' ? '' : precioExtraPorDia}
                  onChange={e => handlePrecioExtraPorDiaChange(e.target.value)}
                  min={0} step={100}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio extra Total ($)</label>
                <input
                  type="number"
                  value={precioExtraTotal === '' ? '' : precioExtraTotal}
                  onChange={e => handlePrecioExtraTotalChange(e.target.value)}
                  min={0} step={100}
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
