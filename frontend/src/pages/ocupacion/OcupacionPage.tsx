import { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, CheckCircle2, Car, Flag, XCircle, Plus, ChevronLeft, ChevronRight, GripVertical, Calendar, LayoutList, AlertTriangle, AlertCircle, Ban, Wrench, CalendarRange } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useOcupacion, useResumenAnual } from '@/hooks/useOcupacion';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CalendarioAnual } from '@/components/shared/CalendarioAnual';
import type { VehiculoOcupacion, EventoOcupacion, Reserva, ApiResponse, DiaResumenAnual } from '@/types';
import { ReservaModal } from '../reservas/ReservaModal';
import { CheckoutModal } from '../reservas/CheckoutModal';
import { ReservaInfoModal } from '../reservas/ReservaInfoModal';
import { PanelPendienteAsignacion } from '@/components/reservas/PanelPendienteAsignacion';

const ESTADO_COLORS_EVENTO: Record<string, string> = {
  // Plan de conexión (13/08), cierra C-6: `pendiente` sí tiene auto asignado
  // (viene del mostrador) y caía en el fallback gris, indistinguible de una
  // `finalizada`. Ámbar y borde punteado: tomada, pero todavía no firme.
  pendiente: 'bg-amber-400 border-amber-500 border-dashed text-amber-950',
  confirmada: 'bg-blue-500 border-blue-600 text-white',
  activa: 'bg-emerald-500 border-emerald-600 text-white',
  vencida: 'bg-red-600 border-red-700 text-white animate-pulse',
  finalizada: 'bg-slate-500 border-slate-600 text-white',
  cancelada: 'bg-red-500 border-red-600 text-white line-through opacity-90',
  // Bloqueos: el `estado` que llega es el motivo. Se pintan con rayado
  // diagonal para que a simple vista no se confundan con una reserva — el
  // auto no está alquilado, está fuera de circulación.
  mantenimiento: 'bg-amber-600 border-amber-700 text-white bg-stripes',
  siniestro: 'bg-red-700 border-red-800 text-white bg-stripes',
  uso_interno: 'bg-primary border-primary text-white bg-stripes',
  venta: 'bg-emerald-700 border-emerald-800 text-white bg-stripes',
  otro: 'bg-slate-600 border-slate-700 text-white bg-stripes',
};

/** Los bloqueos ocupan el vehículo pero no son una reserva: no tienen ficha. */
const ES_BLOQUEO = (tipo: string) => tipo === 'bloqueo';

const ESTADOS_RESERVA_LEYENDA = [
  'pendiente', 'confirmada', 'activa', 'vencida', 'finalizada', 'cancelada',
] as const;

const ESTADO_COLORS_BADGE: Record<string, string> = {
  confirmada: 'bg-blue-100 text-blue-800',
  activa: 'bg-emerald-100 text-emerald-800',
  vencida: 'bg-red-100 text-red-800',
  finalizada: 'bg-slate-200 text-slate-700',
  cancelada: 'bg-red-100 text-red-800 line-through',
  mantenimiento: 'bg-amber-600 text-white',
  siniestro: 'bg-red-700 text-white',
  uso_interno: 'bg-primary text-white',
  venta: 'bg-emerald-700 text-white',
  otro: 'bg-slate-600 text-white',
};

const ESTADO_ICONS: Record<string, React.ReactNode> = {
  pendiente: <Clock className="w-3.5 h-3.5" />,
  confirmada: <CheckCircle2 className="w-3.5 h-3.5" />,
  activa: <Car className="w-3.5 h-3.5" />,
  vencida: <AlertCircle className="w-3.5 h-3.5" />,
  finalizada: <Flag className="w-3.5 h-3.5" />,
  cancelada: <XCircle className="w-3.5 h-3.5" />,
  mantenimiento: <Wrench className="w-3.5 h-3.5" />,
  siniestro: <AlertTriangle className="w-3.5 h-3.5" />,
  uso_interno: <Ban className="w-3.5 h-3.5" />,
  venta: <Ban className="w-3.5 h-3.5" />,
  otro: <Ban className="w-3.5 h-3.5" />,
};

function AsyncCheckoutModal({ 
  reservaId, onClose, onSuccess, defaultTime, defaultDate 
}: { 
  reservaId: number, onClose: () => void, onSuccess: () => void, defaultTime?: string, defaultDate?: string 
}) {
  const { data: reserva, isLoading } = useQuery({
    queryKey: ['reserva', reservaId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Reserva>>(`/reservas/${reservaId}`);
      return res.data.data;
    }
  });

  if (isLoading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-50">
      <div className="bg-white p-6 rounded-xl shadow-xl flex items-center gap-3 text-slate-700">
        <Clock className="w-5 h-5 animate-spin text-primary" />
        <span className="font-medium text-sm">Cargando reserva...</span>
      </div>
    </div>
  );
  if (!reserva) return null;

  return <CheckoutModal reserva={reserva} onClose={onClose} onSuccess={onSuccess} defaultTime={defaultTime} defaultDate={defaultDate} />;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

const FULL_DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// 2.8: 'anual' es una **pre-vista** de 'timeline', no un reemplazo — cae ahí
// mismo al elegir un mes o un día. El modo por defecto no cambia.
type ViewMode = 'timeline' | 'agenda' | 'anual';

export function OcupacionPage() {
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return 'agenda';
    return 'timeline';
  });
  const [agendaDate, setAgendaDate] = useState<Date>(new Date());

  const [vehiculos, setVehiculos] = useState<VehiculoOcupacion[]>([]);
  const [eventos, setEventos] = useState<EventoOcupacion[]>([]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollToDate, setScrollToDate] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const [draggingVehiculoId, setDraggingVehiculoId] = useState<number | null>(null);

  const [showReservaModal, setShowReservaModal] = useState(false);
  const [initialVehiculoId, setInitialVehiculoId] = useState<number | undefined>();
  const [initialFecha, setInitialFecha] = useState<string | undefined>();

  const [checkoutPrompt, setCheckoutPrompt] = useState<{ id: number, fecha: string, hora: string } | null>(null);
  const [activeCheckout, setActiveCheckout] = useState<{ id: number, defaultTime?: string, defaultDate?: string } | null>(null);
  const [reservaInfoId, setReservaInfoId] = useState<number | null>(null);

  const DAYS_TO_SHOW = 120;

  const days = Array.from({ length: DAYS_TO_SHOW }, (_, i) => {
    const d = new Date(currentYear, currentMonth, 1);
    d.setDate(d.getDate() + i);
    return d;
  });

  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const totalDays = days.length;

  const { data: ocupacionData, isLoading: loading, error: queryError, refetch } = useOcupacion({
    fecha_inicio: formatDate(addDays(rangeStart, -2)),
    fecha_fin: formatDate(addDays(rangeEnd, 2)),
  });
  const error = queryError ? 'Error al cargar ocupación' : null;

  // `vehiculos`/`eventos` siguen siendo estado local y no `ocupacionData`
  // directo: el drag-and-drop reordena la lista de vehículos optimistamente
  // (más abajo, `handleDrop`) y necesita poder mutarla sin esperar un
  // refetch. Se resincronizan solos cada vez que llega una respuesta nueva
  // —por cambio de mes, por invalidación desde otra pantalla, o por el
  // refresco automático cada 60s (C-5)—, así que nunca quedan pisados por
  // mucho tiempo.
  useEffect(() => {
    if (!ocupacionData) return;
    setVehiculos(ocupacionData.vehiculos);
    setEventos(ocupacionData.eventos);
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      setScrollToDate(formatDate(new Date()));
    }
  }, [ocupacionData]);

  const loadData = () => { void refetch(); };

  // Scroll to a specific date column in timeline view
  useEffect(() => {
    if (!scrollToDate || !scrollContainerRef.current || viewMode !== 'timeline') return;
    const targetIdx = days.findIndex(d => formatDate(d) === scrollToDate);
    if (targetIdx !== -1) {
      const scrollTarget = Math.max(0, (targetIdx - 1) * 180);
      scrollContainerRef.current.scrollTo({ left: scrollTarget, behavior: 'smooth' });
    }
    setScrollToDate(null);
  }, [scrollToDate, days, viewMode]);

  const goToday = () => {
    const d = new Date();
    setCurrentYear(d.getFullYear());
    setCurrentMonth(d.getMonth());
    setScrollToDate(formatDate(d));
    if (viewMode === 'agenda') setAgendaDate(d);
  };

  const jumpToDate = (dateStr: string) => {
    if (!dateStr) return;
    const d = parseDate(dateStr);
    setCurrentYear(d.getFullYear());
    setCurrentMonth(d.getMonth());
    setScrollToDate(dateStr);
    if (viewMode === 'agenda') setAgendaDate(d);
  };

  // 2.8 — desde la pre-vista anual, un mes o un día caen en la vista
  // timeline de siempre. El estado y el efecto de scroll ya existían para el
  // botón "Hoy"; acá sólo se llaman.
  const onSelectMesAnual = (anioSel: number, mesSel: number) => {
    setViewMode('timeline');
    setCurrentYear(anioSel);
    setCurrentMonth(mesSel);
    setScrollToDate(`${anioSel}-${String(mesSel + 1).padStart(2, '0')}-01`);
  };
  const onSelectDiaAnual = (fechaISO: string) => {
    setViewMode('timeline');
    jumpToDate(fechaISO);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const openReserva = (vehiculoId: number, fecha: string) => {
    setInitialVehiculoId(vehiculoId);
    setInitialFecha(fecha);
    setShowReservaModal(true);
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggingVehiculoId(id);
    e.dataTransfer.setData('text/plain', id.toString());
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = async (e: React.DragEvent, dropOnId: number) => {
    e.preventDefault();
    if (!draggingVehiculoId || draggingVehiculoId === dropOnId) { setDraggingVehiculoId(null); return; }
    const draggedIdx = vehiculos.findIndex(v => v.id === draggingVehiculoId);
    const dropIdx = vehiculos.findIndex(v => v.id === dropOnId);
    if (draggedIdx === -1 || dropIdx === -1) return;
    const newVehiculos = [...vehiculos];
    const [draggedItem] = newVehiculos.splice(draggedIdx, 1);
    newVehiculos.splice(dropIdx, 0, draggedItem);
    setVehiculos(newVehiculos);
    setDraggingVehiculoId(null);
    try {
      const payload = newVehiculos.map((v, idx) => ({ id: v.id, orden: idx }));
      await api.put('/vehiculos/reorder', { vehiculos: payload });
    } catch { loadData(); }
  };

  const getEventsForVehicleDay = (vehiculoId: number, day: Date): EventoOcupacion[] => {
    const dayStr = formatDate(day);
    return eventos.filter(e => e.vehiculo_id === vehiculoId && e.fecha_inicio <= dayStr && e.fecha_fin >= dayStr);
  };

  const getEventSpan = (evento: EventoOcupacion, day: Date, vehiculoEvents: EventoOcupacion[]) => {
    const startDate = parseDate(evento.fecha_inicio);
    const endDate = parseDate(evento.fecha_fin);
    const dayDate = day;
    const isStart = formatDate(startDate) === formatDate(dayDate)
      || (startDate < rangeStart && formatDate(dayDate) === formatDate(rangeStart));
    const startDayStr = formatDate(startDate);
    const hasCollisionOnStart = vehiculoEvents.some(e => e.id !== evento.id && e.fecha_fin === startDayStr);
    const endDayStr = formatDate(endDate);
    const hasCollisionOnEnd = vehiculoEvents.some(e => e.id !== evento.id && e.fecha_inicio === endDayStr);
    const visibleEnd = endDate > rangeEnd ? rangeEnd : endDate;
    const visibleStart = startDate < rangeStart ? rangeStart : startDate;
    const baseSpan = Math.max(1, daysBetween(isStart ? dayDate : visibleStart, visibleEnd) + 1);
    const cappedSpan = Math.min(baseSpan, totalDays - daysBetween(rangeStart, dayDate));
    let leftPercent = 0;
    let widthPercent = cappedSpan * 100;
    if (hasCollisionOnStart && startDate >= rangeStart) { leftPercent = 50; widthPercent -= 50; }
    if (hasCollisionOnEnd && endDate <= rangeEnd) { widthPercent -= 50; }
    return { isStart, span: cappedSpan, leftPercent, widthPercent: Math.max(10, widthPercent) };
  };

  const isToday = (day: Date) => formatDate(day) === formatDate(new Date());

  const renderControls = () => (
    <div className="flex flex-wrap items-center gap-2">
      {/* Timeline month/year controls */}
      {viewMode === 'timeline' && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={currentMonth}
            onChange={e => setCurrentMonth(Number(e.target.value))}
            className="bg-transparent border-none text-slate-800 font-bold text-sm focus:ring-0 cursor-pointer p-0"
          >
            {MONTH_LABELS.map((m, i) => <option key={i} value={i}>{m.toUpperCase()}</option>)}
          </select>
          <select
            value={currentYear}
            onChange={e => setCurrentYear(Number(e.target.value))}
            className="bg-transparent border-none text-slate-800 font-bold text-sm focus:ring-0 cursor-pointer p-0"
          >
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Date jump (available in both modes) */}
      <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm px-2">
        <Calendar className="w-4 h-4 text-slate-400" />
        <input
          type="date"
          className="border-none bg-transparent text-sm text-slate-700 focus:ring-0 py-2 pr-1 cursor-pointer"
          onChange={e => jumpToDate(e.target.value)}
          title="Ir a fecha"
        />
      </div>

      <div className="w-px h-6 bg-slate-200" />

      <button
        onClick={goToday}
        className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-primary hover:bg-primary/10 rounded-lg border border-slate-200 bg-white shadow-sm transition-colors"
      >
        Hoy
      </button>

      {/* View mode toggle */}
      <div className="flex rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setViewMode('timeline')}
          className={`p-2 transition-colors ${viewMode === 'timeline' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Vista timeline"
        >
          <LayoutList className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewMode('agenda')}
          className={`p-2 transition-colors ${viewMode === 'agenda' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Vista agenda (mobile)"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewMode('anual')}
          className={`p-2 transition-colors ${viewMode === 'anual' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Vista anual — pre-vista del año completo"
        >
          <CalendarRange className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 h-full flex flex-col p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calendario de Ocupación</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {renderControls()}
          <button
            onClick={() => setShowReservaModal(true)}
            className="px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nueva Reserva
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-5 flex-wrap text-sm px-1">
        {/* Sólo los estados de reserva. Los 5 motivos de bloqueo no van uno
            por uno: se resumen en un único ítem "Bloqueado" al final, con el
            mismo rayado, para no convertir la leyenda en una lista de 10. */}
        {ESTADOS_RESERVA_LEYENDA.map((estado) => (
          <div key={estado} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-5 h-5 rounded border ${ESTADO_COLORS_EVENTO[estado]}`}>
              {ESTADO_ICONS[estado]}
            </div>
            <span className="text-slate-600 font-medium capitalize">{estado}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded border bg-slate-600 border-slate-700 text-white bg-stripes">
            <Ban className="w-3.5 h-3.5" />
          </div>
          <span className="text-slate-600 font-medium">Bloqueado</span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* TIMELINE VIEW */}
      {viewMode === 'timeline' && (
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 bg-white overflow-auto relative"
        >
          {loading ? (
            <div className="flex items-center justify-center h-60">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <table className="min-w-full text-sm table-fixed border-collapse">
              <colgroup>
                <col style={{ width: '220px', minWidth: '220px' }} />
                {days.map((_, i) => <col key={i} style={{ width: '180px', minWidth: '180px' }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                  <th
                    className="px-4 py-3 text-left font-semibold text-slate-700 sticky left-0 top-0 bg-slate-50 z-50 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]"
                    style={{ minWidth: '220px', width: '220px' }}
                  >
                    Vehículo
                  </th>
                  {days.map((day, i) => {
                    const today = isToday(day);
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <th
                        key={i}
                        className={`py-2 text-center border-r border-slate-200 sticky top-0 z-40 ${
                          today ? 'bg-primary/10/90 text-primary/90' :
                          weekend ? 'bg-slate-100/90 text-slate-600' : 'bg-slate-50/90 text-slate-600'
                        }`}
                        style={{ minWidth: '180px', width: '180px' }}
                      >
                        <div className={`font-bold text-[13px] ${today ? 'text-primary/90' : 'text-slate-800'}`}>
                          {day.getDate()}/{day.getMonth() + 1}/{day.getFullYear()}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider font-bold opacity-80 mt-0.5">
                          {FULL_DAY_LABELS[day.getDay()]}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vehiculos.length === 0 ? (
                  <tr>
                    <td colSpan={totalDays + 1} className="text-center py-16 text-slate-500 bg-slate-50">
                      No hay vehículos activos en la flota
                    </td>
                  </tr>
                ) : (
                  vehiculos.map(vehiculo => {
                    const processedEvents = new Set<number>();
                    const vehiculoEvents = eventos.filter(ev => ev.vehiculo_id === vehiculo.id);
                    return (
                      <tr
                        key={vehiculo.id}
                        className={`hover:bg-slate-50/80 transition-colors group ${draggingVehiculoId === vehiculo.id ? 'opacity-50' : ''}`}
                        draggable
                        onDragStart={e => handleDragStart(e, vehiculo.id)}
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, vehiculo.id)}
                      >
                        <td className="px-3 py-1 sticky left-0 bg-white group-hover:bg-slate-50/80 z-20 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0] align-middle h-[60px] cursor-grab active:cursor-grabbing">
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-slate-800 text-[13px] uppercase tracking-wide truncate">{vehiculo.patente}</span>
                              <span className="text-slate-700 font-semibold text-[10.5px] truncate">{vehiculo.marca} {vehiculo.modelo}</span>
                            </div>
                          </div>
                        </td>
                        {days.map((day, dayIdx) => {
                          const dayEvents = getEventsForVehicleDay(vehiculo.id, day);
                          const eventsToRender = dayEvents.filter(e => {
                            if (processedEvents.has(e.id)) return false;
                            const { isStart } = getEventSpan(e, day, vehiculoEvents);
                            return isStart;
                          });
                          const today = isToday(day);
                          const weekend = day.getDay() === 0 || day.getDay() === 6;
                          const bgClass = today ? 'bg-primary/10/30' : weekend ? 'bg-slate-50/50' : 'bg-white';

                          if (eventsToRender.length > 0) {
                            eventsToRender.forEach(e => processedEvents.add(e.id));
                            return (
                              <td
                                key={dayIdx}
                                className={`relative p-0 border-r border-slate-200 h-[60px] ${bgClass} group/cell cursor-pointer`}
                                style={{ overflow: 'visible' }}
                                onClick={() => openReserva(vehiculo.id, formatDate(day))}
                              >
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity z-0">
                                  <Plus className="w-5 h-5 text-primary/35" />
                                </div>
                                {eventsToRender.map(ev => {
                                  const { leftPercent, widthPercent } = getEventSpan(ev, day, vehiculoEvents);
                                  const colorClass = ESTADO_COLORS_EVENTO[ev.estado] || 'bg-slate-500 border-slate-600 text-white';
                                  const evDate = new Date(`${ev.fecha_inicio}T${ev.hora_inicio}`);
                                  const isOverdue = (!ev.tiene_alquiler && ev.estado === 'activa') || (ev.estado === 'confirmada' && evDate < new Date());
                                  
                                  const esBloqueo = ES_BLOQUEO(ev.tipo);

                                  return (
                                    <div
                                      key={`${ev.tipo}-${ev.id}`}
                                      // Un bloqueo no tiene ficha de reserva: abrirla con su id
                                      // mostraría la reserva equivocada.
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!esBloqueo) setReservaInfoId(ev.id);
                                      }}
                                      title={esBloqueo ? `${ev.cliente_nombre}${ev.notas ? ` — ${ev.notas}` : ''}` : undefined}
                                      className={`absolute inset-y-1 rounded-md border shadow-sm transition-all z-10 overflow-hidden hover:brightness-110 ${
                                        esBloqueo ? 'cursor-default' : 'cursor-pointer'
                                      } ${colorClass}`}
                                      style={{ left: `calc(${leftPercent}% + 1px)`, width: `calc(${widthPercent}% - 2px)`, minWidth: 0, height: '52px' }}
                                    >
                                      {isOverdue && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setCheckoutPrompt({ id: ev.id, fecha: ev.fecha_inicio, hora: ev.hora_inicio });
                                          }}
                                          className="absolute -top-1.5 -right-1.5 w-12 h-6 flex items-center justify-center bg-[#FFE500] text-black rounded-sm shadow-md z-30 hover:bg-[#FFD000] transition-colors border border-black"
                                          title="Falta confirmación de Check-out"
                                        >
                                          <AlertTriangle className="w-4 h-4" />
                                        </button>
                                      )}
                                      <div className="px-1.5 py-0.5 flex flex-col justify-center w-full h-full gap-0">
                                        <div className="font-bold text-[11px] truncate flex items-center gap-1 leading-tight w-full">
                                          {ESTADO_ICONS[ev.estado]}
                                          <span className="truncate drop-shadow-sm flex-1">
                                            {ev.notas || ev.cliente_nombre}
                                          </span>
                                        </div>
                                        {ev.notas && (
                                          <div className="text-[9px] truncate opacity-80 leading-tight pl-1">
                                            {ev.cliente_nombre}
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between text-[9.5px] drop-shadow-sm opacity-95 leading-tight w-full gap-1">
                                          <span className="truncate">
                                            <span className="font-bold">E:</span> {ev.lugar_entrega ? `${ev.lugar_entrega} ` : ''}{ev.hora_inicio.slice(0, 5)}
                                          </span>
                                          <span className="shrink-0">
                                            <span className="font-bold">D:</span> {ev.lugar_devolucion ? `${ev.lugar_devolucion} ` : ''}{ev.hora_fin.slice(0, 5)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={dayIdx}
                              className={`border-r border-slate-200 group/cell cursor-pointer p-0 h-[60px] ${bgClass}`}
                              onClick={() => openReserva(vehiculo.id, formatDate(day))}
                            >
                              <div className="w-full h-full flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <Plus className="w-5 h-5 text-primary/35" />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VISTA ANUAL (2.8) — pre-vista de los 12 meses, cae en timeline */}
      {viewMode === 'anual' && (
        <div className="flex-1 min-h-0 overflow-auto bg-white p-4">
          <VistaAnualOcupacion
            onSelectMes={onSelectMesAnual}
            onSelectDia={onSelectDiaAnual}
          />
        </div>
      )}

      {/* AGENDA VIEW (iPhone-style) */}
      {viewMode === 'agenda' && (
        <AgendaView
          eventos={eventos}
          vehiculos={vehiculos}
          loading={loading}
          agendaDate={agendaDate}
          onDateChange={setAgendaDate}
          onNuevaReserva={(vid, fecha) => openReserva(vid, fecha)}
          onCheckoutPrompt={(id, fecha, hora) => setCheckoutPrompt({ id, fecha, hora })}
          onReservaClick={(id) => setReservaInfoId(id)}
        />
      )}

      {/* "Pendiente de asignación" (2.2) — reservas por categoría, sin auto.
          No tienen fila donde dibujarse en la grilla de arriba; se resuelven
          acá mismo, sin cambiar de pantalla (C-1/C-7). Sale del mismo
          `/ocupacion` que ya se pidió — una sola llamada, una sola verdad. */}
      <PanelPendienteAsignacion
        reservas={ocupacionData?.sin_asignar ?? []}
        onCambio={loadData}
      />

      {/* Modal de Reserva */}
      {showReservaModal && (
        <ReservaModal
          initialVehiculoId={initialVehiculoId}
          initialFechaInicio={initialFecha}
          onClose={() => { setShowReservaModal(false); setInitialVehiculoId(undefined); setInitialFecha(undefined); }}
          onSuccess={() => { setShowReservaModal(false); setInitialVehiculoId(undefined); setInitialFecha(undefined); loadData(); }}
        />
      )}

      {checkoutPrompt && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-50">
          <div className="relative bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm flex flex-col gap-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">¿Se entregó en tiempo y forma?</h3>
              <p className="text-sm text-slate-500">
                El Check-out estaba programado para las <strong>{checkoutPrompt.hora.slice(0, 5)}</strong>. ¿A qué hora se entregó el vehículo?
              </p>
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setActiveCheckout({ id: checkoutPrompt.id, defaultTime: checkoutPrompt.hora.slice(0, 5), defaultDate: checkoutPrompt.fecha });
                  setCheckoutPrompt(null);
                }}
                className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg font-semibold transition-colors"
              >
                Sí, en tiempo y forma
              </button>
              
              <button
                onClick={() => {
                  const now = new Date();
                  const hours = now.getHours().toString().padStart(2, '0');
                  const mins = now.getMinutes().toString().padStart(2, '0');
                  const currentDate = now.toISOString().split('T')[0];
                  setActiveCheckout({ id: checkoutPrompt.id, defaultTime: `${hours}:${mins}`, defaultDate: currentDate });
                  setCheckoutPrompt(null);
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors"
              >
                No, se atrasó (Cargar ahora)
              </button>
              
              <button
                onClick={async () => {
                  if (confirm('¿Estás seguro de cancelar esta reserva?')) {
                    try {
                      await api.patch(`/reservas/${checkoutPrompt.id}/estado`, { estado: 'cancelada' });
                      loadData();
                    } catch (e) { console.error(e); }
                    setCheckoutPrompt(null);
                  }
                }}
                className="w-full py-2 text-sm text-red-600 hover:text-red-800 font-medium mt-2"
              >
                No se entregó (Cancelar reserva)
              </button>
            </div>
            
            <button
                onClick={() => setCheckoutPrompt(null)}
                className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-1"
                title="Cerrar"
              >
                <XCircle className="w-6 h-6" />
              </button>
          </div>
        </div>
      )}

      {activeCheckout && (
        <AsyncCheckoutModal
          reservaId={activeCheckout.id}
          defaultTime={activeCheckout.defaultTime}
          defaultDate={activeCheckout.defaultDate}
          onClose={() => setActiveCheckout(null)}
          onSuccess={() => {
            setActiveCheckout(null);
            loadData();
          }}
        />
      )}

      {reservaInfoId && (
        <ReservaInfoModal
          reservaId={reservaInfoId}
          onClose={() => setReservaInfoId(null)}
          onActionComplete={() => loadData()}
        />
      )}
    </div>
  );
}

// ── Agenda View (iPhone-like) ────────────────────────────────────────────────

function AgendaView({
  eventos,
  vehiculos,
  loading,
  agendaDate,
  onDateChange,
  onNuevaReserva,
  onCheckoutPrompt,
  onReservaClick,
}: {
  eventos: EventoOcupacion[];
  vehiculos: VehiculoOcupacion[];
  loading: boolean;
  agendaDate: Date;
  onDateChange: (d: Date) => void;
  onNuevaReserva: (vehiculoId: number, fecha: string) => void;
  onCheckoutPrompt: (id: number, fecha: string, hora: string) => void;
  onReservaClick: (id: number) => void;
}) {
  // Build a 35-day calendar grid centered on agendaDate's month
  const year = agendaDate.getFullYear();
  const month = agendaDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Calendar grid — start on Monday
  const startOffset = (firstDay.getDay() + 6) % 7; // 0=Mon
  const calDays: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) calDays.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) calDays.push(new Date(year, month, d));
  while (calDays.length % 7 !== 0) calDays.push(null);

  const todayStr = formatDate(new Date());
  const selectedStr = formatDate(agendaDate);

  const getEventsForDay = (day: Date): EventoOcupacion[] => {
    const dayStr = formatDate(day);
    return eventos.filter(e => e.fecha_inicio <= dayStr && e.fecha_fin >= dayStr);
  };

  const selectedEvents = getEventsForDay(agendaDate);

  const prevMonth = () => onDateChange(new Date(year, month - 1, 1));
  const nextMonth = () => onDateChange(new Date(year, month + 1, 1));

  const formatDisplayDate = (d: Date) => {
    return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  };

  return (
    <div className="flex flex-col gap-0 flex-1 min-h-0">
      {/* Month calendar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Month header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="text-base font-bold text-slate-800">
            {MONTH_LABELS[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Day of week headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-slate-400 uppercase py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calDays.map((day, idx) => {
            if (!day) return <div key={idx} className="h-10" />;
            const dayStr = formatDate(day);
            const isSelected = dayStr === selectedStr;
            const isT = dayStr === todayStr;
            const dayEvents = getEventsForDay(day);
            const hasEvents = dayEvents.length > 0;
            return (
              <button
                key={idx}
                onClick={() => onDateChange(day)}
                className={`relative flex flex-col items-center justify-center h-12 transition-colors
                  ${isSelected
                    ? 'bg-primary text-white rounded-xl mx-1 my-0.5 font-bold shadow-md'
                    : isT
                    ? 'text-primary font-bold'
                    : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <span className="text-sm leading-tight">{day.getDate()}</span>
                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-white/70' :
                          ev.estado === 'vencida' ? 'bg-red-600' :
                          ev.estado === 'activa' ? 'bg-emerald-500' :
                          ev.estado === 'confirmada' ? 'bg-blue-500' : 'bg-slate-400'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day agenda */}
      <div className="flex-1 mt-4 space-y-3 overflow-auto pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 capitalize">
            {formatDisplayDate(agendaDate)}
          </h3>
          <button
            onClick={() => onNuevaReserva(0, formatDate(agendaDate))}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva reserva
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : selectedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <Calendar className="w-10 h-10 opacity-30" />
            <p className="text-sm">Sin reservas este dia</p>
          </div>
        ) : (
          selectedEvents.map(ev => {
            const vehiculo = vehiculos.find(v => v.id === ev.vehiculo_id);
            const colorClass = ESTADO_COLORS_BADGE[ev.estado] || 'bg-slate-100 text-slate-700';
            const evDate = new Date(`${ev.fecha_inicio}T${ev.hora_inicio}`);
            const isOverdue = (!ev.tiene_alquiler && ev.estado === 'activa') || (ev.estado === 'confirmada' && evDate < new Date());

            const esBloqueo = ES_BLOQUEO(ev.tipo);

            return (
              <div
                key={`${ev.tipo}-${ev.id}`}
                // Un bloqueo no tiene ficha de reserva que abrir.
                onClick={() => { if (!esBloqueo) onReservaClick(ev.id); }}
                className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex gap-3 items-start relative transition-all ${
                  esBloqueo
                    ? 'cursor-default opacity-90'
                    : 'cursor-pointer hover:border-primary/35 hover:shadow-md'
                }`}
              >
                {isOverdue && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onCheckoutPrompt(ev.id, ev.fecha_inicio, ev.hora_inicio);
                    }}
                    className="absolute -top-2 -right-2 w-16 h-8 flex items-center justify-center bg-[#FFE500] text-black rounded-sm shadow-lg z-20 hover:bg-[#FFD000] transition-colors border-2 border-black"
                    title="Falta confirmación de Check-out"
                  >
                    <AlertTriangle className="w-5 h-5" />
                  </button>
                )}
                {/* Color indicator */}
                <div className={`w-1 self-stretch rounded-full ${
                  ev.estado === 'vencida' ? 'bg-red-600' :
                  ev.estado === 'activa' ? 'bg-emerald-500' :
                  ev.estado === 'confirmada' ? 'bg-blue-500' :
                  ev.estado === 'finalizada' ? 'bg-slate-400' : 'bg-red-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{ev.cliente_nombre}</p>
                      {vehiculo && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {vehiculo.patente} · {vehiculo.marca} {vehiculo.modelo}
                        </p>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${colorClass}`}>
                      {ESTADO_ICONS[ev.estado]} {ev.estado}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Entrega: {ev.hora_inicio.slice(0, 5)} {ev.lugar_entrega ? `— ${ev.lugar_entrega}` : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Devol: {ev.hora_fin.slice(0, 5)} {ev.lugar_devolucion ? `— ${ev.lugar_devolucion}` : ''}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {ev.fecha_inicio} - {ev.fecha_fin}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Vista anual (2.8) ────────────────────────────────────────────────────────
// La pre-vista del año: reusa `CalendarioAnual` —el mismo cuadro de 12 meses
// que Fechas especiales, que es la vista que le gustó al dueño— con un
// endpoint propio agregado en SQL (`/ocupacion/resumen-anual`), no un año
// entero de `/ocupacion`: acá no hacen falta los eventos uno por uno, sólo la
// densidad y los contadores por día.

function colorDensidad(ratio: number): string {
  if (ratio <= 0) return 'bg-slate-50 text-slate-400';
  if (ratio < 0.34) return 'bg-primary/20 text-primary';
  if (ratio < 0.67) return 'bg-primary/50 text-white';
  return 'bg-primary text-white font-bold';
}

function tooltipDia(d: DiaResumenAnual): string {
  const partes = [`${d.ocupados}/${d.total} ocupados`];
  if (d.entregas) partes.push(`${d.entregas} entrega${d.entregas === 1 ? '' : 's'}`);
  if (d.devoluciones) partes.push(`${d.devoluciones} devolución${d.devoluciones === 1 ? '' : 'es'}`);
  if (d.alertas) partes.push(`${d.alertas} alerta${d.alertas === 1 ? '' : 's'}`);
  if (d.sin_asignar) partes.push(`${d.sin_asignar} sin asignar`);
  return partes.join(' · ');
}

function VistaAnualOcupacion({
  onSelectMes, onSelectDia,
}: {
  onSelectMes: (anio: number, mes: number) => void;
  onSelectDia: (fechaISO: string) => void;
}) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const { data, isLoading } = useResumenAnual(anio);

  const porDia = useMemo(() => {
    const m = new Map<string, DiaResumenAnual>();
    (data?.dias ?? []).forEach(d => m.set(d.fecha, d));
    return m;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-primary" /> Muy ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-primary/40" /> Ocupación media
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded border-2 border-red-500" /> Con alertas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Reservas sin asignar
        </span>
      </div>

      <CalendarioAnual
        anio={anio}
        onAnioChange={setAnio}
        onSelectMes={mes => onSelectMes(anio, mes)}
        onSelectDia={onSelectDia}
        renderDia={(fechaISO, dia) => {
          const d = porDia.get(fechaISO);
          if (!d) return null;
          const ratio = d.total > 0 ? d.ocupados / d.total : 0;
          return {
            className: cn(colorDensidad(ratio), d.alertas > 0 && 'ring-2 ring-red-500'),
            title: tooltipDia(d),
            contenido: (
              <>
                {dia}
                {d.sin_asignar > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </>
            ),
          };
        }}
      />
    </div>
  );
}
