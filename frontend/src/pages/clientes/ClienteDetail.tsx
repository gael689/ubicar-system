import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArchiveRestore, ArchiveX, Pencil, Star, Users, Phone, Mail, MessageCircle,
} from 'lucide-react';

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
import { EcheqsTab } from '@/components/clientes/EcheqsTab';
import { ComprobantesTab } from '@/components/clientes/ComprobantesTab';

import { useCliente, useDeactivateCliente, useReactivateCliente } from '@/hooks/useClientes';
import { useCuentaCorrienteCliente } from '@/hooks/useCuentasCorrientes';
import { BadgeCanal } from '@/components/reservas/BadgeCanal';
import { cn, formatCurrency } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { CONDICION_IVA_LABEL, CONDICION_PAGO_LABEL } from '@/lib/constants';

export function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const clienteId = id ? Number(id) : undefined;

  const { data: cliente, isLoading, isError } = useCliente(clienteId);
  // La plata del cliente, arriba y no a dos clics: es el dato que más lo
  // define y estaba escondido en la séptima solapa.
  const { data: cc } = useCuentaCorrienteCliente(clienteId);
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
  // Ver `CuentaCorrienteService.desglose`: el saldo crudo mezcla lo que el
  // cliente debe con lo que pagó por adelantado, y eso hacía que la ficha
  // dijera "saldo a favor" de alguien que sólo está esperando su auto.
  const anticipos = cc?.anticipos ?? 0;
  const deuda = cc?.deuda ?? cc?.saldo ?? 0;

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
                {/* De dónde vino y quién lo cargó (migración 077). Sin esto,
                    alguien que se registró solo desde el sitio se veía igual
                    que uno cargado a mano, y no había forma de contestar
                    cuántos clientes trajo la web. */}
                <BadgeCanal origen={cliente.origen} creadoPor={cliente.creado_por_nombre} />
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

              {/* **El contacto va acá, y clickeable.** Estaba abajo como si
                  fuera una métrica, ocupando el lugar de un número. Un
                  teléfono no es una métrica: es algo que se aprieta. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <a
                  href={`tel:${cliente.telefono}`}
                  className="inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {cliente.telefono}
                </a>
                {(() => {
                  // `wa.me` quiere sólo dígitos, y los números se cargan de mil
                  // formas ("+54 9 291 …", "0291 15 …"): se limpia y listo, sin
                  // intentar adivinar el formato correcto.
                  const digitos = cliente.telefono?.replace(/\D/g, '') ?? '';
                  return digitos.length >= 8 ? (
                    <a
                      href={`https://wa.me/${digitos}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 font-medium text-success hover:bg-success/20"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  ) : null;
                })()}
                {cliente.email && (
                  <a
                    href={`mailto:${cliente.email}`}
                    className="inline-flex items-center gap-1 truncate text-foreground hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {cliente.email}
                  </a>
                )}
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

        {/* **Métricas, ahora sí.** Acá había Teléfono, Email, Licencia y
            Vence lic.: contacto repetido —ya está arriba y en la solapa
            Datos— ocupando el lugar más caro de la pantalla. Una métrica es
            un número que cambia y que decide algo. El contacto no lo es; la
            deuda sí. */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric
            label="Debe"
            value={formatCurrency(Math.abs(deuda))}
            tono={deuda > 0 ? 'malo' : deuda < 0 ? 'bueno' : undefined}
            nota={deuda < 0 ? 'a favor del cliente' : undefined}
          />
          <Metric
            label="Cobrado por adelantado"
            value={anticipos > 0 ? formatCurrency(anticipos) : '—'}
            nota={anticipos > 0 ? 'reservas sin entregar' : undefined}
          />
          {cliente.tipo === 'empresa' ? (
            <>
              <Metric label="Condición IVA" value={cliente.condicion_iva ? CONDICION_IVA_LABEL[cliente.condicion_iva] : '—'} />
              <Metric label="Razón social" value={cliente.razon_social ?? '—'} />
            </>
          ) : (
            <>
              {/* La licencia sí es operativa: sin ella vigente no se entrega. */}
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
          <TabsTrigger value="echeqs">Echeqs</TabsTrigger>
          <TabsTrigger value="comprobantes">Comprobantes</TabsTrigger>
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

        <TabsContent value="echeqs">
          <EcheqsTab clienteId={cliente.id} />
        </TabsContent>

        <TabsContent value="comprobantes">
          <ComprobantesTab clienteId={cliente.id} />
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

function Metric({
  label, value, tono, nota,
}: {
  label: string;
  value: string;
  /** Colorea el número. Sin tono queda neutro, que es el default. */
  tono?: 'bueno' | 'malo';
  /** Una línea que explica el número cuando el número solo no alcanza. */
  nota?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          'truncate text-sm font-medium',
          tono === 'malo' ? 'text-danger' : tono === 'bueno' ? 'text-success' : 'text-foreground',
        )}
      >
        {value}
      </div>
      {nota && <div className="text-[11px] text-muted-foreground">{nota}</div>}
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
