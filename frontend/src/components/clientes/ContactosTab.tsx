import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

import { useContactos, useAddContacto, useDeleteContacto } from '@/hooks/useClientes';
import type { ClienteContacto } from '@/types';

const schema = z.object({
  nombre: z.string().min(2, 'Requerido'),
  puesto: z.string().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

interface Props {
  clienteId: number;
}

export function ContactosTab({ clienteId }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClienteContacto | null>(null);

  const { data: contactos, isLoading } = useContactos(clienteId);
  const addContacto = useAddContacto(clienteId);
  const deleteContacto = useDeleteContacto(clienteId);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    addContacto.mutate({
      nombre: data.nombre,
      puesto: data.puesto || null,
      telefono: data.telefono || null,
      email: data.email || null,
    }, {
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
          <h3 className="text-sm font-semibold text-foreground">Contactos</h3>
          <p className="text-xs text-muted-foreground">
            Personas de contacto en la empresa, con su puesto.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Agregar contacto
        </Button>
      </div>

      {(!contactos || contactos.length === 0) && !formOpen && (
        <EmptyState
          icon={Users}
          title="Sin contactos"
          description="Agregá las personas de referencia de esta empresa (administración, flota, etc.)."
        />
      )}

      {contactos && contactos.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {contactos.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{c.nombre}</span>
                  {c.puesto && (
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {c.puesto}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.telefono && <>{c.telefono}</>}
                  {c.telefono && c.email && ' · '}
                  {c.email}
                  {!c.telefono && !c.email && '—'}
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
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <input {...register('nombre')} placeholder="María García"
                className="input-base" />
              {errors.nombre && <p className="text-xs text-danger">{errors.nombre.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Puesto</label>
              <input {...register('puesto')} placeholder="Gerente de flota"
                className="input-base" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
              <input {...register('telefono')} placeholder="2914123456"
                className="input-base" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input {...register('email')} type="email" placeholder="maria@empresa.com"
                className="input-base" />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addContacto.isPending}>
              {addContacto.isPending ? 'Guardando…' : 'Agregar'}
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
        title="Eliminar contacto"
        description={`Esto da de baja a ${deleteTarget?.nombre} como contacto. Queda en el historial.`}
        confirmLabel="Eliminar"
        destructive
        loading={deleteContacto.isPending}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteContacto.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </Card>
  );
}
