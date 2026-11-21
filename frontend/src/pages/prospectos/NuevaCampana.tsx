import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, ChevronRight, MailCheck, Send, Settings, StickyNote } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useAudiencias, useCalcularCampana, useCrearCampanaRapida, useEnviarPrueba, usePlantillasProspeccion,
  type FiltroProspectos, type PlantillaProspeccion, type Seleccion,
} from '@/hooks/useProspectos';
import { cn, extractError } from '@/lib/utils';

interface Props {
  /** Lo que venía marcado en la tabla (o su filtro), si se abrió desde ahí. */
  seleccion?: Seleccion | null;
  cantidadSeleccionada?: number;
  onClose: () => void;
  onCreada?: () => void;
  /** Para el cartel "sin casilla": lleva a la pestaña Casillas. */
  onIrACasillas: () => void;
}

const n = (x: number) => x.toLocaleString('es-AR');
const mails = (x: number) => `${n(x)} ${x === 1 ? 'mail' : 'mails'}`;

/**
 * **Nueva campaña**: de la lista al envío en una sola pantalla.
 *
 * Pedido de Gael (21/11/2026): crear una campaña era "tedioso, muy largo".
 * Antes había que ponerle nombre, entrar al detalle, escribir el mensaje de
 * cero y "prepararla" — y ni así salía. Acá son tres bloques a la vista:
 * **quiénes** (audiencias de un clic con el número ya calculado), **mensaje**
 * (una plantilla ya escrita, con la vista previa de una empresa real) y
 * **mandar**.
 *
 * Todo lo que se ve en vivo —a cuántos les sale, cómo queda el mail, cuándo
 * termina— lo calcula el servidor en un solo pedido (`/campanas/calcular`):
 * las reglas de a quién se le escribe viven en un solo lugar.
 */
export function NuevaCampana({ seleccion, cantidadSeleccionada, onClose, onCreada, onIrACasillas }: Props) {
  const vieneConSeleccion = !!(seleccion?.ids?.length || seleccion?.filtro);
  const { data: audiencias } = useAudiencias();
  const { data: catalogo } = usePlantillasProspeccion();

  // ── 1 · Quiénes ──────────────────────────────────────────────────────────
  const [usarSeleccion, setUsarSeleccion] = useState(vieneConSeleccion);
  const [segmento, setSegmento] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [soloNunca, setSoloNunca] = useState(false);

  const quienes: Seleccion = useMemo(() => {
    if (usarSeleccion && seleccion) return seleccion;
    const filtro: FiltroProspectos = {
      solo_contactables: true, con_mail: true,
      ...(segmento ? { segmento } : {}),
      ...(ciudad ? { ciudad } : {}),
      ...(soloNunca ? { nunca_contactados: true } : {}),
    };
    return { filtro };
  }, [usarSeleccion, seleccion, segmento, ciudad, soloNunca]);

  // ── 2 · Mensaje ──────────────────────────────────────────────────────────
  const [plantillaId, setPlantillaId] = useState<string | null>(null);
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [segundo, setSegundo] = useState('');
  const [tercero, setTercero] = useState('');
  const [conSegundo, setConSegundo] = useState(true);
  const [conTercero, setConTercero] = useState(true);
  const [verSeguimientos, setVerSeguimientos] = useState(false);
  const [firmaNombre, setFirmaNombre] = useState('');
  const [firmaTelefono, setFirmaTelefono] = useState('');
  const [indice, setIndice] = useState(0);
  // Si la persona ya tocó el texto, cambiar de audiencia no se lo pisa.
  const [tocado, setTocado] = useState(false);
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (catalogo && !firmaNombre && !firmaTelefono) {
      setFirmaNombre(catalogo.firma.nombre);
      setFirmaTelefono(catalogo.firma.telefono);
    }
  }, [catalogo]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarPlantilla = (p: PlantillaProspeccion) => {
    setPlantillaId(p.id);
    setAsunto(p.asuntos[0]);
    setCuerpo(p.cuerpo);
    setSegundo(p.seguimientos[0]?.cuerpo ?? '');
    setTercero(p.seguimientos[1]?.cuerpo ?? '');
    setTocado(false);
  };

  const seguimientos = useMemo(() => [
    ...(conSegundo && segundo.trim() ? [{ dias: 5, cuerpo: segundo }] : []),
    // El tercero es "el último": sin el segundo no tiene sentido.
    ...(conSegundo && conTercero && tercero.trim() ? [{ dias: 12, cuerpo: tercero }] : []),
  ], [conSegundo, conTercero, segundo, tercero]);

  const mensaje = useMemo(() => ({
    asunto, cuerpo, seguimientos, firma_nombre: firmaNombre, firma_telefono: firmaTelefono,
  }), [asunto, cuerpo, seguimientos, firmaNombre, firmaTelefono]);

  const pedido = useMemo(() => ({ ...quienes, ...mensaje, indice }), [quienes, mensaje, indice]);
  const pedidoQuieto = useDebouncedValue(pedido, 350);
  const { data: calculo, isFetching } = useCalcularCampana(pedidoQuieto);

  useEffect(() => { setIndice(0); }, [quienes]);

  // La plantilla se elige sola según el rubro que más pesa en la audiencia.
  useEffect(() => {
    if (!catalogo || !calculo || tocado) return;
    if (plantillaId === calculo.plantilla_sugerida) return;
    const sugerida = catalogo.plantillas.find(p => p.id === calculo.plantilla_sugerida);
    if (sugerida) aplicarPlantilla(sugerida);
  }, [catalogo, calculo?.plantilla_sugerida]); // eslint-disable-line react-hooks/exhaustive-deps

  const plantilla = catalogo?.plantillas.find(p => p.id === plantillaId) ?? null;

  const insertar = (variable: string) => {
    const marca = `{{${variable}}}`;
    const el = cuerpoRef.current;
    const desde = el?.selectionStart ?? cuerpo.length;
    const hasta = el?.selectionEnd ?? cuerpo.length;
    setCuerpo(cuerpo.slice(0, desde) + marca + cuerpo.slice(hasta));
    setTocado(true);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(desde + marca.length, desde + marca.length); });
  };

  // ── 3 · Mandar ───────────────────────────────────────────────────────────
  const [nombre, setNombre] = useState('');
  const [nombreTocado, setNombreTocado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const crear = useCrearCampanaRapida();
  const prueba = useEnviarPrueba();

  useEffect(() => {
    if (!nombreTocado && calculo?.nombre_sugerido) setNombre(calculo.nombre_sugerido);
  }, [calculo?.nombre_sugerido, nombreTocado]);

  const muestra = calculo?.muestra ?? null;
  const plan = calculo?.plan;
  const salen = calculo?.salen ?? 0;
  const graves = (muestra?.avisos ?? []).filter(a => a.grave);
  const puedeGuardar = salen > 0 && !!asunto.trim() && !!cuerpo.trim() && !!nombre.trim() && graves.length === 0;

  const guardar = (enviar: boolean) => crear.mutate({ ...quienes, ...mensaje, nombre, enviar }, {
    onSuccess: c => {
      toast.success(enviar
        ? `Campaña en marcha: ${mails(c.progreso?.en_cola ?? salen)} en la cola`
        : 'Campaña guardada. Cuando haya una casilla, la mandás desde la pestaña Campañas.');
      onCreada?.();
      onClose();
    },
    onError: e => { setConfirmando(false); toast.error(extractError(e)); },
  });

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl gap-5 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nueva campaña</DialogTitle>
          <DialogDescription>
            Elegí a quiénes, revisá el mensaje y mandala. Los mails salen de a poco, en horario de oficina.
          </DialogDescription>
        </DialogHeader>

        {/* ── 1 · Quiénes ─────────────────────────────────────────────── */}
        <Bloque numero={1} titulo="Quiénes">
          <div className="flex flex-wrap gap-2">
            {vieneConSeleccion && (
              <Chip activo={usarSeleccion} onClick={() => setUsarSeleccion(true)}>
                Lo que elegiste en la tabla ({n(cantidadSeleccionada ?? 0)})
              </Chip>
            )}
            <Chip activo={!usarSeleccion && !segmento && !ciudad && !soloNunca}
              onClick={() => { setUsarSeleccion(false); setSegmento(''); setCiudad(''); setSoloNunca(false); }}>
              Todos los que tienen mail ({audiencias ? n(audiencias.todos) : '…'})
            </Chip>
            <Chip activo={!usarSeleccion && soloNunca}
              onClick={() => { setUsarSeleccion(false); setSoloNunca(v => usarSeleccion ? true : !v); }}>
              Los que nunca contactamos ({audiencias ? n(audiencias.nunca_contactados) : '…'})
            </Chip>
          </div>

          {(audiencias?.segmentos.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Por rubro</p>
              <div className="flex flex-wrap gap-1.5">
                {audiencias!.segmentos.map(s => (
                  <Chip key={s.segmento} chico activo={!usarSeleccion && segmento === s.segmento}
                    onClick={() => { setUsarSeleccion(false); setSegmento(segmento === s.segmento ? '' : s.segmento); }}>
                    {s.segmento} ({n(s.cantidad)})
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {(audiencias?.ciudades.length ?? 0) > 1 && (
            <label className="mt-3 flex max-w-xs flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Por ciudad</span>
              <select value={usarSeleccion ? '' : ciudad} className="input-base" aria-label="Ciudad"
                onChange={e => { setUsarSeleccion(false); setCiudad(e.target.value); }}>
                <option value="">Todas</option>
                {audiencias!.ciudades.map(c => (
                  <option key={c.ciudad} value={c.ciudad}>{c.ciudad} ({n(c.cantidad)})</option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-3 rounded-lg bg-muted p-3 text-sm" aria-live="polite">
            {!calculo ? <span className="text-muted-foreground">Contando…</span> : (
              <>
                <p className="text-foreground">
                  Le sale a <strong data-testid="salen">{n(salen)}</strong> {salen === 1 ? 'empresa' : 'empresas'}
                  {isFetching && <span className="text-muted-foreground"> · actualizando…</span>}
                </p>
                {Object.keys(calculo.no_salen).length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <li className="font-medium">A {n(calculo.total - salen)} no se les escribe:</li>
                    {Object.entries(calculo.no_salen).map(([motivo, cuantos]) => (
                      <li key={motivo}>· {n(cuantos)} — {motivo}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </Bloque>

        {/* ── 2 · Mensaje ─────────────────────────────────────────────── */}
        <Bloque numero={2} titulo="Mensaje">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Plantilla">
            {(catalogo?.plantillas ?? []).map(p => (
              <Chip key={p.id} chico activo={plantillaId === p.id} onClick={() => aplicarPlantilla(p)}
                title={p.descripcion}>
                {p.nombre}
                {calculo?.plantilla_sugerida === p.id && <span className="ml-1 opacity-70">· sugerida</span>}
              </Chip>
            ))}
          </div>
          {plantilla && <p className="mt-1.5 text-xs text-muted-foreground">{plantilla.descripcion}</p>}

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {/* El editor */}
            <div className="space-y-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Asunto</span>
                <input value={asunto} className="input-base" aria-label="Asunto"
                  onChange={e => { setAsunto(e.target.value); setTocado(true); }} />
              </label>
              {plantilla && plantilla.asuntos.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {plantilla.asuntos.filter(a => a !== asunto).map(a => (
                    <button key={a} type="button" onClick={() => setAsunto(a)}
                      className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
                      {a}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Mensaje</span>
                <Textarea ref={cuerpoRef} value={cuerpo} rows={14} aria-label="Mensaje"
                  className="font-mono text-xs leading-relaxed"
                  onChange={e => { setCuerpo(e.target.value); setTocado(true); }} />
              </label>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Insertar:</span>
                {(catalogo?.variables ?? []).map(v => (
                  <button key={v.nombre} type="button" title={v.ayuda} onClick={() => insertar(v.nombre)}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-ubicar-primary/10">
                    {`{{${v.nombre}}}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Lo que va entre <code>[[ ]]</code> desaparece solo si a esa empresa le falta el dato.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Firma</span>
                  <input value={firmaNombre} onChange={e => setFirmaNombre(e.target.value)}
                    placeholder="Franco" className="input-base" aria-label="Firma" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">WhatsApp de la firma</span>
                  <input value={firmaTelefono} onChange={e => setFirmaTelefono(e.target.value)}
                    className="input-base" aria-label="WhatsApp de la firma" />
                </label>
              </div>

              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={conSegundo} onChange={e => setConSegundo(e.target.checked)}
                    className="h-4 w-4 accent-primary" />
                  Sumar seguimiento a los 5 días
                </label>
                <label className={cn('mt-1.5 flex items-center gap-2 text-sm', !conSegundo && 'opacity-50')}>
                  <input type="checkbox" checked={conSegundo && conTercero} disabled={!conSegundo}
                    onChange={e => setConTercero(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Y un último a los 12 días
                </label>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Ya están escritos. Salen solos, y sólo si la empresa no respondió ni se dio de baja.
                  {conSegundo && (
                    <button type="button" className="ml-1 text-ubicar-primary underline"
                      onClick={() => setVerSeguimientos(v => !v)}>
                      {verSeguimientos ? 'Ocultar' : 'Ver o editar'}
                    </button>
                  )}
                </p>
                {conSegundo && verSeguimientos && (
                  <div className="mt-2 space-y-2">
                    <Textarea value={segundo} rows={6} aria-label="Seguimiento a los 5 días"
                      className="font-mono text-xs" onChange={e => { setSegundo(e.target.value); setTocado(true); }} />
                    {conTercero && (
                      <Textarea value={tercero} rows={6} aria-label="Seguimiento a los 12 días"
                        className="font-mono text-xs" onChange={e => { setTercero(e.target.value); setTocado(true); }} />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* La vista previa */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Así le llega a {muestra ? <strong className="text-foreground">{muestra.prospecto.nombre}</strong> : '…'}
                </p>
                {muestra && muestra.de > 1 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Empresa anterior"
                      onClick={() => setIndice(i => (i - 1 + muestra.de) % muestra.de)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {muestra.indice + 1} de {n(muestra.de)}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Empresa siguiente"
                      onClick={() => setIndice(i => (i + 1) % muestra.de)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </div>

              {muestra ? (
                <div className="rounded-lg border border-border bg-white" data-testid="vista-previa">
                  <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                    <p>Para: <span className="text-foreground">{muestra.prospecto.email}</span></p>
                    <p>Asunto: <strong className="text-foreground">{muestra.asunto || '—'}</strong></p>
                  </div>
                  <pre className="max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-3 font-sans text-sm leading-relaxed text-foreground">
                    {muestra.cuerpo || 'Elegí una plantilla.'}
                  </pre>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {calculo ? 'No hay ninguna empresa a la que mandarle: cambiá la audiencia.' : 'Armando la vista previa…'}
                </div>
              )}

              {muestra?.prospecto.notas && (
                <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Nota interna (no va en el mail):</strong> {muestra.prospecto.notas}
                  </span>
                </p>
              )}
              {(muestra?.faltantes.length ?? 0) > 0 && (
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                  A esta empresa le falta: {muestra!.faltantes.map(f => `{{${f}}}`).join(', ')}. En el mail ese lugar queda vacío.
                </p>
              )}
              {(muestra?.avisos ?? []).map(a => (
                <p key={a.texto} role={a.grave ? 'alert' : undefined}
                  className={cn('flex gap-2 rounded-lg p-2.5 text-xs',
                    a.grave ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.texto}
                </p>
              ))}
              {(muestra?.seguimientos.length ?? 0) > 0 && (
                <details className="rounded-lg border border-border text-xs">
                  <summary className="cursor-pointer px-3 py-2 text-muted-foreground">
                    Ver {muestra!.seguimientos.length === 1 ? 'el seguimiento' : 'los seguimientos'}
                  </summary>
                  {muestra!.seguimientos.map(s => (
                    <div key={s.dias} className="border-t border-border px-3 py-2">
                      <p className="mb-1 font-medium text-muted-foreground">A los {s.dias} días · {s.asunto}</p>
                      <pre className="whitespace-pre-wrap break-words font-sans text-foreground">{s.cuerpo}</pre>
                    </div>
                  ))}
                </details>
              )}
            </div>
          </div>
        </Bloque>

        {/* ── 3 · Mandar ──────────────────────────────────────────────── */}
        <Bloque numero={3} titulo="Mandar">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <label className="flex max-w-sm flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Nombre de la campaña</span>
                <input value={nombre} className="input-base" aria-label="Nombre de la campaña"
                  onChange={e => { setNombre(e.target.value); setNombreTocado(true); }} />
              </label>

              {plan && plan.listo && (
                <p className="text-sm text-foreground" data-testid="resumen-envio">
                  Salen <strong>{mails(salen)}</strong> desde {plan.casillas_activas}{' '}
                  {plan.casillas_activas === 1 ? 'casilla' : 'casillas'}
                  {plan.por_dia > 0 && <>, unos {n(plan.por_dia)} por día</>}
                  {plan.termina_texto && <>: termina <strong>{plan.termina_texto}</strong></>}.
                  {seguimientos.length > 0 && (
                    <span className="text-muted-foreground"> Después, {seguimientos.length === 1
                      ? 'el seguimiento' : 'los seguimientos'} a quien no haya respondido.</span>
                  )}
                </p>
              )}
              {plan?.listo && plan.simulado && (
                <p className="text-xs text-amber-700">
                  Entorno de prueba: los mails quedan registrados pero no salen de verdad.
                </p>
              )}
              {plan?.listo && plan.solo_a.length > 0 && (
                <p className="text-xs text-amber-700">
                  Modo prueba: sólo salen de verdad los mails a {plan.solo_a.join(', ')}.
                </p>
              )}
              {plan && !plan.listo && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-[200px] flex-1">
                    <strong>Todavía no se puede enviar.</strong> {plan.motivo} Podés dejar la campaña
                    guardada y mandarla después con un clic.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => { onClose(); onIrACasillas(); }}>
                    <Settings className="h-4 w-4" /> Configurar casillas
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button variant="outline" disabled={!muestra || graves.length > 0 || prueba.isPending}
                onClick={() => prueba.mutate({ ...mensaje, prospecto_id: muestra?.prospecto.id }, {
                  onSuccess: r => toast.success(r.simulado
                    ? 'Prueba simulada: en este entorno no salen mails.'
                    : `Te la mandamos a ${r.para}`),
                  onError: e => toast.error(extractError(e)),
                })}>
                <MailCheck className="h-4 w-4" /> {prueba.isPending ? 'Mandando…' : 'Enviarme una prueba'}
              </Button>
              {plan && !plan.listo ? (
                <Button disabled={!puedeGuardar || crear.isPending} onClick={() => guardar(false)}>
                  {crear.isPending ? 'Guardando…' : 'Guardar lista para enviar'}
                </Button>
              ) : (
                <Button disabled={!puedeGuardar || !plan || crear.isPending} onClick={() => setConfirmando(true)}>
                  <Send className="h-4 w-4" /> Enviar{salen > 0 ? ` a ${n(salen)}` : ''}
                </Button>
              )}
            </div>
          </div>
        </Bloque>

        <ConfirmDialog
          open={confirmando} onOpenChange={setConfirmando}
          title={`¿Mandar ${mails(salen)}?`}
          description={`La campaña «${nombre}» le va a escribir a ${n(salen)} ${salen === 1 ? 'empresa' : 'empresas'}. `
            + 'Salen de a poco, en días hábiles y horario de oficina. La podés pausar o cancelar cuando quieras.'}
          confirmLabel={`Sí, enviar ${mails(salen)}`}
          loading={crear.isPending}
          onConfirm={() => guardar(true)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Bloque({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-xl border border-border p-3 sm:p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ubicar-primary text-xs font-bold text-white">
          {numero}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Chip({ activo, chico, onClick, title, children }: {
  activo: boolean; chico?: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={activo}
      className={cn(
        'rounded-full border font-medium transition-colors',
        chico ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        activo
          ? 'border-ubicar-primary bg-ubicar-primary text-white'
          : 'border-border bg-white text-foreground hover:bg-muted',
      )}>
      {children}
    </button>
  );
}
