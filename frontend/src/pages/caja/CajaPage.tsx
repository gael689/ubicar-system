import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, TrendingUp, TrendingDown, DollarSign,
  ChevronRight, Car, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCajaDia, useAnularPago } from '@/hooks/usePagos';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { DondeEstaLaPlata } from '@/components/pagos/DondeEstaLaPlata';
import { CobroSueltoForm } from '@/components/pagos/CobroSueltoForm';
import { formatCurrency, extractError, hoyLocal } from '@/lib/utils';
import { MEDIO_PAGO_COLOR } from '@/lib/constants';
import { etiquetaMedio } from '@/lib/mediosPago';
import type { Pago, Gasto } from '@/types';
import { PendientesSection } from './PendientesSection';

function PagoRow({ p, onDelete }: { p: Pago; onDelete: (id: number) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 rounded-lg group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{formatCurrency(p.monto)}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MEDIO_PAGO_COLOR[p.medio_pago] ?? 'bg-muted text-muted-foreground'}`}>
            {etiquetaMedio(p.medio_pago)}
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
          title="Anular cobro"
          aria-label="Anular cobro"
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
  const [fecha, setFecha] = useState(() => hoyLocal());
  const [showForm, setShowForm] = useState(false);

  const { data: caja, isLoading, refetch, isFetching } = useCajaDia(fecha);
  const anularPago = useAnularPago();
  const [anularId, setAnularId] = useState<number | null>(null);

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
      toast.success('Cobro anulado');
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
          {/* Vive adentro de la pestaña "Caja del día" de Finanzas: el
              título dice qué día se está mirando, no repite la pestaña. */}
          <h1 className="text-lg font-bold text-foreground">Caja del</h1>
          <input
            type="date"
            value={fecha}
            max={hoyLocal()}
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
                <span className="text-xs text-muted-foreground">Gastos</span>
              </div>
              <p className="text-2xl font-bold text-danger">{formatCurrency(caja.total_egresos)}</p>
            </div>
            {/* Se llamaba "Balance" y se leía como "lo que hay en el cajón",
                que es otra cosa (lo contesta "Dónde está la plata"). La
                cuenta va escrita abajo para que no haya que adivinarla. */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Resultado del día</span>
              </div>
              <p className={`text-2xl font-bold ${caja.resultado_del_dia >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(caja.resultado_del_dia)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ingresos {formatCurrency(caja.total_ingresos)} − gastos {formatCurrency(caja.total_egresos)}
              </p>
            </div>
          </div>
        )}

        {/* Donde esta la plata: el efectivo del cajon y desde cuando. */}
        <MotivoDialog
          open={anularId !== null}
          onOpenChange={open => !open && setAnularId(null)}
          title="Anular el cobro"
          description="El cobro no se borra: queda anulado, sale de la caja de su fecha y se le vuelve a sumar la deuda al cliente. El motivo es lo único que va a explicar por qué."
          confirmLabel="Anular cobro"
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
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${MEDIO_PAGO_COLOR[medio] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {etiquetaMedio(medio)}: <span className="font-bold">{formatCurrency(monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <CobroSueltoForm fecha={fecha} onListo={() => setShowForm(false)} />
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
