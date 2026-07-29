import { useState } from 'react';
import { Percent, Plus, X, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useDescuentosDuracion, useCrearDescuentoDuracion,
  useDarDeBajaDescuentoDuracion, useReactivarDescuentoDuracion,
} from '@/hooks/usePrecios';
import { useCategorias } from '@/hooks/useCategorias';
import { cn, extractError } from '@/lib/utils';

const FORM_VACIO = {
  nombre: '',
  dias_desde: '',
  dias_hasta: '',
  porcentaje: '',
  categoria_id: '',
};

/**
 * Descuento por alquilar muchos días. Es un eje distinto al del calendario:
 * el calendario dice cuánto vale CADA día, esto dice cuánto se bonifica por
 * el largo total. Separarlos evita cargar una regla por cada combinación de
 * fecha × duración.
 */
export function DescuentosDuracionPanel() {
  const [verInactivos, setVerInactivos] = useState(false);
  const { data: descuentos = [] } = useDescuentosDuracion(verInactivos);
  const { data: categorias = [] } = useCategorias();
  const crear = useCrearDescuentoDuracion();
  const darDeBaja = useDarDeBajaDescuentoDuracion();
  const reactivar = useReactivarDescuentoDuracion();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await crear.mutateAsync({
        nombre: form.nombre,
        dias_desde: Number(form.dias_desde),
        dias_hasta: form.dias_hasta ? Number(form.dias_hasta) : null,
        porcentaje: form.porcentaje,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      });
      toast.success('Descuento creado');
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
          <Percent className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Descuentos por duración</h3>
          {/* Aparece en las dos pantallas de precios, y no tiene canal: el
              aviso no es decoración, evita que alguien crea que está tocando
              sólo la web porque entró por ahí. */}
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            los dos canales
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerInactivos(v => !v)}>
            {verInactivos ? 'Ver sólo activos' : 'Ver dados de baja'}
          </Button>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Se aplica sobre el total de los días ya calculados. Si dos descuentos se solapan, gana el
        de mayor porcentaje — el cliente nunca sale perdiendo por un solapamiento mal cargado.
        <strong> Estos descuentos valen igual en web y en mostrador</strong>: son la misma lista
        en las dos pantallas.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Nuevo descuento</span>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Una semana o más"
                className="input-base"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Desde (días) *</label>
              <input
                type="number" min="1"
                value={form.dias_desde}
                onChange={e => setForm(f => ({ ...f, dias_desde: e.target.value }))}
                className="input-base"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hasta (días)</label>
              <input
                type="number" min="1"
                value={form.dias_hasta}
                onChange={e => setForm(f => ({ ...f, dias_hasta: e.target.value }))}
                className="input-base"
                placeholder="Sin tope"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">% *</label>
              <input
                type="number" min="0.01" max="100" step="0.01"
                value={form.porcentaje}
                onChange={e => setForm(f => ({ ...f, porcentaje: e.target.value }))}
                className="input-base"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Categoría</label>
            <select
              value={form.categoria_id}
              onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
              className="input-base"
            >
              <option value="">Toda la flota</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={crear.isPending}>Crear</Button>
          </div>
        </form>
      )}

      {descuentos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Sin descuentos por duración cargados.
        </p>
      ) : (
        <div className="space-y-1.5">
          {descuentos.map(d => (
            <div key={d.id} className={cn(
              'flex items-center gap-3 rounded-lg border border-border px-3 py-2',
              !d.activo && 'opacity-50'
            )}>
              <span className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                −{Number(d.porcentaje)}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{d.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {d.dias_hasta ? `${d.dias_desde} a ${d.dias_hasta} días` : `${d.dias_desde} días o más`}
                  {' · '}{d.categoria_nombre ?? 'toda la flota'}
                </p>
              </div>
              {d.activo ? (
                <Button variant="ghost" size="sm" onClick={() => darDeBaja.mutate(d.id)} title="Dar de baja">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => reactivar.mutate(d.id)} title="Reactivar">
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
