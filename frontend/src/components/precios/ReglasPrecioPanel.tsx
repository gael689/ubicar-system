import { useState } from 'react';
import { Tag, Plus, X, RotateCcw, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useReglasPrecio, useCrearReglaPrecio, useActualizarReglaPrecio,
  useDarDeBajaReglaPrecio, useReactivarReglaPrecio,
} from '@/hooks/usePrecios';
import { useCategorias } from '@/hooks/useCategorias';
import { useFechasEspeciales } from '@/hooks/useFechasEspeciales';
import { cn, formatCurrency, formatDate, extractError } from '@/lib/utils';
import type { CanalTarifa, TarifaCalendario } from '@/types';

const DIAS = [
  { iso: 1, letra: 'L' }, { iso: 2, letra: 'M' }, { iso: 3, letra: 'M' },
  { iso: 4, letra: 'J' }, { iso: 5, letra: 'V' }, { iso: 6, letra: 'S' },
  { iso: 7, letra: 'D' },
];

/**
 * Las tres capas del plan (§7.2), tal como los dueños las describieron.
 * Se ofrecen como preset para que nadie tenga que aprenderse los números:
 * elegir "Promoción" ya deja la prioridad en 20 y marca `es_promocional`.
 */
const CAPAS = [
  { valor: 0,  label: 'Precio base', ayuda: 'El precio de todo el año. Es el piso sobre el que se apila el resto.' },
  { valor: 10, label: 'Fecha especial', ayuda: 'Navidad, fin de semana largo, temporada alta. Le gana al precio base.' },
  { valor: 20, label: 'Promoción', ayuda: 'Le gana a todo y se comunica como descuento en la web.' },
];

function formVacio(canal: CanalTarifa) {
  return {
    nombre: '',
    categoria_id: '' as string,
    precio_dia: '',
    usar_fecha_especial: false,
    fecha_especial_id: '' as string,
    fecha_desde: '',
    fecha_hasta: '',
    dias_semana: [] as number[],
    prioridad: 0,
    // El canal lo fija la pantalla en la que se está, no un desplegable que
    // hay que acordarse de tocar. Cargar en "Precios web" una regla que sin
    // querer también cambia el mostrador es el error que esto evita.
    canal,
    es_promocional: false,
    precio_referencia: '',
    etiqueta_promo: '',
    min_dias: '',
    max_dias: '',
    notas: '',
  };
}

interface Props {
  /** El canal de esta pantalla. La lista, el alta y la edición trabajan sobre él. */
  canal: 'web' | 'mostrador';
}

export function ReglasPrecioPanel({ canal }: Props) {
  const [verInactivas, setVerInactivas] = useState(false);
  const { data: reglas = [], isLoading } = useReglasPrecio({
    incluir_inactivas: verInactivas,
    canal,
  });
  const { data: categorias = [] } = useCategorias();
  const { data: fechasEspeciales = [] } = useFechasEspeciales();

  const crear = useCrearReglaPrecio();
  const actualizar = useActualizarReglaPrecio();
  const darDeBaja = useDarDeBajaReglaPrecio();
  const reactivar = useReactivarReglaPrecio();

  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(() => formVacio(canal));

  const otroCanal = canal === 'web' ? 'mostrador' : 'web';

  function abrirNueva() {
    setForm(formVacio(canal));
    setEditandoId(null);
    setShowForm(true);
  }

  function abrirEdicion(r: TarifaCalendario) {
    setForm({
      nombre: r.nombre,
      categoria_id: r.categoria_id ? String(r.categoria_id) : '',
      precio_dia: r.precio_dia,
      usar_fecha_especial: r.fecha_especial_id != null,
      fecha_especial_id: r.fecha_especial_id ? String(r.fecha_especial_id) : '',
      fecha_desde: r.fecha_desde ?? '',
      fecha_hasta: r.fecha_hasta ?? '',
      dias_semana: r.dias_semana ?? [],
      prioridad: r.prioridad,
      canal: r.canal,
      es_promocional: r.es_promocional,
      precio_referencia: r.precio_referencia ?? '',
      etiqueta_promo: r.etiqueta_promo ?? '',
      min_dias: r.min_dias ? String(r.min_dias) : '',
      max_dias: r.max_dias ? String(r.max_dias) : '',
      notas: r.notas ?? '',
    });
    setEditandoId(r.id);
    setShowForm(true);
  }

  function elegirCapa(prioridad: number) {
    setForm(f => ({
      ...f,
      prioridad,
      // La capa 20 ES la promo: marcarla a mano sería un paso de más.
      es_promocional: prioridad === 20 ? true : f.es_promocional,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      nombre: form.nombre,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      precio_dia: form.precio_dia,
      // El rango se define de UNA forma: heredado o propio, nunca las dos.
      fecha_especial_id: form.usar_fecha_especial ? Number(form.fecha_especial_id) : null,
      fecha_desde: form.usar_fecha_especial ? null : form.fecha_desde,
      fecha_hasta: form.usar_fecha_especial ? null : (form.fecha_hasta || form.fecha_desde),
      dias_semana: form.dias_semana.length > 0 ? form.dias_semana : null,
      prioridad: form.prioridad,
      canal: form.canal,
      es_promocional: form.es_promocional,
      precio_referencia: form.es_promocional && form.precio_referencia ? form.precio_referencia : null,
      etiqueta_promo: form.es_promocional ? form.etiqueta_promo : null,
      min_dias: form.min_dias ? Number(form.min_dias) : null,
      max_dias: form.max_dias ? Number(form.max_dias) : null,
      notas: form.notas || null,
    };
    try {
      if (editandoId) {
        await actualizar.mutateAsync({ id: editandoId, payload });
        toast.success('Regla actualizada');
      } else {
        await crear.mutateAsync(payload);
        toast.success('Regla de precio creada');
      }
      setShowForm(false);
      setEditandoId(null);
      setForm(formVacio(canal));
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleBaja(r: TarifaCalendario) {
    try {
      await darDeBaja.mutateAsync(r.id);
      toast.success('Regla dada de baja — vuelve a aplicar el precio de menor prioridad');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Reglas de precio {canal === 'web' ? 'de la web' : 'del mostrador'}
          </h3>
          {reglas.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold">
              {reglas.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerInactivas(v => !v)}>
            {verInactivas ? 'Ver sólo activas' : 'Ver dadas de baja'}
          </Button>
          <Button size="sm" onClick={abrirNueva}>
            <Plus className="h-4 w-4" /> Nueva regla
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        La regla de <strong>mayor prioridad</strong> que cubre el día es la que manda. Apilar una
        promoción no borra el precio de abajo: cuando la promo se da de baja, el precio anterior
        vuelve a aplicar solo.
      </p>
      <p className="text-xs text-muted-foreground">
        Acá sólo se ve y se carga lo de <strong>{canal}</strong>. Las reglas marcadas
        <span className="mx-1 rounded border border-border px-1.5 py-0.5 text-[10px]">
          los dos canales
        </span>
        aparecen también en {otroCanal}: si las editás, cambia el precio de los dos.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {editandoId ? 'Editar regla' : 'Nueva regla de precio'}
            </span>
            <button type="button" onClick={() => { setShowForm(false); setEditandoId(null); }}
              className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Capa — lo primero que se elige, porque define todo lo demás. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">¿Qué tipo de precio es?</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CAPAS.map(c => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => elegirCapa(c.valor)}
                  className={cn(
                    'rounded-lg border p-2.5 text-left transition-colors',
                    form.prioridad === c.valor
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-background hover:border-primary/50'
                  )}
                >
                  <span className="block text-sm font-semibold">{c.label}</span>
                  <span className={cn(
                    'block text-[10px] leading-tight mt-0.5',
                    form.prioridad === c.valor ? 'text-white/80' : 'text-muted-foreground'
                  )}>
                    {c.ayuda}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Base anual pick-up"
                className="input-base"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categoría</label>
              <select
                value={form.categoria_id}
                onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                className="input-base"
              >
                <option value="">Toda la flota</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Precio por día *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.precio_dia}
                onChange={e => setForm(f => ({ ...f, precio_dia: e.target.value }))}
                className="input-base"
                required
              />
            </div>
          </div>

          {/* Rango: heredado de una fecha especial, o cargado a mano. */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.usar_fecha_especial}
                onChange={e => setForm(f => ({ ...f, usar_fecha_especial: e.target.checked }))}
              />
              Usar una fecha especial ya cargada
            </label>
            {form.usar_fecha_especial ? (
              <div className="space-y-1">
                <select
                  value={form.fecha_especial_id}
                  onChange={e => setForm(f => ({ ...f, fecha_especial_id: e.target.value }))}
                  className="input-base"
                  required
                >
                  <option value="">Elegir fecha especial…</option>
                  {fechasEspeciales.map(fe => (
                    <option key={fe.id} value={fe.id}>
                      {fe.nombre} ({formatDate(fe.fecha_desde)} → {formatDate(fe.fecha_hasta)})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  El rango se hereda. Si después se corrige la fecha especial, este precio se
                  corrige solo — no hay que tocarlo de nuevo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            )}
          </div>

          {/* Días de la semana — "los fines de semana valen más". */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Días de la semana <span className="font-normal">(ninguno = todos)</span>
            </label>
            <div className="flex gap-1">
              {DIAS.map(d => {
                const activo = form.dias_semana.includes(d.iso);
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      dias_semana: activo
                        ? f.dias_semana.filter(x => x !== d.iso)
                        : [...f.dias_semana, d.iso],
                    }))}
                    className={cn(
                      'h-8 w-8 rounded text-xs font-semibold transition-colors',
                      activo
                        ? 'bg-primary text-white'
                        : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {d.letra}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Dos opciones, no tres: en esta pantalla "el otro canal solo" no
                es una elección válida — para eso se va a la otra pantalla. */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">¿Dónde aplica?</label>
              <select
                value={form.canal === 'ambos' ? 'ambos' : canal}
                onChange={e => setForm(f => ({ ...f, canal: e.target.value as CanalTarifa }))}
                className="input-base"
              >
                <option value={canal}>Sólo {canal}</option>
                <option value="ambos">Los dos canales</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mín. días</label>
              <input
                type="number" min="1"
                value={form.min_dias}
                onChange={e => setForm(f => ({ ...f, min_dias: e.target.value }))}
                className="input-base"
                placeholder="Sin mínimo"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Máx. días</label>
              <input
                type="number" min="1"
                value={form.max_dias}
                onChange={e => setForm(f => ({ ...f, max_dias: e.target.value }))}
                className="input-base"
                placeholder="Sin máximo"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prioridad</label>
              <input
                type="number"
                value={form.prioridad}
                onChange={e => setForm(f => ({ ...f, prioridad: Number(e.target.value) }))}
                className="input-base"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.es_promocional}
              onChange={e => setForm(f => ({ ...f, es_promocional: e.target.checked }))}
            />
            Es una promoción (se comunica como descuento)
          </label>

          {form.es_promocional && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-amber-500 p-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Etiqueta de la promo *</label>
                <input
                  value={form.etiqueta_promo}
                  onChange={e => setForm(f => ({ ...f, etiqueta_promo: e.target.value }))}
                  placeholder="Ej: Promo Día del Amigo"
                  className="input-base"
                  required
                />
                <p className="text-[10px] text-white/85">Es el texto que ve el cliente.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Precio tachado</label>
                <input
                  type="number" min="1" step="0.01"
                  value={form.precio_referencia}
                  onChange={e => setForm(f => ({ ...f, precio_referencia: e.target.value }))}
                  className="input-base"
                />
                <p className="text-[10px] text-white/85">
                  El precio "de lista" para mostrar el antes/ahora. Tiene que ser mayor al que se cobra.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <input
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              className="input-base"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm"
              onClick={() => { setShowForm(false); setEditandoId(null); }}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={crear.isPending || actualizar.isPending}>
              {editandoId ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : reglas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Todavía no hay reglas de precio para {canal}. Mientras tanto el sistema
          cotiza con las tarifas por duración de siempre — es el motivo de que
          la grilla de arriba muestre el mismo número todos los días.
        </p>
      ) : (
        <div className="space-y-1.5">
          {reglas.map(r => (
            <div
              key={r.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-border px-3 py-2',
                !r.activo && 'opacity-50'
              )}
            >
              <span className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
                r.prioridad >= 20 ? 'bg-amber-500 text-white'
                  : r.prioridad >= 10 ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground'
              )}>
                P{r.prioridad}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{r.nombre}</span>
                  {r.es_promocional && r.etiqueta_promo && (
                    <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {r.etiqueta_promo}
                    </span>
                  )}
                  {/* La marca importante es la contraria a la de antes: acá
                      todas las reglas son de este canal, y lo que hay que
                      señalar es cuál además toca el otro. */}
                  {r.canal === 'ambos' && (
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      los dos canales
                    </span>
                  )}
                  {!r.activo && (
                    <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                      DADA DE BAJA
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {r.categoria_nombre ?? r.vehiculo_patente ?? 'Toda la flota'}
                  {' · '}
                  {r.vigencia_desde
                    ? `${formatDate(r.vigencia_desde)} → ${formatDate(r.vigencia_hasta!)}`
                    : 'sin rango'}
                  {r.fecha_especial_nombre && ` · vía ${r.fecha_especial_nombre}`}
                  {r.dias_semana && r.dias_semana.length > 0 &&
                    ` · ${r.dias_semana.map(d => DIAS.find(x => x.iso === d)?.letra).join('')}`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(r.precio_dia)}
                </p>
                <p className="text-[10px] text-muted-foreground">por día</p>
              </div>

              <div className="shrink-0 flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => abrirEdicion(r)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {r.activo ? (
                  <Button variant="ghost" size="sm" onClick={() => handleBaja(r)} title="Dar de baja">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => reactivar.mutate(r.id)} title="Reactivar">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
