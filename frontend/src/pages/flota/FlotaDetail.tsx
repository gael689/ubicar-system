import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArchiveRestore, ArchiveX, ArrowLeft, Camera, Car, Pencil,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { VehiculoFormDialog } from '@/components/flota/VehiculoFormDialog';
import { TarifasTab } from '@/components/flota/TarifasTab';
import { DocumentosTab } from '@/components/flota/DocumentosTab';
import { GastosMantenimientoTab } from '@/components/flota/GastosMantenimientoTab';
import { HistorialTab } from '@/components/flota/HistorialTab';
import { HistorialReservasTab } from '@/components/flota/HistorialReservasTab';
import { DaniosTab } from '@/components/flota/DaniosTab';
import { BloqueosTab } from '@/components/flota/BloqueosTab';

import {
  useDeactivateVehiculo,
  useInactivarVehiculo,
  useReactivateVehiculo,
  useUploadFoto,
  useVehiculo,
} from '@/hooks/useVehiculos';
import { resolveAssetUrl } from '@/lib/api';
import { ESTADO_VEHICULO_COLOR, ESTADO_VEHICULO_LABEL, TIPO_VEHICULO_LABEL } from '@/lib/constants';
import { toast } from 'sonner';
import { cn, codigoDeError, extractError, formatDate, formatNumber } from '@/lib/utils';

export function FlotaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const vehiculoId = id ? Number(id) : undefined;

  const { data: vehiculo, isLoading, isError } = useVehiculo(vehiculoId);

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [conflicto, setConflicto] = useState<string | null>(null);

  const deactivate = useDeactivateVehiculo();
  const inactivar = useInactivarVehiculo();
  const reactivate = useReactivateVehiculo();
  const uploadFoto = useUploadFoto();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Card className="p-6"><Skeleton className="h-32 w-full" /></Card>
      </div>
    );
  }

  if (isError || !vehiculo) {
    return (
      <Card>
        <EmptyState
          icon={Car}
          title="Vehículo no encontrado"
          description="Puede que haya sido eliminado o que el enlace no sea correcto."
          action={
            <Button asChild>
              <Link to="/flota"><ArrowLeft className="h-4 w-4" /> Volver a la flota</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const inactivo = !vehiculo.activo;
  const fotoUrl = resolveAssetUrl(vehiculo.foto_url);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFoto.mutate({ id: vehiculo.id, file });
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/flota"><ArrowLeft className="h-4 w-4" /> Flota</Link>
        </Button>
      </div>

      {/* Header del vehículo */}
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="md:w-56 bg-secondary relative group">
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={`${vehiculo.marca} ${vehiculo.modelo}`}
                className="h-44 w-full object-cover md:h-full"
              />
            ) : (
              <div className="h-44 w-full md:h-full flex items-center justify-center">
                <Car className="h-14 w-14 text-primary/40" />
              </div>
            )}
            <label
              className={cn(
                'absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-white',
                'bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer',
              )}
            >
              <Camera className="h-4 w-4" />
              {fotoUrl ? 'Cambiar foto' : 'Subir foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleFotoChange}
                disabled={uploadFoto.isPending}
              />
            </label>
          </div>

          <div className="flex-1 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    {vehiculo.marca} {vehiculo.modelo}
                  </h2>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                      ESTADO_VEHICULO_COLOR[vehiculo.estado],
                    )}
                  >
                    {ESTADO_VEHICULO_LABEL[vehiculo.estado]}
                  </span>
                  {inactivo && (
                    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{vehiculo.patente}</span>
                  {' · '}
                  {TIPO_VEHICULO_LABEL[vehiculo.tipo]}
                  {' · '}
                  {vehiculo.anio}
                  {' · '}
                  {vehiculo.color}
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                    onClick={() => reactivate.mutate(vehiculo.id)}
                    disabled={reactivate.isPending}
                  >
                    <ArchiveRestore className="h-4 w-4" />
                    {reactivate.isPending ? 'Reactivando…' : 'Reactivar'}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Metric label="Km actual" value={formatNumber(vehiculo.km_actual)} />
              <Metric label="Próximo service" value={`${formatNumber(vehiculo.km_proximo_service)} km`} />
              <Metric label="Cada" value={`${formatNumber(vehiculo.km_entre_services)} km`} />
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="datos" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos / Mant.</TabsTrigger>
          <TabsTrigger value="danios">Daños</TabsTrigger>
          <TabsTrigger value="bloqueos">Bloqueos</TabsTrigger>
          <TabsTrigger value="hist-reservas">Hist. Reservas</TabsTrigger>
          <TabsTrigger value="hist-gastos">Hist. Gastos</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <Card className="p-5">
            <PageHeader
              title="Datos del vehículo"
              description="Información básica registrada en el alta."
            />
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Patente" value={<span className="font-mono">{vehiculo.patente}</span>} />
              <Field label="Tipo" value={TIPO_VEHICULO_LABEL[vehiculo.tipo]} />
              <Field label="Marca" value={vehiculo.marca} />
              <Field label="Modelo" value={vehiculo.modelo} />
              <Field label="Año" value={String(vehiculo.anio)} />
              <Field label="Km actual" value={formatNumber(vehiculo.km_actual)} />
              <Field label="Km entre services" value={formatNumber(vehiculo.km_entre_services)} />
              <Field label="Próximo service" value={`${formatNumber(vehiculo.km_proximo_service)} km`} />
              <Field label="Alta en el sistema" value={formatDate(vehiculo.created_at)} />
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="tarifas">
          <TarifasTab vehiculoId={vehiculo.id} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocumentosTab vehiculoId={vehiculo.id} />
        </TabsContent>

        <TabsContent value="gastos">
          <GastosMantenimientoTab
            vehiculoId={vehiculo.id}
            kmActual={vehiculo.km_actual}
            kmProximoService={vehiculo.km_proximo_service}
            kmEntreServices={vehiculo.km_entre_services}
          />
        </TabsContent>

        <TabsContent value="danios">
          <DaniosTab vehiculoId={vehiculo.id} />
        </TabsContent>

        <TabsContent value="bloqueos">
          <BloqueosTab vehiculoId={vehiculo.id} />
        </TabsContent>

        <TabsContent value="hist-reservas">
          <HistorialReservasTab vehiculoId={vehiculo.id} />
        </TabsContent>

        <TabsContent value="hist-gastos">
          <HistorialTab vehiculoId={vehiculo.id} />
        </TabsContent>
      </Tabs>

      <VehiculoFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vehiculo={vehiculo}
      />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={(open) => { setDeactivateOpen(open); if (!open) setConflicto(null); }}
        title={conflicto ? 'El vehículo tiene reservas sin cerrar' : 'Dar de baja vehículo'}
        description={
          conflicto
            ? `${conflicto} Si lo das de baja igual, esas reservas quedan sobre un vehículo inactivo y hay que reasignarlas a mano.`
            : `Esto marca a ${vehiculo.patente} como inactivo. No se elimina del sistema y podés reactivarlo cuando quieras.`
        }
        confirmLabel={conflicto ? 'Darlo de baja igual' : 'Dar de baja'}
        destructive
        loading={deactivate.isPending || inactivar.isPending}
        onConfirm={async () => {
          try {
            // Segunda vuelta: la persona ya leyó qué reservas quedan afectadas.
            if (conflicto) await inactivar.mutateAsync(vehiculo.id);
            else await deactivate.mutateAsync(vehiculo.id);
            setDeactivateOpen(false);
            setConflicto(null);
            navigate('/flota');
          } catch (err) {
            if (codigoDeError(err) === 'vehiculo_con_reservas') {
              setConflicto(extractError(err));
            } else {
              toast.error(extractError(err));
              setDeactivateOpen(false);
            }
          }
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
