import { useState } from 'react';
import { Globe, AlertTriangle, Clock, Check, X, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import {
  useReservasWeb, useResumenReservasWeb,
  useAceptarReservaWeb, useRechazarReservaWeb,
} from '@/hooks/useReservasWeb';
import { useVehiculos } from '@/hooks/useVehiculos';
import { ESTADO_RESERVA_LABEL, ESTADO_RESERVA_COLOR } from '@/lib/constants';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Reserva } from '@/types';

/**
 * Bandeja de Reservas Web (ítem 64).
 *
 * Tres situaciones distintas, y el orden importa: primero lo que tiene plata
 * del cliente en juego.
 */
export function ReservasWebPage() {
  const { data: resumen } = useResumenReservasWeb();
  const { data: reservas, isLoading } = useReservasWeb();
  const [aceptando, setAceptando] = useState<Reserva | null>(null);
  const [rechazando, setRechazando] = useState<Reserva | null>(null);
  const rechazar = useRechazarReservaWeb();

  // Lo que ya cobró va primero: ahí hay plata del cliente esperando.
  const orden = { revision_sin_cupo: 0, sin_disponibilidad: 1, pendiente_pago: 2 } as Record<string, number>;
  const ordenadas = [...(reservas ?? [])].sort(
    (a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reservas web</h1>
          <p className="text-sm text-muted-foreground">
            Lo que entró por la web y espera una decisión.
          </p>
        </div>
      </div>

      {resumen && resumen.pendientes > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-warning px-4 py-3 text-white">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">
            {resumen.pendientes} solicitud{resumen.pendientes === 1 ? '' : 'es'} esperando respuesta.
            Cada una es una venta que se puede caer.
          </p>
        </div>
      )}

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Cargando…</Card>}

      {!isLoading && ordenadas.length === 0 && (
        <Card className="p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">No hay nada pendiente</p>
          <p className="text-xs text-muted-foreground">
            Las reservas que entren por la web van a aparecer acá.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {ordenadas.map(r => (
          <FilaReservaWeb
            key={r.id}
            reserva={r}
            onAceptar={() => setAceptando(r)}
            onRechazar={() => setRechazando(r)}
          />
        ))}
      </div>

      {aceptando && (
        <AsignarVehiculoDialog reserva={aceptando} onClose={() => setAceptando(null)} />
      )}

      <MotivoDialog
        open={!!rechazando}
        onOpenChange={o => !o && setRechazando(null)}
        title="Rechazar solicitud"
        description={
          'La solicitud queda registrada con su motivo — es lo que después explica una ' +
          'devolución y lo que permite medir por qué se caen las ventas. Si el cliente ' +
          'ya pagó, la devolución todavía se hace a mano.'
        }
        confirmLabel="Rechazar"
        destructive
        loading={rechazar.isPending}
        onConfirm={motivo => {
          if (!rechazando) return;
          rechazar.mutate({ id: rechazando.id, motivo }, { onSuccess: () => setRechazando(null) });
        }}
      />
    </div>
  );
}

function FilaReservaWeb({
  reserva, onAceptar, onRechazar,
}: { reserva: Reserva; onAceptar: () => void; onRechazar: () => void }) {
  const esperandoPago = reserva.estado === 'pendiente_pago';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">#{reserva.id}</span>
            <span className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold',
              ESTADO_RESERVA_COLOR[reserva.estado],
            )}>
              {ESTADO_RESERVA_LABEL[reserva.estado]}
            </span>
            {reserva.categoria?.nombre && (
              <span className="text-sm text-muted-foreground">{reserva.categoria.nombre}</span>
            )}
          </div>

          <p className="text-sm text-foreground">
            {formatDate(reserva.fecha_inicio)} {reserva.hora_inicio?.slice(0, 5)}
            {' → '}
            {formatDate(reserva.fecha_fin)} {reserva.hora_fin?.slice(0, 5)}
          </p>

          {/* El contacto se guarda en la reserva y no sólo en el cliente: una
              solicitud sin cupo puede no llegar nunca a crear un cliente, y ese
              contacto es justamente lo que no se quiere perder. */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {(reserva.web_contacto_nombre || reserva.cliente?.nombre_completo) && (
              <span className="font-medium text-foreground">
                {reserva.web_contacto_nombre || reserva.cliente?.nombre_completo}
              </span>
            )}
            {reserva.web_contacto_email && (
              <a href={`mailto:${reserva.web_contacto_email}`} className="flex items-center gap-1 hover:text-primary">
                <Mail className="h-3 w-3" /> {reserva.web_contacto_email}
              </a>
            )}
            {reserva.web_contacto_telefono && (
              <a href={`tel:${reserva.web_contacto_telefono}`} className="flex items-center gap-1 hover:text-primary">
                <Phone className="h-3 w-3" /> {reserva.web_contacto_telefono}
              </a>
            )}
          </div>

          {reserva.precio_total && (
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(reserva.precio_total)}
            </p>
          )}
        </div>

        {esperandoPago ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Esperando al cliente
          </p>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={onAceptar}>
              <Check className="h-4 w-4" /> Aceptar
            </Button>
            <Button size="sm" variant="ghost" onClick={onRechazar}>
              <X className="h-4 w-4" /> Rechazar
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Aceptar es asignar un vehículo concreto: es el momento en que una reserva
 * por categoría vuelve a ser una reserva de un auto puntual. El backend
 * revalida la disponibilidad al asignar.
 */
function AsignarVehiculoDialog({ reserva, onClose }: { reserva: Reserva; onClose: () => void }) {
  const { data: vehiculosPag } = useVehiculos({ page_size: 100 });
  const vehiculos = vehiculosPag?.data ?? [];
  const aceptar = useAceptarReservaWeb();
  const [vehiculoId, setVehiculoId] = useState<number | ''>('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Se ofrecen primero los de la categoría pedida, pero no se ocultan los
  // demás: dar un upgrade es una decisión comercial válida.
  const candidatos = [...vehiculos].sort((a, b) => {
    const ca = a.categoria_id === reserva.categoria_id ? 0 : 1;
    const cb = b.categoria_id === reserva.categoria_id ? 0 : 1;
    return ca - cb;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-background p-5">
        <div>
          <h3 className="font-semibold text-foreground">Aceptar reserva #{reserva.id}</h3>
          <p className="text-xs text-muted-foreground">
            Asignale un vehículo. Se verifica que esté libre en esas fechas antes de confirmar.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-danger px-3 py-2 text-xs text-white">{error}</p>
        )}

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Vehículo *</label>
          <select
            value={vehiculoId}
            onChange={e => setVehiculoId(e.target.value ? Number(e.target.value) : '')}
            className="input-base"
          >
            <option value="">Elegí un vehículo…</option>
            {candidatos.map(v => (
              <option key={v.id} value={v.id}>
                {v.patente} — {v.marca} {v.modelo}
                {v.categoria_id !== reserva.categoria_id ? ' (otra categoría)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nota (opcional)</label>
          <input value={notas} onChange={e => setNotas(e.target.value)} className="input-base" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            disabled={!vehiculoId || aceptar.isPending}
            onClick={() => {
              setError(null);
              aceptar.mutate(
                { id: reserva.id, vehiculo_id: Number(vehiculoId), notas: notas || undefined },
                {
                  onSuccess: onClose,
                  onError: (e: any) =>
                    setError(e?.response?.data?.detail ?? 'No se pudo aceptar la reserva'),
                },
              );
            }}
          >
            {aceptar.isPending ? 'Confirmando…' : 'Confirmar reserva'}
          </Button>
        </div>
      </div>
    </div>
  );
}
