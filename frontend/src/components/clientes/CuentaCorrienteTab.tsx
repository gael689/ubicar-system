import { useState } from 'react';
import { Plus, TrendingUp, TrendingDown, CalendarClock, Pencil } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import {
  useCuentaCorrienteCliente,
  useMovimientosCC,
  useAgregarMovimiento,
  useEditarVencimiento,
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
  const editarVencimiento = useEditarVencimiento();
  const [showForm, setShowForm] = useState(false);
  const [editandoVencId, setEditandoVencId] = useState<number | null>(null);
  const [nuevaFechaVenc, setNuevaFechaVenc] = useState('');
  const [motivoVenc, setMotivoVenc] = useState('');

  async function handleGuardarVencimiento(movId: number) {
    if (!motivoVenc.trim()) {
      toast.error('Indicá el motivo del cambio');
      return;
    }
    try {
      await editarVencimiento.mutateAsync({
        movimientoId: movId,
        fecha_vencimiento: nuevaFechaVenc || null,
        motivo: motivoVenc.trim(),
      });
      toast.success('Vencimiento actualizado');
      setEditandoVencId(null);
      setMotivoVenc('');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

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

  // Aging de deuda (FIN-09): sólo débitos vigentes (no anulados) con
  // fecha_vencimiento pasada. Cada movimiento tiene su propio vencimiento
  // (calculado según la condición de pago), no es un aging "por cliente".
  const hoy = new Date();
  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 };
  for (const m of movimientos) {
    if (m.tipo !== 'debito' || m.anulado || !m.fecha_vencimiento) continue;
    const venc = new Date(m.fecha_vencimiento);
    const diasVencido = Math.floor((hoy.getTime() - venc.getTime()) / 86400000);
    if (diasVencido <= 0) continue;
    const monto = Number(m.monto);
    if (diasVencido <= 30) aging.d0_30 += monto;
    else if (diasVencido <= 60) aging.d31_60 += monto;
    else if (diasVencido <= 90) aging.d61_90 += monto;
    else aging.d90mas += monto;
  }
  const totalVencido = aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d90mas;

  // Seguimiento de lo que todavía no venció — el aging de arriba sólo mira
  // deuda vencida; esto es lo que se viene, para hacerle seguimiento antes
  // de que llegue la fecha.
  const proximosVencimientos = movimientos
    .filter(m => m.tipo === 'debito' && !m.anulado && m.fecha_vencimiento && new Date(m.fecha_vencimiento) >= hoy)
    .sort((a, b) => (a.fecha_vencimiento! < b.fecha_vencimiento! ? -1 : 1))
    .slice(0, 3);

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

        {totalVencido > 0 && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-4 gap-2">
            {[
              { label: '0-30 días', value: aging.d0_30, color: 'text-warning' },
              { label: '31-60 días', value: aging.d31_60, color: 'text-orange-600' },
              { label: '61-90 días', value: aging.d61_90, color: 'text-danger' },
              { label: '+90 días', value: aging.d90mas, color: 'text-danger font-bold' },
            ].map(b => (
              <div key={b.label} className="rounded-lg bg-muted/40 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{b.label}</p>
                <p className={`text-sm font-semibold ${b.color}`}>{formatCurrency(b.value)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Próximo vencimiento — seguimiento de lo que todavía no venció */}
      {proximosVencimientos.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Próximo vencimiento</p>
          </div>
          <div className="space-y-2">
            {proximosVencimientos.map(m => {
              const dias = Math.ceil((new Date(m.fecha_vencimiento!).getTime() - hoy.getTime()) / 86400000);
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{m.concepto}</p>
                    <p className="text-xs text-primary font-medium">
                      Vence el {formatDate(m.fecha_vencimiento!)} ({dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`})
                    </p>
                  </div>
                  <span className="text-sm font-bold text-foreground shrink-0">{formatCurrency(m.monto)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
              <div key={m.id} className="px-4 py-3 hover:bg-muted/20">
                <div className="flex items-center gap-3">
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
                      {m.tipo === 'debito' && !m.anulado && (
                        m.fecha_vencimiento
                          ? ` · Vence ${formatDate(m.fecha_vencimiento)}`
                          : ' · Sin vencimiento todavía'
                      )}
                    </p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${m.tipo === 'credito' ? 'text-success' : 'text-danger'}`}>
                    {m.tipo === 'credito' ? '+' : '−'}{formatCurrency(m.monto)}
                  </span>
                  {m.tipo === 'debito' && !m.anulado && (
                    <button
                      onClick={() => {
                        setEditandoVencId(editandoVencId === m.id ? null : m.id);
                        setNuevaFechaVenc(m.fecha_vencimiento ?? '');
                        setMotivoVenc('');
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
                      title="Editar vencimiento"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {editandoVencId === m.id && (
                  <div className="mt-2 ml-10 flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Nueva fecha de vencimiento</label>
                      <input
                        type="date"
                        value={nuevaFechaVenc}
                        onChange={e => setNuevaFechaVenc(e.target.value)}
                        className="block mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-xs text-muted-foreground">Motivo *</label>
                      <input
                        type="text"
                        value={motivoVenc}
                        onChange={e => setMotivoVenc(e.target.value)}
                        placeholder="Ej: se extendió el alquiler, el auto volvió más tarde..."
                        className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
                      />
                    </div>
                    <button
                      onClick={() => setEditandoVencId(null)}
                      className="px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleGuardarVencimiento(m.id)}
                      disabled={editarVencimiento.isPending}
                      className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg disabled:opacity-50"
                    >
                      {editarVencimiento.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
