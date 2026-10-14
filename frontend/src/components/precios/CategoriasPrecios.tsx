import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Car, Check, CheckCircle2, ImageUp, Pencil, Tags } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InputMoneda } from '@/components/shared/InputMoneda';
import {
  useCategorias, useCreateTarifaCategoria, useTarifasCategoria, useUpdateCategoria,
  useUploadFotoCategoria,
} from '@/hooks/useCategorias';
import { useCoberturaPrecios, type CoberturaCategoria } from '@/hooks/usePrecios';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Categoria } from '@/types';

/**
 * Las categorías, con todo lo comercial en una fila (14/10).
 *
 * Antes había dos lugares para "el precio de una categoría": Flota →
 * Categorías (la tarifa) y Precios (el calendario), que además se pisaban. Y
 * si la web podía vender o no una categoría no se veía en ningún lado: el 14/10
 * ninguna tenía precio y la web las mostraba todas como "sin disponibilidad".
 *
 * Ahora es una sola tabla, arriba de Precios:
 *
 * - **Precio por día**: el precio base. Es la tarifa diaria de la categoría, lo
 *   que se cobra cualquier día que el calendario de abajo no cambie.
 * - **En web**: si se ofrece en el sitio. Un click.
 * - **Estado**: si la web la puede vender, y si no, desde cuándo. Sale del
 *   mismo cálculo que el aviso de la campana.
 */
export function CategoriasPrecios() {
  const { data: categorias, isLoading } = useCategorias();
  const { data: cobertura = [] } = useCoberturaPrecios();
  const porCategoria = new Map(cobertura.map(c => [c.categoria_id, c]));
  const conProblema = cobertura.filter(c => c.visible_web && c.con_flota && c.dias_sin_precio > 0);

  return (
    <Card className="space-y-3 p-5" id="categorias">
      <div className="flex items-center gap-2">
        <Tags className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Categorías</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        El <strong>precio por día</strong> es el precio base: queda definido para siempre. Desde el{' '}
        <strong>calendario</strong> de abajo lo pueden ajustar a medida según la fecha (temporadas,
        feriados, promociones). <strong>En web</strong> decide si la categoría aparece en el sitio.
      </p>

      {/* Discreto a propósito (14/10): el cartel rojo a todo ancho era
          demasiado para algo que se resuelve cargando un número. */}
      {conProblema.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {conProblema.length === 1 ? 'Esta categoría no tiene' : 'Estas categorías no tienen'} definido
            el precio por día: <strong>{conProblema.map(c => c.categoria_nombre).join(', ')}</strong>.
          </span>
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-24 px-3 py-2">Foto</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Precio por día</th>
                <th className="w-20 px-3 py-2 text-center">En web</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(categorias ?? []).map(c => (
                <FilaCategoria key={c.id} categoria={c} cobertura={porCategoria.get(c.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FilaCategoria({ categoria, cobertura }: { categoria: Categoria; cobertura?: CoberturaCategoria }) {
  return (
    <tr className="align-middle">
      <td className="px-3 py-2"><FotoCategoria categoria={categoria} /></td>
      <td className="px-3 py-2">
        <div className="font-semibold text-foreground">{categoria.nombre}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{categoria.codigo}</div>
      </td>
      <td className="px-3 py-2"><PrecioBase categoria={categoria} /></td>
      <td className="px-3 py-2 text-center"><TildeWeb categoria={categoria} /></td>
      <td className="px-3 py-2"><Estado categoria={categoria} cobertura={cobertura} /></td>
    </tr>
  );
}

/**
 * El precio base: la tarifa **diaria** de la categoría.
 *
 * Es lo único que hace falta para que la web cotice cualquier alquiler (la
 * escalera por duración hace el resto). Guardar uno nuevo da de baja el
 * anterior del mismo tipo, así que no se apilan.
 */
function PrecioBase({ categoria }: { categoria: Categoria }) {
  const qc = useQueryClient();
  const { data: tarifas = [] } = useTarifasCategoria(categoria.id);
  const crear = useCreateTarifaCategoria(categoria.id);
  const diaria = tarifas.find(t => t.tipo === 'diaria');
  const otras = tarifas.filter(t => t.tipo !== 'diaria');
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState<number | ''>('');

  const guardar = () => {
    if (monto === '' || Number(monto) <= 0) return;
    crear.mutate({ tipo: 'diaria', monto: Number(monto) }, {
      onSuccess: () => {
        setEditando(false);
        // La grilla, el estado y el aviso se recalculan con el precio nuevo.
        qc.invalidateQueries({ queryKey: ['precios'] });
      },
    });
  };

  if (editando) {
    return (
      <form
        onSubmit={e => { e.preventDefault(); guardar(); }}
        className="flex items-center gap-1.5"
      >
        <InputMoneda
          value={monto}
          onChange={setMonto}
          placeholder="45.000"
          autoFocus
          className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        <Button size="sm" type="submit" disabled={crear.isPending || monto === ''}>
          {crear.isPending ? '…' : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => { setMonto(diaria ? Number(diaria.monto) : ''); setEditando(true); }}
        className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted"
        title="Cambiar el precio por día"
      >
        {diaria ? (
          <span className="font-bold tabular-nums text-foreground">{formatCurrency(diaria.monto)}</span>
        ) : (
          <span className="font-semibold text-danger">Sin cargar</span>
        )}
        <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
      </button>
      {otras.length > 0 && (
        // Con la escalera por duración, una semanal o mensual descuenta dos
        // veces. No se borra sola: se avisa.
        <p className="text-[11px] text-amber-700">
          También tiene precio {otras.map(t => t.tipo).join(' y ')} (puede descontar dos veces).
        </p>
      )}
    </div>
  );
}

/** Si la categoría se ofrece en la web, con un click. */
function TildeWeb({ categoria }: { categoria: Categoria }) {
  const qc = useQueryClient();
  const actualizar = useUpdateCategoria();
  const enWeb = categoria.visible_web !== false;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={enWeb}
      aria-label={`${categoria.nombre} en la web`}
      disabled={actualizar.isPending}
      onClick={() => actualizar.mutate(
        { id: categoria.id, body: { visible_web: !enWeb } },
        { onSuccess: () => qc.invalidateQueries({ queryKey: ['precios'] }) },
      )}
      title={enWeb ? 'Se ofrece en la web. Click para ocultarla.' : 'No aparece en la web. Click para mostrarla.'}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border-2 transition-colors disabled:opacity-50',
        enWeb
          ? 'border-primary bg-primary text-white hover:bg-primary/90'
          : 'border-slate-300 bg-white text-transparent hover:border-primary/60',
      )}
    >
      <Check className="h-4 w-4" strokeWidth={3} />
    </button>
  );
}


/** ¿La web la puede vender? Sale del mismo cálculo que el aviso de la campana. */
function Estado({ categoria, cobertura }: { categoria: Categoria; cobertura?: CoberturaCategoria }) {
  if (categoria.visible_web === false) {
    return <span className="text-xs text-muted-foreground">No se ofrece en la web</span>;
  }
  if (!cobertura) return <span className="text-xs text-muted-foreground">…</span>;
  if (!cobertura.con_flota) {
    return <span className="text-xs text-muted-foreground">Sin autos en esta categoría</span>;
  }
  if (cobertura.dias_sin_precio === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Se vende en la web
      </span>
    );
  }
  // Lo que se lee es **hasta cuándo tiene precio** (el día anterior al primer
  // hueco), no "desde cuándo no": con el calendario cargado hasta el 19,
  // "sin precio desde el 20" se leía como una fecha equivocada.
  const primerHueco = cobertura.primer_dia_sin_precio!;
  const hoy = new Date().toISOString().slice(0, 10);
  if (primerHueco <= hoy) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Falta el precio por día
      </span>
    );
  }
  const ultimo = new Date(`${primerHueco}T12:00:00`);
  ultimo.setDate(ultimo.getDate() - 1);
  return (
    <span className="inline-flex flex-col text-xs text-amber-700">
      <span className="inline-flex items-center gap-1 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Tiene precio hasta el {formatDate(ultimo.toISOString().slice(0, 10))}
      </span>
      <span className="pl-5 text-[11px] text-muted-foreground">Después falta el precio por día</span>
    </span>
  );
}

/** La foto de la tarjeta en la web. Tocarla abre el selector de archivo. */
function FotoCategoria({ categoria }: { categoria: Categoria }) {
  const subir = useUploadFotoCategoria();
  return (
    <label
      className="group relative flex h-14 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30"
      title="Cambiar la foto que muestra la web"
    >
      {categoria.foto_url ? (
        <img src={categoria.foto_url} alt="" className="h-full w-full object-contain p-0.5" />
      ) : (
        <Car className="h-5 w-5 text-muted-foreground" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
        <ImageUp className="h-4 w-4" />
      </span>
      {subir.isPending && <span className="absolute inset-0 animate-pulse bg-white/60" />}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) subir.mutate({ id: categoria.id, file });
          e.target.value = '';
        }}
      />
    </label>
  );
}
