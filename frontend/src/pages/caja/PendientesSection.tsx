import { useState } from 'react';
import { usePagosPendientes, useCrearPago } from '@/hooks/usePagos';
import { useReservas } from '@/hooks/useReservas';
import { formatCurrency, extractError } from '@/lib/utils';
import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { PagoPendiente, MetodoPago } from '@/types';

function today() {
  return new Date().toISOString().split('T')[0];
}

const MEDIOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'echeq', label: 'Echeq' },
  { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
];

export function PendientesSection() {
  const { data: pendientes, isLoading, refetch, isFetching } = usePagosPendientes();
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);
  
  const crearPago = useCrearPago();
  const { updateReserva } = useReservas();

  const [monto, setMonto] = useState<number | ''>('');
  const [medio, setMedio] = useState<string>('efectivo');
  const [fecha, setFecha] = useState(today());
  const [notas, setNotas] = useState('');

  const handleAbrirCobro = (p: PagoPendiente) => {
    setCobrandoId(`${p.tipo}-${p.id_origen}`);
    setMonto(p.saldo_pendiente);
    setMedio('efectivo');
    setFecha(today());
    setNotas('');
  };

  const handleSubmit = async (p: PagoPendiente) => {
    if (!monto || monto <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }
    
    try {
      if (p.tipo === 'alquiler_checkout') {
        await crearPago.mutateAsync({
          alquiler_id: p.id_origen,
          monto: Number(monto),
          medio_pago: medio as MetodoPago,
          fecha,
          notas: notas || null,
        });
        toast.success('Cobro de alquiler registrado');
      } else {
        const nuevoAbonado = p.monto_abonado + Number(monto);
        const estado_pago = nuevoAbonado >= p.monto_total ? 'pagado' : 'anticipo';
        
        await updateReserva(p.id_origen, {
          estado_pago,
          anticipo_monto: nuevoAbonado,
          anticipo_fecha: fecha,
          anticipo_medio_pago: medio,
        } as any);
        toast.success('Anticipo de reserva actualizado');
      }
      setCobrandoId(null);
      refetch();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (isLoading) {
    return <div className="text-sm text-slate-500 py-4 text-center">Cargando pendientes...</div>;
  }

  if (!pendientes || pendientes.length === 0) {
    return null; // Ocultar si no hay deudas
  }

  return (
    <div className="bg-amber-50/50 border border-amber-200 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-amber-200 flex items-center justify-between bg-amber-100/50">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-amber-900">Cobros Pendientes</h3>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="text-amber-700 hover:text-amber-900">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="divide-y divide-amber-100">
        {pendientes.map(p => {
          const isCobrando = cobrandoId === `${p.tipo}-${p.id_origen}`;
          
          return (
            <div key={`${p.tipo}-${p.id_origen}`} className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{p.cliente}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      {p.tipo === 'reserva' ? 'Reserva' : 'Alquiler'} #{p.id_origen}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Total: {formatCurrency(p.monto_total)} · Abonado: {formatCurrency(p.monto_abonado)}
                    {p.notas && <span className="ml-1 text-amber-700">({p.notas})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Saldo pendiente</div>
                    <div className="text-base font-bold text-danger">{formatCurrency(p.saldo_pendiente)}</div>
                  </div>
                  {!isCobrando && (
                    <button onClick={() => handleAbrirCobro(p)} className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-50">
                      Cobrar
                    </button>
                  )}
                </div>
              </div>

              {isCobrando && (
                <div className="mt-2 p-3 bg-white border border-amber-200 rounded-lg flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs text-slate-600 block mb-1">Monto a cobrar</label>
                    <input type="number" value={monto} onChange={e => setMonto(parseFloat(e.target.value) || '')} 
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-slate-600 block mb-1">Medio</label>
                    <select value={medio} onChange={e => setMedio(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500">
                      {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs text-slate-600 block mb-1">Fecha</label>
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                  {p.tipo === 'alquiler_checkout' && (
                    <div className="flex-2 min-w-[150px]">
                      <label className="text-xs text-slate-600 block mb-1">Notas</label>
                      <input type="text" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional..."
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setCobrandoId(null)} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
                      Cancelar
                    </button>
                    <button onClick={() => handleSubmit(p)} disabled={crearPago.isPending} className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 flex items-center gap-1 disabled:opacity-50">
                      {crearPago.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
