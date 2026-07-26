import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { OcupacionPage } from './ocupacion/OcupacionPage';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { formatCurrency } from '@/lib/utils';
import { CalendarIcon, BanknotesIcon, KeyIcon, ArrowDownOnSquareStackIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';

const ICONS = {
  nueva_reserva: CalendarIcon,
  check_out: KeyIcon,
  devolucion: ArrowDownOnSquareStackIcon,
  pago: BanknotesIcon,
  gasto: CurrencyDollarIcon,
};

const COLORS = {
  nueva_reserva: 'text-indigo-600 bg-indigo-100',
  check_out: 'text-emerald-600 bg-emerald-100',
  devolucion: 'text-blue-600 bg-blue-100',
  pago: 'text-green-600 bg-green-100',
  gasto: 'text-red-600 bg-red-100',
};

export function Dashboard() {
  const navigate = useNavigate();
  const [fechaFlujo, setFechaFlujo] = useState(new Date().toISOString().split('T')[0]);
  const { data: stats, isLoading } = useDashboardStats(fechaFlujo);

  const [flujoHeight, setFlujoHeight] = useState(65);
  const [isExpanded, setIsExpanded] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < window.innerHeight - 200) {
        setFlujoHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = () => {
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';
  };

  return (
    <div className="flex flex-col h-full gap-0 bg-background overflow-hidden relative">
      {/* Ocupación como vista principal (Calendario) */}
      {!isExpanded && (
        <section className="flex-1 min-h-0">
          <OcupacionPage />
        </section>
      )}

      {/* Resizer */}
      {!isExpanded && (
        <div 
          onMouseDown={handleMouseDown}
          className="h-2 w-full bg-slate-100 border-y border-border cursor-row-resize flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0 group"
        >
          <div className="w-8 h-1 rounded-full bg-slate-300 group-hover:bg-slate-400" />
        </div>
      )}

      {/* Flujo del día (Timeline vertical) */}
      <section 
        className={`shrink-0 bg-background px-6 py-4 overflow-y-auto ${isExpanded ? 'flex-1 h-full' : ''}`}
        style={!isExpanded ? { height: `${flujoHeight}px` } : {}}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">Flujo del día / Movimientos del día</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fechaFlujo}
              onChange={(e) => setFechaFlujo(e.target.value)}
              className="px-2 py-1 text-xs rounded-md border border-input bg-background"
            />
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-1 text-xs font-semibold rounded-md border border-input bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              {isExpanded ? 'Contraer' : 'Expandir'}
            </button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-2">Cargando movimientos...</div>
        ) : stats?.flujo_del_dia?.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center bg-card rounded-xl border border-border">
            Aún no hay movimientos en el día de hoy.
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 pb-2">
            {stats?.flujo_del_dia.map((evento, index) => {
              const Icono = ICONS[evento.tipo];
              return (
                <div key={index} className="relative pl-6">
                  {/* Círculo en la línea */}
                  <div className={`absolute -left-[11px] top-1 p-1 rounded-full border-2 border-white ${COLORS[evento.tipo]}`}>
                    <Icono className="w-3 h-3" />
                  </div>
                  
                  {/* Contenido del evento */}
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
                    {/* Montos / Ver Reserva */}
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
        )}
      </section>
    </div>
  );
}
