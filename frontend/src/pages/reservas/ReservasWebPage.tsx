import { useState } from 'react';
import { Globe, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { PanelResolverReserva } from '@/components/reservas/PanelResolverReserva';
import { FilaReservaWeb } from '@/components/reservas/FilaReservaWeb';
import { useReservasWeb, useResumenReservasWeb, useRechazarReservaWeb } from '@/hooks/useReservasWeb';
import { useListaReservas } from '@/hooks/useReservas';
import type { Reserva } from '@/types';

/**
 * Bandeja de Reservas Web.
 *
 * Tres secciones, y el orden importa: **primero lo que tiene plata del cliente
 * en juego**.
 *
 * La sección que faltaba es la última. Una reserva web que se cobró y confirmó
 * deja la bandeja al instante, aunque todavía no tenga auto ni contrato — y
 * ahí se volvía invisible: no aparecía acá y en el listado general se veía
 * igual que cualquier otra confirmada. Quedarse a mitad de camino es
 * exactamente lo que pasa cuando entra un llamado, así que tiene que dejar
 * una marca hasta que esté terminada.
 */
export function ReservasWebPage() {
  const { data: resumen } = useResumenReservasWeb();
  const { data: reservas, isLoading, refetch } = useReservasWeb();
  const [resolviendo, setResolviendo] = useState<Reserva | null>(null);
  const [rechazando, setRechazando] = useState<Reserva | null>(null);
  const rechazar = useRechazarReservaWeb();

  // Las que ya se resolvieron a medias: confirmadas, pero sin auto o sin
  // contrato firmado. Salen del listado general porque la bandeja sólo
  // devuelve los tres estados sin resolver.
  const { data: confirmadasWeb, refetch: refetchConfirmadas } = useListaReservas({
    origen: 'web', estado: 'confirmada', page_size: 100,
  });
  const aMedias = (confirmadasWeb?.data ?? []).filter(
    r => !r.vehiculo_id || r.contrato_estado === 'sin_emitir',
  );

  const refrescar = () => { refetch(); refetchConfirmadas(); };

  const todas = reservas ?? [];
  const esperandoPago = todas.filter(r => r.estado === 'pendiente_pago');
  const requierenDecision = todas.filter(r => r.estado !== 'pendiente_pago');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reservas web</h1>
          <p className="text-sm text-muted-foreground">
            Lo que entró por la web y todavía no es una venta cerrada.
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

      {!isLoading && todas.length === 0 && aMedias.length === 0 && (
        <Card className="p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">No hay nada pendiente</p>
          <p className="text-xs text-muted-foreground">
            Las reservas que entren por la web van a aparecer acá.
          </p>
        </Card>
      )}

      <Seccion
        titulo="Necesitan una decisión"
        bajada="El cupo se fue, o el cliente pidió algo que no había. Hay que contestarle."
        reservas={requierenDecision}
      >
        {r => (
          <FilaReservaWeb
            key={r.id}
            reserva={r}
            onResolver={() => setResolviendo(r)}
            onRechazar={() => setRechazando(r)}
          />
        )}
      </Seccion>

      <Seccion
        titulo="Esperando la transferencia"
        bajada={
          'Por transferencia no hay aviso automático: el cliente manda el ' +
          'comprobante y alguien lo cruza contra el extracto. Hasta que no se ' +
          'registra acá, la reserva no está confirmada y el auto no está tomado.'
        }
        reservas={esperandoPago}
      >
        {r => (
          <FilaReservaWeb
            key={r.id}
            reserva={r}
            onResolver={() => setResolviendo(r)}
            onRechazar={() => setRechazando(r)}
          />
        )}
      </Seccion>

      <Seccion
        titulo="Cobradas, pero sin terminar"
        bajada="Ya se confirmaron y todavía les falta el auto o el contrato."
        reservas={aMedias}
      >
        {r => (
          <FilaReservaWeb key={r.id} reserva={r} onResolver={() => setResolviendo(r)} />
        )}
      </Seccion>

      {resolviendo && (
        <PanelResolverReserva
          reserva={resolviendo}
          onClose={() => { setResolviendo(null); refrescar(); }}
          onCambio={refrescar}
        />
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
          rechazar.mutate({ id: rechazando.id, motivo }, {
            onSuccess: () => { setRechazando(null); refrescar(); },
          });
        }}
      />
    </div>
  );
}

function Seccion({
  titulo, bajada, reservas, children,
}: {
  titulo: string;
  bajada: string;
  reservas: Reserva[];
  children: (r: Reserva) => React.ReactNode;
}) {
  if (reservas.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {titulo} <span className="text-muted-foreground">({reservas.length})</span>
        </h2>
        <p className="text-xs text-muted-foreground">{bajada}</p>
      </div>
      <div className="space-y-3">{reservas.map(children)}</div>
    </section>
  );
}

