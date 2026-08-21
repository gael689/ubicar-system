import { useState } from 'react';
import { Globe, AlertTriangle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { PanelResolverReserva } from '@/components/reservas/PanelResolverReserva';
import { FilaReservaWeb } from '@/components/reservas/FilaReservaWeb';
import { useReservasWeb, useResumenReservasWeb, useRechazarReservaWeb } from '@/hooks/useReservasWeb';
import { useListaReservas } from '@/hooks/useReservas';
import { FilaSolicitudContacto, FilaSolicitudResuelta } from '@/components/reservas/FilaSolicitudContacto';
import {
  useSolicitudesContacto, useResolverSolicitudContacto,
} from '@/hooks/useSolicitudesContacto';
import type { Reserva, SolicitudContacto } from '@/types';

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

  // D-61: "Piden que los llamemos". Consulta aparte porque es otra entidad —
  // no son reservas y no comparten ni bandeja ni acciones.
  const { data: solicitudesData, refetch: refetchSolicitudes } = useSolicitudesContacto();
  const solicitudes = solicitudesData ?? [];
  const [resolviendoSolicitud, setResolviendoSolicitud] = useState<
    { solicitud: SolicitudContacto; accion: 'contactado' | 'cerrar' } | null
  >(null);
  const resolverSolicitud = useResolverSolicitudContacto();

  // El historial de llamadas. **Faltaba entero**: apenas se marcaba "Ya lo
  // llamé", la solicitud pasaba a `contactado` y desaparecía de la única
  // pantalla que las mostraba — la bandeja lista sólo `pendiente`. O sea que
  // no había forma de revisar a quién se llamó ni qué dijo, y el campo
  // `resultado` que el mostrador se toma el trabajo de escribir no se leía
  // nunca más. Van las dos juntas y no una sección por estado: para quien
  // atiende, "ya la llamé" y "el asunto se terminó" son lo mismo — algo que
  // ya no requiere levantar el teléfono.
  const [verAtendidas, setVerAtendidas] = useState(false);
  const { data: contactadas } = useSolicitudesContacto('contactado', verAtendidas);
  const { data: cerradas } = useSolicitudesContacto('cerrado', verAtendidas);
  const atendidas = [...(contactadas ?? []), ...(cerradas ?? [])].sort(
    (a, b) => (b.resuelta_en ?? '').localeCompare(a.resuelta_en ?? ''),
  );

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Reservas web</h1>
            <p className="text-sm text-muted-foreground">
              Lo que entró por la web y todavía no es una venta cerrada.
            </p>
          </div>
        </div>

        {/* El acceso al historial vive acá arriba y no adentro de la sección
            de solicitudes, que sólo se dibuja cuando hay alguna pendiente. Si
            estuviera ahí, el día que no queda ninguna llamada por hacer —que
            es justo cuando uno quiere revisar qué se hizo— el botón
            desaparecería con la sección. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVerAtendidas(v => !v)}
        >
          <History className="h-4 w-4" />
          {verAtendidas ? 'Ocultar las llamadas atendidas' : 'Ver las llamadas atendidas'}
        </Button>
      </div>

      {/* D-61: el aviso cuenta las dos cosas. Antes sólo miraba las reservas,
          así que una tanda de pedidos de llamada no movía el cartel y podía
          pasar el día entero sin que nadie los viera. */}
      {(resumen?.pendientes ?? 0) + solicitudes.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-warning px-4 py-3 text-white">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">
            {[
              resumen?.pendientes
                ? `${resumen.pendientes} reserva${resumen.pendientes === 1 ? '' : 's'} esperando respuesta`
                : null,
              solicitudes.length
                ? `${solicitudes.length} ${solicitudes.length === 1 ? 'persona espera' : 'personas esperan'} que la${solicitudes.length === 1 ? '' : 's'} llamemos`
                : null,
            ].filter(Boolean).join(' · ')}
            . Cada una es una venta que se puede caer.
          </p>
        </div>
      )}

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Cargando…</Card>}

      {!isLoading && todas.length === 0 && aMedias.length === 0 && solicitudes.length === 0 && (
        <Card className="p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">No hay nada pendiente</p>
          <p className="text-xs text-muted-foreground">
            Las reservas que entren por la web van a aparecer acá.
          </p>
        </Card>
      )}

      {/* D-61 — va **primero y separado**: es lo único de esta pantalla donde
          nosotros prometimos algo. Todo lo de abajo son reservas que esperan
          una decisión nuestra; esto es gente esperando un llamado que dijimos
          que íbamos a hacer. La bajada lo dice con todas las letras para que
          nadie la trabaje como si fuera una venta cerrada. */}
      {solicitudes.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Piden que los llamemos{' '}
              <span className="text-muted-foreground">({solicitudes.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Dejaron sus datos desde la web. <strong>Todavía no reservaron nada</strong> —
              es una llamada pendiente, no una venta cerrada.
            </p>
          </div>
          <div className="space-y-3">
            {solicitudes.map(s => (
              <FilaSolicitudContacto
                key={s.id}
                solicitud={s}
                onContactado={() => setResolviendoSolicitud({ solicitud: s, accion: 'contactado' })}
                onCerrar={() => setResolviendoSolicitud({ solicitud: s, accion: 'cerrar' })}
              />
            ))}
          </div>
        </section>
      )}

      {/* El historial. Se muestra apagado (`FilaSolicitudResuelta`) porque no
          hay nada que hacer con estas filas: son para consultar, no para
          trabajar. Lo importante de cada una es el `resultado` —"alquiló",
          "no atiende", "llama en marzo"— que es lo que evita que el próximo
          que atienda vuelva a llamar para preguntar lo mismo. */}
      {verAtendidas && (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Llamadas ya atendidas{' '}
              <span className="text-muted-foreground">({atendidas.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Las que alguien ya llamó o dio por cerradas, de la más reciente a la más vieja.
            </p>
          </div>
          {atendidas.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">
              Todavía no se atendió ninguna solicitud.
            </Card>
          ) : (
            <div className="space-y-2">
              {atendidas.map(s => (
                <FilaSolicitudResuelta key={s.id} solicitud={s} />
              ))}
            </div>
          )}
        </section>
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

      {/* Qué pasó al llamar. Se puede dejar vacío a propósito: obligar a
          escribir algo hace que la gente escriba cualquier cosa con tal de
          poder sacarse el ítem de encima. */}
      <MotivoDialog
        open={!!resolviendoSolicitud}
        onOpenChange={o => !o && setResolviendoSolicitud(null)}
        title={
          resolviendoSolicitud?.accion === 'contactado'
            ? 'Marcar como contactado'
            : 'Cerrar la solicitud'
        }
        description={
          resolviendoSolicitud?.accion === 'contactado'
            ? 'Queda registrado quién llamó y cuándo. Si querés, anotá qué dijo: sirve para el que atienda después.'
            : 'Se termina el asunto: alquiló, no le servía, o no hubo forma de ubicarlo. Anotá cuál fue.'
        }
        confirmLabel={resolviendoSolicitud?.accion === 'contactado' ? 'Ya lo llamé' : 'Cerrar'}
        destructive={false}
        opcional
        etiqueta="Qué pasó"
        loading={resolverSolicitud.isPending}
        onConfirm={resultado => {
          if (!resolviendoSolicitud) return;
          resolverSolicitud.mutate(
            {
              id: resolviendoSolicitud.solicitud.id,
              accion: resolviendoSolicitud.accion,
              resultado,
            },
            {
              onSuccess: () => {
                setResolviendoSolicitud(null);
                refetchSolicitudes();
              },
            },
          );
        }}
      />

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

