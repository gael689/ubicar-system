import React, { useState } from 'react';
import { useAlquileres } from '@/hooks/useAlquileres';
import type { ExtenderResponse } from '@/types';

interface Props {
  alquilerId: number;
  vehiculoInfo: string;
  clienteNombre: string;
  fechaFinActual: string;
  horaFinActual: string;
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

export function ExtenderModal({
  alquilerId,
  vehiculoInfo,
  clienteNombre,
  fechaFinActual,
  horaFinActual,
  onClose,
  onSuccess,
}: Props) {
  const { extender, loading, error } = useAlquileres();

  const [nuevaFecha, setNuevaFecha] = useState(fechaFinActual);
  const [nuevaHora, setNuevaHora] = useState(horaFinActual.slice(0, 5));
  const [resultado, setResultado] = useState<ExtenderResponse | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 shadow-2xl">
          <div className="px-6 py-5 flex flex-col items-center gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Alquiler extendido</h2>
              <p className="text-sm text-slate-400 mt-1">{vehiculoInfo} · {clienteNombre}</p>
            </div>

            <div className="w-full grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-800 p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">Fecha anterior</div>
                <div className="text-white font-medium">{formatDate(resultado.fecha_fin_anterior)}</div>
                <div className="text-xs text-slate-500">{resultado.duracion_dias_anterior} días</div>
              </div>
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
                <div className="text-xs text-emerald-400 mb-1">Nueva fecha fin</div>
                <div className="text-emerald-300 font-bold">{formatDate(resultado.fecha_fin_nueva)}</div>
                <div className="text-xs text-emerald-400">{resultado.duracion_dias_nueva} días</div>
              </div>
              {resultado.diferencia != null && (
                <div className="col-span-2 rounded-xl bg-slate-800 p-3 flex justify-between items-center">
                  <span className="text-slate-400">Cargo adicional</span>
                  <span className="text-amber-300 font-bold text-base">{formatMoney(resultado.diferencia)}</span>
                </div>
              )}
              {resultado.precio_nuevo != null && (
                <div className="col-span-2 rounded-xl bg-slate-800 p-3 flex justify-between items-center">
                  <span className="text-slate-400">Precio total nuevo</span>
                  <span className="text-white font-semibold">{formatMoney(resultado.precio_nuevo)}</span>
                </div>
              )}
            </div>

            <button
              onClick={onSuccess}
              className="w-full px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Extender alquiler</h2>
            <p className="text-xs text-slate-400">{vehiculoInfo} · {clienteNombre}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="rounded-xl bg-slate-800/60 border border-white/10 p-4 flex justify-between text-sm">
            <span className="text-slate-400">Fecha fin actual</span>
            <span className="text-white font-medium">{formatDate(fechaFinActual)} · {horaFinActual.slice(0, 5)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Nueva fecha fin *</label>
              <input
                type="date"
                value={nuevaFecha}
                min={fechaFinActual}
                onChange={e => setNuevaFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Hora *</label>
              <input
                type="time"
                value={nuevaHora}
                onChange={e => setNuevaHora(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            El sistema verifica automáticamente que el vehículo esté libre esos días antes de confirmar.
          </p>

          {(error || localError) && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
              ⚠️ {localError || error}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
            📅 Confirmar extensión
          </button>
        </div>
      </div>
    </div>
  );
}
