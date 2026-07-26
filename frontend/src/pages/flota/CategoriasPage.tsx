import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategorias, useTarifasCategoria, useCreateTarifaCategoria } from '@/hooks/useCategorias';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { TarifaCreate } from '@/hooks/useTarifas';
import type { Categoria } from '@/types';

const TIPO_LABEL: Record<string, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
};
const TIPO_HINT: Record<string, string> = {
  diaria: 'Precio por día para alquileres de menos de 7 días',
  semanal: 'Precio por día (no el total de la semana) para alquileres de 7 a 29 días',
  mensual: 'Precio por día (no el total del mes) para alquileres de 30 días o más',
};

export function CategoriasPage() {
  const { data: categorias, isLoading } = useCategorias();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/flota"><ArrowLeft className="h-4 w-4" /> Flota</Link>
        </Button>
      </div>

      <PageHeader
        title="Categorías de vehículo"
        description="Cada vehículo se asigna a una categoría. Las tarifas se pueden cargar por categoría o por vehículo puntual — el vehículo específico siempre gana."
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {(categorias ?? []).map(c => (
            <CategoriaCard key={c.id} categoria={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoriaCard({ categoria }: { categoria: Categoria }) {
  const [expanded, setExpanded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const { data: tarifas, isLoading } = useTarifasCategoria(categoria.id);
  const crear = useCreateTarifaCategoria(categoria.id);

  const [tipo, setTipo] = useState<TarifaCreate['tipo']>('diaria');
  const [monto, setMonto] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return;
    crear.mutate({ tipo, monto: montoNum }, {
      onSuccess: () => { setMonto(''); setFormOpen(false); },
    });
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20"
      >
        <div className="text-left">
          <span className="text-sm font-semibold text-foreground">{categoria.nombre}</span>
          <span className="text-xs text-muted-foreground ml-2 font-mono">{categoria.codigo}</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tarifas de esta categoría</p>
            <Button size="sm" variant="outline" onClick={() => setFormOpen(v => !v)}>
              <Plus className="h-3.5 w-3.5" /> Nueva tarifa
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : !tarifas || tarifas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sin tarifas cargadas para esta categoría todavía.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border">
              {tarifas.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {TIPO_LABEL[t.tipo]}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCurrency(t.monto)} / día
                      </span>
                      <p className="text-[11px] text-muted-foreground">{TIPO_HINT[t.tipo]}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Desde {formatDate(t.vigencia_desde)}</span>
                </div>
              ))}
            </div>
          )}

          {formOpen && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value as TarifaCreate['tipo'])}
                    className="block w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="diaria">Diaria</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Precio por día ($)</label>
                  <input
                    type="number" min="1" step="1"
                    value={monto} onChange={e => setMonto(e.target.value)}
                    placeholder="25000"
                    className="block w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={crear.isPending}>
                    {crear.isPending ? 'Guardando…' : 'Guardar'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{TIPO_HINT[tipo]}</p>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
