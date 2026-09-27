import { useRef, useState } from 'react';
import {
  ScrollText, Download, Ban, AlertTriangle, Plus, X, Upload, Paperclip, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { InputMoneda } from '@/components/shared/InputMoneda';
import {
  usePagareDeReserva, usePrepararPagare, useCrearPagare, useAnularPagare,
  useSubirEscaneoPagare, descargarPdfPagare, verEscaneoPagare, type PagareNuevo,
} from '@/hooks/usePagares';
import { extractError, formatDate, irAlError } from '@/lib/utils';
import type { DeudorPosible, PagarePreparado, PersonaPagare, TipoDeudor } from '@/types';

/** Lo que el operador decide al emitir: el monto, quién es el deudor y quiénes firman con él. */
export interface DatosPagare {
  monto: number | '';
  codeudores: PersonaPagare[];
  /**
   * Quién firma como deudor: `cliente`, `representante` o `conductor:<id>`.
   * Vacío = todavía no se eligió, que para una empresa no deja emitir.
   */
  deudor: string;
}

export function datosInicialesPagare(p: PagarePreparado | undefined): DatosPagare {
  return {
    monto: p ? Math.round(p.monto_sugerido) : '',
    codeudores: [],
    // Un particular firma él mismo. Una empresa tiene que elegir: la empresa,
    // su representante o un conductor son obligados distintos.
    deudor: p?.requiere_elegir_deudor ? '' : 'cliente',
  };
}

const claveDeudor = (d: DeudorPosible) => (d.tipo === 'conductor' ? `conductor:${d.conductor_id}` : d.tipo);

/** "CUIT" o "DNI". Los pagarés viejos no traen el tipo: se deduce de los dígitos. */
export function etiquetaDocumento(p: Pick<PersonaPagare, 'dni' | 'tipo_documento'>): 'CUIT' | 'DNI' {
  return p.tipo_documento ?? ((p.dni || '').replace(/\D/g, '').length === 11 ? 'CUIT' : 'DNI');
}

/** El deudor elegido entre los posibles, o `null` si falta elegirlo. */
export function deudorElegido(preparado: PagarePreparado | undefined, datos: DatosPagare): DeudorPosible | null {
  if (!preparado?.deudores_posibles?.length) return null;
  return preparado.deudores_posibles.find(d => claveDeudor(d) === datos.deudor) ?? null;
}

/** Lo que viaja a `POST /pagares`. El deudor va como *quién*, no con sus datos. */
export function payloadPagare(reservaId: number, datos: DatosPagare): PagareNuevo {
  const [tipo, id] = (datos.deudor || 'cliente').split(':');
  return {
    reserva_id: reservaId,
    monto: Number(datos.monto),
    codeudores: datos.codeudores,
    deudor: { tipo: tipo as TipoDeudor, conductor_id: id ? Number(id) : null },
  };
}

/** ¿Se puede emitir con esto? Devuelve el motivo si no. */
export function faltaParaEmitir(preparado: PagarePreparado | undefined, datos: DatosPagare): string | null {
  if (!(Number(datos.monto) > 0)) return 'Falta el monto de la franquicia.';
  if (preparado?.deudores_posibles?.length && !deudorElegido(preparado, datos)) {
    return 'Elegí quién firma la franquicia como deudor.';
  }
  return null;
}

/**
 * El formulario de emisión del pagaré. Controlado: lo usa tanto el "Generar
 * contrato + pagaré" como el "Generar pagaré" de un contrato ya emitido.
 */
export function FormPagare({
  preparado, datos, onCambiar,
}: {
  preparado: PagarePreparado;
  datos: DatosPagare;
  onCambiar: (d: DatosPagare) => void;
}) {
  const setCodeudor = (i: number, campo: keyof PersonaPagare, valor: string) =>
    onCambiar({
      ...datos,
      codeudores: datos.codeudores.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)),
    });
  const agregar = (c: PersonaPagare) => onCambiar({ ...datos, codeudores: [...datos.codeudores, c] });
  const quitar = (i: number) => onCambiar({ ...datos, codeudores: datos.codeudores.filter((_, j) => j !== i) });

  const posibles = preparado.deudores_posibles ?? [];
  const elegido = deudorElegido(preparado, datos);
  const docDeudor = (elegido?.dni ?? preparado.deudor.dni ?? '').replace(/\D/g, '');
  // El sugerido como co-deudor no puede ser el mismo que firma como deudor.
  const sugerido = preparado.codeudor_sugerido;
  const sugeridoDisponible = !!sugerido
    && sugerido.dni.replace(/\D/g, '') !== docDeudor
    && !datos.codeudores.some(c => c.dni && c.dni === sugerido.dni);

  if (preparado.faltantes.length > 0) {
    return (
      <div className="flex gap-2 rounded-lg bg-warning px-3 py-2 text-white">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-xs">
          Para emitir la franquicia falta cargar {preparado.faltantes.join('; ')}.
          El texto de la franquicia tiene que decir las tasas: sin ellas no se genera.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Sin texto de ayuda debajo (plan 27/09, A5): el monto arranca en la
            franquicia base de la categoría y el número se ve con sus puntos. */}
        <div className="space-y-1" data-campo="pagare_monto">
          <label className="text-muted-foreground">Monto de la franquicia *</label>
          <InputMoneda
            value={datos.monto}
            onChange={v => onCambiar({ ...datos, monto: v })}
            className="input-base"
          />
        </div>
        <div className="space-y-0.5 text-muted-foreground">
          <p><span className="text-foreground font-medium">A la orden de:</span> {preparado.beneficiario}</p>
          <p><span className="text-foreground font-medium">Pagadero en:</span> {preparado.lugar_pago}</p>
          <p>
            <span className="text-foreground font-medium">Intereses:</span> compensatorio {preparado.interes_compensatorio},
            punitorio {preparado.interes_punitorio} (anual vencido)
          </p>
        </div>
      </div>

      {/* Quién es el deudor. Para un particular es él; para una empresa se
          elige explícitamente, porque la empresa, su representante y un
          conductor son tres obligados distintos. */}
      {posibles.length > 1 ? (
        <fieldset className="space-y-1.5" data-campo="pagare_deudor">
          <legend className="text-muted-foreground">
            Firma como deudor{preparado.requiere_elegir_deudor && <span className="text-danger"> *</span>}
          </legend>
          {posibles.map(d => {
            const clave = claveDeudor(d);
            return (
              <label key={clave} className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-muted/40">
                <input
                  type="radio"
                  name="pagare-deudor"
                  value={clave}
                  checked={datos.deudor === clave}
                  onChange={() => onCambiar({
                    ...datos,
                    deudor: clave,
                    // Quien pasa a ser deudor sale de los co-deudores.
                    codeudores: datos.codeudores.filter(
                      c => !d.dni || c.dni.replace(/\D/g, '') !== d.dni.replace(/\D/g, ''),
                    ),
                  })}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="font-medium text-foreground">{d.nombre}</span>
                  <span className="text-muted-foreground"> · {d.rol}</span>
                  <span className="block text-muted-foreground">
                    {d.dni ? `${d.tipo_documento}: ${d.dni}` : `Sin ${d.tipo_documento} cargado`}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">Deudor:</span> {preparado.deudor.nombre} ·{' '}
          {etiquetaDocumento(elegido ?? preparado.deudor)} {preparado.deudor.dni || '—'}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-muted-foreground">
          Co-deudores <span className="text-[11px]">(opcional — firman a la derecha, con su propia firma)</span>
        </p>
        {datos.codeudores.map((c, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_1fr_auto] gap-2 items-center">
            <input className="input-base col-span-2 sm:col-span-1" placeholder="Nombre y apellido" value={c.nombre}
              onChange={e => setCodeudor(i, 'nombre', e.target.value)} />
            <input className="input-base" placeholder="DNI o CUIT" value={c.dni}
              onChange={e => setCodeudor(i, 'dni', e.target.value)} />
            <input className="input-base" placeholder="Domicilio" value={c.domicilio ?? ''}
              onChange={e => setCodeudor(i, 'domicilio', e.target.value)} />
            <Button type="button" variant="ghost" size="sm" onClick={() => quitar(i)} aria-label="Quitar co-deudor">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {datos.codeudores.length < 3 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => agregar({ nombre: '', dni: '', domicilio: '' })}>
              <Plus className="h-3.5 w-3.5" /> Agregar co-deudor
            </Button>
            {/* Se ofrece, no se asume: manejar el auto no convierte a nadie en garante. */}
            {sugerido && sugeridoDisponible && (
              <Button type="button" variant="ghost" size="sm" onClick={() => agregar(sugerido)}>
                <UserPlus className="h-3.5 w-3.5" /> Sumar al conductor ({sugerido.nombre})
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** El pagaré de una reserva que ya tiene contrato: emitirlo o verlo. */
export function PagarePanel({ reservaId }: { reservaId: number }) {
  const { data: pagare, isLoading } = usePagareDeReserva(reservaId);
  const { data: preparado } = usePrepararPagare(reservaId, !pagare && !isLoading);
  const crear = useCrearPagare();
  const anular = useAnularPagare();
  const subir = useSubirEscaneoPagare();
  const input = useRef<HTMLInputElement>(null);
  const [datos, setDatos] = useState<DatosPagare | null>(null);
  const [anulando, setAnulando] = useState(false);

  if (isLoading) return null;

  if (!pagare) {
    const actuales = datos ?? datosInicialesPagare(preparado);
    return (
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Franquicia</h4>
        </div>
        {preparado && <FormPagare preparado={preparado} datos={actuales} onCambiar={setDatos} />}
        {preparado && preparado.faltantes.length === 0 && (
          <Button
            type="button"
            size="sm"
            disabled={crear.isPending}
            onClick={() => {
              const falta = faltaParaEmitir(preparado, actuales);
              if (falta) {
                toast.error(falta);
                irAlError(Number(actuales.monto) > 0 ? 'pagare_deudor' : 'pagare_monto');
                return;
              }
              crear.mutate(payloadPagare(reservaId, actuales), {
                onSuccess: () => { toast.success('Franquicia generada'); setDatos(null); },
                onError: e => toast.error(extractError(e)),
              });
            }}
          >
            <ScrollText className="h-4 w-4" /> {crear.isPending ? 'Generando…' : 'Generar franquicia'}
          </Button>
        )}
      </div>
    );
  }

  const s = pagare.snapshot;
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">Franquicia {pagare.numero_formateado}</h4>
            <p className="text-xs text-muted-foreground">
              Por ${s.monto_numerico} · emitido el {formatDate(pagare.fecha_generacion)}
            </p>
          </div>
        </div>
        {pagare.firmado ? (
          <span className="rounded-md bg-success px-2 py-0.5 text-xs font-semibold text-white">Firmado</span>
        ) : (
          <span className="rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white">Sin firmar</span>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Deudor: {s.deudor.nombre} · {etiquetaDocumento(s.deudor)} {s.deudor.dni || '—'}</p>
        {s.codeudores.length > 0 && (
          <p>Co-deudor{s.codeudores.length > 1 ? 'es' : ''}: {s.codeudores.map(c => `${c.nombre} (${etiquetaDocumento(c)} ${c.dni})`).join(', ')}</p>
        )}
        {pagare.firmado ? (
          <p>
            Firmó {pagare.firmado_por_nombre} · DNI {pagare.firmado_por_dni}
            {pagare.firmado_at && ` · ${formatDate(pagare.firmado_at)}`}
            {pagare.firma_medio === 'papel' && ' · en papel'}
            {pagare.firma_medio === 'pantalla' && ' · en pantalla'}
            {pagare.firma_medio === 'link' && ' · desde el link'}
          </p>
        ) : (
          <p className="text-foreground">
            Se firma junto con el contrato: el mismo link y el mismo botón "Firmar en el mostrador".
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => descargarPdfPagare(pagare)}>
          <Download className="h-4 w-4" /> Descargar franquicia
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            const archivo = e.target.files?.[0];
            e.target.value = '';
            if (archivo) subir.mutate({ id: pagare.id, archivo }, { onSuccess: () => toast.success('Franquicia firmada adjuntada') });
          }}
        />
        <Button type="button" size="sm" variant="ghost" disabled={subir.isPending} onClick={() => input.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          {subir.isPending ? 'Subiendo…' : pagare.tiene_escaneo ? 'Reemplazar el papel firmado' : 'Subir el firmado en papel'}
        </Button>
        {pagare.tiene_escaneo && (
          <Button type="button" size="sm" variant="ghost" onClick={() => verEscaneoPagare(pagare)}>
            <Paperclip className="h-3.5 w-3.5" /> Ver el papel
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => setAnulando(true)}>
          <Ban className="h-4 w-4" /> Anular
        </Button>
      </div>

      <MotivoDialog
        open={anulando}
        onOpenChange={setAnulando}
        title="Anular franquicia"
        description="La franquicia no se borra: queda registrada como anulada con su motivo. Después se puede emitir otra."
        confirmLabel="Anular"
        destructive
        loading={anular.isPending}
        onConfirm={motivo => anular.mutate({ id: pagare.id, motivo }, { onSuccess: () => setAnulando(false) })}
      />
    </div>
  );
}
