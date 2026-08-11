import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ComoSeArmaElPrecio } from '@/components/precios/ComoSeArmaElPrecio';

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

// D-35: el monto es el precio del BLOQUE COMPLETO, no el precio por día.
// Un alquiler se descompone consumiendo los bloques más grandes primero:
// 10 días = 1 semana + 3 días sueltos (ver domain/tarifas.py).
const TIPO_HINT: Record<string, string> = {
  diaria: 'Precio de UN día. Se usa para los días sueltos que sobran de una semana o un mes.',
  semanal: 'Precio de la SEMANA COMPLETA (7 días). Un alquiler de 10 días cobra una semana + 3 días.',
  mensual: 'Precio del MES COMPLETO (30 días). Un alquiler de 40 días cobra un mes + una semana + 3 días.',
};

const DIAS_POR_BLOQUE: Record<string, number> = { diaria: 1, semanal: 7, mensual: 30 };

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
      <ComoSeArmaElPrecio />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tarifas vigentes</h3>
          <p className="text-xs text-muted-foreground">
            Solo una tarifa activa por tipo. Al crear una nueva del mismo tipo, la anterior se desactiva.
            Esta tarifa es el precio de siempre y <strong>vale para web y mostrador</strong>: para un
            precio distinto en una fecha o en un canal, va una regla en Precios.
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
          activas={activas}
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
        <div>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatCurrency(tarifa.monto)} / día
          </span>
          <p className="text-[11px] text-muted-foreground">{TIPO_HINT[tarifa.tipo]}</p>
        </div>
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
  activas,
  onSubmit,
  onCancel,
  loading,
}: {
  activas: Tarifa[];
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

  // Alertas suaves (no bloquean) contra los dos errores de carga posibles.
  // "El sistema informa, la persona decide".
  const montoNum = Number(monto);
  const dias = DIAS_POR_BLOQUE[tipo];
  const tarifaDiaria = activas.find(t => t.tipo === 'diaria');
  const precioDiario = tarifaDiaria ? Number(tarifaDiaria.monto) : 0;

  let advertencia: string | null = null;
  if (montoNum > 0 && precioDiario > 0 && dias > 1) {
    if (montoNum <= precioDiario) {
      // El error clásico al pasar del modelo viejo al nuevo.
      advertencia = `${formatCurrency(montoNum)} por ${dias} días es menos que un solo día (${formatCurrency(precioDiario)}). ¿Cargaste el precio POR DÍA en vez del precio del bloque completo? Acá va el total de ${dias} días.`;
    } else if (montoNum >= precioDiario * dias) {
      advertencia = `${formatCurrency(montoNum)} por ${dias} días no es más barato que pagarlos sueltos (${formatCurrency(precioDiario * dias)}). La banda "${TIPO_LABEL[tipo]}" no le da ninguna ventaja al cliente: nadie va a alquilar más tiempo por eso.`;
    }
  }

  const equivalente = montoNum > 0 && dias > 1 ? montoNum / dias : null;

  return (
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
          <label className="text-xs font-medium text-muted-foreground">
            {tipo === 'diaria' ? 'Precio del día ($)' : `Precio de ${dias === 7 ? 'la semana' : 'el mes'} ($)`}
          </label>
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
      </div>
      <p className="text-xs text-muted-foreground">
        {TIPO_HINT[tipo]}
        {equivalente !== null && (
          <span className="ml-1 text-foreground">Equivale a {formatCurrency(equivalente)} por día.</span>
        )}
      </p>
      {advertencia && (
        <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-1.5">
          ⚠ {advertencia}
        </p>
      )}
    </form>
  );
}
