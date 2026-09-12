import { useRef, useState } from 'react';
import {
  ScrollText, Download, Ban, AlertTriangle, Plus, X, Upload, Paperclip, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import {
  usePagareDeReserva, usePrepararPagare, useCrearPagare, useAnularPagare,
  useSubirEscaneoPagare, descargarPdfPagare, verEscaneoPagare,
} from '@/hooks/usePagares';
import { extractError, formatCurrency, formatDate } from '@/lib/utils';
import type { PagarePreparado, PersonaPagare } from '@/types';

/** Lo que el operador decide al emitir: el monto y quiénes firman con el cliente. */
export interface DatosPagare {
  monto: string;
  codeudores: PersonaPagare[];
}

export function datosInicialesPagare(p: PagarePreparado | undefined): DatosPagare {
  return { monto: p ? String(Math.round(p.monto_sugerido)) : '', codeudores: [] };
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
  const sugeridoYaEsta = !!preparado.codeudor_sugerido
    && datos.codeudores.some(c => c.dni && c.dni === preparado.codeudor_sugerido?.dni);

  if (preparado.faltantes.length > 0) {
    return (
      <div className="flex gap-2 rounded-lg bg-warning px-3 py-2 text-white">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-xs">
          Para emitir el pagaré falta cargar {preparado.faltantes.join('; ')}.
          El texto del pagaré tiene que decir las tasas: sin ellas no se genera.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-muted-foreground">Monto del pagaré ($) *</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={datos.monto}
            onChange={e => onCambiar({ ...datos, monto: e.target.value })}
            className="input-base"
          />
          <p className="text-[11px] text-muted-foreground">
            Sugerido: el valor del alquiler ({formatCurrency(preparado.monto_sugerido)}).
            {preparado.franquicia != null && ` La franquicia de esta reserva es ${formatCurrency(preparado.franquicia)}.`}
          </p>
        </div>
        <div className="space-y-0.5 text-muted-foreground">
          <p><span className="text-foreground font-medium">Deudor:</span> {preparado.deudor.nombre} · DNI {preparado.deudor.dni || '—'}</p>
          <p><span className="text-foreground font-medium">A la orden de:</span> {preparado.beneficiario}</p>
          <p><span className="text-foreground font-medium">Pagadero en:</span> {preparado.lugar_pago}</p>
          <p>
            <span className="text-foreground font-medium">Intereses:</span> compensatorio {preparado.interes_compensatorio},
            punitorio {preparado.interes_punitorio} (anual vencido)
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground">
          Co-deudores <span className="text-[11px]">(opcional — firman a la derecha, con su propia firma)</span>
        </p>
        {datos.codeudores.map((c, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_1fr_auto] gap-2 items-center">
            <input className="input-base col-span-2 sm:col-span-1" placeholder="Nombre y apellido" value={c.nombre}
              onChange={e => setCodeudor(i, 'nombre', e.target.value)} />
            <input className="input-base" placeholder="DNI" value={c.dni}
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
            {preparado.codeudor_sugerido && !sugeridoYaEsta && (
              <Button type="button" variant="ghost" size="sm" onClick={() => agregar(preparado.codeudor_sugerido!)}>
                <UserPlus className="h-3.5 w-3.5" /> Sumar al conductor adicional ({preparado.codeudor_sugerido.nombre})
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
          <h4 className="text-sm font-semibold text-foreground">Pagaré</h4>
          <span className="text-xs text-muted-foreground">— documento aparte, mismo link y misma firma</span>
        </div>
        {preparado && <FormPagare preparado={preparado} datos={actuales} onCambiar={setDatos} />}
        {preparado && preparado.faltantes.length === 0 && (
          <Button
            type="button"
            size="sm"
            disabled={crear.isPending || !(parseFloat(actuales.monto) > 0)}
            onClick={() =>
              crear.mutate(
                { reserva_id: reservaId, monto: parseFloat(actuales.monto), codeudores: actuales.codeudores },
                {
                  onSuccess: () => { toast.success('Pagaré generado'); setDatos(null); },
                  onError: e => toast.error(extractError(e)),
                },
              )
            }
          >
            <ScrollText className="h-4 w-4" /> {crear.isPending ? 'Generando…' : 'Generar pagaré'}
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
            <h4 className="text-sm font-semibold text-foreground">Pagaré {pagare.numero_formateado}</h4>
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
        <p>Deudor: {s.deudor.nombre} · DNI {s.deudor.dni || '—'}</p>
        {s.codeudores.length > 0 && (
          <p>Co-deudor{s.codeudores.length > 1 ? 'es' : ''}: {s.codeudores.map(c => `${c.nombre} (DNI ${c.dni})`).join(', ')}</p>
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
          <Download className="h-4 w-4" /> Descargar pagaré
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            const archivo = e.target.files?.[0];
            e.target.value = '';
            if (archivo) subir.mutate({ id: pagare.id, archivo }, { onSuccess: () => toast.success('Pagaré firmado adjuntado') });
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
        title="Anular pagaré"
        description="El pagaré no se borra: queda registrado como anulado con su motivo. Después se puede emitir otro."
        confirmLabel="Anular"
        destructive
        loading={anular.isPending}
        onConfirm={motivo => anular.mutate({ id: pagare.id, motivo }, { onSuccess: () => setAnulando(false) })}
      />
    </div>
  );
}
