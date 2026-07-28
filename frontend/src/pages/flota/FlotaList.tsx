import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Plus, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { codigoDeError, extractError } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

import { VehiculoFilters, type FlotaFilters } from '@/components/flota/VehiculoFilters';
import { VehiculoTable } from '@/components/flota/VehiculoTable';
import { VehiculoFormDialog } from '@/components/flota/VehiculoFormDialog';

import {
  useDeactivateVehiculo,
  useInactivarVehiculo,
  useReactivateVehiculo,
  useVehiculos,
} from '@/hooks/useVehiculos';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Vehiculo } from '@/types';

const INITIAL_FILTERS: FlotaFilters = {
  q: '',
  estado: '',
  tipo: '',
  incluir_inactivos: false,
};

export function FlotaList() {
  const [filters, setFilters] = useState<FlotaFilters>(INITIAL_FILTERS);
  const debouncedQ = useDebouncedValue(filters.q, 300);

  const queryParams = useMemo(
    () => ({
      q: debouncedQ || undefined,
      estado: filters.estado || undefined,
      tipo: filters.tipo || undefined,
      incluir_inactivos: filters.incluir_inactivos || undefined,
      page: 1,
      page_size: 50,
    }),
    [debouncedQ, filters.estado, filters.tipo, filters.incluir_inactivos],
  );

  const { data, isLoading, isError, error } = useVehiculos(queryParams);

  // ─── Dialogs ──────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Vehiculo | null>(null);
  const [deactivating, setDeactivating] = useState<Vehiculo | null>(null);

  const deactivate = useDeactivateVehiculo();
  const inactivar = useInactivarVehiculo();
  const reactivate = useReactivateVehiculo();
  // Mensaje del 409 cuando el auto tiene reservas sin cerrar. Mientras está
  // seteado, el diálogo pide una segunda confirmación en vez de repetir la
  // misma acción que ya falló.
  const [conflicto, setConflicto] = useState<string | null>(null);

  const handleConfirmDeactivate = async () => {
    if (!deactivating) return;
    try {
      if (conflicto) {
        // Segunda vuelta: la persona ya leyó qué reservas quedan afectadas.
        await inactivar.mutateAsync(deactivating.id);
      } else {
        await deactivate.mutateAsync(deactivating.id);
      }
      setDeactivating(null);
      setConflicto(null);
    } catch (err) {
      if (codigoDeError(err) === 'vehiculo_con_reservas') {
        setConflicto(extractError(err));
      } else {
        toast.error(extractError(err));
        setDeactivating(null);
      }
    }
  };

  const vehiculos = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Flota"
        description="Gestioná todos los vehículos. Los inactivos no se eliminan — siguen visibles con el toggle."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/flota/categorias"><Tags className="h-4 w-4" /> Categorías</Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuevo vehículo
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <VehiculoFilters value={filters} onChange={setFilters} />
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-danger">
            No se pudo cargar la flota. {(error as Error)?.message}
          </div>
        ) : vehiculos.length === 0 ? (
          <EmptyState
            icon={Car}
            title={hasActiveFilters(filters) ? 'Sin resultados' : 'Todavía no hay vehículos'}
            description={
              hasActiveFilters(filters)
                ? 'Probá ajustar los filtros o desactivar el toggle de inactivos.'
                : 'Empezá agregando el primer vehículo de la flota.'
            }
            action={
              !hasActiveFilters(filters) && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Agregar vehículo
                </Button>
              )
            }
          />
        ) : (
          <>
            <VehiculoTable
              vehiculos={vehiculos}
              onEdit={(v) => setEditing(v)}
              onDeactivate={(v) => setDeactivating(v)}
              onReactivate={(v) => reactivate.mutate(v.id)}
            />
            <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              {total} {total === 1 ? 'vehículo' : 'vehículos'}
            </div>
          </>
        )}
      </Card>

      <VehiculoFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <VehiculoFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        vehiculo={editing}
      />

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(open) => { if (!open) { setDeactivating(null); setConflicto(null); } }}
        title={conflicto ? 'El vehículo tiene reservas sin cerrar' : 'Dar de baja vehículo'}
        description={
          conflicto
            ? `${conflicto} Si lo das de baja igual, esas reservas quedan sobre un vehículo inactivo y hay que reasignarlas a mano.`
            : deactivating
              ? `Esto marca a ${deactivating.patente} como inactivo. No se elimina del sistema y podés reactivarlo cuando quieras.`
              : ''
        }
        confirmLabel={conflicto ? 'Darlo de baja igual' : 'Dar de baja'}
        destructive
        loading={deactivate.isPending || inactivar.isPending}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}

function hasActiveFilters(f: FlotaFilters): boolean {
  return !!(f.q || f.estado || f.tipo || f.incluir_inactivos);
}
