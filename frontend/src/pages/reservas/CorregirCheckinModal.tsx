import { useEffect, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useAlquileres } from '@/hooks/useAlquileres';
import { extractError, formatMiles } from '@/lib/utils';
import type { Alquiler, Reserva } from '@/types';
import { BotonesDeEstado, LIMPIEZA_OPTIONS } from '@/components/reservas/BotonesDeEstado';
import { FUEL_LEVELS } from './CheckinModal';

interface Props {
  alquilerId: number;
  reserva: Reserva;
  onClose: () => void;
  onSuccess: () => void;
}

const CAMPO =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
const ROTULO = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide';

/**
 * Corregir un check-in ya hecho — *"cuando se pone en gris y quedó un dato
 * mal, ¿se puede cambiar?"* (28/10).
 *
 * **Sólo los datos, nunca la plata.** El excedente, los cargos, la garantía y
 * los cobros quedan como estaban. Si la hora corregida cambia lo que
 * correspondía cobrar, se avisa al guardar y se resuelve aparte.
 */
export function CorregirCheckinModal({ alquilerId, reserva, onClose, onSuccess }: Props) {
  const { getAlquiler, corregirCheckin, loading } = useAlquileres();
  const [alquiler, setAlquiler] = useState<Alquiler | null>(null);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [km, setKm] = useState('');
  const [combustible, setCombustible] = useState(100);
  const [limpieza, setLimpieza] = useState('limpio');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAlquiler(alquilerId)
      .then(a => {
        setAlquiler(a);
        setFecha(a.checkin_fecha ?? '');
        setHora((a.checkin_hora ?? '').slice(0, 5));
        setKm(a.checkin_km != null ? String(a.checkin_km) : '');
        setCombustible(a.checkin_combustible ?? 100);
        setLimpieza(a.checkin_estado_limpieza ?? 'limpio');
        setDescripcion(a.checkin_descripcion ?? '');
      })
      .catch(err => setError(extractError(err)));
  }, [alquilerId, getAlquiler]);

  const pactada = (reserva.hora_devolucion_acordada ?? reserva.hora_fin).slice(0, 5);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await corregirCheckin(alquilerId, {
        checkin_fecha: fecha,
        checkin_hora: `${hora}:00`,
        checkin_km: parseInt(km),
        checkin_combustible: combustible,
        checkin_descripcion: descripcion || null,
        checkin_estado_limpieza: limpieza,
      });
      if (res.cargo_excedente_correspondia != null) {
        toast.warning(
          `Check-in corregido. Con la hora nueva el excedente sería $${formatMiles(res.cargo_excedente_correspondia)}; `
          + `lo cobrado no se modificó.`,
          { duration: 10000 },
        );
      } else {
        toast.success('Check-in corregido');
      }
      onSuccess();
    } catch (err) {
      setError(extractError(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-background border border-border shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Corregir check-in</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reserva #{reserva.id} · {reserva.cliente?.nombre_completo ?? `Cliente ${reserva.cliente_id}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            ✕
          </button>
        </div>

        {!alquiler && !error ? (
          <div className="p-10 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <form onSubmit={guardar} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 border border-border px-3 py-2">
                Se corrigen sólo los datos de la devolución. Lo cobrado (excedente, cargos, garantía) no cambia.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={ROTULO}>Fecha *</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={CAMPO} required />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO}>
                    Hora * <span className="normal-case font-normal text-muted-foreground">(pactada: {pactada})</span>
                  </label>
                  <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={CAMPO} required />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={ROTULO}>KM devolución * (salida: {alquiler?.checkout_km ?? '...'})</label>
                <input
                  type="number"
                  value={km}
                  onChange={e => setKm(e.target.value)}
                  min={alquiler?.checkout_km}
                  className={CAMPO}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className={ROTULO}>Combustible devolución *</label>
                <div className="flex gap-2">
                  {FUEL_LEVELS.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setCombustible(f.value)}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                        combustible === f.value
                          ? f.color + ' scale-105 shadow-sm'
                          : 'bg-muted border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className={ROTULO}>Estado de limpieza</label>
                <BotonesDeEstado opciones={LIMPIEZA_OPTIONS} valor={limpieza} onChange={setLimpieza} />
              </div>

              <div className="space-y-1.5">
                <label className={ROTULO}>Observaciones</label>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={3}
                  className={CAMPO}
                />
              </div>

              {error && (
                <p className="text-sm text-danger rounded-lg bg-danger/10 border border-danger/20 px-3 py-2">{error}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-muted/30 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-3 py-2 rounded-lg bg-muted hover:bg-accent text-foreground text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !alquiler}
                className="flex-1 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Guardando…' : 'Guardar corrección'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
