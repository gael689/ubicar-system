import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePagosPendientes, useCrearPago } from '@/hooks/usePagos';
import { useRegistrarCobro } from '@/hooks/useResolverReserva';
import { formatCurrency, formatDate, extractError, hoyLocal } from '@/lib/utils';
import { MEDIOS_COBRO_MANUAL, opcionesDeMedio } from '@/lib/mediosPago';
import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { PagoPendiente, MetodoPago } from '@/types';

const MEDIOS = opcionesDeMedio(MEDIOS_COBRO_MANUAL);

/**
 * Lo que hay que cobrar ahora: alquileres con el auto afuera y saldo, y
 * reservas que retiran en los próximos días sin pagar completas.
 *
 * **Cada cobro pasa por el camino que asienta la plata.** El de una reserva
 * sin alquiler es la seña, `POST /reservas/{id}/registrar-cobro`: crea el
 * `Pago` (entra a la caja del día) y el crédito en la cuenta del cliente.
 * Antes esta pantalla editaba `anticipo_monto` de la reserva con un PATCH —
 * sin pago, sin asiento, sin nada en la caja— y la seña existía sólo como un
 * número que ningún cálculo de saldo miraba.
 */
export function PendientesSection() {
  const { data: pendientes, isLoading, refetch, isFetching } = usePagosPendientes();
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);
  const qc = useQueryClient();

  const crearPago = useCrearPago();
  const registrarCobro = useRegistrarCobro();
  const guardando = crearPago.isPending || registrarCobro.isPending;

  const [monto, setMonto] = useState<number | ''>('');
  const [medio, setMedio] = useState<MetodoPago>('efectivo');
  const [fecha, setFecha] = useState(hoyLocal());
  const [notas, setNotas] = useState('');

  const handleAbrirCobro = (p: PagoPendiente) => {
    setCobrandoId(`${p.tipo}-${p.id_origen}`);
    setMonto(p.saldo_pendiente);
    setMedio('efectivo');
    setFecha(hoyLocal());
    setNotas('');
  };

  const handleSubmit = async (p: PagoPendiente) => {
    if (!monto || monto <= 0) {
      toast.error('Poné un monto mayor a cero');
      return;
    }

    try {
      if (p.tipo === 'alquiler_checkout') {
        await crearPago.mutateAsync({
          alquiler_id: p.id_origen,
          monto: Number(monto),
          medio_pago: medio,
          fecha,
          notas: notas || null,
        });
        toast.success('Cobro registrado');
      } else {
        // La seña de una reserva que todavía no salió. `confirmar: false`:
        // cobrar no es confirmar — eso lo decide quien asigna el auto.
        await registrarCobro.mutateAsync({
          id: p.id_origen,
          monto: Number(monto),
          medio_pago: medio,
          fecha,
          referencia: notas || undefined,
          confirmar: false,
        });
        // `registrar-cobro` no invalida la caja: el cobro tiene que aparecer
        // ya en la caja del día.
        qc.invalidateQueries({ queryKey: ['caja'] });
        qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
        toast.success('Seña registrada');
      }
      setCobrandoId(null);
      refetch();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4 text-center">Cargando cobros pendientes…</div>;
  }

  if (!pendientes || pendientes.length === 0) {
    return null; // Sin nada para cobrar no hace falta el cartel.
  }

  return (
    <div className="bg-warning/5 border border-warning/30 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-warning/30 flex items-center justify-between bg-warning/10">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning" />
          <h3 className="text-sm font-bold text-foreground">Cobros pendientes</h3>
          <span className="text-xs text-muted-foreground">
            autos afuera con saldo y reservas que retiran esta semana
          </span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground hover:text-foreground"
          title="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="divide-y divide-warning/20">
        {pendientes.map(p => {
          const isCobrando = cobrandoId === `${p.tipo}-${p.id_origen}`;
          const esReserva = p.tipo === 'reserva';

          return (
            <div key={`${p.tipo}-${p.id_origen}`} className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{p.cliente}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                      {esReserva ? `Reserva #${p.id_origen}` : `Alquiler #${p.id_origen}`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Total: {formatCurrency(p.monto_total)} · Pagado: {formatCurrency(p.monto_abonado)}
                    {p.fecha_referencia && (
                      <span className="ml-1">
                        · {esReserva ? 'Retira' : 'Salió'} el {formatDate(p.fecha_referencia)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Falta cobrar</div>
                    <div className="text-base font-bold text-danger">{formatCurrency(p.saldo_pendiente)}</div>
                  </div>
                  {!isCobrando && (
                    <button
                      onClick={() => handleAbrirCobro(p)}
                      className="px-3 py-1.5 bg-card border border-warning/40 text-foreground text-sm font-medium rounded-lg hover:bg-warning/10"
                    >
                      {esReserva ? 'Cobrar seña' : 'Cobrar'}
                    </button>
                  )}
                </div>
              </div>

              {isCobrando && (
                <div className="mt-2 p-3 bg-card border border-border rounded-lg flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs text-muted-foreground block mb-1">Monto</label>
                    <input
                      type="number"
                      value={monto}
                      onChange={e => setMonto(parseFloat(e.target.value) || '')}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground block mb-1">Cómo pagó</label>
                    <select
                      value={medio}
                      onChange={e => setMedio(e.target.value as MetodoPago)}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                    >
                      {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs text-muted-foreground block mb-1">Fecha</label>
                    <input
                      type="date"
                      value={fecha}
                      max={hoyLocal()}
                      onChange={e => setFecha(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                    />
                  </div>
                  <div className="flex-2 min-w-[150px]">
                    <label className="text-xs text-muted-foreground block mb-1">
                      {esReserva ? 'N° de operación (opcional)' : 'Notas (opcional)'}
                    </label>
                    <input
                      type="text"
                      value={notas}
                      onChange={e => setNotas(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCobrandoId(null)}
                      className="px-3 py-1.5 text-sm text-muted-foreground border border-border rounded hover:bg-accent"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleSubmit(p)}
                      disabled={guardando}
                      className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 flex items-center gap-1 disabled:opacity-50"
                    >
                      {guardando ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Registrar cobro
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
