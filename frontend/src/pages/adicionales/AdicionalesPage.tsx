import { useState } from 'react';
import { Plus, X, RotateCcw, Trash2, Pencil, ShieldCheck, Package, ArrowDownWideNarrow } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdicionales, useCrearAdicional, useActualizarAdicional,
  useDarDeBajaAdicional, useReactivarAdicional,
} from '@/hooks/useAdicionales';
import { cn, formatCurrency, extractError } from '@/lib/utils';
import type { Adicional, GrupoAdicional, UnidadCobro } from '@/types';

const FORM_VACIO = {
  codigo: '',
  nombre: '',
  descripcion: '',
  grupo: 'extra' as GrupoAdicional,
  precio: '',
  unidad_cobro: 'por_dia' as UnidadCobro,
  incluido: false,
  // Cuánto BAJA la franquicia, no cuánto queda (migración 084).
  franquicia_descuento: '',
  porcentaje_sobre_alquiler: '',
  max_cantidad: '',
  visible_web: true,
  orden: 0,
};

/**
 * Catálogo de adicionales (Fase 5, ítem 56 — plan §7.4).
 *
 * Los cargan los dueños con su precio: la lista no está cerrada y cambia con
 * la temporada, por eso es un ABM y no una constante en el código.
 */
export function AdicionalesPage() {
  const [verInactivos, setVerInactivos] = useState(false);
  const { data: adicionales = [], isLoading } = useAdicionales({
    incluir_inactivos: verInactivos,
  });
  const crear = useCrearAdicional();
  const actualizar = useActualizarAdicional();
  const darDeBaja = useDarDeBajaAdicional();
  const reactivar = useReactivarAdicional();

  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VACIO);

  const coberturas = adicionales.filter(a => a.grupo === 'cobertura');
  const extras = adicionales.filter(a => a.grupo === 'extra');

  function abrirNuevo(grupo: GrupoAdicional) {
    setForm({ ...FORM_VACIO, grupo });
    setEditandoId(null);
    setShowForm(true);
  }

  function abrirEdicion(a: Adicional) {
    setForm({
      codigo: a.codigo,
      nombre: a.nombre,
      descripcion: a.descripcion ?? '',
      grupo: a.grupo,
      precio: a.precio,
      unidad_cobro: a.unidad_cobro,
      incluido: a.incluido,
      franquicia_descuento: a.franquicia_descuento ?? '',
      porcentaje_sobre_alquiler: a.porcentaje_sobre_alquiler ?? '',
      max_cantidad: a.max_cantidad ? String(a.max_cantidad) : '',
      visible_web: a.visible_web,
      orden: a.orden,
    });
    setEditandoId(a.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      grupo: form.grupo,
      precio: form.precio || '0',
      unidad_cobro: form.unidad_cobro,
      incluido: form.incluido,
      // La franquicia y el % sobre el alquiler sólo existen en las coberturas.
      franquicia_descuento:
        form.grupo === 'cobertura' && form.franquicia_descuento ? form.franquicia_descuento : null,
      porcentaje_sobre_alquiler:
        form.grupo === 'cobertura' && form.porcentaje_sobre_alquiler
          ? form.porcentaje_sobre_alquiler
          : null,
      max_cantidad: form.max_cantidad ? Number(form.max_cantidad) : null,
      visible_web: form.visible_web,
      orden: form.orden,
    };
    try {
      if (editandoId) {
        await actualizar.mutateAsync({ id: editandoId, payload: base });
        toast.success('Adicional actualizado');
      } else {
        await crear.mutateAsync({ ...base, codigo: form.codigo });
        toast.success('Adicional creado');
      }
      setShowForm(false);
      setEditandoId(null);
      setForm(FORM_VACIO);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Adicionales"
        description="Coberturas y extras que se suman al alquiler. Los precios se congelan en cada reserva al contratarse."
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {editandoId ? 'Editar adicional' : `Nuevo ${form.grupo === 'cobertura' ? 'cobertura' : 'extra'}`}
              </span>
              <button type="button" onClick={() => { setShowForm(false); setEditandoId(null); }}
                className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                <select
                  value={form.grupo}
                  onChange={e => setForm(f => ({ ...f, grupo: e.target.value as GrupoAdicional }))}
                  className="input-base"
                >
                  <option value="cobertura">Cobertura (se elige una)</option>
                  <option value="extra">Extra (se eligen varios)</option>
                </select>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder={form.grupo === 'cobertura' ? 'Ej: Cobertura full' : 'Ej: Silla de bebé'}
                  className="input-base"
                  required
                />
              </div>
              {!editandoId && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Código *</label>
                  <input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    placeholder="cob_full"
                    className="input-base"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">No se puede cambiar después.</p>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Descripción {form.grupo === 'cobertura' && '— explicá la franquicia en una línea clara'}
              </label>
              <input
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder={form.grupo === 'cobertura'
                  ? 'Ej: Sin franquicia. No pagás nada ante un siniestro.'
                  : 'Ej: Apta hasta 18 kg'}
                className="input-base"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Precio *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.precio}
                  onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                  className="input-base"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Se cobra</label>
                <select
                  value={form.unidad_cobro}
                  onChange={e => setForm(f => ({ ...f, unidad_cobro: e.target.value as UnidadCobro }))}
                  className="input-base"
                >
                  <option value="por_dia">Por día</option>
                  <option value="unico">Una sola vez</option>
                </select>
              </div>
              {form.grupo === 'cobertura' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Cuánto baja la franquicia
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.franquicia_descuento}
                    onChange={e => setForm(f => ({ ...f, franquicia_descuento: e.target.value }))}
                    className="input-base"
                    placeholder="500000"
                  />
                  {/* Antes acá se cargaba la franquicia que QUEDABA, y eso sólo
                      podía ser cierto para una categoría: hay tres bases
                      distintas ($1,5M / $2M / $3M). El mismo número prometía
                      cosas distintas según el auto. Lo que define la cobertura
                      es cuánto descuenta. */}
                  <p className="text-[11px] text-muted-foreground">
                    Se resta de la base de cada categoría. La franquicia nunca baja
                    de {formatCurrency(500000)}.
                  </p>
                </div>
              )}
              {form.grupo === 'cobertura' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">% sobre el alquiler</label>
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={form.porcentaje_sobre_alquiler}
                    onChange={e => setForm(f => ({ ...f, porcentaje_sobre_alquiler: e.target.value }))}
                    className="input-base"
                    placeholder="Vacío = usa el Precio"
                  />
                  {form.porcentaje_sobre_alquiler && Number(form.precio) > 0 && (
                    <p className="text-[10px] text-amber-600">
                      Con un % cargado, el campo "Precio" no se cobra — dejalo en 0.
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Máx. por reserva</label>
                <input
                  type="number" min="1"
                  value={form.max_cantidad}
                  onChange={e => setForm(f => ({ ...f, max_cantidad: e.target.value }))}
                  className="input-base"
                  placeholder="Sin tope"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              {form.grupo === 'cobertura' && (
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={form.incluido}
                    onChange={e => setForm(f => ({ ...f, incluido: e.target.checked }))}
                  />
                  Ya viene incluida en el alquiler
                </label>
              )}
              <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.visible_web}
                  onChange={e => setForm(f => ({ ...f, visible_web: e.target.checked }))}
                />
                Ofrecer en la web
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm"
                onClick={() => { setShowForm(false); setEditandoId(null); }}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={crear.isPending || actualizar.isPending}>
                {editandoId ? 'Guardar cambios' : 'Crear'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setVerInactivos(v => !v)}>
          {verInactivos ? 'Ver sólo activos' : 'Ver dados de baja'}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Grupo
            titulo="Coberturas"
            ayuda="El cliente elige UNA. Son niveles del mismo seguro, no se suman entre sí."
            icono={<ShieldCheck className="h-4 w-4 text-primary" />}
            items={coberturas}
            onNuevo={() => abrirNuevo('cobertura')}
            onEditar={abrirEdicion}
            onBaja={id => darDeBaja.mutate(id)}
            onReactivar={id => reactivar.mutate(id)}
            escalera
          />
          <Grupo
            titulo="Extras"
            ayuda="Se pueden elegir todos los que quiera."
            icono={<Package className="h-4 w-4 text-primary" />}
            items={extras}
            onNuevo={() => abrirNuevo('extra')}
            onEditar={abrirEdicion}
            onBaja={id => darDeBaja.mutate(id)}
            onReactivar={id => reactivar.mutate(id)}
          />
        </>
      )}
    </div>
  );
}

function Grupo({
  titulo, ayuda, icono, items, onNuevo, onEditar, onBaja, onReactivar, escalera,
}: {
  titulo: string;
  ayuda: string;
  icono: React.ReactNode;
  items: Adicional[];
  onNuevo: () => void;
  onEditar: (a: Adicional) => void;
  onBaja: (id: number) => void;
  onReactivar: (id: number) => void;
  /** Coberturas: muestra la escalera franquicia↔precio (D-53) además de la
   *  lista de ABM — el orden se guarda por franquicia, no por `orden`. */
  escalera?: boolean;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icono}
          <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
          {items.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold">
              {items.length}
            </span>
          )}
        </div>
        <Button size="sm" onClick={onNuevo}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ayuda}</p>

      {escalera && <EscaleraFranquicia items={items} />}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Todavía no hay {titulo.toLowerCase()} cargados.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map(a => (
            <div key={a.id} className={cn(
              'flex items-center gap-3 rounded-lg border border-border px-3 py-2',
              !a.activo && 'opacity-50'
            )}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{a.nombre}</span>
                  {a.incluido && (
                    <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      INCLUIDA
                    </span>
                  )}
                  {!a.visible_web && (
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      no web
                    </span>
                  )}
                  {!a.activo && (
                    <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                      DADO DE BAJA
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {a.descripcion ?? a.codigo}
                  {a.franquicia_descuento !== null && ` · baja ${formatCurrency(a.franquicia_descuento)}`}
                  {a.max_cantidad && ` · máx. ${a.max_cantidad}`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {Number(a.precio) === 0 ? 'Sin cargo' : formatCurrency(a.precio)}
                </p>
                {Number(a.precio) > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {a.unidad_cobro === 'por_dia' ? 'por día' : 'única vez'}
                  </p>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEditar(a)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {a.activo ? (
                  <Button variant="ghost" size="sm" onClick={() => onBaja(a.id)} title="Dar de baja">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => onReactivar(a.id)} title="Reactivar">
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

/**
 * La escalera franquicia↔precio (D-53, plan §3.8b).
 *
 * El backend ya rechaza guardar una cobertura que rompa el orden — acá se ve
 * el orden **antes** de tocar nada, para que el rechazo del `POST`/`PATCH`
 * no sea la primera noticia. Ordenada de menos descuento (más barata) a más
 * (más cara): así se lee de arriba a abajo como "pagás menos, cubrís más".
 */
function EscaleraFranquicia({ items }: { items: Adicional[] }) {
  const conFranquicia = items
    .filter(a => a.activo && a.franquicia_descuento !== null)
    .sort((a, b) => Number(a.franquicia_descuento) - Number(b.franquicia_descuento));

  if (conFranquicia.length < 2) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <ArrowDownWideNarrow className="h-3.5 w-3.5 text-primary" />
        Escalera franquicia → precio
      </div>
      <div className="space-y-1">
        {conFranquicia.map(a => (
          <div key={a.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-foreground">{a.nombre}</span>
            <span className="flex shrink-0 items-center gap-3 tabular-nums text-muted-foreground">
              <span>baja {formatCurrency(a.franquicia_descuento!)}</span>
              <span className="font-medium text-foreground">
                {a.porcentaje_sobre_alquiler
                  ? `${a.porcentaje_sobre_alquiler}% del alquiler`
                  : Number(a.precio) === 0
                  ? 'incluida'
                  : `${formatCurrency(a.precio)}${a.unidad_cobro === 'por_dia' ? '/día' : ''}`}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        A menor franquicia, mayor precio — si una fila no cumple esto, el sistema no va a dejar guardarla.
      </p>
    </div>
  );
}
