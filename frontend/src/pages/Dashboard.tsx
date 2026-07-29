import { useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { OcupacionPage } from './ocupacion/OcupacionPage';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { formatCurrency } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Banknote, Key, ArrowDownToLine, DollarSign, Maximize2 } from 'lucide-react';
import type { DashboardDetalle } from '@/types';

type FlujoEvento = DashboardDetalle['flujo_del_dia'][number];

const ICONS = {
  nueva_reserva: Calendar,
  check_out: Key,
  devolucion: ArrowDownToLine,
  pago: Banknote,
  gasto: DollarSign,
};

const COLORS = {
  nueva_reserva: 'text-primary bg-primary/15',
  check_out: 'text-emerald-600 bg-emerald-100',
  devolucion: 'text-blue-600 bg-blue-100',
  pago: 'text-green-600 bg-green-100',
  gasto: 'text-red-600 bg-red-100',
};

function FlujoTimeline({ stats, isLoading, navigate }: { stats?: DashboardDetalle; isLoading: boolean; navigate: NavigateFunction }) {
  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-2">Cargando movimientos...</div>;
  }
  if (!stats?.flujo_del_dia?.length) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center bg-card rounded-xl border border-border">
        Aún no hay movimientos en ese día.
      </div>
    );
  }
  return (
    <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 pb-2">
      {stats.flujo_del_dia.map((evento: FlujoEvento, index: number) => {
        const Icono = ICONS[evento.tipo];
        return (
          <div key={index} className="relative pl-6">
            <div className={`absolute -left-[11px] top-1 p-1 rounded-full border-2 border-white ${COLORS[evento.tipo]}`}>
              <Icono className="w-3 h-3" />
            </div>
            <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-sm flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {evento.descripcion}
                </p>
                {evento.hora_programada && evento.hora_real ? (
                  <p className="text-[10px] text-muted-foreground font-medium flex gap-1">
                    <span className="font-bold text-slate-700">Real: {evento.hora_real}</span> | Prog: {evento.hora_programada}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {evento.hora}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end shrink-0 gap-1">
                {evento.monto !== undefined && (
                  <span className={`text-xs font-bold ${evento.monto >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {evento.monto >= 0 ? '+' : ''}{formatCurrency(evento.monto)}
                  </span>
                )}
                {evento.reserva_id && (
                  <button
                    onClick={() => navigate('/reservas')}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Ver Reserva
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [fechaFlujo, setFechaFlujo] = useState(new Date().toISOString().split('T')[0]);
  const { data: stats, isLoading } = useDashboardStats(fechaFlujo);
  const [flujoDialogOpen, setFlujoDialogOpen] = useState(false);

  return (
    <div className="flex flex-col h-full gap-0 bg-background overflow-hidden relative">
      {/* Ocupación — calendario, siempre visible, ocupa todo el espacio disponible */}
      <section className="flex-1 min-h-0">
        <OcupacionPage />
      </section>

      {/* El flujo del día vive **sólo** en el modal.
          Antes ocupaba una franja fija de 220px abajo del calendario, y la
          mayor parte del tiempo mostraba "aún no hay movimientos": le comía un
          cuarto de pantalla al calendario, que es lo que de verdad se mira
          todo el día, para no decir nada. El botón flota encima y no le quita
          ni un píxel. */}
      <button
        onClick={() => setFlujoDialogOpen(true)}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-primary/90"
      >
        <Maximize2 className="h-3.5 w-3.5" /> Ver flujo del día
      </button>

      {/* Modal: vista completa, con selector de fecha */}
      <Dialog open={flujoDialogOpen} onOpenChange={setFlujoDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Flujo del día</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-end shrink-0">
            <input
              type="date"
              value={fechaFlujo}
              onChange={(e) => setFechaFlujo(e.target.value)}
              className="px-2 py-1 text-xs rounded-md border border-input bg-background"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <FlujoTimeline stats={stats} isLoading={isLoading} navigate={navigate} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
