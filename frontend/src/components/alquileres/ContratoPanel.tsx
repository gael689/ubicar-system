import { useRef, useState, useEffect } from 'react';
import { FileText, Download, PenLine, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import {
  useContratoDeAlquiler, usePrepararContrato, useCrearContrato,
  useFirmarContrato, useAnularContrato, descargarPdfContrato,
} from '@/hooks/useContratos';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
  alquilerId: number;
}

/**
 * Contrato de un alquiler: generar, firmar, descargar y anular.
 *
 * El anverso se precarga desde el sistema y **es editable**: lo que el
 * operador corrige es lo que se congela en el snapshot. Por eso la vista
 * previa muestra los datos ya resueltos y no los recalcula al vuelo.
 */
export function ContratoPanel({ alquilerId }: Props) {
  const { data: contrato, isLoading } = useContratoDeAlquiler(alquilerId);
  const { data: preparado } = usePrepararContrato(alquilerId, !contrato && !isLoading);
  const crear = useCrearContrato();
  const anular = useAnularContrato();

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

        {preparado && <ResumenAnverso snapshot={preparado.snapshot} />}

        <Button
          size="sm"
          disabled={!preparado || crear.isPending}
          onClick={() => preparado && crear.mutate({ alquiler_id: alquilerId, snapshot: preparado.snapshot })}
        >
          {crear.isPending ? 'Generando…' : 'Generar contrato'}
        </Button>
      </Card>
    );
  }

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
          <p className="text-xs text-muted-foreground">
            Firmó {contrato.firmado_por_nombre} · DNI {contrato.firmado_por_dni}
            {contrato.firmado_at && ` · ${formatDate(contrato.firmado_at)}`}
          </p>
        )}
        {contrato.anulado && contrato.motivo_anulacion && (
          <p className="text-xs text-muted-foreground">Motivo: {contrato.motivo_anulacion}</p>
        )}

        {contrato.snapshot && <ResumenAnverso snapshot={contrato.snapshot} />}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => descargarPdfContrato(contrato)}>
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>
          {!contrato.firmado && !contrato.anulado && (
            <Button size="sm" onClick={() => setFirmando(true)}>
              <PenLine className="h-4 w-4" /> Firmar
            </Button>
          )}
          {!contrato.anulado && (
            <Button size="sm" variant="ghost" onClick={() => setAnulando(true)}>
              <Ban className="h-4 w-4" /> Anular
            </Button>
          )}
        </div>
      </Card>

      {firmando && (
        <FirmaDialog
          contratoId={contrato.id}
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

function FirmaDialog({ contratoId, onClose }: { contratoId: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const firmar = useFirmarContrato();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (e.currentTarget.width / rect.width),
      y: (e.clientY - rect.top) * (e.currentTarget.height / rect.height),
    };
  };

  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
  };

  const confirmar = () => {
    if (!nombre.trim() || !dni.trim()) return;
    firmar.mutate(
      {
        id: contratoId,
        nombre: nombre.trim(),
        dni: dni.trim(),
        firma_base64: tieneTrazo ? canvasRef.current?.toDataURL('image/png') : null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-background p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Firmar contrato</h3>
          <p className="text-xs text-muted-foreground">
            Firma manuscrita del cliente. Quien firma puede no ser el titular de la reserva.
          </p>
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

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Firma</label>
          <canvas
            ref={canvasRef}
            width={560}
            height={180}
            className="w-full touch-none rounded-lg border border-dashed border-border bg-white"
            onPointerDown={e => {
              dibujando.current = true;
              const ctx = e.currentTarget.getContext('2d');
              const { x, y } = posicion(e);
              ctx?.beginPath();
              ctx?.moveTo(x, y);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => {
              if (!dibujando.current) return;
              const ctx = e.currentTarget.getContext('2d');
              const { x, y } = posicion(e);
              ctx?.lineTo(x, y);
              ctx?.stroke();
              setTieneTrazo(true);
            }}
            onPointerUp={() => { dibujando.current = false; }}
            onPointerLeave={() => { dibujando.current = false; }}
          />
          <button type="button" onClick={limpiar} className="text-xs text-primary hover:underline">
            Borrar y volver a firmar
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            disabled={!nombre.trim() || !dni.trim() || firmar.isPending}
            onClick={confirmar}
          >
            {firmar.isPending ? 'Guardando…' : 'Confirmar firma'}
          </Button>
        </div>
      </div>
    </div>
  );
}
