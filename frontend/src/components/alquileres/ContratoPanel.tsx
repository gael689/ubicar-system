import { useRef, useState } from 'react';
import {
  FileText, Download, PenLine, Ban, AlertTriangle, Link2, Copy, Check,
  MessageCircle, Upload, Paperclip, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import {
  useContratoDeReserva, usePrepararContrato, useCrearContrato,
  useFirmarContrato, useAnularContrato, descargarPdfContrato,
  useGenerarLinkFirma, useRevocarLinkFirma, useSubirEscaneoContrato,
  verEscaneoContrato, contratoYaFirmado, type LinkFirma,
} from '@/hooks/useContratos';
import { usePagareDeReserva, usePrepararPagare, useCrearPagare } from '@/hooks/usePagares';
import { LienzoFirma } from '@/components/shared/LienzoFirma';
import { PagarePanel, FormPagare, datosInicialesPagare, type DatosPagare } from './PagarePanel';
import { api } from '@/lib/api';
import { extractError, formatCurrency, formatDate, sinRespuesta } from '@/lib/utils';
import type { Contrato, Pagare, PersonaPagare } from '@/types';

interface Props {
  reservaId: number;
  /** `true` si el auto todavía no salió: cambia el texto, no la función. */
  antesDeEntregar?: boolean;
}

/**
 * Contrato de una reserva: generar, firmar, descargar y anular.
 *
 * **Cuelga de la reserva, no del alquiler.** Se puede emitir apenas se acuerda
 * el alquiler, que es cuando hay tiempo de leerlo y corregirlo — antes se
 * emitía recién en el check-out, con el cliente esperando en la puerta.
 *
 * El anverso se precarga desde el sistema y **es editable**: lo que el
 * operador corrige es lo que se congela en el snapshot. Por eso la vista
 * previa muestra los datos ya resueltos y no los recalcula al vuelo.
 */
export function ContratoPanel({ reservaId, antesDeEntregar = false }: Props) {
  const { data: contrato, isLoading } = useContratoDeReserva(reservaId);
  const { data: preparado } = usePrepararContrato(reservaId, !contrato && !isLoading);
  const crear = useCrearContrato();
  const anular = useAnularContrato();
  // ── El pagaré ───────────────────────────────────────────────────────
  // Documento aparte, que viaja en el mismo link y se firma con la misma
  // firma. Ver `PagarePanel` y `docs/PAGARE.md`.
  const { data: pagare } = usePagareDeReserva(reservaId);
  const { data: pagarePreparado } = usePrepararPagare(reservaId, !contrato && !isLoading);
  const crearPagare = useCrearPagare();
  const [conPagare, setConPagare] = useState(true);
  const [datosPagare, setDatosPagare] = useState<DatosPagare | null>(null);

  const [firmando, setFirmando] = useState(false);
  const [anulando, setAnulando] = useState(false);

  if (isLoading) return <Card className="p-5 text-sm text-muted-foreground">Cargando contrato…</Card>;

  // ── Todavía no hay contrato: se ofrece generarlo ────────────────────────
  if (!contrato) {
    return (
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Contrato</h3>
        </div>

        {preparado?.falta_datos_fiscales && (
          <div className="flex gap-2 rounded-lg bg-warning px-3 py-2 text-white">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs">
              Faltan los datos fiscales del locador (CUIT, razón social). El contrato se puede
              generar igual, pero sale marcado como <strong>documento provisorio</strong>.
              Se cargan en Configuración → Empresa.
            </p>
          </div>
        )}

        {antesDeEntregar && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            El auto todavía no salió, así que el <strong>kilometraje y el combustible de
            salida</strong> se imprimen en blanco para completar al entregar. Emitirlo
            ahora da tiempo a revisarlo y a que el cliente lo lea antes.
          </p>
        )}

        {preparado && <ResumenAnverso snapshot={preparado.snapshot} />}

        {/* ── Pagaré, abajo del contrato ─────────────────────────────
            Se genera en el mismo click y comparte el link. Si faltan las
            tasas en Configuración, se avisa acá y el contrato sale solo. */}
        {pagarePreparado && (
          <div className="rounded-xl border border-border p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={conPagare && pagarePreparado.faltantes.length === 0}
                disabled={pagarePreparado.faltantes.length > 0}
                onChange={e => setConPagare(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Generar también el pagaré
              <span className="text-xs font-normal text-muted-foreground">— mismo link, misma firma</span>
            </label>
            {(conPagare || pagarePreparado.faltantes.length > 0) && (
              <FormPagare
                preparado={pagarePreparado}
                datos={datosPagare ?? datosInicialesPagare(pagarePreparado)}
                onCambiar={setDatosPagare}
              />
            )}
          </div>
        )}

        <Button
          size="sm"
          disabled={!preparado || crear.isPending || crearPagare.isPending}
          onClick={() => {
            if (!preparado) return;
            const incluirPagare = conPagare && !!pagarePreparado && pagarePreparado.faltantes.length === 0;
            const dp = datosPagare ?? datosInicialesPagare(pagarePreparado);
            crear.mutate(
              { reserva_id: reservaId, snapshot: preparado.snapshot },
              {
                onSuccess: () => {
                  if (!incluirPagare) return;
                  crearPagare.mutate(
                    { reserva_id: reservaId, monto: parseFloat(dp.monto), codeudores: dp.codeudores },
                    {
                      // El contrato ya quedó: el pagaré se puede reintentar
                      // desde el bloque que aparece abajo del contrato.
                      onError: e => toast.error(`El contrato se generó, pero el pagaré no: ${extractError(e)}`),
                    },
                  );
                },
              },
            );
          }}
        >
          {crear.isPending || crearPagare.isPending
            ? 'Generando…'
            : conPagare && pagarePreparado?.faltantes.length === 0 ? 'Generar contrato y pagaré' : 'Generar contrato'}
        </Button>
      </Card>
    );
  }

  const pagarePendiente = !!pagare && !pagare.firmado && !pagare.anulado;
  const faltaFirmar = !contrato.anulado && (!contrato.firmado || pagarePendiente);

  // ── Contrato emitido ────────────────────────────────────────────────────
  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">
                Contrato {contrato.numero_formateado}
              </h3>
              <p className="text-xs text-muted-foreground">
                Emitido el {formatDate(contrato.fecha_generacion)}
              </p>
            </div>
          </div>

          {contrato.anulado ? (
            <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-semibold text-white">
              Anulado
            </span>
          ) : contrato.firmado ? (
            <span className="rounded-md bg-success px-2 py-0.5 text-xs font-semibold text-white">
              Firmado
            </span>
          ) : (
            <span className="rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white">
              Sin firmar
            </span>
          )}
        </div>

        {contrato.firmado && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Firmó {contrato.firmado_por_nombre} · DNI {contrato.firmado_por_dni}
              {contrato.firmado_at && ` · ${formatDate(contrato.firmado_at)}`}
              {/* Con qué medio importa: si dice "en papel" y no hay imagen, el
                  original firmado está en un cajón y no es un error. */}
              {contrato.firma_medio === 'papel' && ' · en papel'}
              {contrato.firma_medio === 'pantalla' && ' · en pantalla'}
              {contrato.firma_medio === 'link' && ' · desde el link'}
            </p>
            {contrato.firma_medio === 'link' && (
              <p className="text-[11px] text-muted-foreground">
                Aceptó {contrato.firma_aceptaciones?.length ?? 0} declaraciones
                {contrato.firma_ip && ` · desde ${contrato.firma_ip}`}
              </p>
            )}
          </div>
        )}
        {contrato.anulado && contrato.motivo_anulacion && (
          <p className="text-xs text-muted-foreground">Motivo: {contrato.motivo_anulacion}</p>
        )}

        {contrato.snapshot && <ResumenAnverso snapshot={contrato.snapshot} />}

        {faltaFirmar && <BloqueFirma contrato={contrato} pagare={pagarePendiente ? pagare! : null} />}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => descargarPdfContrato(contrato)}>
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>
          {faltaFirmar && (
            <Button size="sm" onClick={() => setFirmando(true)}>
              <PenLine className="h-4 w-4" />
              {contrato.firmado ? 'Firmar el pagaré en el mostrador' : 'Firmar en el mostrador'}
            </Button>
          )}
          {!contrato.anulado && (
            <Button size="sm" variant="ghost" onClick={() => setAnulando(true)}>
              <Ban className="h-4 w-4" /> Anular
            </Button>
          )}
        </div>

        {/* El papel firmado se puede adjuntar aunque el contrato ya esté
            marcado como firmado: el orden natural es marcar y después subir,
            o al revés, y forzar una secuencia sólo agrega clics. */}
        {!contrato.anulado && <AdjuntarPapel contrato={contrato} />}

        {!contrato.anulado && <PagarePanel reservaId={reservaId} />}
      </Card>

      {firmando && (
        <FirmaDialog
          contratoId={contrato.id}
          reservaId={reservaId}
          firmaContrato={!contrato.firmado}
          pagare={pagarePendiente ? pagare! : null}
          onClose={() => setFirmando(false)}
        />
      )}

      <MotivoDialog
        open={anulando}
        onOpenChange={setAnulando}
        title="Anular contrato"
        description="El contrato no se borra: queda registrado como anulado con su motivo."
        confirmLabel="Anular"
        destructive
        loading={anular.isPending}
        onConfirm={motivo => {
          anular.mutate({ id: contrato.id, motivo }, { onSuccess: () => setAnulando(false) });
        }}
      />
    </>
  );
}

// ─── Los tres caminos para firmar ────────────────────────────────────────────

/**
 * El link es **el camino principal**: el cliente lee el contrato entero con
 * calma en su teléfono, tilda las declaraciones y firma. Nadie tiene que
 * imprimir nada ni resolverlo con el auto en la puerta.
 *
 * Los otros dos —papel y mostrador— siguen estando y se ofrecen abajo. No es
 * redundancia: hay clientes sin teléfono a mano, y hay veces que el papel
 * firmado es lo que pide la otra parte.
 */
function BloqueFirma({ contrato, pagare }: { contrato: Contrato; pagare: Pagare | null }) {
  const generar = useGenerarLinkFirma();
  const revocar = useRevocarLinkFirma();
  const [link, setLink] = useState<LinkFirma | null>(
    contrato.link_prellenado
      ? { url: contrato.link_prellenado, expira: contrato.firma_token_expira ?? null, mensaje: '' }
      : null
  );
  const [copiado, setCopiado] = useState<'url' | 'mensaje' | null>(null);

  // El teléfono sale del snapshot, que es el que se congeló al emitir: es el
  // número con el que se acordó este alquiler.
  //
  // `wa.me` quiere sólo dígitos — los números argentinos se cargan de mil
  // formas ("+54 9 291 418-0554", "0291 15 418-0554") y no se intenta
  // adivinar el formato, se limpia lo que no sea dígito. Mismo criterio que
  // `PanelResolverReserva` y la ficha del cliente.
  const telefono = String(contrato.snapshot?.cliente?.telefono ?? '');
  const digitos = telefono.replace(/\D/g, '');
  // Cuando el link ya venía puesto (`link_prellenado` de una sesión anterior),
  // el backend no vuelve a armar el texto: acá se arma uno equivalente, para
  // que el botón no dependa de haber apretado "Generar" en esta misma pantalla.
  const mensajeWhatsapp = link
    ? link.mensaje || (pagare
      ? `Te paso ${contrato.firmado ? 'el pagaré para que lo leas y lo firmes' : 'el contrato de alquiler y el pagaré para que los leas y los firmes'} desde el celular:\n\n${link.url}`
      : `Te paso el contrato de alquiler para que lo leas y lo firmes desde el celular:\n\n${link.url}`)
    : '';
  // **El link se abre, no se manda solo.** WhatsApp quema números por
  // automatizar el envío: esto deja el chat abierto con el texto escrito y
  // quien atiende aprieta enviar.
  const urlWhatsapp = digitos.length >= 8
    ? `https://wa.me/${digitos}?text=${encodeURIComponent(mensajeWhatsapp)}`
    : null;

  async function copiar(texto: string, cual: 'url' | 'mensaje') {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error('No se pudo copiar. Seleccioná el texto a mano.');
    }
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          {pagare && contrato.firmado ? 'Que firme el pagaré' : pagare ? 'Que firme el contrato y el pagaré' : 'Que lo firme el cliente'}
        </p>
      </div>

      {!link ? (
        <>
          <p className="text-xs text-muted-foreground">
            Genera un link para mandarle por WhatsApp. El cliente lee el contrato completo,
            acepta las condiciones y firma desde el celular.
            {pagare && ' En el mismo link, abajo del contrato, está el pagaré: una sola firma vale para los dos.'}
            {' '}Cuando firma,{' '}
            <strong className="text-foreground">nos llega el aviso con el PDF firmado</strong>.
          </p>
          <Button
            size="sm"
            disabled={generar.isPending}
            onClick={() =>
              generar.mutate(contrato.id, {
                onSuccess: setLink,
                onError: e => toast.error(extractError(e)),
              })
            }
          >
            <Link2 className="h-4 w-4" />
            {generar.isPending ? 'Generando…' : 'Generar link de firma'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {link.url}
            </code>
            <Button size="sm" variant="ghost" onClick={() => copiar(link.url, 'url')}>
              {copiado === 'url' ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {link.expira && (
            <p className="text-[11px] text-muted-foreground">
              Vence el {formatDate(link.expira)}. Después se genera uno nuevo.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {urlWhatsapp ? (
              <Button size="sm" asChild>
                <a href={urlWhatsapp} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Mandar por WhatsApp a {telefono}
                </a>
              </Button>
            ) : (
              <p className="w-full text-[11px] text-muted-foreground">
                El cliente no tiene teléfono cargado: copiá el link y mandáselo a mano.
              </p>
            )}
            {mensajeWhatsapp && (
              <Button size="sm" variant="secondary" onClick={() => copiar(mensajeWhatsapp, 'mensaje')}>
                {copiado === 'mensaje' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copiar mensaje
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={revocar.isPending}
              onClick={() =>
                revocar.mutate(contrato.id, {
                  onSuccess: () => { setLink(null); toast.success('Link revocado'); },
                })
              }
            >
              <X className="h-3.5 w-3.5" /> Revocar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * El camino en papel, completo.
 *
 * Marcar "firmado en papel" ya se podía; lo que faltaba era el ejemplar con la
 * firma. Sin él, el sistema afirmaba que había un contrato firmado y no tenía
 * con qué respaldarlo: el papel vivía en una carpeta.
 */
function AdjuntarPapel({ contrato }: { contrato: Contrato }) {
  const subir = useSubirEscaneoContrato();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const archivo = e.target.files?.[0];
          e.target.value = '';   // permite volver a elegir el mismo archivo
          if (!archivo) return;
          subir.mutate(
            { id: contrato.id, archivo },
            {
              onSuccess: () => toast.success('Contrato firmado adjuntado'),
              onError: err => toast.error(extractError(err)),
            }
          );
        }}
      />
      <Button size="sm" variant="ghost" disabled={subir.isPending} onClick={() => input.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        {subir.isPending
          ? 'Subiendo…'
          : contrato.tiene_escaneo ? 'Reemplazar el papel firmado' : 'Subir el firmado en papel'}
      </Button>
      {contrato.tiene_escaneo && (
        <Button size="sm" variant="ghost" onClick={() => verEscaneoContrato(contrato)}>
          <Paperclip className="h-3.5 w-3.5" /> Ver el papel adjuntado
        </Button>
      )}
    </div>
  );
}

// ─── Vista previa del anverso ────────────────────────────────────────────────

function ResumenAnverso({ snapshot }: { snapshot: NonNullable<import('@/types').Contrato['snapshot']> }) {
  const { cargos, coberturas, vehiculo, servicio } = snapshot;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <Dato etiqueta="Vehículo" valor={`${vehiculo.descripcion ?? '—'} · ${vehiculo.patente ?? ''}`} />
        <Dato etiqueta="Km de salida" valor={`${servicio.check_out_km ?? '—'} km`} />
        <Dato etiqueta="Retiro" valor={`${servicio.check_out_fecha ?? ''} ${servicio.check_out_hora ?? ''}`} />
        <Dato etiqueta="Devolución" valor={`${servicio.check_in_fecha ?? ''} ${servicio.check_in_hora ?? ''}`} />
      </div>

      <div className="border-t border-border pt-2 space-y-1">
        {cargos.lineas.map((l, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-muted-foreground">
              {l.concepto} {l.cantidad > 1 && `× ${l.cantidad}`}
            </span>
            <span className="tabular-nums">{formatCurrency(l.total)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          {/* "Valor estimado" y no "total": al firmar el auto todavía no volvió. */}
          <span>Valor estimado</span>
          <span className="tabular-nums">{formatCurrency(cargos.valor_estimado)}</span>
        </div>
      </div>

      <div className="border-t border-border pt-2">
        <p className="font-semibold text-foreground">
          Franquicia: {formatCurrency(coberturas.franquicia)}
        </p>
        {coberturas.contratadas.map(c => (
          <p key={c.nombre} className="text-muted-foreground">Cobertura: {c.nombre}</p>
        ))}
        {coberturas.rechazadas.length > 0 && (
          <p className="text-muted-foreground">
            Rechaza: {coberturas.rechazadas.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{etiqueta}: </span>
      <span className="font-medium text-foreground">{valor}</span>
    </div>
  );
}

// ─── Canvas de firma ─────────────────────────────────────────────────────────

type Medio = 'pantalla' | 'papel';

/**
 * ¿Quedó todo firmado del lado del servidor? Para cuando el POST no volvió.
 * Con pagaré, "firmado" es los dos documentos, no sólo el contrato.
 */
async function todoFirmado(contratoId: number, reservaId: number, conPagare: boolean): Promise<boolean> {
  if (!(await contratoYaFirmado(contratoId))) return false;
  if (!conPagare) return true;
  try {
    const res = await api.get<{ data: Pagare[] }>('/pagares', { params: { reserva_id: reservaId } });
    return res.data.data.some(p => !p.anulado && p.firmado);
  } catch {
    return false;
  }
}

/**
 * Las dos formas reales de firmar, explícitas.
 *
 * En papel ya funcionaba —bastaba con confirmar sin dibujar nada— pero nada lo
 * decía, así que en la práctica no existía. Y sin registrar el medio, un
 * contrato firmado con lapicera y uno marcado por error se veían idénticos.
 *
 * **Con pagaré, la misma firma vale para los dos documentos**, y cada
 * co-deudor firma en su propio recuadro. El backend no firma ninguno si falta
 * la firma de un co-deudor: el acto es uno.
 */
function FirmaDialog({
  contratoId, reservaId, firmaContrato, pagare, onClose,
}: {
  contratoId: number;
  reservaId: number;
  /** `false` si el contrato ya estaba firmado y lo que falta es el pagaré. */
  firmaContrato: boolean;
  pagare: Pagare | null;
  onClose: () => void;
}) {
  const codeudores: PersonaPagare[] = pagare?.snapshot.codeudores ?? [];
  const [firma, setFirma] = useState<string | null>(null);
  const [firmasCod, setFirmasCod] = useState<(string | null)[]>(() => codeudores.map(() => null));
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [medio, setMedio] = useState<Medio>('pantalla');
  const firmar = useFirmarContrato();

  const faltanCodeudores = medio === 'pantalla' && firmasCod.some(f => !f);
  const titulo = firmaContrato && pagare ? 'Firmar contrato y pagaré' : pagare ? 'Firmar el pagaré' : 'Firmar contrato';

  const confirmar = () => {
    if (!nombre.trim() || !dni.trim() || faltanCodeudores) return;
    firmar.mutate(
      {
        id: contratoId,
        nombre: nombre.trim(),
        dni: dni.trim(),
        firma_medio: medio,
        // En papel nunca se manda trazo aunque haya quedado dibujado antes de
        // cambiar de opción: el original es el papel.
        firma_base64: medio === 'pantalla' ? firma : null,
        codeudores: medio === 'pantalla' ? firmasCod.map(f => ({ firma_base64: f })) : [],
      },
      {
        onSuccess: onClose,
        onError: async err => {
          // El toast del hook ya avisó. Lo que falta es el caso en que el
          // pedido llegó y la respuesta no: el trazo va como imagen y desde un
          // celular la conexión se corta justo ahí. Antes de dejar a alguien
          // firmando de nuevo, se pregunta cómo quedó.
          if (!sinRespuesta(err)) return;
          if (await todoFirmado(contratoId, reservaId, !!pagare)) {
            toast.success('La firma sí había quedado registrada.');
            onClose();
          }
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-background p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">{titulo}</h3>
          <p className="text-xs text-muted-foreground">
            Firma manuscrita del cliente. Quien firma puede no ser el titular de la reserva.
            {pagare && firmaContrato && ' La misma firma queda en el contrato y en el pagaré.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            ['pantalla', 'Firma en pantalla', 'Con el dedo o el mouse'],
            ['papel', 'Firmó en papel', 'Se imprimió y firmó a mano'],
          ] as const).map(([valor, tituloMedio, ayuda]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setMedio(valor)}
              aria-pressed={medio === valor}
              className={`rounded-lg border p-2.5 text-left transition-colors ${
                medio === valor
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-medium text-foreground">{tituloMedio}</p>
              <p className="text-xs text-muted-foreground">{ayuda}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Nombre de quien firma *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className="input-base" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">DNI *</label>
            <input value={dni} onChange={e => setDni(e.target.value)} className="input-base" />
          </div>
        </div>

        {medio === 'papel' ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            El <strong className="text-foreground">papel firmado es el original</strong> y hay
            que archivarlo{pagare ? ' (el del pagaré, con más razón: es el que se presenta al cobro)' : ''}.
            Acá sólo queda la constancia de quién firmó y cuándo: el PDF que se reimprima desde el
            sistema va a decir que se firmó en papel, sin la imagen de la firma.
          </p>
        ) : (
          <div className="space-y-3">
            <LienzoFirma onCambiar={setFirma} etiqueta={pagare ? 'Firma del cliente (deudor)' : 'Firma'} />
            {codeudores.map((c, i) => (
              <LienzoFirma
                key={i}
                etiqueta={`Firma del co-deudor: ${c.nombre} (DNI ${c.dni}) *`}
                onCambiar={f => setFirmasCod(prev => prev.map((x, j) => (j === i ? f : x)))}
              />
            ))}
          </div>
        )}

        {faltanCodeudores && (
          <p className="text-xs text-muted-foreground">
            Falta la firma de {codeudores.filter((_, i) => !firmasCod[i]).map(c => c.nombre).join(', ')}.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            type="button"
            size="sm"
            disabled={!nombre.trim() || !dni.trim() || faltanCodeudores || firmar.isPending}
            onClick={confirmar}
          >
            {firmar.isPending
              ? 'Guardando…'
              : medio === 'papel' ? 'Marcar como firmado' : 'Confirmar firma'}
          </Button>
        </div>
      </div>
    </div>
  );
}
