import { useState } from 'react';
import { CalendarDays, Plus, X, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useFechasEspeciales, useCrearFechaEspecial,
  useDarDeBajaFechaEspecial, useReactivarFechaEspecial,
} from '@/hooks/useFechasEspeciales';
import { COLOR_FECHA_ESPECIAL, TIPO_FECHA_ESPECIAL_LABEL } from '@/lib/constants';
import { cn, formatDate, extractError } from '@/lib/utils';
import type { TipoFechaEspecial, ColorFechaEspecial } from '@/types';

const FORM_VACIO = {
  nombre: '',
  fecha_desde: '',
  fecha_hasta: '',
  tipo: 'comercial' as TipoFechaEspecial,
  color: 'ambar' as ColorFechaEspecial,
  notas: '',
};

export function FechasEspecialesPanel() {
  const [verInactivas, setVerInactivas] = useState(false);
  const { data: fechas = [], isLoading } = useFechasEspeciales({ incluir_inactivas: verInactivas });
  const crear = useCrearFechaEspecial();
  const darDeBaja = useDarDeBajaFechaEspecial();
  const reactivar = useReactivarFechaEspecial();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    try {
      await crear.mutateAsync({
        nombre: form.nombre,
        fecha_desde: form.fecha_desde,
        // Un día suelto: si no cargan el fin, es el mismo día.
        fecha_hasta: form.fecha_hasta || form.fecha_desde,
        tipo: form.tipo,
        color: form.color,
        notas: form.notas || null,
      });
      toast.success('Fecha especial creada');
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
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Fechas especiales</h3>
          {fechas.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold">
              {fechas.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerInactivas(v => !v)}>
            {verInactivas ? 'Ver sólo activas' : 'Ver dadas de baja'}
          </Button>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4" /> Nueva fecha
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Feriados, fechas comerciales y temporadas. Aparecen marcadas en el calendario de ocupación
        para que se vean al planificar. Más adelante van a ser la base de los precios por fecha.
      </p>

      {showForm && (
        <form onSubmit={handleCrear} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">Nueva fecha especial</span>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Día del Amigo 2027"
                className="input-base"
                required
              />
            </div>
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
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoFechaEspecial }))}
                className="input-base"
              >
                {(Object.keys(TIPO_FECHA_ESPECIAL_LABEL) as TipoFechaEspecial[]).map(t => (
                  <option key={t} value={t}>{TIPO_FECHA_ESPECIAL_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex gap-1.5 pt-1">
                {(Object.keys(COLOR_FECHA_ESPECIAL) as ColorFechaEspecial[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    title={c}
                    className={cn(
                      'h-6 w-6 rounded-full transition-all',
                      COLOR_FECHA_ESPECIAL[c].punto,
                      form.color === c ? 'ring-2 ring-offset-2 ring-foreground/40 scale-110' : 'opacity-60',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notas</label>
              <input
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Opcional"
                className="input-base"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={crear.isPending}>
              <Save className="h-4 w-4" /> {crear.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : fechas.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">Sin fechas especiales cargadas.</p>
      ) : (
        <div className="divide-y divide-border">
          {fechas.map(f => {
            const unDia = f.fecha_desde === f.fecha_hasta;
            return (
              <div key={f.id} className={cn('flex items-center gap-3 py-2.5', !f.activo && 'opacity-50')}>
                <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', COLOR_FECHA_ESPECIAL[f.color].punto)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {unDia ? formatDate(f.fecha_desde) : `${formatDate(f.fecha_desde)} — ${formatDate(f.fecha_hasta)}`}
                    {' · '}{TIPO_FECHA_ESPECIAL_LABEL[f.tipo]}
                    {f.notas ? ` · ${f.notas}` : ''}
                  </p>
                </div>
                {f.activo ? (
                  <Button variant="ghost" size="sm" onClick={() => darDeBaja.mutate(f.id)} title="Dar de baja">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => reactivar.mutate(f.id)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
