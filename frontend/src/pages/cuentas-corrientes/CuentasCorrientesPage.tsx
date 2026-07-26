import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  useCuentasCorrientes,
  useMovimientosCC,
  useAgregarMovimiento,
} from '@/hooks/useCuentasCorrientes';
import { formatCurrency, formatDate, extractError } from '@/lib/utils';
import type { CuentaCorriente, MovimientoCC } from '@/types';

const movSchema = z.object({
  tipo: z.enum(['debito', 'credito']),
  concepto: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().min(0.01, 'Debe ser mayor a 0'),
  fecha: z.string().min(1),
  alquiler_id: z.coerce.number().optional().nullable(),
});
type MovForm = z.infer<typeof movSchema>;

function MovimientoRow({ m }: { m: MovimientoCC }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-muted/30 rounded-lg">
      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.tipo === 'credito' ? 'bg-success' : 'bg-danger'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{m.concepto}</p>
        <p className="text-xs text-muted-foreground">{formatDate(m.fecha)}{m.alquiler_id ? ` · Alq. #${m.alquiler_id}` : ''}</p>
      </div>
      <span className={`text-sm font-semibold shrink-0 ${m.tipo === 'credito' ? 'text-success' : 'text-danger'}`}>
        {m.tipo === 'credito' ? '+' : '−'}{formatCurrency(m.monto)}
      </span>
    </div>
  );
}

function CCDetalle({
  cc,
  onClose,
}: {
  cc: CuentaCorriente;
  onClose: () => void;
}) {
  const { data: movimientos = [], isLoading } = useMovimientosCC(cc.id);
  const agregar = useAgregarMovimiento(cc.id);
  const [showForm, setShowForm] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MovForm>({
    resolver: zodResolver(movSchema),
    defaultValues: { tipo: 'credito', fecha: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: MovForm) {
    try {
      await agregar.mutateAsync({ ...data, alquiler_id: data.alquiler_id || null });
      toast.success('Movimiento registrado');
      reset();
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{cc.cliente_nombre}</h2>
            <p className={`text-lg font-bold mt-0.5 ${cc.saldo < 0 ? 'text-danger' : cc.saldo > 0 ? 'text-success' : 'text-muted-foreground'}`}>
              Saldo: {formatCurrency(cc.saldo)}
              {cc.saldo < 0 && ' (debe)'}
              {cc.saldo > 0 && ' (a favor)'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar movimiento manual
          </button>

          {showForm && (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-muted/30 rounded-xl p-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select {...register('tipo')} className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background">
                  <option value="credito">Crédito (a favor)</option>
                  <option value="debito">Débito (debe)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monto</label>
                <input {...register('monto')} type="number" step="0.01"
                  className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.monto && <p className="text-xs text-danger">{errors.monto.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Concepto</label>
                <input {...register('concepto')} placeholder="Ej: Pago parcial alquiler"
                  className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.concepto && <p className="text-xs text-danger">{errors.concepto.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha</label>
                <input {...register('fecha')} type="date"
                  className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Alquiler ID (opc.)</label>
                <input {...register('alquiler_id')} type="number"
                  className="w-full mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowForm(false); reset(); }}
                  className="text-sm text-muted-foreground hover:text-foreground">
                  Cancelar
                </button>
                <button type="submit" disabled={agregar.isPending}
                  className="px-3 py-1 text-sm bg-primary text-white rounded-lg disabled:opacity-50">
                  {agregar.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="text-center text-muted-foreground text-sm py-4">Cargando movimientos...</div>
          ) : movimientos.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">Sin movimientos aún</p>
          ) : (
            <div className="space-y-0.5">
              {movimientos.map(m => <MovimientoRow key={m.id} m={m} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CuentasCorrientesPage() {
  const navigate = useNavigate();
  const { data: cuentas = [], isLoading } = useCuentasCorrientes();
  const [selected, setSelected] = useState<CuentaCorriente | null>(null);

  const conDeuda = cuentas.filter(c => c.saldo < 0);
  const conSaldo = cuentas.filter(c => c.saldo > 0);
  const enCero = cuentas.filter(c => c.saldo === 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Cuentas Corrientes</h1>
          <span className="text-sm text-muted-foreground">{cuentas.length} clientes</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Resumen */}
        {cuentas.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3.5 w-3.5 text-danger" />
                <span className="text-xs text-muted-foreground">Con deuda</span>
              </div>
              <p className="text-xl font-bold text-danger">{conDeuda.length}</p>
              <p className="text-xs text-danger/70">
                {formatCurrency(Math.abs(conDeuda.reduce((s, c) => s + c.saldo, 0)))} total
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                <span className="text-xs text-muted-foreground">Con saldo a favor</span>
              </div>
              <p className="text-xl font-bold text-success">{conSaldo.length}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">En cero</span>
              </div>
              <p className="text-xl font-bold text-muted-foreground">{enCero.length}</p>
            </div>
          </div>
        )}

        {/* Lista */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-10">Cargando...</div>
        ) : cuentas.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No hay cuentas corrientes activas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Se crean automáticamente al registrar un cobro por "Cuenta Corriente"
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {cuentas
              .sort((a, b) => a.saldo - b.saldo) // deudores primero
              .map((cc, i) => (
                <div
                  key={cc.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer group ${i > 0 ? 'border-t border-border' : ''}`}
                  onClick={() => setSelected(cc)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{cc.cliente_nombre ?? `Cliente #${cc.cliente_id}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${cc.saldo < 0 ? 'text-danger' : cc.saldo > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                      {formatCurrency(cc.saldo)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/clientes/${cc.cliente_id}`); }}
                      className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100"
                      title="Ver cliente"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {selected && <CCDetalle cc={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
