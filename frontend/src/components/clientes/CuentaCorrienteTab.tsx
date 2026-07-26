import { useState } from 'react';
import { Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import {
  useCuentaCorrienteCliente,
  useMovimientosCC,
  useAgregarMovimiento,
} from '@/hooks/useCuentasCorrientes';
import { formatCurrency, formatDate, extractError } from '@/lib/utils';

const movSchema = z.object({
  tipo: z.enum(['debito', 'credito']),
  concepto: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().min(0.01, 'Debe ser mayor a 0'),
  fecha: z.string().min(1),
  alquiler_id: z.coerce.number().optional().nullable(),
});
type MovForm = z.infer<typeof movSchema>;

interface Props {
  clienteId: number;
  clienteNombre: string;
}

export function CuentaCorrienteTab({ clienteId, clienteNombre }: Props) {
  const { data: cc, isLoading: loadingCC } = useCuentaCorrienteCliente(clienteId);
  const { data: movimientos = [], isLoading: loadingMovs } = useMovimientosCC(cc?.id);
  const agregar = useAgregarMovimiento(cc?.id ?? 0);
  const [showForm, setShowForm] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MovForm>({
    resolver: zodResolver(movSchema),
    defaultValues: { tipo: 'credito', fecha: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: MovForm) {
    if (!cc) return;
    try {
      await agregar.mutateAsync({ ...data, alquiler_id: data.alquiler_id || null });
      toast.success('Movimiento registrado');
      reset({ tipo: 'credito', fecha: new Date().toISOString().slice(0, 10) });
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  if (loadingCC) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">Cargando cuenta corriente...</Card>;
  }

  const saldo = cc?.saldo ?? 0;

  return (
    <div className="space-y-4">
      {/* Saldo */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Saldo actual de {clienteNombre}</p>
            {/* D-01: saldo positivo = el cliente debe. Negativo = saldo a favor. */}
            <p className={`text-3xl font-bold ${saldo > 0 ? 'text-danger' : saldo < 0 ? 'text-success' : 'text-foreground'}`}>
              {formatCurrency(Math.abs(saldo))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {saldo > 0 && 'El cliente tiene una deuda pendiente'}
              {saldo < 0 && 'El cliente tiene saldo a favor'}
              {saldo === 0 && 'Saldo en cero'}
            </p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Movimiento manual
          </button>
        </div>
      </Card>

      {/* Formulario */}
      {showForm && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Nuevo movimiento</p>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <select {...register('tipo')} className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background">
                <option value="credito">Crédito (a favor del cliente)</option>
                <option value="debito">Débito (el cliente debe)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monto</label>
              <input {...register('monto')} type="number" step="0.01"
                className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
              {errors.monto && <p className="text-xs text-danger">{errors.monto.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Concepto</label>
              <input {...register('concepto')} placeholder="Ej: Anticipo alquiler enero"
                className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
              {errors.concepto && <p className="text-xs text-danger">{errors.concepto.message}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha</label>
              <input {...register('fecha')} type="date"
                className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ID Alquiler (opc.)</label>
              <input {...register('alquiler_id')} type="number" placeholder="Ej: 7"
                className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowForm(false); reset(); }}
                className="px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground">
                Cancelar
              </button>
              <button type="submit" disabled={agregar.isPending || !cc}
                className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg disabled:opacity-50">
                {agregar.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Historial de movimientos */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Historial de movimientos</p>
        </div>
        {loadingMovs ? (
          <div className="text-center text-muted-foreground py-6 text-sm">Cargando...</div>
        ) : movimientos.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            Sin movimientos registrados
          </div>
        ) : (
          <div className="divide-y divide-border">
            {movimientos.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <div className={`p-1.5 rounded-lg ${m.tipo === 'credito' ? 'bg-success/10' : 'bg-danger/10'}`}>
                  {m.tipo === 'credito'
                    ? <TrendingUp className="h-3.5 w-3.5 text-success" />
                    : <TrendingDown className="h-3.5 w-3.5 text-danger" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{m.concepto}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(m.fecha)}
                    {m.alquiler_id ? ` · Alquiler #${m.alquiler_id}` : ''}
                  </p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${m.tipo === 'credito' ? 'text-success' : 'text-danger'}`}>
                  {m.tipo === 'credito' ? '+' : '−'}{formatCurrency(m.monto)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
