import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Pause, Play, Send, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAccionCampana, useCampanaProspecto, useCampanasProspecto, useGuardarMensajeCampana,
  useMarcarRespondio, type AccionDeCampana, type CampanaProspecto,
} from '@/hooks/useProspectos';
import { cn, extractError, formatDate } from '@/lib/utils';

const ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-700' },
  lista: { texto: 'Lista para enviar', clase: 'bg-amber-100 text-amber-800' },
  enviando: { texto: 'Enviando', clase: 'bg-emerald-100 text-emerald-800' },
  pausada: { texto: 'Pausada', clase: 'bg-amber-100 text-amber-800' },
  terminada: { texto: 'Terminada', clase: 'bg-ubicar-primary/10 text-ubicar-dark' },
  cancelada: { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-500' },
};

const ESTADO_ENVIO: Record<string, string> = {
  en_cola: 'En la cola', enviando: 'Saliendo', enviado: 'Enviado', entregado: 'Entregado',
  rebotado: 'Rebotó', queja: 'Lo marcó como spam', respondio: 'Respondió', baja: 'Se dio de baja',
  omitido: 'No salió', error: 'Falló', cancelado: 'Cancelado',
};

const n = (x: number) => x.toLocaleString('es-AR');

/**
 * Las campañas, con lo que pasó con cada una: cuántos mails salieron, cuántos
 * llegaron, cuántos rebotaron, quién respondió y quién se dio de baja. Desde
 * acá se pausan, se reanudan, se cancelan y —las que quedaron guardadas sin
 * casilla— se mandan.
 */
export function CampanasTab({ onNueva }: { onNueva: () => void }) {
  const { data: campanas = [], isLoading } = useCampanasProspecto();
  const accion = useAccionCampana();
  const [abierta, setAbierta] = useState<number | null>(null);
  const [aCancelar, setACancelar] = useState<CampanaProspecto | null>(null);

  const hacer = (id: number, que: AccionDeCampana, listo: string) =>
    accion.mutate({ id, accion: que }, {
      onSuccess: () => toast.success(listo),
      onError: e => toast.error(extractError(e)),
    });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (campanas.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
        <Megaphone className="h-8 w-8 text-ubicar-primary" />
        Todavía no mandaste ninguna campaña.
        <Button onClick={onNueva}><Megaphone className="h-4 w-4" /> Nueva campaña</Button>
      </Card>
    );
  }
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {campanas.map(c => {
          const p = c.progreso;
          const total = p ? p.en_cola + p.enviados : 0;
          const salio = !!p && p.enviados + p.en_cola > 0;
          return (
            <Card key={c.id} className="p-4">
              <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setAbierta(c.id)}>
                <span>
                  <span className="block font-semibold text-foreground">{c.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.created_at ? formatDate(c.created_at) : ''}{c.asunto ? ` · ${c.asunto}` : ''}
                  </span>
                </span>
                <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-semibold', ESTADO[c.estado]?.clase)}>
                  {ESTADO[c.estado]?.texto ?? c.estado}
                </span>
              </button>

              {salio && p ? (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
                    aria-valuemin={0} aria-valuemax={total} aria-valuenow={p.enviados}
                    aria-label={`${p.enviados} de ${total} mails enviados`}>
                    <div className="h-full bg-ubicar-primary transition-all"
                      style={{ width: `${total ? Math.round((100 * p.enviados) / total) : 0}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs sm:grid-cols-5">
                    <Numero titulo="Enviados" valor={p.enviados} detalle={p.en_cola ? `faltan ${n(p.en_cola)}` : undefined} />
                    <Numero titulo="Entregados" valor={p.entregados} />
                    <Numero titulo="Rebotes" valor={p.rebotes} alerta={p.rebotes > 0} />
                    <Numero titulo="Respuestas" valor={p.respuestas} bueno={p.respuestas > 0} />
                    <Numero titulo="Bajas" valor={p.bajas + p.quejas} alerta={p.quejas > 0}
                      detalle={p.quejas ? `${n(p.quejas)} spam` : undefined} />
                  </dl>
                  {p.simulados > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700">
                      {n(p.simulados)} de prueba: quedaron registrados pero no salieron de verdad.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-foreground">
                  <strong>{n(c.por_estado.pendiente ?? 0)}</strong> a contactar · {n(c.por_estado.omitido ?? 0)} omitidos
                  {!c.asunto && <span className="ml-2 text-xs text-amber-700">Falta escribir el mensaje.</span>}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {(c.estado === 'lista' || c.estado === 'borrador') && c.asunto && (
                  <Button size="sm" disabled={accion.isPending} onClick={() => hacer(c.id, 'lanzar', 'Campaña en marcha')}>
                    <Send className="h-4 w-4" /> Enviar
                  </Button>
                )}
                {c.estado === 'enviando' && (
                  <Button size="sm" variant="outline" disabled={accion.isPending}
                    onClick={() => hacer(c.id, 'pausar', 'Campaña pausada')}>
                    <Pause className="h-4 w-4" /> Pausar
                  </Button>
                )}
                {c.estado === 'pausada' && (
                  <Button size="sm" disabled={accion.isPending} onClick={() => hacer(c.id, 'reanudar', 'Campaña reanudada')}>
                    <Play className="h-4 w-4" /> Reanudar
                  </Button>
                )}
                {['enviando', 'pausada', 'lista'].includes(c.estado) && (
                  <Button size="sm" variant="ghost" disabled={accion.isPending} onClick={() => setACancelar(c)}>
                    <XCircle className="h-4 w-4" /> Cancelar
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAbierta(c.id)}>Ver detalle</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {abierta !== null && <DetalleDeCampana id={abierta} onClose={() => setAbierta(null)} />}
      <ConfirmDialog
        open={aCancelar !== null} onOpenChange={o => { if (!o) setACancelar(null); }}
        title="¿Cancelar la campaña?"
        description={`Lo que todavía no salió de «${aCancelar?.nombre ?? ''}» no se manda. Lo que ya salió, salió.`}
        confirmLabel="Sí, cancelar" cancelLabel="Volver" destructive
        onConfirm={() => { if (aCancelar) hacer(aCancelar.id, 'cancelar', 'Campaña cancelada'); setACancelar(null); }}
      />
    </>
  );
}

function Numero({ titulo, valor, detalle, alerta, bueno }: {
  titulo: string; valor: number; detalle?: string; alerta?: boolean; bueno?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className={cn('text-base font-bold tabular-nums text-foreground',
        alerta && 'text-red-700', bueno && 'text-emerald-700')}>
        {n(valor)}
        {detalle && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{detalle}</span>}
      </dd>
    </div>
  );
}

function DetalleDeCampana({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: c } = useCampanaProspecto(id);
  const guardar = useGuardarMensajeCampana();
  const respondio = useMarcarRespondio();
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [viendo, setViendo] = useState<number | null>(null);
  useEffect(() => { if (c) { setAsunto(c.asunto ?? ''); setCuerpo(c.cuerpo ?? ''); } }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return null;
  const puedeEditar = c.estado === 'borrador' || c.estado === 'lista';
  const envios = c.envios ?? [];
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{c.nombre}</DialogTitle>
          <DialogDescription>
            {ESTADO[c.estado]?.texto} · {n(c.destinatarios)} empresas
            {(c.seguimientos?.length ?? 0) > 0 && ` · con ${c.seguimientos!.length} ${c.seguimientos!.length === 1 ? 'seguimiento' : 'seguimientos'}`}
          </DialogDescription>
        </DialogHeader>

        {Object.keys(c.omitidos_por_motivo).length > 0 && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="mb-1 font-medium">No se les escribe:</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {Object.entries(c.omitidos_por_motivo).map(([motivo, cuantos]) => (
                <li key={motivo}><strong className="text-foreground">{cuantos}</strong> · {motivo}</li>
              ))}
            </ul>
          </div>
        )}

        {puedeEditar ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Mensaje</p>
            <input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Asunto" className="input-base" />
            <Textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={10}
              className="font-mono text-xs" placeholder="Todavía sin escribir." />
            <p className="text-[11px] text-muted-foreground">
              El pie con el link de baja se agrega solo si no está.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Empresa</th>
                  <th className="px-3 py-2 font-medium">Mail</th>
                  <th className="px-3 py-2 font-medium">Qué pasó</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {envios.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Todavía no salió nada.</td></tr>
                )}
                {envios.map(e => (
                  <tr key={e.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{e.empresa}</p>
                      <p className="text-muted-foreground">{e.para}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.toque === 1 ? 'Primer mail' : e.toque === 2 ? 'Seguimiento' : 'Último aviso'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-foreground">{ESTADO_ENVIO[e.estado] ?? e.estado}</span>
                      {e.simulado && <span className="ml-1 text-amber-700">(de prueba)</span>}
                      {e.estado === 'en_cola' && (
                        <span className="block text-muted-foreground">desde el {formatDate(e.programado_para)}</span>
                      )}
                      {e.motivo && <span className="block text-muted-foreground">{e.motivo}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button className="text-ubicar-primary underline" onClick={() => setViendo(viendo === e.id ? null : e.id)}>
                        {viendo === e.id ? 'Ocultar' : 'Ver mail'}
                      </button>
                      {['enviado', 'entregado'].includes(e.estado) && (
                        <button className="ml-3 text-ubicar-primary underline" disabled={respondio.isPending}
                          onClick={() => respondio.mutate(e.prospecto_id, {
                            onSuccess: () => toast.success('Anotado: no le salen más seguimientos'),
                            onError: err => toast.error(extractError(err)),
                          })}>
                          Marcar que respondió
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viendo !== null && (() => {
              const e = envios.find(x => x.id === viendo);
              return e ? (
                <div className="border-t border-border bg-muted/40 p-3 text-xs">
                  <p className="mb-1 text-muted-foreground">
                    {e.desde ? `De ${e.desde} · ` : ''}Asunto: <strong className="text-foreground">{e.asunto}</strong>
                  </p>
                  <pre className="whitespace-pre-wrap break-words font-sans text-foreground">{e.cuerpo}</pre>
                </div>
              ) : null;
            })()}
          </div>
        )}

        <DialogFooter>
          {puedeEditar && (
            <Button variant="outline" disabled={guardar.isPending}
              onClick={() => guardar.mutate({ id, asunto, cuerpo }, {
                onSuccess: () => toast.success('Mensaje guardado'),
                onError: e => toast.error(extractError(e)),
              })}>
              Guardar mensaje
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
