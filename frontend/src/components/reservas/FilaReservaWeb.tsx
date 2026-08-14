import { Clock, Mail, Phone, Wrench, X, Globe, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ESTADO_RESERVA_LABEL, ESTADO_RESERVA_COLOR } from '@/lib/constants';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Reserva } from '@/types';

/** Hace cuánto que está esperando. Una reserva que espera se enfría. */
export function esperandoHace(desde: string | undefined): string | null {
  if (!desde) return null;
  const ms = Date.now() - new Date(desde).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return 'recién entró';
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

/**
 * La ficha completa de una reserva que todavía no es una venta cerrada:
 * pedido, contacto, plata y qué falta.
 *
 * Plan de conexión (13/08) — extraída de `ReservasWebPage.tsx` para que el
 * panel "Pendiente de asignación" del calendario (2.2) use exactamente la
 * misma ficha y no una segunda versión que un día informe distinto sobre la
 * misma reserva.
 */
export function FilaReservaWeb({
  reserva, onResolver, onRechazar,
}: { reserva: Reserva; onResolver: () => void; onRechazar?: () => void }) {
  const total =
    Number(reserva.precio_total ?? 0)
    + Number(reserva.cargo_late_checkout ?? 0)
    + Number(reserva.total_adicionales ?? 0);
  const cobrado = Number(reserva.anticipo_monto ?? 0);
  const falta = total - cobrado;
  const espera = esperandoHace(reserva.created_at);
  const esWeb = reserva.origen === 'web';

  // Lo que le falta a esta reserva, en la fila: sin esto hay que abrirla una
  // por una para saber cuál es la urgente.
  const pendientes: string[] = [];
  if (reserva.estado === 'pendiente_pago') pendientes.push('confirmar el pago');
  if (!reserva.vehiculo_id) pendientes.push('asignar el auto');
  if (reserva.vehiculo_id && reserva.contrato_estado === 'sin_emitir') pendientes.push('emitir el contrato');

  // El contacto se guarda en la reserva y no sólo en el cliente porque una
  // solicitud web sin cupo puede no llegar nunca a crear un cliente — pero
  // una reserva de mostrador siempre tiene cliente, así que se completa con
  // el suyo cuando no hay `web_contacto_*`.
  const nombre = reserva.web_contacto_nombre || reserva.cliente?.nombre_completo;
  const email = reserva.web_contacto_email || reserva.cliente?.email;
  const telefono = reserva.web_contacto_telefono || reserva.cliente?.telefono;

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
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {esWeb ? <Globe className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {esWeb ? 'Web' : 'Mostrador'}
            </span>
            {reserva.categoria?.nombre && (
              <span className="text-sm text-muted-foreground">{reserva.categoria.nombre}</span>
            )}
            {espera && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {espera}
              </span>
            )}
          </div>

          <p className="text-sm text-foreground">
            {formatDate(reserva.fecha_inicio)} {reserva.hora_inicio?.slice(0, 5)}
            {' → '}
            {formatDate(reserva.fecha_fin)} {reserva.hora_fin?.slice(0, 5)}
            {reserva.lugar_entrega && (
              <span className="text-muted-foreground"> · {reserva.lugar_entrega}</span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {nombre && <span className="font-medium text-foreground">{nombre}</span>}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-1 hover:text-primary">
                <Mail className="h-3 w-3" /> {email}
              </a>
            )}
            {telefono && (
              <a href={`tel:${telefono}`} className="flex items-center gap-1 hover:text-primary">
                <Phone className="h-3 w-3" /> {telefono}
              </a>
            )}
          </div>

          {total > 0 && (
            <p className="text-sm text-foreground">
              <span className="font-semibold">{formatCurrency(total)}</span>
              {cobrado > 0 && (
                <span className="text-muted-foreground"> · cobrado {formatCurrency(cobrado)}</span>
              )}
              {falta > 0 && (
                <span className="font-semibold text-warning"> · falta cobrar {formatCurrency(falta)}</span>
              )}
            </p>
          )}

          {pendientes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Falta: <span className="font-medium text-foreground">{pendientes.join(' · ')}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={onResolver}>
            <Wrench className="h-4 w-4" /> Resolver
          </Button>
          {onRechazar && (
            <Button size="sm" variant="ghost" onClick={onRechazar}>
              <X className="h-4 w-4" /> Rechazar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
