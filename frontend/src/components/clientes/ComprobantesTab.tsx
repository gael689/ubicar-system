import { useState } from 'react';
import { Download, Receipt, Plus, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import {
  useComprobantesCliente, useCreateComprobante, useAnularComprobante,
  type ComprobanteCreateInput, type TipoComprobante,
} from '@/hooks/useComprobantes';
import { resolveAssetUrl } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const TIPO_LABEL: Record<TipoComprobante, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
  remito: 'Remito',
};

const ESTADO_COLOR: Record<string, string> = {
  emitida: 'bg-primary/10 text-primary border-primary/30',
  cobrada: 'bg-success/10 text-success border-success/30',
  anulada: 'bg-danger/10 text-danger border-danger/30',
};

const TIPOS_QUE_AJUSTAN_CC: TipoComprobante[] = ['nota_credito', 'nota_debito'];

interface Props {
  clienteId: number;
}

export function ComprobantesTab({ clienteId }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [anularId, setAnularId] = useState<number | null>(null);

  const { data: comprobantes, isLoading } = useComprobantesCliente(clienteId);
  const createComprobante = useCreateComprobante(clienteId);
  const anular = useAnularComprobante(clienteId);

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Comprobantes</h3>
          <p className="text-xs text-muted-foreground">
            Facturas, notas de crédito/débito y remitos — carga manual con PDF.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Cargar comprobante
        </Button>
      </div>

      {(!comprobantes || comprobantes.length === 0) && !formOpen && (
        <EmptyState
          icon={Receipt}
          title="Sin comprobantes"
          description="Cargá facturas, notas de crédito/débito o remitos de este cliente."
        />
      )}

      {comprobantes && comprobantes.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {comprobantes.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {TIPO_LABEL[c.tipo]} {c.punto_venta ? `${c.punto_venta}-` : ''}{c.numero}
                    </span>
                    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium', ESTADO_COLOR[c.estado])}>
                      {c.estado}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(c.fecha_emision)}
                    {c.estado === 'anulada' && c.motivo_anulacion ? ` · Anulado: ${c.motivo_anulacion}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-foreground">{formatCurrency(c.total)}</span>
                {c.archivo_url && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={resolveAssetUrl(c.archivo_url) ?? '#'} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                {c.estado !== 'anulada' && (
                  <Button variant="ghost" size="sm" onClick={() => setAnularId(c.id)}>
                    <Ban className="h-3.5 w-3.5 text-danger" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <ComprobanteFormInline
          onSubmit={(data) => createComprobante.mutate(data, { onSuccess: () => setFormOpen(false) })}
          onCancel={() => setFormOpen(false)}
          loading={createComprobante.isPending}
        />
      )}

      <MotivoDialog
        open={anularId !== null}
        onOpenChange={open => !open && setAnularId(null)}
        title="Anular comprobante"
        description="Nunca se borra: queda marcado como anulado. Si era nota de crédito/débito, el movimiento en la cuenta corriente se revierte con un contra-asiento."
        confirmLabel="Anular"
        loading={anular.isPending}
        onConfirm={async (motivo) => {
          if (anularId) {
            await anular.mutateAsync({ id: anularId, motivo });
            setAnularId(null);
          }
        }}
      />
    </Card>
  );
}

function ComprobanteFormInline({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (data: ComprobanteCreateInput) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tipo, setTipo] = useState<TipoComprobante>('factura_b');
  const [puntoVenta, setPuntoVenta] = useState('');
  const [numero, setNumero] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const ajustaCC = TIPOS_QUE_AJUSTAN_CC.includes(tipo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !numero.trim() || !total) return;
    onSubmit({
      tipo,
      punto_venta: puntoVenta || undefined,
      numero: numero.trim(),
      fecha_emision: fechaEmision,
      total: Number(total),
      file,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value as TipoComprobante)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {ajustaCC && (
            <p className="text-[11px] text-muted-foreground">
              Genera un {tipo === 'nota_credito' ? 'crédito' : 'débito'} en la cuenta corriente del cliente.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha de emisión</label>
          <input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Punto de venta (opcional)</label>
          <input value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)} placeholder="0001"
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Número *</label>
          <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="00000123"
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Total ($) *</label>
          <input type="number" min={0} step="0.01" value={total} onChange={e => setTotal(e.target.value)}
            placeholder="0.00" className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Archivo (PDF, imagen)</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !file}>
          {loading ? 'Subiendo...' : 'Cargar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}
