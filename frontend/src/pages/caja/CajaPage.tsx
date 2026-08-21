import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, TrendingUp, TrendingDown, DollarSign,
  ChevronRight, Car, RefreshCw,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCajaDia, useCrearPago, useAnularPago } from '@/hooks/usePagos';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { DondeEstaLaPlata } from '@/components/pagos/DondeEstaLaPlata';
import { formatCurrency, extractError } from '@/lib/utils';
import { METODO_PAGO_LABEL } from '@/lib/constants';
import type { Pago, Gasto, MetodoPago } from '@/types';
import { PendientesSection } from './PendientesSection';

const MEDIOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'echeq', label: 'Echeq' },
  { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
  { value: 'wapa', label: 'Wapa' },
];

const schema = z.object({
  alquiler_id: z.coerce.number().min(1, 'Requerido'),
  monto: z.coerce.number().min(0.01, 'Debe ser mayor a 0'),
  medio_pago: z.string().min(1, 'Requerido'),
  con_factura: z.boolean().default(false),
  fecha: z.string().min(1, 'Requerido'),
  notas: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const MEDIO_COLOR: Record<string, string> = {
  efectivo: 'bg-emerald-100 text-emerald-700',
  transferencia: 'bg-blue-100 text-blue-700',
  tarjeta: 'bg-purple-100 text-purple-700',
  cheque: 'bg-amber-100 text-amber-700',
  echeq: 'bg-orange-100 text-orange-700',
  cuenta_corriente: 'bg-slate-100 text-slate-700',
};

function PagoRow({ p, onDelete }: { p: Pago; onDelete: (id: number) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 rounded-lg group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{formatCurrency(p.monto)}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MEDIO_COLOR[p.medio_pago] ?? 'bg-muted text-muted-foreground'}`}>
            {METODO_PAGO_LABEL[p.medio_pago] ?? p.medio_pago}
          </span>
          {p.con_factura && (
            <span className="text-[10px] text-muted-foreground border border-border rounded px-1">Factura</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {p.cliente_nombre ?? '—'} · {p.vehiculo_patente ?? '—'}
          {p.notas && ` · ${p.notas}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {p.reserva_id && (
          <button
            onClick={() => navigate('/reservas')}
            className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            title="Ver reserva"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(p.id)}
          className="p-1 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar pago"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function GastoRow({ g }: { g: Gasto }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 rounded-lg cursor-pointer"
      onClick={() => navigate(`/flota/${g.vehiculo_id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-danger">−{formatCurrency(g.monto)}</span>
          <span className="text-[10px] text-muted-foreground border border-border rounded px-1">{g.tipo}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {g.descripcion}{g.proveedor ? ` · ${g.proveedor}` : ''}
        </p>
      </div>
      <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

export function CajaPage() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);

  const { data: caja, isLoading, refetch, isFetching } = useCajaDia(fecha);
  const crearPago = useCrearPago();
  const anularPago = useAnularPago();
  const [anularId, setAnularId] = useState<number | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha, con_factura: false },
  });

  async function onSubmit(data: FormData) {
    try {
      await crearPago.mutateAsync({ ...data, medio_pago: data.medio_pago as MetodoPago });
      toast.success('Cobro registrado');
      reset({ fecha, con_factura: false });
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  // Un cobro no se borra: se da de baja con motivo. El `confirm()` del
  // navegador no servía para esto — no puede pedir un texto, y el motivo es lo
  // único que va a quedar para explicar por qué cambió la caja de un día
  // pasado.
  function handleDelete(id: number) {
    setAnularId(id);
  }

  async function handleAnular(motivo: string) {
    if (!anularId) return;
    try {
      await anularPago.mutateAsync({ id: anularId, motivo });
      toast.success('Cobro dado de baja');
      setAnularId(null);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Caja y Pagos</h1>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1 bg-background text-foreground"
          />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Registrar cobro
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <PendientesSection />

        {/* Cards resumen */}
        {caja && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">Ingresos</span>
              </div>
              <p className="text-2xl font-bold text-success">{formatCurrency(caja.total_ingresos)}</p>
              {/* Los cobros con medio `cuenta_corriente` no son plata que entro:
                  se los anotamos al cliente. Estaban sumados al total y lo
                  inflaban sin que se notara. Ahora salen aparte. */}
              {!!caja.total_a_cuenta && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  + {formatCurrency(caja.total_a_cuenta)} anotados en cuenta corriente
                </p>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-danger" />
                <span className="text-xs text-muted-foreground">Egresos</span>
              </div>
              <p className="text-2xl font-bold text-danger">{formatCurrency(caja.total_egresos)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Balance</span>
              </div>
              <p className={`text-2xl font-bold ${caja.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(caja.balance)}
              </p>
            </div>
          </div>
        )}

        {/* Donde esta la plata: el efectivo del cajon y desde cuando. */}
        <MotivoDialog
          open={anularId !== null}
          onOpenChange={open => !open && setAnularId(null)}
          title="Dar de baja el cobro"
          description="El cobro no se borra: queda registrado como dado de baja, sale de la caja de su fecha, y su crédito en la cuenta corriente se revierte con un contra-asiento. El motivo es lo único que va a explicar por qué."
          confirmLabel="Dar de baja"
          loading={anularPago.isPending}
          onConfirm={handleAnular}
        />

        {caja && (
          <DondeEstaLaPlata
            fecha={fecha}
            datos={caja.donde_esta_la_plata}
            movimientos={caja.movimientos_caja}
          />
        )}

        {/* Desglose por medio de pago */}
        {caja?.por_medio_pago && Object.keys(caja.por_medio_pago).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Por medio de pago</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(caja.por_medio_pago).map(([medio, monto]) => (
                <div
                  key={medio}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${MEDIO_COLOR[medio] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {METODO_PAGO_LABEL[medio] ?? medio}: <span className="font-bold">{formatCurrency(monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulario inline */}
        {showForm && (
          <div className="bg-card border border-primary/30 rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Nuevo cobro</p>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">ID Alquiler</label>
                <input
                  {...register('alquiler_id')}
                  type="number"
                  placeholder="Ej: 12"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
                />
                {errors.alquiler_id && <p className="text-xs text-danger mt-0.5">{errors.alquiler_id.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monto</label>
                <input
                  {...register('monto')}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
                />
                {errors.monto && <p className="text-xs text-danger mt-0.5">{errors.monto.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Medio de pago</label>
                <select {...register('medio_pago')} className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background">
                  {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha</label>
                <input
                  {...register('fecha')}
                  type="date"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Notas (opcional)</label>
                <input
                  {...register('notas')}
                  placeholder="Ej: Adelanto primer semana"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" {...register('con_factura')} id="factura" className="rounded" />
                <label htmlFor="factura" className="text-sm text-muted-foreground">Con factura</label>
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crearPago.isPending}
                  className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {crearPago.isPending ? 'Guardando...' : 'Guardar cobro'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de cobros y gastos del día */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Cargando caja...</div>
        ) : caja ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cobros (ingresos) */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold text-foreground">Cobros</span>
                <span className="ml-auto text-xs text-muted-foreground">{caja.cobros.length} registros</span>
              </div>
              {caja.cobros.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Sin cobros este día</p>
              ) : (
                <div className="p-1">
                  {caja.cobros.map(p => (
                    <PagoRow key={p.id} p={p} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>

            {/* Gastos (egresos) */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-danger" />
                <span className="text-sm font-semibold text-foreground">Gastos de flota</span>
                <span className="ml-auto text-xs text-muted-foreground">{caja.gastos.length} registros</span>
              </div>
              {caja.gastos.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Sin gastos este día</p>
              ) : (
                <div className="p-1">
                  {caja.gastos.map(g => (
                    <GastoRow key={g.id} g={g} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
