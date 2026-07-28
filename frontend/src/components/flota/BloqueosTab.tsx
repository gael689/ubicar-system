import { useState } from 'react';
import { Ban, Plus, X, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBloqueos, useCrearBloqueo, useLiberarBloqueo,
  useReactivarBloqueo, useVerificarBloqueo,
} from '@/hooks/useBloqueos';
import { cn, formatDate, extractError } from '@/lib/utils';
import type { MotivoBloqueo } from '@/types';

const MOTIVOS: { value: MotivoBloqueo; label: string; ayuda: string }[] = [
  { value: 'mantenimiento', label: 'Mantenimiento', ayuda: 'Service, gomería, chapa y pintura' },
  { value: 'siniestro', label: 'Siniestro', ayuda: 'Chocado, esperando peritaje o repuestos' },
  { value: 'uso_interno', label: 'Uso interno', ayuda: 'Lo usa la empresa' },
  { value: 'venta', label: 'En venta', ayuda: 'En exhibición o reservado para vender' },
  { value: 'otro', label: 'Otro', ayuda: '' },
];

const MOTIVO_COLOR: Record<MotivoBloqueo, string> = {
  mantenimiento: 'bg-amber-600 text-white',
  siniestro: 'bg-danger text-white',
  uso_interno: 'bg-primary text-white',
  venta: 'bg-emerald-600 text-white',
  otro: 'bg-slate-600 text-white',
};

const FORM_VACIO = {
  fecha_desde: '',
  fecha_hasta: '',
  motivo: 'mantenimiento' as MotivoBloqueo,
  notas: '',
};

/**
 * Bloqueos del vehículo (Fase 5, ítem 59).
 *
 * `estado = fuera_de_servicio` dice "hoy no está" pero no tiene fechas: no
 * sirve para planificar. Un bloqueo es un rango, así que se puede cargar el
 * service del mes que viene y el sistema va a rechazar reservas en esos días.
 */
export function BloqueosTab({ vehiculoId }: { vehiculoId: number }) {
  const [verInactivos, setVerInactivos] = useState(false);
  const { data: bloqueos = [], isLoading } = useBloqueos({
    vehiculo_id: vehiculoId,
    incluir_inactivos: verInactivos,
  });
  const crear = useCrearBloqueo();
  const liberar = useLiberarBloqueo();
  const reactivar = useReactivarBloqueo();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  // Avisa qué reservas se pisarían ANTES de crear el bloqueo, no después.
  const { data: conflictos = [] } = useVerificarBloqueo(
    showForm && form.fecha_desde
      ? {
          vehiculo_id: vehiculoId,
          fecha_desde: form.fecha_desde,
          fecha_hasta: form.fecha_hasta || form.fecha_desde,
        }
      : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await crear.mutateAsync({
        vehiculo_id: vehiculoId,
        fecha_desde: form.fecha_desde,
        // Un solo día: si no cargan el fin, es el mismo día.
        fecha_hasta: form.fecha_hasta || form.fecha_desde,
        motivo: form.motivo,
        notas: form.notas || null,
      });
      const pisadas = res.data.reservas_en_conflicto ?? [];
      if (pisadas.length > 0) {
        toast.warning(res.message, { duration: 8000 });
      } else {
        toast.success('Bloqueo creado');
      }
      setForm(FORM_VACIO);
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Bloqueos</h3>
          {bloqueos.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold">
              {bloqueos.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerInactivos(v => !v)}>
            {verInactivos ? 'Ver sólo vigentes' : 'Ver liberados'}
          </Button>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4" /> Bloquear fechas
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Períodos en los que el vehículo no se puede alquilar. Mientras esté bloqueado, el sistema
        rechaza cualquier reserva que caiga en esas fechas.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Nuevo bloqueo</span>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Desde *</label>
              <input
                type="date"
                value={form.fecha_desde}
                onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))}
                className="input-base"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <input
                type="date"
                value={form.fecha_hasta}
                onChange={e => setForm(f => ({ ...f, fecha_hasta: e.target.value }))}
                min={form.fecha_desde || undefined}
                className="input-base"
              />
              <p className="text-[10px] text-muted-foreground">Vacío = un solo día</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo</label>
              <select
                value={form.motivo}
                onChange={e => setForm(f => ({ ...f, motivo: e.target.value as MotivoBloqueo }))}
                className="input-base"
              >
                {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {MOTIVOS.find(m => m.value === form.motivo)?.ayuda}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <input
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Ej: service de 40.000 km en el concesionario"
              className="input-base"
            />
          </div>

          {/* El bloqueo se crea igual — el auto se rompe cuando se rompe — pero
              hay que saber qué reservas quedan pisadas para reasignarlas. */}
          {conflictos.length > 0 && (
            <div className="rounded-lg bg-danger p-3 space-y-1.5">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Hay {conflictos.length} reserva{conflictos.length !== 1 ? 's' : ''} en ese rango
              </p>
              {conflictos.map(r => (
                <p key={r.id} className="text-xs text-white/90">
                  #{r.id} · {r.cliente} · {formatDate(r.fecha_inicio)} → {formatDate(r.fecha_fin)} ({r.estado})
                </p>
              ))}
              <p className="text-[11px] text-white/80">
                El bloqueo se va a crear igual, pero hay que reasignar esas reservas a otro vehículo.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={crear.isPending}>
              {conflictos.length > 0 ? 'Bloquear igual' : 'Bloquear'}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : bloqueos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          El vehículo no tiene bloqueos cargados.
        </p>
      ) : (
        <div className="space-y-1.5">
          {bloqueos.map(b => (
            <div key={b.id} className={cn(
              'flex items-center gap-3 rounded-lg border border-border px-3 py-2',
              !b.activo && 'opacity-50'
            )}>
              <span className={cn(
                'shrink-0 rounded px-2 py-0.5 text-[10px] font-bold',
                MOTIVO_COLOR[b.motivo]
              )}>
                {MOTIVOS.find(m => m.value === b.motivo)?.label ?? b.motivo}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {formatDate(b.fecha_desde)}
                  {b.fecha_hasta !== b.fecha_desde && ` → ${formatDate(b.fecha_hasta)}`}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {b.dias} día{b.dias !== 1 ? 's' : ''}
                  </span>
                  {!b.activo && (
                    <span className="ml-2 text-[10px] font-semibold text-muted-foreground">
                      LIBERADO
                    </span>
                  )}
                </p>
                {b.notas && <p className="text-xs text-muted-foreground truncate">{b.notas}</p>}
              </div>

              {b.activo ? (
                <Button variant="ghost" size="sm" onClick={() => liberar.mutate(b.id)}
                  title="Liberar el vehículo">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => reactivar.mutate(b.id)}
                  title="Reactivar">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
