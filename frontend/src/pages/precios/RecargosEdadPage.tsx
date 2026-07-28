import { useState } from 'react';
import { Plus, X, Trash2, Pencil, CalendarClock, Info } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useRecargosEdad, useCrearRecargoEdad,
  useActualizarRecargoEdad, useDarDeBajaRecargoEdad,
} from '@/hooks/useRecargosEdad';
import { useCategorias } from '@/hooks/useCategorias';
import { cn, formatCurrency, extractError } from '@/lib/utils';
import type { RecargoEdad, UnidadCobro } from '@/types';

const FORM_VACIO = {
  nombre: '',
  descripcion: '',
  edad_desde: '18',
  edad_hasta: '24',
  tipo_importe: 'porcentaje' as 'porcentaje' | 'monto',
  valor: '',
  unidad_cobro: 'por_dia' as UnidadCobro,
  categoria_id: '' as string,
};

/**
 * Recargos por franja etaria (D-38).
 *
 * **No hay edad mínima para alquilar.** La edad modifica el precio, no rechaza
 * al cliente — rechazar pierde la venta entera, recargar la conserva y cubre
 * el riesgo. Es cómo opera el rubro.
 *
 * Los cargan los administradores, no están en el código: la franja y el monto
 * son decisiones comerciales que van a cambiar.
 */
export function RecargosEdadPage() {
  const { data: recargos = [], isLoading } = useRecargosEdad();
  const { data: categorias = [] } = useCategorias();
  const crear = useCrearRecargoEdad();
  const actualizar = useActualizarRecargoEdad();
  const darDeBaja = useDarDeBajaRecargoEdad();

  const [form, setForm] = useState(FORM_VACIO);
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const nombreCategoria = (id: number | null) =>
    id === null ? 'Todas las categorías' : categorias.find(c => c.id === id)?.nombre ?? '—';

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setEditandoId(null);
    setAbierto(true);
  };

  const abrirEdicion = (r: RecargoEdad) => {
    setForm({
      nombre: r.nombre,
      descripcion: r.descripcion ?? '',
      edad_desde: String(r.edad_desde),
      edad_hasta: r.edad_hasta === null ? '' : String(r.edad_hasta),
      tipo_importe: r.porcentaje !== null ? 'porcentaje' : 'monto',
      valor: r.porcentaje ?? r.monto ?? '',
      unidad_cobro: r.unidad_cobro,
      categoria_id: r.categoria_id === null ? '' : String(r.categoria_id),
    });
    setEditandoId(r.id);
    setAbierto(true);
  };

  const guardar = async () => {
    const valor = Number(form.valor);
    if (!form.nombre.trim()) return toast.error('Poné un nombre');
    if (!valor || valor <= 0) return toast.error('El importe tiene que ser mayor a 0');
    if (form.tipo_importe === 'porcentaje' && valor > 100)
      return toast.error('El porcentaje no puede ser mayor a 100');

    const body = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      edad_desde: Number(form.edad_desde),
      edad_hasta: form.edad_hasta === '' ? null : Number(form.edad_hasta),
      // El backend valida que venga uno u otro, nunca los dos.
      monto: form.tipo_importe === 'monto' ? valor : null,
      porcentaje: form.tipo_importe === 'porcentaje' ? valor : null,
      unidad_cobro: form.unidad_cobro,
      categoria_id: form.categoria_id === '' ? null : Number(form.categoria_id),
    };

    try {
      if (editandoId) await actualizar.mutateAsync({ id: editandoId, ...body });
      else await crear.mutateAsync(body);
      toast.success(editandoId ? 'Recargo actualizado' : 'Recargo creado');
      setAbierto(false);
    } catch (e) {
      toast.error(extractError(e));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recargos por edad"
        description="La edad del conductor puede modificar la tarifa. No rechaza a nadie."
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4" /> Nuevo recargo
          </Button>
        }
      />

      <Card className="flex gap-2.5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">No se rechaza a nadie por edad.</strong>{' '}
            Si la edad del conductor cae en una de estas franjas, se suma el recargo
            a la reserva y se le muestra al cliente <em>antes</em> de confirmar.
          </p>
          <p className="mt-1.5">
            La edad se mide <strong className="text-foreground">al retirar el vehículo</strong>,
            y es la de quien maneja: si la reserva tiene un conductor designado, se usa
            la suya y no la del titular.
          </p>
        </div>
      </Card>

      {isLoading && <Skeleton className="h-40" />}

      {!isLoading && recargos.length === 0 && (
        <Card className="p-10 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium text-foreground">No hay recargos cargados</p>
          <p className="text-sm text-muted-foreground">
            Sin franjas cargadas, la edad no afecta el precio de ninguna reserva.
          </p>
        </Card>
      )}

      <div className="grid gap-3">
        {recargos.map(r => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{r.nombre}</p>
                <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {r.edad_hasta === null
                    ? `${r.edad_desde} años o más`
                    : `${r.edad_desde} a ${r.edad_hasta} años`}
                </span>
                <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {nombreCategoria(r.categoria_id)}
                </span>
              </div>
              {r.descripcion && (
                <p className="mt-1 text-xs text-muted-foreground">{r.descripcion}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-bold text-primary">
                  {r.porcentaje !== null
                    ? `+${Number(r.porcentaje)}%`
                    : `+${formatCurrency(r.monto ?? 0)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {/* El porcentaje ya escala con la duración: multiplicarlo por
                      los días lo cobraría al cuadrado. */}
                  {r.porcentaje !== null
                    ? 'sobre el alquiler'
                    : r.unidad_cobro === 'por_dia'
                      ? 'por día'
                      : 'único'}
                </p>
              </div>

              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => abrirEdicion(r)} aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Dar de baja"
                  onClick={async () => {
                    try {
                      await darDeBaja.mutateAsync(r.id);
                      toast.success('Recargo dado de baja');
                    } catch (e) {
                      toast.error(extractError(e));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">
                {editandoId ? 'Editar recargo' : 'Nuevo recargo por edad'}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setAbierto(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Nombre *</label>
                <input
                  className="input-base"
                  placeholder="Conductor joven"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Desde (años) *</label>
                <input
                  type="number" min={0} className="input-base"
                  value={form.edad_desde}
                  onChange={e => setForm(f => ({ ...f, edad_desde: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hasta (años)</label>
                <input
                  type="number" min={0} className="input-base"
                  placeholder="Vacío = en adelante"
                  value={form.edad_hasta}
                  onChange={e => setForm(f => ({ ...f, edad_hasta: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tipo de recargo</label>
                <select
                  className="input-base"
                  value={form.tipo_importe}
                  onChange={e => setForm(f => ({ ...f, tipo_importe: e.target.value as 'porcentaje' | 'monto' }))}
                >
                  <option value="porcentaje">Porcentaje sobre el alquiler</option>
                  <option value="monto">Monto fijo</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {form.tipo_importe === 'porcentaje' ? 'Porcentaje (%) *' : 'Monto ($) *'}
                </label>
                <input
                  type="number" min={0} step="0.01" className="input-base"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                />
              </div>

              {form.tipo_importe === 'monto' && (
                <div>
                  <label className="text-xs text-muted-foreground">Se cobra</label>
                  <select
                    className="input-base"
                    value={form.unidad_cobro}
                    onChange={e => setForm(f => ({ ...f, unidad_cobro: e.target.value as UnidadCobro }))}
                  >
                    <option value="por_dia">Por cada día</option>
                    <option value="unico">Una sola vez</option>
                  </select>
                </div>
              )}

              <div className={cn(form.tipo_importe === 'porcentaje' && 'sm:col-span-2')}>
                <label className="text-xs text-muted-foreground">Aplica a</label>
                <select
                  className="input-base"
                  value={form.categoria_id}
                  onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Descripción</label>
                <input
                  className="input-base"
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button size="sm" onClick={guardar} disabled={crear.isPending || actualizar.isPending}>
                {crear.isPending || actualizar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
