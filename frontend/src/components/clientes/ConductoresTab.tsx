import { useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { LicenciaBadge } from '@/components/clientes/LicenciaBadge';
import { NuevoConductorForm } from '@/components/clientes/SelectorConductores';

import {
  useConductores,
  useDeleteConductor,
  type ConductorAdicional,
} from '@/hooks/useClientes';
import { formatDate } from '@/lib/utils';

interface Props {
  clienteId: number;
}

export function ConductoresTab({ clienteId }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConductorAdicional | null>(null);

  const { data: conductores, isLoading } = useConductores(clienteId);
  const deleteConductor = useDeleteConductor(clienteId);

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Conductores</h3>
          <p className="text-xs text-muted-foreground">
            Personas autorizadas a manejar en los alquileres de este cliente. En cada reserva se eligen de 1 a 3.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Agregar conductor
        </Button>
      </div>

      {(!conductores || conductores.length === 0) && !formOpen && (
        <EmptyState
          icon={UserCheck}
          title="Sin conductores cargados"
          description="Podés agregar conductores autorizados para los alquileres de este cliente."
        />
      )}

      {conductores && conductores.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {conductores.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{c.nombre_completo}</span>
                  <LicenciaBadge vencimiento={c.licencia_vencimiento} showLabel={false} />
                </div>
                <div className="text-xs text-muted-foreground">
                  DNI: <span className="font-mono">{c.dni || '—'}</span>
                  {' · '}
                  Lic: {c.licencia_numero || '—'}
                  {' · '}
                  Vence: {c.licencia_vencimiento ? formatDate(c.licencia_vencimiento) : '—'}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        // El mismo formulario que el wizard de reserva y el contrato rápido:
        // sólo el nombre es obligatorio. Antes pedía DNI, licencia y
        // vencimiento sí o sí, y el conductor que retiraba "ya" no se podía
        // cargar hasta tener todos los papeles.
        <NuevoConductorForm
          clienteId={clienteId}
          onCreado={() => setFormOpen(false)}
          onCancelar={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Eliminar conductor"
        description={`Esto elimina a ${deleteTarget?.nombre_completo} como conductor adicional.`}
        confirmLabel="Eliminar"
        destructive
        loading={deleteConductor.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteConductor.mutateAsync(deleteTarget.id);
          } catch {
            // El toast con el motivo ya lo muestra el `onError` de la
            // mutación; acá sólo se evita el rechazo sin atrapar, que dejaba
            // el diálogo abierto y colgado.
          } finally {
            setDeleteTarget(null);
          }
        }}
      />
    </Card>
  );
}
