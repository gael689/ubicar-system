import { useState } from 'react';
import { Plus, Trash2, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { EmptyState } from '@/components/shared/EmptyState';

import {
  useGastos,
  useCreateGasto,
  useDeleteGasto,
  type Gasto,
  type GastoCreate,
  type TipoGasto,
  type MedioPagoGasto,
} from '@/hooks/useGastos';
import { formatCurrency, formatDate } from '@/lib/utils';

const TIPO_LABEL: Record<TipoGasto, string> = {
  service: 'Service',
  combustible: 'Combustible',
  cubiertas: 'Cubiertas',
  reparacion: 'Reparación',
  seguro: 'Seguro',
  patente: 'Patente',
  vtv: 'VTV',
  lavado: 'Lavado',
  otro: 'Otro',
};

const MEDIO_LABEL: Record<MedioPagoGasto, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  echeq: 'Echeq',
};

interface Props {
  vehiculoId: number;
}

export function GastosTab({ vehiculoId }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Gasto | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGastos(vehiculoId, { page, page_size: 15 });
  const createGasto = useCreateGasto(vehiculoId);
  const deleteGasto = useDeleteGasto(vehiculoId);

  const gastos = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 15);

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Gastos del vehículo</h3>
          <p className="text-xs text-muted-foreground">
            Services, combustible, reparaciones y otros gastos asociados.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Registrar gasto
        </Button>
      </div>

      {gastos.length === 0 && (
        <EmptyState
          icon={Wrench}
          title="Sin gastos registrados"
          description="Registrá services, combustible y otros gastos del vehículo."
        />
      )}

      {gastos.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {gastos.map(g => (
            <div key={g.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{g.descripcion}</span>
                  <span className="inline-flex items-center rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {TIPO_LABEL[g.tipo]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(g.fecha)} · {MEDIO_LABEL[g.medio_pago]}
                  {g.km_al_momento != null && ` · ${g.km_al_momento.toLocaleString()} km`}
                  {g.proveedor && ` · ${g.proveedor}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {formatCurrency(g.monto)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(g)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      {formOpen && (
        <GastoFormInline
          onSubmit={(data) => {
            createGasto.mutate(data, { onSuccess: () => setFormOpen(false) });
          }}
          onCancel={() => setFormOpen(false)}
          loading={createGasto.isPending}
        />
      )}

      <MotivoDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Dar de baja el gasto"
        description={`El gasto "${deleteTarget?.descripcion}" de ${deleteTarget ? formatCurrency(deleteTarget.monto) : ''} deja de contar en el reporte de flota y en el efectivo del cajón. No se borra: queda registrado con el motivo.`}
        confirmLabel="Dar de baja"
        loading={deleteGasto.isPending}
        onConfirm={async (motivo) => {
          if (deleteTarget) {
            await deleteGasto.mutateAsync({ id: deleteTarget.id, motivo });
            setDeleteTarget(null);
          }
        }}
      />
    </Card>
  );
}

function GastoFormInline({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (data: GastoCreate) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tipo, setTipo] = useState<TipoGasto>('service');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [medioPago, setMedioPago] = useState<MedioPagoGasto>('efectivo');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [proveedor, setProveedor] = useState('');
  const [km, setKm] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || !descripcion.trim()) return;
    onSubmit({
      tipo,
      descripcion: descripcion.trim(),
      monto: montoNum,
      medio_pago: medioPago,
      fecha,
      proveedor: proveedor.trim() || null,
      km_al_momento: km ? Number(km) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoGasto)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Monto ($)</label>
          <input type="number" min="1" step="1" value={monto} onChange={e => setMonto(e.target.value)}
            placeholder="15000" className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Medio de pago</label>
          <select value={medioPago} onChange={e => setMedioPago(e.target.value as MedioPagoGasto)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            {Object.entries(MEDIO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Descripción</label>
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
            placeholder="Service 30.000 km" className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Proveedor (opcional)</label>
          <input type="text" value={proveedor} onChange={e => setProveedor(e.target.value)}
            placeholder="Taller Pérez" className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Km al momento (opcional)</label>
          <input type="number" min="0" value={km} onChange={e => setKm(e.target.value)}
            placeholder="30000" className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? 'Guardando…' : 'Registrar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
