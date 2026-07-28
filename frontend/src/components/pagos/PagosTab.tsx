import { useState } from 'react';
import { Plus, Trash2, CreditCard } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { usePagos, useCrearPago, useEliminarPago } from '@/hooks/usePagos';
import { formatCurrency, formatDate, extractError } from '@/lib/utils';
import { METODO_PAGO_LABEL } from '@/lib/constants';
import type { MetodoPago } from '@/types';

const MEDIOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'echeq', label: 'Echeq' },
  { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
];

const schema = z.object({
  monto: z.coerce.number().min(0.01, 'Debe ser mayor a 0'),
  medio_pago: z.string().min(1),
  con_factura: z.boolean().default(false),
  fecha: z.string().min(1),
  notas: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  alquilerId: number;
  precioTotal?: string | null;
}

const MEDIO_COLOR: Record<string, string> = {
  efectivo: 'bg-emerald-100 text-emerald-700',
  transferencia: 'bg-blue-100 text-blue-700',
  tarjeta: 'bg-purple-100 text-purple-700',
  cheque: 'bg-amber-100 text-amber-700',
  echeq: 'bg-orange-100 text-orange-700',
  cuenta_corriente: 'bg-slate-100 text-slate-700',
};

export function PagosTab({ alquilerId, precioTotal }: Props) {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = usePagos({ alquiler_id: alquilerId });
  const pagos = data?.data ?? [];
  const crear = useCrearPago();
  const eliminar = useEliminarPago();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: new Date().toISOString().slice(0, 10), con_factura: false },
  });

  const totalCobrado = pagos.reduce((s, p) => s + parseFloat(String(p.monto)), 0);
  const totalEsperado = precioTotal ? parseFloat(precioTotal) : null;
  const saldo = totalEsperado !== null ? totalEsperado - totalCobrado : null;

  async function onSubmit(data: FormData) {
    try {
      await crear.mutateAsync({
        alquiler_id: alquilerId,
        ...data,
        medio_pago: data.medio_pago as MetodoPago,
      });
      toast.success('Cobro registrado');
      reset({ fecha: new Date().toISOString().slice(0, 10), con_factura: false });
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este cobro?')) return;
    try {
      await eliminar.mutateAsync(id);
      toast.success('Cobro eliminado');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/30 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Cobrado</p>
          <p className="text-lg font-bold text-success">{formatCurrency(totalCobrado)}</p>
        </div>
        {totalEsperado !== null && (
          <>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total esperado</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalEsperado)}</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${saldo! > 0 ? 'bg-warning/10' : 'bg-success/10'}`}>
              <p className="text-xs text-muted-foreground mb-1">{saldo! > 0 ? 'Pendiente' : 'Pagado'}</p>
              <p className={`text-lg font-bold ${saldo! > 0 ? 'text-warning' : 'text-success'}`}>
                {saldo! > 0 ? formatCurrency(saldo!) : '✓ Completo'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-4 text-sm">Cargando...</div>
      ) : pagos.length === 0 ? (
        <div className="text-center py-6">
          <CreditCard className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Sin cobros registrados</p>
        </div>
      ) : (
        <div className="space-y-1">
          {pagos.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 px-2 hover:bg-muted/20 rounded-lg group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(p.monto)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MEDIO_COLOR[p.medio_pago] ?? 'bg-muted text-muted-foreground'}`}>
                    {METODO_PAGO_LABEL[p.medio_pago] ?? p.medio_pago}
                  </span>
                  {p.con_factura && (
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-1">Factura</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.fecha)}{p.notas ? ` · ${p.notas}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                className="p-1 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botón + formulario */}
      {showForm ? (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-muted/20 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Monto</label>
              <input {...register('monto')} type="number" step="0.01"
                className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
              {errors.monto && <p className="text-xs text-danger">{errors.monto.message}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Medio</label>
              <select {...register('medio_pago')}
                className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background">
                {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Fecha</label>
              <input {...register('fecha')} type="date"
                className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notas</label>
              <input {...register('notas')} placeholder="Opcional"
                className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" {...register('con_factura')} id="fac" className="rounded" />
            <label htmlFor="fac" className="text-xs text-muted-foreground">Con factura</label>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); reset(); }}
              className="text-sm text-muted-foreground hover:text-foreground px-2">
              Cancelar
            </button>
            <button type="submit" disabled={crear.isPending}
              className="px-3 py-1 text-sm bg-primary text-white rounded-lg disabled:opacity-50">
              {crear.isPending ? '...' : 'Guardar'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Registrar cobro
        </button>
      )}
    </div>
  );
}
