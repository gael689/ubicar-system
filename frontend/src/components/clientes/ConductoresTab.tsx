import { useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { LicenciaBadge } from '@/components/clientes/LicenciaBadge';

import {
  useConductores,
  useAddConductor,
  useDeleteConductor,
  type ConductorAdicional,
} from '@/hooks/useClientes';
import { formatDate } from '@/lib/utils';

const schema = z.object({
  nombre_completo: z.string().min(2, 'Requerido'),
  dni: z.string().min(7, 'DNI inválido'),
  licencia_numero: z.string().min(1, 'Requerido'),
  licencia_vencimiento: z.string().min(10, 'Fecha requerida'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  clienteId: number;
}

export function ConductoresTab({ clienteId }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConductorAdicional | null>(null);

  const { data: conductores, isLoading } = useConductores(clienteId);
  const addConductor = useAddConductor(clienteId);
  const deleteConductor = useDeleteConductor(clienteId);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    addConductor.mutate(data, {
      onSuccess: () => {
        reset();
        setFormOpen(false);
      },
    });
  };

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
          <h3 className="text-sm font-semibold text-foreground">Conductores adicionales</h3>
          <p className="text-xs text-muted-foreground">
            Personas autorizadas a conducir el vehículo en los alquileres de este cliente.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Agregar conductor
        </Button>
      </div>

      {(!conductores || conductores.length === 0) && !formOpen && (
        <EmptyState
          icon={UserCheck}
          title="Sin conductores adicionales"
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
                  DNI: <span className="font-mono">{c.dni}</span>
                  {' · '}
                  Lic: {c.licencia_numero}
                  {' · '}
                  Vence: {formatDate(c.licencia_vencimiento)}
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
        <form onSubmit={handleSubmit(onSubmit)}
          className="space-y-3 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre completo *</label>
              <input {...register('nombre_completo')} placeholder="María García"
                className="input-base" />
              {errors.nombre_completo && (
                <p className="text-xs text-danger">{errors.nombre_completo.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">DNI *</label>
              <input {...register('dni')} placeholder="30123456"
                className="input-base" />
              {errors.dni && <p className="text-xs text-danger">{errors.dni.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">N° de licencia *</label>
              <input {...register('licencia_numero')} placeholder="B98765432"
                className="input-base" />
              {errors.licencia_numero && (
                <p className="text-xs text-danger">{errors.licencia_numero.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vencimiento licencia *</label>
              <input {...register('licencia_vencimiento')} type="date"
                className="input-base" />
              {errors.licencia_vencimiento && (
                <p className="text-xs text-danger">{errors.licencia_vencimiento.message}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addConductor.isPending}>
              {addConductor.isPending ? 'Guardando…' : 'Agregar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { reset(); setFormOpen(false); }}>
              Cancelar
            </Button>
          </div>
        </form>
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
          if (deleteTarget) {
            await deleteConductor.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </Card>
  );
}
