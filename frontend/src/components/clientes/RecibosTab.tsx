import { useState } from 'react';
import { Plus, Download, Ban, Receipt } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { useRecibosCliente, useCrearRecibo, useAnularRecibo, descargarPdfRecibo } from '@/hooks/useRecibos';
import { ESTADO_RECIBO_LABEL, ESTADO_RECIBO_COLOR, MEDIO_PAGO_RECIBO_LABEL } from '@/lib/constants';
import { formatCurrency, formatDate, extractError, cn } from '@/lib/utils';
import type { MedioPagoRecibo, Recibo } from '@/types';

const schema = z.object({
  fecha: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().min(0.01, 'Debe ser mayor a 0'),
  medio_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'echeq']),
  concepto: z.string().min(1, 'Requerido'),
});
type FormData = z.infer<typeof schema>;

const MEDIOS: MedioPagoRecibo[] = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'echeq'];

interface Props {
  clienteId: number;
}

export function RecibosTab({ clienteId }: Props) {
  const { data: recibos = [], isLoading } = useRecibosCliente(clienteId);
  const crear = useCrearRecibo();
  const anular = useAnularRecibo();
  const [showForm, setShowForm] = useState(false);
  const [anularId, setAnularId] = useState<number | null>(null);
  const [descargando, setDescargando] = useState<number | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().slice(0, 10),
      medio_pago: 'efectivo',
      concepto: 'Pago a cuenta',
    },
  });

  async function onSubmit(data: FormData) {
    try {
      await crear.mutateAsync({ ...data, cliente_id: clienteId });
      toast.success('Recibo emitido');
      reset({ fecha: new Date().toISOString().slice(0, 10), medio_pago: 'efectivo', concepto: 'Pago a cuenta' });
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleDescargar(recibo: Recibo) {
    setDescargando(recibo.id);
    try {
      await descargarPdfRecibo(recibo);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDescargando(null);
    }
  }

  async function handleAnular(motivo: string) {
    if (!anularId) return;
    try {
      await anular.mutateAsync({ id: anularId, motivo });
      toast.success('Recibo anulado');
      setAnularId(null);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground">Recibos emitidos</h3>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4" /> Emitir recibo
          </Button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 rounded-xl border border-border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Fecha</label>
              <input {...register('fecha')} type="date" className="input-base" />
              {errors.fecha && <p className="text-xs text-danger">{errors.fecha.message}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monto</label>
              <input {...register('monto')} type="number" step="0.01" placeholder="0.00" className="input-base" />
              {errors.monto && <p className="text-xs text-danger">{errors.monto.message}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Medio de pago</label>
              <select {...register('medio_pago')} className="input-base">
                {MEDIOS.map(m => (
                  <option key={m} value={m}>{MEDIO_PAGO_RECIBO_LABEL[m]}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-muted-foreground">Concepto</label>
              <input {...register('concepto')} className="input-base" />
              {errors.concepto && <p className="text-xs text-danger">{errors.concepto.message}</p>}
            </div>
            <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={crear.isPending}>
                {crear.isPending ? 'Emitiendo...' : 'Emitir recibo'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Historial de recibos</p>
        </div>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-6 text-sm">Cargando...</div>
        ) : recibos.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            Sin recibos emitidos para este cliente
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recibos.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-foreground text-sm">{r.prefijo}-{String(r.numero).padStart(5, '0')}</span>
                    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', ESTADO_RECIBO_COLOR[r.estado])}>
                      {ESTADO_RECIBO_LABEL[r.estado]}
                    </span>
                  </div>
                  <p className="text-sm text-foreground truncate">{r.concepto}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.fecha)} · {MEDIO_PAGO_RECIBO_LABEL[r.medio_pago]}
                    {r.estado === 'anulado' && r.motivo_anulacion ? ` · Anulado: ${r.motivo_anulacion}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-success shrink-0">{formatCurrency(r.monto)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleDescargar(r)} disabled={descargando === r.id}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {r.estado === 'emitido' && (
                    <Button variant="ghost" size="sm" onClick={() => setAnularId(r.id)}>
                      <Ban className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <MotivoDialog
        open={anularId !== null}
        onOpenChange={open => !open && setAnularId(null)}
        title="Anular recibo"
        description="El recibo queda marcado como anulado (no se borra) y el crédito que generó se revierte con un contra-asiento en la cuenta corriente."
        confirmLabel="Anular"
        loading={anular.isPending}
        onConfirm={handleAnular}
      />
    </div>
  );
}
