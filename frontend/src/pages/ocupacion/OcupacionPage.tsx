import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { Clock, CheckCircle2, Car, Flag, XCircle, Plus, ChevronLeft, ChevronRight, GripVertical, Calendar, LayoutList, AlertTriangle, AlertCircle, Ban, Wrench, CalendarRange, Globe, CreditCard } from 'lucide-react';
import { ESTADO_RESERVA_LABEL } from '@/lib/constants';
import { useCategorias } from '@/hooks/useCategorias';
import { PanelResolverReserva } from '@/components/reservas/PanelResolverReserva';
import { useQuery } from '@tanstack/react-query';
import { useOcupacion, useResumenAnual } from '@/hooks/useOcupacion';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CalendarioAnual } from '@/components/shared/CalendarioAnual';
import type { VehiculoOcupacion, EventoOcupacion, Reserva, ApiResponse, DiaResumenAnual } from '@/types';
import { ReservaModal } from '../reservas/ReservaModal';
import { CheckoutModal } from '../reservas/CheckoutModal';
import { ReservaInfoModal } from '../reservas/ReservaInfoModal';

const ESTADO_COLORS_EVENTO: Record<string, string> = {
  // Plan de conexión (13/08), cierra C-6: `pendiente` sí tiene auto asignado
  // (viene del mostrador) y caía en el fallback gris, indistinguible de una
  // `finalizada`. Ámbar y borde punteado: tomada, pero todavía no firme.
  // **Contorneada, sin relleno sólido.** Una reserva pendiente todavía no
  // ocupa el auto (regla 2.3: sólo ocupan confirmada, activa, vencida y
  // bloqueo), así que pintarla como las que sí ocupan hace que la grilla
  // mienta: una celda parece tomada estando libre. Con el relleno tenue se
  // sigue viendo que hay algo en el aire, que es la información verdadera.
  pendiente: 'bg-amber-100 border-amber-500 border-dashed text-amber-900',
  confirmada: 'bg-blue-500 border-blue-600 text-white',
  activa: 'bg-emerald-500 border-emerald-600 text-white',
  vencida: 'bg-red-600 border-red-700 text-white animate-pulse',
  finalizada: 'bg-slate-500 border-slate-600 text-white',
  cancelada: 'bg-red-500 border-red-600 text-white line-through opacity-90',
  // Reserva web esperando el pago. **Llegaba desde el backend y no tenía
  // color**: caía en el fallback gris, idéntica a una `finalizada`. Y no es lo
  // mismo: acá hay alguien pagando esas fechas ahora mismo.
  //
  // Contorneada y tenue a propósito — **no ocupa calendario** (el cupo lo
  // sostiene el hold, no la reserva), así que pintarla sólida haría que la
  // grilla mienta: una celda parecería tomada estando libre. Pero tampoco
  // puede ser invisible, o el mostrador vende encima de una venta en curso.
  pendiente_pago: 'bg-violet-100 border-violet-400 border-dashed text-violet-900',
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

/**
 * Estados que el backend manda y el calendario **no dibuja**.
 *
 * `sin_disponibilidad` es una solicitud de alguien que pidió fechas sin cupo, y
 * `revision_sin_cupo` es un pago que entró cuando el cupo ya no estaba.
 * Ninguna de las dos tiene auto asignado ni ocupa el calendario: su lugar es la
 * bandeja de pendientes, no una barra sobre una fila de vehículo.
 *
 * Hasta ahora llegaban y se pintaban **grises, iguales a una `finalizada`**,
 * sobre una fila que no les corresponde. Se filtran acá y no en el backend
 * porque la misma consulta alimenta el panel de reservas sin asignar, que sí
 * las necesita.
 */
const ESTADO_FUERA_DEL_CALENDARIO = new Set(['sin_disponibilidad', 'revision_sin_cupo']);

/**
 * Id de la fila "Por asignar". Negativo a propósito: ningún vehículo real
 * puede tenerlo, así que las reservas sin auto pueden pasar por el mismo
 * cálculo de posición que las demás sin riesgo de caer en una fila ajena.
 */
const FILA_SIN_ASIGNAR = -1;

/**
 * Los estados que la leyenda declara.
 *
 * **`cancelada` salió, y no es una omisión.** La consulta del calendario nunca
 * la trae (`reserva_repo.find_para_ocupacion`), así que la leyenda prometía un
 * color que la grilla no puede producir: alguien que buscaba el rojo tachado no
 * lo iba a encontrar nunca. El estilo se conserva en la tabla de arriba por si
 * algún día se decide mostrarlas.
 *
 * **`pendiente_pago` entró**: llegaba desde el backend, se pintaba gris sin
 * entrada en la leyenda, y nadie podía saber qué era esa barra.
 */
const ESTADOS_RESERVA_LEYENDA = [
  'pendiente', 'pendiente_pago', 'confirmada', 'activa', 'vencida', 'finalizada',
] as const;

const ESTADO_COLORS_BADGE: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  pendiente_pago: 'bg-violet-100 text-violet-800',
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
  pendiente_pago: <CreditCard className="w-3.5 h-3.5" />,
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

/**
 * Lo que se lee al pasar el mouse por un bloque del calendario.
 *
 * Hasta ahora **sólo los bloqueos tenían tooltip**: una reserva no tenía
 * ninguno, así que todo lo que no entraba en 52px de alto simplemente no se
 * podía saber sin abrirla. Y el canal —de dónde vino y quién la cargó— no
 * estaba en ningún lado del calendario.
 */
function tooltipEvento(ev: EventoOcupacion): string {
  if (ES_BLOQUEO(ev.tipo)) {
    return `${ev.cliente_nombre}${ev.notas ? ` — ${ev.notas}` : ''}`;
  }
  const lineas = [ev.cliente_nombre];
  lineas.push(ev.origen === 'web' ? 'Reservó por el sitio web' : 'Cargada en el mostrador');
  if (ev.creado_por && ev.origen !== 'web') lineas.push(`Por ${ev.creado_por}`);
  if (ev.lugar_entrega) lineas.push(`Entrega: ${ev.lugar_entrega} ${ev.hora_inicio.slice(0, 5)}`);
  if (ev.lugar_devolucion) lineas.push(`Devolución: ${ev.lugar_devolucion} ${ev.hora_fin.slice(0, 5)}`);
  if (ev.notas) lineas.push(ev.notas);
  return lineas.join('\n');
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
// mismo al elegir un mes o un día. Es el modo por defecto en escritorio
// (Gael la eligió como calendario principal, 14/08).
type ViewMode = 'timeline' | 'agenda' | 'anual';

export function OcupacionPage() {
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return 'agenda';
    return 'anual';
  });
  const [agendaDate, setAgendaDate] = useState<Date>(new Date());

  const [vehiculos, setVehiculos] = useState<VehiculoOcupacion[]>([]);
  const [eventos, setEventos] = useState<EventoOcupacion[]>([]);
  /**
   * Reservas confirmadas **sin auto asignado**.
   *
   * El backend las viene mandando desde el plan de conexión (13/08) y el
   * calendario **las tiraba**: sólo leía `vehiculos` y `eventos`. Como no
   * tienen `vehiculo_id` no hay fila donde dibujarlas, así que no se veían en
   * ningún lado — y sin embargo **ya descuentan cupo**. Eso es sobreventa
   * visual: mirás la grilla, ves un auto libre, y en realidad está vendido.
   */
  const [sinAsignar, setSinAsignar] = useState<Reserva[]>([]);

  // ── Filtros y agrupado (agregados, apagables) ────────────────────────────
  // Los tres son de vista: filtran o reordenan lo que se dibuja, sin tocar la
  // consulta ni el cálculo de cupo. Si se apagan, el calendario vuelve a ser
  // exactamente el de antes.
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroCanal, setFiltroCanal] = useState<'todas' | 'web' | 'mostrador'>('todas');
  const [agrupar, setAgrupar] = useState(true);
  const [gruposCerrados, setGruposCerrados] = useState<Set<number | string>>(new Set());
  const { data: categoriasData } = useCategorias();

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
    setEventos(ocupacionData.eventos.filter(e => !ESTADO_FUERA_DEL_CALENDARIO.has(e.estado)));
    setSinAsignar(ocupacionData.sin_asignar ?? []);
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
    // Si el mes elegido es el actual, cae en **hoy** y no en el día 1: en el
    // mes en curso lo que se quiere ver es lo que está pasando, no el
    // arranque del mes que ya pasó.
    const hoy = new Date();
    const esMesActual = anioSel === hoy.getFullYear() && mesSel === hoy.getMonth();
    setScrollToDate(
      esMesActual ? formatDate(hoy) : `${anioSel}-${String(mesSel + 1).padStart(2, '0')}-01`,
    );
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
    return eventosVisibles.filter(e => e.vehiculo_id === vehiculoId && e.fecha_inicio <= dayStr && e.fecha_fin >= dayStr);
  };

  // ── Asignar arrastrando desde "Por asignar" ──────────────────────────────
  // Es la única interacción nueva del calendario. Por debajo **no inventa un
  // camino**: abre el panel de asignación que ya existe, con el auto
  // preseleccionado. Ese panel es el que valida disponibilidad, avisa si es
  // upgrade o downgrade y dispara la emisión del contrato (D-47); duplicar esa
  // lógica en un drag sería tener dos formas de asignar que después divergen.
  const [reservaArrastrada, setReservaArrastrada] = useState<number | null>(null);
  const [asignarA, setAsignarA] = useState<{ reserva: Reserva; vehiculoId: number } | null>(null);

  /**
   * Abre el panel de asignación para una reserva sin auto.
   *
   * Sin vehículo preseleccionado: el panel ya lista los disponibles separando
   * los de la categoría pedida, valida la fecha en el momento y avisa si es
   * upgrade o downgrade. Es el mismo y único camino de asignación del sistema.
   */
  const abrirAsignacion = (reservaId: number) => {
    const reserva = sinAsignar.find(r => r.id === reservaId);
    if (reserva) setAsignarA({ reserva, vehiculoId: 0 });
  };

  const soltarEnVehiculo = (vehiculoId: number) => {
    if (reservaArrastrada == null) return;
    const reserva = sinAsignar.find(r => r.id === reservaArrastrada);
    setReservaArrastrada(null);
    if (reserva) setAsignarA({ reserva, vehiculoId });
  };

  /**
   * Las reservas sin auto, con la forma de un evento para poder dibujarlas con
   * la misma maquinaria que el resto.
   *
   * `vehiculo_id: FILA_SIN_ASIGNAR` es un centinela: no existe ningún vehículo
   * con id negativo, así que nunca colisiona con una fila real y a la vez
   * permite reusar `getEventSpan` sin tocarlo.
   */
  const eventosSinAsignar: EventoOcupacion[] = useMemo(
    () => sinAsignar
      // **Los filtros valen también acá.** La fila "Por asignar" nacía de
      // `sinAsignar` crudo, así que con el filtro en "Mostrador" seguía
      // mostrando las reservas web, y con una categoría elegida mostraba las
      // de todas. La grilla decía una cosa y la fila de arriba otra — y es la
      // fila desde la que se arrastra para asignar, o sea justo donde
      // equivocarse cuesta.
      .filter(r => filtroCanal === 'todas' || (r.origen ?? 'mostrador') === filtroCanal)
      .filter(r => !filtroCategoria || String(r.categoria_id ?? '') === filtroCategoria)
      .map(r => ({
      id: r.id,
      vehiculo_id: FILA_SIN_ASIGNAR,
      tipo: 'reserva' as const,
      estado: r.estado,
      fecha_inicio: r.fecha_inicio,
      hora_inicio: r.hora_inicio,
      fecha_fin: r.fecha_fin,
      hora_fin: r.hora_fin,
      // Una solicitud web sin cupo puede no tener cliente todavía (D-04).
      cliente_nombre: r.cliente?.nombre_completo ?? r.web_contacto_nombre ?? 'Sin cliente',
      lugar_entrega: r.lugar_entrega,
      lugar_devolucion: r.lugar_devolucion,
      notas: r.categoria?.nombre ? `${r.categoria.nombre} — sin auto asignado` : null,
      origen: r.origen,
      creado_por: r.usuario_nombre ?? '',
    })),
    [sinAsignar, filtroCanal, filtroCategoria],
  );

  /**
   * En qué carril va cada reserva sin asignar, para que dos que se pisan no se
   * dibujen una encima de la otra.
   *
   * **La fila "Por asignar" es una sola fila para N reservas.** A diferencia de
   * las filas de vehículo —donde dos reservas simultáneas serían una
   * sobreventa y no pueden pasar—, acá lo normal es que varias convivan: son
   * justamente las que todavía no tienen unidad. Con posicionamiento absoluto
   * y sin carriles, la segunda tapaba a la primera y la fila mentía diciendo
   * que había una sola reserva pendiente.
   *
   * Reparto codicioso por fecha de inicio: cada reserva va al primer carril
   * cuyo último ocupante ya terminó. Es el mismo algoritmo con el que se
   * dibuja cualquier línea de tiempo, y con dos o tres pendientes —el caso
   * real— da uno o dos carriles.
   */
  const carrilesSinAsignar = useMemo(() => {
    const orden = [...eventosSinAsignar].sort(
      (a, b) => (a.fecha_inicio < b.fecha_inicio ? -1 : a.fecha_inicio > b.fecha_inicio ? 1 : a.id - b.id)
    );
    const finDeCarril: string[] = [];
    const carril = new Map<number, number>();
    for (const ev of orden) {
      // Adyacente no es solapado: una que termina el 10 y otra que empieza el
      // 10 comparten carril, igual que en las filas de vehículo.
      let i = finDeCarril.findIndex(fin => fin < ev.fecha_inicio);
      if (i === -1) { i = finDeCarril.length; finDeCarril.push(ev.fecha_fin); }
      else if (ev.fecha_fin > finDeCarril[i]) finDeCarril[i] = ev.fecha_fin;
      carril.set(ev.id, i);
    }
    return { carril, cantidad: Math.max(1, finDeCarril.length) };
  }, [eventosSinAsignar]);

  /** Alto de la fila "Por asignar": crece con los carriles, no con las reservas. */
  const ALTO_CARRIL = 56;
  const altoSinAsignar = carrilesSinAsignar.cantidad * ALTO_CARRIL + 4;

  /**
   * Las filas que se dibujan, después de aplicar el filtro de categoría.
   *
   * El filtro es **de vista**: no cambia la consulta ni el cupo. Un auto
   * escondido sigue ocupado; simplemente no se está mirando.
   */
  const vehiculosVisibles = useMemo(
    () => (filtroCategoria
      ? vehiculos.filter(v => String(v.categoria_id ?? '') === filtroCategoria)
      : vehiculos),
    [vehiculos, filtroCategoria],
  );

  /**
   * Los eventos que se dibujan, después del filtro de canal.
   *
   * Los **bloqueos nunca se filtran por canal**: no vienen de ningún canal, y
   * esconderlos al mirar "web" haría que un auto en el taller parezca libre —
   * exactamente la clase de mentira que el calendario no puede permitirse.
   */
  const eventosVisibles = useMemo(
    () => (filtroCanal === 'todas'
      ? eventos
      : eventos.filter(e => ES_BLOQUEO(e.tipo) || (e.origen ?? 'mostrador') === filtroCanal)),
    [eventos, filtroCanal],
  );

  /**
   * Las filas agrupadas por categoría.
   *
   * **El orden manual de la flota se conserva dentro de cada grupo**: el
   * drag & drop sigue funcionando igual, sólo que no se puede cruzar de
   * categoría. `vehiculos` ya viene en el orden persistido, y agrupar sin
   * reordenar dentro del grupo es lo que lo respeta.
   *
   * Los autos sin categoría van al final, juntos y visibles: son un problema
   * de carga (el aviso `vehiculo_sin_categoria` los reclama) y esconderlos los
   * sacaría del calendario.
   */
  const gruposDeFilas = useMemo(() => {
    if (!agrupar) return [{ id: 'todos' as const, nombre: '', vehiculos: vehiculosVisibles }];
    const orden = (categoriasData ?? []).map(c => ({ id: c.id as number | string, nombre: c.nombre }));
    const grupos = orden
      .map(c => ({ ...c, vehiculos: vehiculosVisibles.filter(v => v.categoria_id === c.id) }))
      .filter(g => g.vehiculos.length > 0);
    const sinCategoria = vehiculosVisibles.filter(
      v => !v.categoria_id || !(categoriasData ?? []).some(c => c.id === v.categoria_id)
    );
    if (sinCategoria.length) {
      grupos.push({ id: 'sin-categoria', nombre: 'Sin categoría', vehiculos: sinCategoria });
    }
    return grupos;
  }, [agrupar, vehiculosVisibles, categoriasData]);

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
      {/* La anual va primera: es el calendario principal (14/08), así que
          encabeza el selector además de ser el modo por defecto. */}
      <div className="flex rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setViewMode('anual')}
          className={`p-2 transition-colors ${viewMode === 'anual' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Vista anual — el año completo"
        >
          <CalendarRange className="w-4 h-4" />
        </button>
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

      {/* Leyenda de estados — una sola para las tres vistas. La anual pinta
          con estos mismos colores desde que dejó de pintar por densidad, así
          que ya no hay dos leyendas compitiendo en la misma pantalla. */}
      <div className="flex items-center gap-5 flex-wrap text-sm px-1">
        {/* Sólo los estados de reserva. Los 5 motivos de bloqueo no van uno
            por uno: se resumen en un único ítem "Bloqueado" al final, con el
            mismo rayado, para no convertir la leyenda en una lista de 10. */}
        {ESTADOS_RESERVA_LEYENDA.map((estado) => (
          <div key={estado} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-5 h-5 rounded border ${ESTADO_COLORS_EVENTO[estado]}`}>
              {ESTADO_ICONS[estado]}
            </div>
            {/* Con la etiqueta y no con el nombre crudo del estado: sin esto
                `pendiente_pago` se leía "Pendiente_pago". */}
            <span className="text-slate-600 font-medium">
              {ESTADO_RESERVA_LABEL[estado] ?? estado}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded border bg-slate-600 border-slate-700 text-white bg-stripes">
            <Ban className="w-3.5 h-3.5" />
          </div>
          <span className="text-slate-600 font-medium">Bloqueado</span>
        </div>

        {/* Filtros. Van con la leyenda porque son de la misma familia: la
            leyenda dice qué significan los colores, esto dice qué se muestra.
            **Sólo filtran lo que se ve** — no tocan la consulta ni el cupo. */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 shadow-sm"
            title="Mostrar sólo los autos de una categoría"
          >
            <option value="">Todas las categorías</option>
            {(categoriasData ?? []).map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>

          {/* Apagar el agrupado devuelve la lista plana por patente, que es
              como estaba antes. El agregado es reversible desde la pantalla. */}
          <button
            onClick={() => setAgrupar(v => !v)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors ${
              agrupar
                ? 'border-primary/25 bg-primary/10 text-primary'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
            title={agrupar ? 'Ver la flota como lista, ordenada por patente' : 'Agrupar las filas por categoría'}
          >
            {agrupar ? 'Por categoría' : 'Lista'}
          </button>

          <div className="flex rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            {([
              { v: 'todas', label: 'Todas' },
              { v: 'web', label: 'Web' },
              { v: 'mostrador', label: 'Mostrador' },
            ] as const).map(o => (
              <button
                key={o.v}
                onClick={() => setFiltroCanal(o.v)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  filtroCanal === o.v ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'
                }`}
                title="Mostrar sólo las reservas de este canal"
              >
                {o.label}
              </button>
            ))}
          </div>
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
                  <>
                  {/* Reservas ya vendidas a las que todavía no se les asignó
                      auto. Van arriba de todo y sólo si hay alguna: una fila
                      vacía permanente sería ruido, pero no verlas es
                      sobreventa. */}
                  {eventosSinAsignar.length > 0 && (
                    <tr className="bg-amber-50">
                      <td
                        className="px-3 py-1 sticky left-0 bg-amber-50 z-20 border-r border-amber-200 shadow-[1px_0_0_0_#fde68a] align-middle"
                        style={{ height: altoSinAsignar }}
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-amber-900 text-[13px] uppercase tracking-wide truncate">
                              Por asignar
                            </span>
                            <span className="text-amber-800 font-semibold text-[10.5px] truncate">
                              {eventosSinAsignar.length} reserva{eventosSinAsignar.length !== 1 ? 's' : ''} sin auto
                            </span>
                          </div>
                        </div>
                      </td>
                      {days.map((day, dayIdx) => {
                        const dayStr = formatDate(day);
                        const delDia = eventosSinAsignar.filter(
                          e => e.fecha_inicio <= dayStr && e.fecha_fin >= dayStr
                        );
                        const aDibujar = delDia.filter(
                          e => getEventSpan(e, day, eventosSinAsignar).isStart
                        );
                        return (
                          <td
                            key={dayIdx}
                            className="relative border-r border-amber-200/70 p-0"
                            style={{ minWidth: '180px', width: '180px', height: altoSinAsignar }}
                          >
                            {aDibujar.map(ev => {
                              const { leftPercent, widthPercent } = getEventSpan(ev, day, eventosSinAsignar);
                              return (
                                <div
                                  key={`sin-${ev.id}`}
                                  onClick={() => setReservaInfoId(ev.id)}
                                  title={`${tooltipEvento(ev)}\n\nArrastrala a un auto para asignárselo.`}
                                  draggable
                                  onDragStart={e => {
                                    setReservaArrastrada(ev.id);
                                    e.dataTransfer.setData('text/plain', `reserva:${ev.id}`);
                                  }}
                                  onDragEnd={() => setReservaArrastrada(null)}
                                  className="absolute rounded-md border border-dashed border-amber-500 bg-amber-200 text-amber-950 shadow-sm cursor-grab active:cursor-grabbing transition-all z-10 overflow-hidden hover:brightness-105"
                                  style={{
                                    left: `calc(${leftPercent}% + 1px)`,
                                    width: `calc(${widthPercent}% - 2px)`,
                                    minWidth: 0,
                                    // El carril, para que dos reservas que se
                                    // pisan se vean las dos.
                                    top: (carrilesSinAsignar.carril.get(ev.id) ?? 0) * ALTO_CARRIL + 4,
                                    height: ALTO_CARRIL - 8,
                                  }}
                                >
                                  <div className="px-1.5 py-0.5 flex flex-col justify-center w-full h-full gap-0.5">
                                    <div className="font-bold text-[11px] truncate flex items-center gap-1 leading-tight">
                                      <Car className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate flex-1">{ev.cliente_nombre}</span>
                                      {ev.origen === 'web' && <Globe className="h-3 w-3 shrink-0 opacity-90" />}
                                    </div>
                                    {ev.notas && (
                                      <div className="text-[9px] truncate opacity-80 leading-tight pl-1">
                                        {ev.notas}
                                      </div>
                                    )}
                                    {/* El botón, a la vista. Que la acción esté
                                        sólo en el click del bloque o en el
                                        arrastre la vuelve invisible: hay que
                                        saber que está. */}
                                    <button
                                      onClick={e => { e.stopPropagation(); abrirAsignacion(ev.id); }}
                                      className="self-start rounded bg-amber-600 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white hover:bg-amber-700"
                                    >
                                      Asignar auto
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  {gruposDeFilas.map(grupo => (
                  <Fragment key={grupo.id}>
                  {/* Encabezado de categoría, plegable. Sólo aparece si el
                      agrupado está activo: con `agrupar` en false la grilla es
                      la lista plana de siempre. */}
                  {agrupar && grupo.nombre && (
                    <tr className="bg-sky-100">
                      <td
                        colSpan={days.length + 1}
                        className="px-0 py-1 bg-sky-100 border-y border-sky-200"
                      >
                        {/* **Pegado a la izquierda.** La celda abarca los 120
                            días, así que sin esto el nombre de la categoría se
                            va de pantalla apenas scrolleás a la derecha y la
                            fila queda como una franja celeste sin decir de qué
                            grupo es. */}
                        <div className="sticky left-0 z-30 w-fit bg-sky-100 pl-3 pr-4">
                          <button
                            onClick={() => setGruposCerrados(prev => {
                              const s = new Set(prev);
                              s.has(grupo.id) ? s.delete(grupo.id) : s.add(grupo.id);
                              return s;
                            })}
                            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-900 hover:text-sky-950"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${!gruposCerrados.has(grupo.id) ? 'rotate-90' : ''}`} />
                            {grupo.nombre}
                            <span className="font-medium text-sky-700">
                              · {grupo.vehiculos.length} unidad{grupo.vehiculos.length !== 1 ? 'es' : ''}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!gruposCerrados.has(grupo.id) && grupo.vehiculos.map(vehiculo => {
                    const processedEvents = new Set<number>();
                    const vehiculoEvents = eventosVisibles.filter(ev => ev.vehiculo_id === vehiculo.id);
                    return (
                      <tr
                        key={vehiculo.id}
                        className={`hover:bg-slate-50/80 transition-colors group ${draggingVehiculoId === vehiculo.id ? 'opacity-50' : ''}`}
                        draggable
                        onDragStart={e => handleDragStart(e, vehiculo.id)}
                        onDragOver={handleDragOver}
                        onDrop={e => {
                          // Dos cosas se pueden soltar en una fila: otro auto
                          // (reordenar la flota, lo de siempre) o una reserva
                          // sin asignar. Se distinguen por cuál se está
                          // arrastrando, no por el payload, para no cambiar el
                          // comportamiento existente.
                          if (reservaArrastrada != null) {
                            e.preventDefault();
                            soltarEnVehiculo(vehiculo.id);
                            return;
                          }
                          handleDrop(e, vehiculo.id);
                        }}
                        // Resalta las filas donde se puede soltar la reserva.
                        // Sólo las de la categoría pedida se sugieren; el resto
                        // acepta igual, porque asignar de otra categoría es un
                        // upgrade legítimo y el panel lo avisa.
                        style={reservaArrastrada != null ? { outline: '2px dashed rgba(245,158,11,.45)', outlineOffset: '-2px' } : undefined}
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
                                      // Las reservas no tenían tooltip: sólo lo
                                      // tenían los bloqueos. Ahora las dos lo
                                      // llevan, y en la reserva dice de dónde
                                      // vino y quién la cargó — que es
                                      // justamente lo que no se podía saber
                                      // mirando el calendario.
                                      title={tooltipEvento(ev)}
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
                                          {/* El canal, como ícono y nunca como
                                              color: el color ya lo tiene tomado
                                              el estado, que tiene su leyenda. */}
                                          {!esBloqueo && ev.origen === 'web' && (
                                            <Globe className="h-3 w-3 shrink-0 opacity-90" />
                                          )}
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
                  })}
                  </Fragment>
                  ))}
                  </>
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

      {/* "Pendiente de asignación" (2.2) vivía acá. Lo reemplaza
          `AvisoReservasPendientes`, que está en el layout y por lo tanto en
          **todas** las pantallas.
          Esta versión sólo mostraba lo que caía en el rango de fechas que el
          calendario tenía a la vista: una reserva para marzo no aparecía en
          ningún lado si estabas mirando agosto. Dejar las dos era tener dos
          listas que un día iban a decir cosas distintas sobre lo mismo. */}

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

      {/* Soltar una reserva sobre un auto abre el panel de asignación de
          siempre. El arrastre es un atajo para llegar acá, no una segunda
          forma de asignar. */}
      {asignarA && (
        <PanelResolverReserva
          reserva={asignarA.reserva}
          onClose={() => setAsignarA(null)}
          onCambio={() => loadData()}
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

/** Qué estado manda cuando un día tiene varios.
 *
 *  **Prioridad, no mayoría.** La vista anual es para decidir qué día hay que
 *  mirar: un día con una vencida entre diez activas te necesita igual. Los
 *  cinco motivos de bloqueo van juntos, debajo de lo que está en curso y
 *  arriba de lo que ya terminó. */
const PRIORIDAD_ANUAL = [
  'vencida', 'activa', 'confirmada', 'pendiente',
  'mantenimiento', 'siniestro', 'uso_interno', 'venta', 'otro',
  'finalizada',
];

const ES_BLOQUEO_ESTADO = (e: string) =>
  ['mantenimiento', 'siniestro', 'uso_interno', 'venta', 'otro'].includes(e);

/** Los tokens que sirven en una barra del timeline pero son ruido en un
 *  cuadradito de 45px: el latido con 40 celdas rojas a la vez marea, y el
 *  tachado y la opacidad no se leen a ese tamaño. */
const SOLO_TIMELINE = new Set(['animate-pulse', 'line-through', 'opacity-90', 'border-dashed']);

/**
 * El color del día en la vista anual, **derivado de la misma tabla que el
 * timeline**. No hay una segunda paleta: si mañana cambia el azul de
 * `confirmada` en `ESTADO_COLORS_EVENTO`, cambian las dos vistas juntas.
 */
function chipAnual(estado: string): string {
  const base = ESTADO_COLORS_EVENTO[estado] ?? 'bg-slate-500 border-slate-600 text-white';
  return base.split(' ').filter(t => !SOLO_TIMELINE.has(t)).join(' ');
}

/** Sólo el fondo, para los segmentos de la franja inferior. */
function soloFondo(clases: string): string {
  return clases.split(' ').filter(t => t.startsWith('bg-')).join(' ');
}

/** Los estados presentes ese día, del más urgente al menos. */
function estadosPresentes(d: DiaResumenAnual): string[] {
  const presentes = Object.entries(d.estados ?? {})
    .filter(([, n]) => n > 0)
    .map(([e]) => e);
  return PRIORIDAD_ANUAL.filter(e => presentes.includes(e));
}

const PLURAL_ESTADO: Record<string, [string, string]> = {
  pendiente: ['pendiente', 'pendientes'],
  confirmada: ['confirmada', 'confirmadas'],
  activa: ['activa', 'activas'],
  vencida: ['vencida', 'vencidas'],
  finalizada: ['finalizada', 'finalizadas'],
};

function tooltipDia(d: DiaResumenAnual): string {
  const estados = d.estados ?? {};
  const partes: string[] = [];
  let bloqueados = 0;

  for (const estado of estadosPresentes(d)) {
    const n = estados[estado];
    if (ES_BLOQUEO_ESTADO(estado)) { bloqueados += n; continue; }
    const [uno, varios] = PLURAL_ESTADO[estado] ?? [estado, estado];
    partes.push(`${n} ${n === 1 ? uno : varios}`);
  }
  if (bloqueados) {
    partes.push(`${bloqueados} vehículo${bloqueados === 1 ? '' : 's'} bloqueado${bloqueados === 1 ? '' : 's'}`);
  }

  const segunda: string[] = [];
  if (d.entregas) segunda.push(`${d.entregas} entrega${d.entregas === 1 ? '' : 's'}`);
  if (d.devoluciones) segunda.push(`${d.devoluciones} devolución${d.devoluciones === 1 ? '' : 'es'}`);
  if (d.sin_asignar) segunda.push(`${d.sin_asignar} sin asignar`);
  if (d.total) segunda.push(`${d.ocupados} de ${d.total} autos ocupados`);

  return [partes.join(' · '), segunda.join(' · ')].filter(Boolean).join('\n');
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
      {/* Sin leyenda propia: la vista anual usa los mismos colores y la misma
          leyenda de estados que el timeline, que está arriba. Tener dos
          leyendas distintas en la misma pantalla era lo que hacía que nadie
          supiera qué significaba cada color. */}
      <CalendarioAnual
        anio={anio}
        onAnioChange={setAnio}
        onSelectMes={mes => onSelectMes(anio, mes)}
        onSelectDia={onSelectDia}
        renderDia={(fechaISO, dia) => {
          const d = porDia.get(fechaISO);
          const presentes = d ? estadosPresentes(d) : [];
          // Día sin nada: se devuelve null y la grilla le deja su gris de
          // siempre. Un tooltip que diga "0 reservas" es peor que ninguno.
          if (!d || presentes.length === 0) return null;

          const [dominante, ...otros] = presentes;
          return {
            className: cn('border overflow-hidden font-semibold', chipAnual(dominante)),
            title: tooltipDia(d),
            contenido: (
              <>
                {dia}
                {/* El fondo dice el estado más urgente; esta franja avisa que
                    ese día hay además otros. Sin ella, un día con una vencida
                    sola se vería igual que uno con una vencida entre diez
                    activas. */}
                {otros.length > 0 && (
                  <span className="absolute inset-x-0 bottom-0 flex h-1.5">
                    {otros.map(e => (
                      <span key={e} className={cn('flex-1', soloFondo(chipAnual(e)))} />
                    ))}
                  </span>
                )}
              </>
            ),
          };
        }}
      />
    </div>
  );
}
