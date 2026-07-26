import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArchiveRestore, ArchiveX, Pencil, Star, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { LicenciaBadge } from '@/components/clientes/LicenciaBadge';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { ConductoresTab } from '@/components/clientes/ConductoresTab';
import { ContactosTab } from '@/components/clientes/ContactosTab';
import { ClienteHistorial } from '@/components/clientes/ClienteHistorial';
import { ClienteDocumentosTab } from '@/components/clientes/ClienteDocumentosTab';
import { TarjetaTab } from '@/components/clientes/TarjetaTab';
import { MultasTab } from '@/components/clientes/MultasTab';
import { CuentaCorrienteTab } from '@/components/clientes/CuentaCorrienteTab';
import { RecibosTab } from '@/components/clientes/RecibosTab';

import { useCliente, useDeactivateCliente, useReactivateCliente } from '@/hooks/useClientes';
import { formatDate } from '@/lib/utils';
import { CONDICION_IVA_LABEL, CONDICION_PAGO_LABEL } from '@/lib/constants';

export function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const clienteId = id ? Number(id) : undefined;

  const { data: cliente, isLoading, isError } = useCliente(clienteId);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const deactivate = useDeactivateCliente();
  const reactivate = useReactivateCliente();

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
          icon={Users}
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

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-primary">
                {cliente.nombre_completo.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold text-foreground">{cliente.nombre_completo}</h2>
                {cliente.es_frecuente && <Star className="h-4 w-4 text-warning fill-warning" />}
                {inactivo && (
                  <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Inactivo
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                <span className="font-mono font-semibold text-foreground">{cliente.dni_cuit}</span>
                {' · '}
                {cliente.tipo === 'empresa' ? 'Empresa' : 'Particular'}
                {' · '}
                Alta: {formatDate(cliente.created_at.split('T')[0])}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LicenciaBadge vencimiento={cliente.licencia_vencimiento} />
            {!inactivo ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeactivateOpen(true)}>
                  <ArchiveX className="h-4 w-4" /> Dar de baja
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reactivate.mutate(cliente.id)}
                disabled={reactivate.isPending}
              >
                <ArchiveRestore className="h-4 w-4" />
                {reactivate.isPending ? 'Reactivando…' : 'Reactivar'}
              </Button>
            )}
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Teléfono" value={cliente.telefono} />
          <Metric label="Email" value={cliente.email ?? '—'} />
          {cliente.tipo === 'empresa' ? (
            <>
              <Metric label="CUIT" value={cliente.dni_cuit} />
              <Metric label="Tipo" value="Empresa" />
            </>
          ) : (
            <>
              <Metric label="Licencia" value={cliente.licencia_numero ?? '—'} />
              <Metric label="Vence lic." value={formatDate(cliente.licencia_vencimiento)} />
            </>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="datos" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          {cliente.tipo !== 'empresa' && (
            <TabsTrigger value="conductores">Conductores</TabsTrigger>
          )}
          {cliente.tipo === 'empresa' && (
            <TabsTrigger value="contactos">Contactos</TabsTrigger>
          )}
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="tarjeta">Tarjeta</TabsTrigger>
          <TabsTrigger value="multas">Multas</TabsTrigger>
          <TabsTrigger value="cuenta-corriente">Cta. Corriente</TabsTrigger>
          <TabsTrigger value="recibos">Recibos</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <Card className="p-5">
            <PageHeader title="Datos del cliente" description="Información completa registrada." />
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0 text-sm">
              <Field label="Nombre completo" value={cliente.nombre_completo} />
              <Field
                label={cliente.tipo === 'empresa' ? 'CUIT' : 'DNI / CUIT'}
                value={<span className="font-mono">{cliente.dni_cuit}</span>}
              />
              <Field label="Teléfono" value={cliente.telefono} />
              <Field label="Email" value={cliente.email ?? '—'} />
              <Field label="Tipo" value={cliente.tipo === 'empresa' ? 'Empresa' : 'Particular'} />
              <Field label="Cliente frecuente" value={cliente.es_frecuente ? 'Sí' : 'No'} />
              {cliente.tipo === 'empresa' ? (
                <>
                  <Field label="Razón social" value={cliente.razon_social ?? '—'} />
                  <Field label="Condición IVA" value={cliente.condicion_iva ? CONDICION_IVA_LABEL[cliente.condicion_iva] : '—'} />
                </>
              ) : (
                <>
                  <Field label="Licencia N°" value={cliente.licencia_numero} />
                  <Field label="Categoría" value={cliente.licencia_categoria} />
                  <Field label="Vencimiento licencia" value={formatDate(cliente.licencia_vencimiento)} />
                  <Field label="Fecha de nacimiento" value={cliente.fecha_nacimiento ? formatDate(cliente.fecha_nacimiento) : '—'} />
                  <Field label="Licencia desde" value={cliente.licencia_desde ? formatDate(cliente.licencia_desde) : '—'} />
                  <Field label="País de licencia" value={cliente.licencia_pais ?? '—'} />
                </>
              )}
              <Field label="Domicilio" value={cliente.domicilio ?? '—'} />
              <Field label="Localidad" value={cliente.localidad ?? '—'} />
              <Field label="Provincia" value={cliente.provincia ?? '—'} />
              <Field label="Código postal" value={cliente.codigo_postal ?? '—'} />
              <Field
                label="Condición de pago"
                value={cliente.condicion_pago_default ? CONDICION_PAGO_LABEL[cliente.condicion_pago_default] : '—'}
              />
              <Field label="Alta en el sistema" value={formatDate(cliente.created_at.split('T')[0])} />
              {cliente.notas && (
                <div className="sm:col-span-2 py-1.5 border-b border-border/50">
                  <dt className="text-muted-foreground text-xs mb-1">Notas</dt>
                  <dd className="text-foreground">{cliente.notas}</dd>
                </div>
              )}
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <ClienteDocumentosTab clienteId={cliente.id} />
        </TabsContent>

        {cliente.tipo !== 'empresa' && (
          <TabsContent value="conductores">
            <ConductoresTab clienteId={cliente.id} />
          </TabsContent>
        )}

        {cliente.tipo === 'empresa' && (
          <TabsContent value="contactos">
            <ContactosTab clienteId={cliente.id} />
          </TabsContent>
        )}

        <TabsContent value="historial">
          <ClienteHistorial clienteId={cliente.id} />
        </TabsContent>

        <TabsContent value="tarjeta">
          <TarjetaTab clienteId={cliente.id} />
        </TabsContent>

        <TabsContent value="multas">
          <MultasTab clienteId={cliente.id} />
        </TabsContent>

        <TabsContent value="cuenta-corriente">
          <CuentaCorrienteTab clienteId={cliente.id} clienteNombre={cliente.nombre_completo} />
        </TabsContent>

        <TabsContent value="recibos">
          <RecibosTab clienteId={cliente.id} />
        </TabsContent>
      </Tabs>

      <ClienteFormDialog open={editOpen} onOpenChange={setEditOpen} cliente={cliente} />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Dar de baja cliente"
        description={`Esto marca a ${cliente.nombre_completo} como inactivo. No se elimina del sistema y podés reactivarlo cuando quieras.`}
        confirmLabel="Dar de baja"
        destructive
        loading={deactivate.isPending}
        onConfirm={async () => {
          await deactivate.mutateAsync(cliente.id);
          setDeactivateOpen(false);
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground truncate">{value}</div>
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
