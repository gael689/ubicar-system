import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

import {
  useTarifas,
  useCreateTarifa,
  useDeactivateTarifa,
  type Tarifa,
  type TarifaCreate,
} from '@/hooks/useTarifas';
import { formatCurrency, formatDate } from '@/lib/utils';

const TIPO_LABEL: Record<string, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
};

interface Props {
  vehiculoId: number;
}

export function TarifasTab({ vehiculoId }: Props) {
  const [showInactivas, setShowInactivas] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tarifa | null>(null);

  const { data: tarifas, isLoading } = useTarifas(vehiculoId, showInactivas);
  const createTarifa = useCreateTarifa(vehiculoId);
  const deactivateTarifa = useDeactivateTarifa(vehiculoId);

  const activas = tarifas?.filter(t => t.activo) ?? [];
  const inactivas = tarifas?.filter(t => !t.activo) ?? [];

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tarifas vigentes</h3>
          <p className="text-xs text-muted-foreground">
            Solo una tarifa activa por tipo. Al crear una nueva del mismo tipo, la anterior se desactiva.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva tarifa
        </Button>
      </div>

      {activas.length === 0 && !showInactivas && (
        <EmptyState
          title="Sin tarifas"
          description="Agregá al menos una tarifa diaria para poder cotizar alquileres."
        />
      )}

      {activas.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {activas.map(t => (
            <TarifaRow key={t.id} tarifa={t} onDelete={() => setDeleteTarget(t)} />
          ))}
        </div>
      )}

      {showInactivas && inactivas.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Historial (inactivas)
          </h4>
          <div className="divide-y divide-border rounded-lg border opacity-60">
            {inactivas.map(t => (
              <TarifaRow key={t.id} tarifa={t} inactive />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showInactivas}
            onChange={e => setShowInactivas(e.target.checked)}
            className="rounded border-border"
          />
          Mostrar historial de tarifas
        </label>
      </div>

      {formOpen && (
        <TarifaFormInline
          onSubmit={(data) => {
            createTarifa.mutate(data, { onSuccess: () => setFormOpen(false) });
          }}
          onCancel={() => setFormOpen(false)}
          loading={createTarifa.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Desactivar tarifa"
        description={`Esto desactiva la tarifa ${TIPO_LABEL[deleteTarget?.tipo ?? '']} de ${deleteTarget ? formatCurrency(deleteTarget.monto) : ''}. Queda en el historial.`}
        confirmLabel="Desactivar"
        destructive
        loading={deactivateTarifa.isPending}
        onConfirm={async () => {
          if (deleteTarget) {
            await deactivateTarifa.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </Card>
  );
}

function TarifaRow({ tarifa, onDelete, inactive }: { tarifa: Tarifa; onDelete?: () => void; inactive?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {TIPO_LABEL[tarifa.tipo]}
        </span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatCurrency(tarifa.monto)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Desde {formatDate(tarifa.vigencia_desde)}
        </span>
        {!inactive && onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}

function TarifaFormInline({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (data: TarifaCreate) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tipo, setTipo] = useState<TarifaCreate['tipo']>('diaria');
  const [monto, setMonto] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return;
    onSubmit({ tipo, monto: montoNum });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
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
        <label className="text-xs font-medium text-muted-foreground">Monto ($)</label>
        <input
          type="number"
          min="1"
          step="1"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          placeholder="25000"
          className="block w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
