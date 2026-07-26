import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArchiveX, ArrowLeft, Building2, Calendar, FileText, Mail, Pencil, Phone, Star, User
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';

import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { ConductoresTab } from '@/components/clientes/ConductoresTab';
import { LicenciaBadge } from '@/components/clientes/LicenciaBadge';

import { useCliente, useDeactivateCliente } from '@/hooks/useClientes';
import { cn, formatDate } from '@/lib/utils';

export function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clienteId = id ? Number(id) : undefined;

  const { data: cliente, isLoading, isError } = useCliente(clienteId);

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const deactivate = useDeactivateCliente();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Card className="p-6"><Skeleton className="h-32 w-full" /></Card>
      </div>
    );
  }

  if (isError || !cliente) {
    return (
      <Card>
        <EmptyState
          icon={User}
          title="Cliente no encontrado"
          description="Puede que haya sido eliminado o que el enlace no sea correcto."
          action={
            <Button asChild>
              <Link to="/clientes"><ArrowLeft className="h-4 w-4" /> Volver a clientes</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const inactivo = !cliente.activo;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/clientes"><ArrowLeft className="h-4 w-4" /> Clientes</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="flex items-center justify-center bg-secondary p-8 md:w-56">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
              {cliente.tipo === 'empresa' ? (
                <Building2 className="h-12 w-12" />
              ) : (
                <User className="h-12 w-12" />
              )}
            </div>
          </div>

          <div className="flex-1 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    {cliente.nombre_completo}
                  </h2>
                  {cliente.es_frecuente && (
                    <Star className="h-4 w-4 fill-warning text-warning" title="Cliente frecuente" />
                  )}
                  {inactivo && (
                    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-3">
                  <span className="font-mono">{cliente.dni_cuit}</span>
                  <span className="capitalize">{cliente.tipo}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!inactivo && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeactivateOpen(true)}>
                      <ArchiveX className="h-4 w-4" /> Dar de baja
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span className="text-foreground">{cliente.telefono}</span>
              </div>
              {cliente.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span className="text-foreground">{cliente.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Licencia: <span className="font-mono text-foreground">{cliente.licencia_numero}</span> ({cliente.licencia_categoria})
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Alta: <span className="text-foreground">{formatDate(cliente.created_at)}</span>
              </div>
            </div>
            
            <div className="mt-4 flex gap-2">
               <LicenciaBadge vencimiento={cliente.licencia_vencimiento} />
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="datos" className="w-full">
        <TabsList>
          <TabsTrigger value="datos">Datos y Notas</TabsTrigger>
          <TabsTrigger value="conductores">Conductores Adic.</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="cuenta_corriente">Cuenta Corriente</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <Card className="p-5 space-y-6">
             <PageHeader title="Datos del cliente" description="Información registrada y notas internas." />
             <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Razón social / Nombre" value={cliente.nombre_completo} />
              <Field label="DNI / CUIT" value={<span className="font-mono">{cliente.dni_cuit}</span>} />
              <Field label="Teléfono" value={cliente.telefono} />
              <Field label="Email" value={cliente.email || '-'} />
              <Field label="Licencia" value={<span className="font-mono">{cliente.licencia_numero}</span>} />
              <Field label="Vencimiento" value={cliente.licencia_vencimiento ? formatDate(cliente.licencia_vencimiento) : '-'} />
              <Field label="Categoría" value={cliente.licencia_categoria} />
              <Field label="Alta en sistema" value={formatDate(cliente.created_at)} />
             </dl>
             {cliente.notas && (
               <div className="mt-6">
                 <h4 className="text-sm font-medium mb-2">Notas internas</h4>
                 <div className="p-3 bg-muted/30 rounded-md text-sm whitespace-pre-wrap">
                   {cliente.notas}
                 </div>
               </div>
             )}
          </Card>
        </TabsContent>

        <TabsContent value="conductores">
          <ConductoresTab clienteId={cliente.id} />
        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-5">
            <EmptyState
              title="Historial de Alquileres"
              description="Próximamente. Los alquileres y reservas de este cliente se visualizarán acá (Fase 3)."
            />
          </Card>
        </TabsContent>

        <TabsContent value="cuenta_corriente">
           <Card className="p-5">
            <EmptyState
              title="Cuenta Corriente"
              description="Próximamente. El saldo y los movimientos se visualizarán acá (Fase 7)."
            />
          </Card>
        </TabsContent>
      </Tabs>

      <ClienteFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cliente={cliente}
      />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Dar de baja cliente"
        description={`Esto marca a ${cliente.nombre_completo} como inactivo. Se podrá reactivar más adelante y el historial nunca se borra.`}
        confirmLabel="Dar de baja"
        destructive
        loading={deactivate.isPending}
        onConfirm={async () => {
          await deactivate.mutateAsync(cliente.id);
          setDeactivateOpen(false);
          navigate('/clientes');
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}
