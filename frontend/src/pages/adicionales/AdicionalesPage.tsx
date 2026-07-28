import { useState } from 'react';
import { Plus, X, RotateCcw, Trash2, Pencil, ShieldCheck, Package } from 'lucide-react';
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
  franquicia: '',
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
      franquicia: a.franquicia ?? '',
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
      // La franquicia sólo existe en las coberturas.
      franquicia: form.grupo === 'cobertura' && form.franquicia ? form.franquicia : null,
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
                  <label className="text-xs font-medium text-muted-foreground">Franquicia</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.franquicia}
                    onChange={e => setForm(f => ({ ...f, franquicia: e.target.value }))}
                    className="input-base"
                    placeholder="0 = sin franquicia"
                  />
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
  titulo, ayuda, icono, items, onNuevo, onEditar, onBaja, onReactivar,
}: {
  titulo: string;
  ayuda: string;
  icono: React.ReactNode;
  items: Adicional[];
  onNuevo: () => void;
  onEditar: (a: Adicional) => void;
  onBaja: (id: number) => void;
  onReactivar: (id: number) => void;
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
                  {a.franquicia !== null && ` · franquicia ${formatCurrency(a.franquicia)}`}
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
