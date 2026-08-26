import { useState, useEffect, useCallback, useMemo } from 'react';
import { AccionesContrato } from '@/components/reservas/AccionesContrato';
import { CheckCircle2, Car, Flag, XCircle, Plus, FileText, Search, X, Calendar, AlertTriangle, AlarmClockOff, SlidersHorizontal, ChevronDown, Rows3, Rows2, Clock, Globe, Store, Wrench, Check, Hourglass } from 'lucide-react';
import { PanelResolverReserva } from '@/components/reservas/PanelResolverReserva';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useReservas, descargarPdfReserva } from '@/hooks/useReservas';
import api from '@/lib/api';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { extractError, cn } from '@/lib/utils';
import { ESTADO_RESERVA_LABEL } from '@/lib/constants';
import { useAppStore, type CanalReserva } from '@/store/useAppStore';
import { BadgeCanal } from '@/components/reservas/BadgeCanal';
import type { Reserva, EstadoReserva, PaginatedResponse } from '@/types';
import { ReservaModal } from './ReservaModal';
import { CheckoutModal } from './CheckoutModal';
import { CheckinModal } from './CheckinModal';
import { ExtenderModal } from './ExtenderModal';
import { SemaforoDot } from './SemaforoDot';

/**
 * Los estados que se pueden filtrar, y se eligen **de a varios**.
 *
 * Lo pidió el dueño así: "que pueda filtrar por 'esperando pago', por
 * 'confirmada' y las demás, que sean filtros esto y esto". Antes era un valor
 * solo, y en el mostrador la pregunta nunca es "mostrame las confirmadas" sino
 * "mostrame lo que tengo que resolver hoy" — que son dos o tres estados juntos.
 * Con un chip por vez había que mirar la pantalla tres veces y acordarse de lo
 * que decía la anterior.
 *
 * Están **los nueve** del enum, no una selección. Los tres de la web
 * (`pendiente_pago`, `sin_disponibilidad`, `revision_sin_cupo`) aparecen en la
 * tabla igual, así que dejarlos afuera del filtro significaba que la fila que
 * más grita —una reserva pagada que se quedó sin auto— era justamente la que no
 * se podía buscar. El orden es el del día de trabajo: primero lo que está vivo,
 * después lo que hay que resolver, y al final lo cerrado.
 */
const ESTADOS: { value: EstadoReserva; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'activa', label: 'Activa' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'pendiente_pago', label: 'Esperando pago' },
  { value: 'revision_sin_cupo', label: 'Pagada sin cupo' },
  { value: 'sin_disponibilidad', label: 'Sin disponibilidad' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'cancelada', label: 'Cancelada' },
];

/**
 * De dónde vino la reserva. Un solo listado con filtro, en vez de una pantalla
 * separada para la web: son la misma tabla y el mismo circuito a partir de que
 * están confirmadas.
 */
const CANALES: { value: CanalReserva; label: string; icon?: typeof Globe }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'web', label: 'Web', icon: Globe },
  { value: 'mostrador', label: 'Mostrador', icon: Store },
];

// Los tres que faltaban acá se veían como una etiqueta gris sin borde, porque
// el lookup caía en el `?? ''`: al poderse filtrar ahora aparecen en tandas, y
// una columna entera de badges apagados no dice nada.
const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-700 border-slate-300',
  confirmada: 'bg-blue-100 text-blue-800 border-blue-200',
  revision_sin_cupo: 'bg-rose-100 text-rose-800 border-rose-300',
  sin_disponibilidad: 'bg-orange-100 text-orange-800 border-orange-200',
  activa: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  vencida: 'bg-red-100 text-red-800 border-red-300 animate-pulse',
  pendiente_pago: 'bg-amber-100 text-amber-800 border-amber-200',
  finalizada: 'bg-slate-200 text-slate-800 border-slate-300',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
};

const ESTADO_ICONS: Record<string, React.ReactNode> = {
  pendiente: <Hourglass className="w-3.5 h-3.5" />,
  confirmada: <CheckCircle2 className="w-3.5 h-3.5" />,
  revision_sin_cupo: <Wrench className="w-3.5 h-3.5" />,
  sin_disponibilidad: <AlertTriangle className="w-3.5 h-3.5" />,
  activa: <Car className="w-3.5 h-3.5" />,
  vencida: <AlarmClockOff className="w-3.5 h-3.5" />,
  pendiente_pago: <Clock className="w-3.5 h-3.5" />,
  finalizada: <Flag className="w-3.5 h-3.5" />,
  cancelada: <XCircle className="w-3.5 h-3.5" />,
};

export function ReservasList() {
  // Reservas "vencidas": pasó la hora de devolución y el auto no volvió.
  // Antes esto se aproximaba filtrando 'activa' + fecha_fin < hoy en el cliente;
  // ahora el backend ya calcula el estado 'vencida' de forma autoritativa.
  const { data: pendingCheckouts = [] } = useQuery({
    queryKey: ['reservas', 'pending-checkout-alerts'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', {
        params: { estado: 'vencida', page_size: 50, page: 1 },
      });
      return data.data;
    },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  /**
   * Reservas web esperando la transferencia.
   *
   * Se consultan aparte del listado porque **se pierden entre las demás**: son
   * ventas sin confirmar, sin auto tomado y con un cliente que ya mandó el
   * comprobante por WhatsApp. Si aparecen sólo como una fila más entre
   * cincuenta, nadie las ve hasta que el cliente vuelve a escribir.
   */
  const { data: webEsperandoPago = [] } = useQuery({
    queryKey: ['reservas', 'web-esperando-pago'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', {
        params: { origen: 'web', estado: 'pendiente_pago', page_size: 50, page: 1 },
      });
      return data.data;
    },
    staleTime: 60_000,
  });

  const { loading, error, listReservas, cancelarReserva } = useReservas();
  const [resolverReserva, setResolverReserva] = useState<Reserva | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // La selección de estados. Vacía significa "todos" y no "ninguno": es lo que
  // espera cualquiera que abre la pantalla sin tocar nada.
  const [estados, setEstados] = useState<EstadoReserva[]>([]);
  const [search, setSearch] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Fase 3 §5.2: filtros colapsables (arrancan cerrados para recuperar
  // espacio) y densidad de tabla persistida.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    reservasDensidad: densidad, setReservasDensidad: setDensidad,
    reservasCanal: canal, setReservasCanal: setCanal,
  } = useAppStore();
  // El canal cuenta como filtro activo sólo si acota algo: en "todas" no
  // esconde nada, así que marcarlo haría que el contador mienta.
  // Los estados cuentan como **un** filtro aunque haya cinco elegidos: el
  // badge dice cuántas cosas están acotando la lista, no cuántos clicks se
  // dieron. Si sumara uno por chip, elegir tres estados marcaría "3" y
  // parecería que también hay una búsqueda y una fecha puestas.
  const activeFiltersCount = useMemo(
    () => [estados.length ? 'estado' : '', search, fechaFiltro, canal !== 'todas' ? canal : ''].filter(Boolean).length,
    [estados, search, fechaFiltro, canal],
  );
  const compacta = densidad === 'compacta';
  const cellPad = compacta ? 'px-3 py-1.5' : 'px-4 py-3';
  const [checkoutReserva, setCheckoutReserva] = useState<Reserva | null>(null);
  const [checkinReserva, setCheckinReserva] = useState<Reserva | null>(null);
  const [editReserva, setEditReserva] = useState<Reserva | null>(null);
  const [extenderReserva, setExtenderReserva] = useState<Reserva | null>(null);
  const pageSize = 20;

  /** Suma o saca un estado de la selección, sin pisar los otros. */
  const toggleEstado = useCallback((valor: EstadoReserva) => {
    setEstados(prev => prev.includes(valor) ? prev.filter(e => e !== valor) : [...prev, valor]);
    // Volver a la página 1 es obligatorio: con otro filtro la página 3 puede no
    // existir, y la tabla queda vacía como si no hubiera resultados.
    setPage(1);
  }, []);

  const limpiarFiltros = useCallback(() => {
    setEstados([]);
    setSearch('');
    setFechaFiltro('');
    setPage(1);
  }, []);

  const loadReservas = useCallback(async () => {
    const resp = await listReservas({
      // Coma-separado, que es lo que el backend valida contra el enum y
      // responde 400 si no reconoce. Sin estados elegidos no se manda el
      // parámetro: mandar una cadena vacía filtraría por "nada".
      estado: estados.length ? estados.join(',') : undefined,
      q: search.trim() || undefined,
      fecha: fechaFiltro || undefined,
      // El backend ya aceptaba `origen` (lo usa el banner de arriba); lo que
      // faltaba era que el listado principal pudiera pasarlo.
      origen: canal === 'todas' ? undefined : canal,
      page,
      page_size: pageSize,
    });
    setReservas(resp.data);
    setTotal(resp.total);
  }, [listReservas, estados, search, fechaFiltro, canal, page]);

  useEffect(() => {
    loadReservas().catch(() => {});
  }, [loadReservas]);

  /**
   * Recargar al volver a la pestaña.
   *
   * El caso real es el contrato: se le manda el link al cliente, firma **desde
   * el teléfono**, y en la computadora el listado sigue diciendo "Sin firmar"
   * porque se cargó antes. Nadie sabe que tiene que apretar F5, así que la
   * pantalla miente hasta que alguien recarga por casualidad.
   *
   * Pasa lo mismo con cualquier cambio hecho desde otra máquina: son varios
   * usando el sistema a la vez.
   */
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') loadReservas().catch(() => {});
    };
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [loadReservas]);

  const [cancelarId, setCancelarId] = useState<number | null>(null);

  const handleCancelar = async (motivo: string) => {
    if (!cancelarId) return;
    try {
      await cancelarReserva(cancelarId, motivo);
      setCancelarId(null);
      await loadReservas();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* Header — sticky para no perderlo al scrollear la tabla */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 bg-surface/95 backdrop-blur px-4 pt-4 pb-3 space-y-3 border-b border-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Reservas y Alquileres</h1>
            <p className="text-sm text-slate-500 mt-1">{total} resultado{total !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle de densidad */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setDensidad('comoda')}
                title="Densidad cómoda"
                className={cn('p-1.5 rounded-md transition-colors', !compacta ? 'bg-primary/15 text-primary' : 'text-slate-400 hover:text-slate-600')}
              >
                <Rows2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDensidad('compacta')}
                title="Densidad compacta"
                className={cn('p-1.5 rounded-md transition-colors', compacta ? 'bg-primary/15 text-primary' : 'text-slate-400 hover:text-slate-600')}
              >
                <Rows3 className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className={cn(
                'px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-2',
                filtersOpen ? 'bg-primary/10 border-primary/25 text-primary' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', filtersOpen && 'rotate-180')} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva Reserva
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="space-y-3">
            {/* Buscador y filtro de fecha */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-48 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o DNI/CUIT del cliente..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                />
                {search && (
                  <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 px-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={fechaFiltro}
                  onChange={e => { setFechaFiltro(e.target.value); setPage(1); }}
                  className="border-none bg-transparent text-sm text-slate-700 focus:ring-0 py-2"
                  title="Filtrar por dia especifico"
                />
                {fechaFiltro && (
                  <button onClick={() => { setFechaFiltro(''); setPage(1); }} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Canal. Va antes que el estado y separado a propósito: no es una
                búsqueda sino una forma de trabajar, y es lo único de esta
                barra que queda puesto entre sesiones. */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500">Canal</span>
              {CANALES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => { setCanal(c.value); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    canal === c.value
                      ? 'bg-primary/15 text-primary border-primary/25'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {c.icon && <c.icon className="w-3.5 h-3.5" />}
                  {c.label}
                </button>
              ))}
            </div>

            {/* Filtros de estado — se eligen de a varios.
                El chip "Todos" no es un estado más: es el que limpia la
                selección, y queda encendido justamente cuando no hay ninguno
                elegido. Así "sacar el filtro" es un click y no nueve. */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500">Estado</span>
              <button
                onClick={() => { setEstados([]); setPage(1); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  estados.length === 0
                    ? 'bg-primary/15 text-primary border-primary/25'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Todos
              </button>
              {ESTADOS.map((e) => {
                const activo = estados.includes(e.value);
                return (
                  <button
                    key={e.value}
                    onClick={() => toggleEstado(e.value)}
                    aria-pressed={activo}
                    title={activo ? `Sacar "${e.label}" del filtro` : `Sumar "${e.label}" al filtro`}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                      activo
                        ? 'bg-primary/15 text-primary border-primary/25'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {/* El tilde es lo que distingue "elegido" de "resaltado".
                        Con varios chips prendidos a la vez, el color solo no
                        alcanza para leer que se pueden combinar. */}
                    {activo && <Check className="w-3.5 h-3.5" />}
                    {e.label}
                  </button>
                );
              })}
            </div>

            {(estados.length > 0 || search || fechaFiltro) && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={limpiarFiltros}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border bg-amber-600 text-white border-amber-700 hover:bg-amber-700 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpiar filtros
                </button>
                {estados.length > 0 && (
                  <span className="text-xs text-slate-500">
                    Mostrando {estados.map(v => ESTADOS.find(e => e.value === v)?.label ?? v).join(' + ')}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reservas web esperando la transferencia.
          Por transferencia no hay webhook: nadie le avisa al sistema que la
          plata llegó. La reserva se queda en `pendiente_pago` sin ocupar
          calendario hasta que una persona concilia el comprobante contra el
          extracto — y si nadie lo hace, la venta se cae sola. */}
      {webEsperandoPago.length > 0 && (
        <div className="rounded-xl border border-amber-700 bg-amber-600 p-4">
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-white shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {webEsperandoPago.length} reserva{webEsperandoPago.length !== 1 ? 's' : ''} web esperando la transferencia
              </p>
              <p className="text-xs text-amber-50 mt-0.5">
                No se confirman solas. Registrá el cobro cuando lo veas en el extracto y asignales un auto.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {webEsperandoPago.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setResolverReserva(r)}
                    title="Cobrar, asignar el auto y emitir el contrato"
                    className="inline-flex items-center gap-1 text-xs bg-white border border-amber-900 rounded-lg px-2 py-1 text-amber-900 font-medium hover:bg-amber-100 transition-colors"
                  >
                    <Wrench className="h-3 w-3" />
                    #{r.id} · {r.cliente?.nombre_completo ?? r.web_contacto_nombre ?? `Cliente ${r.cliente_id}`}
                    {' · '}{r.categoria?.nombre ?? 'sin categoría'}
                    {' · '}{r.fecha_inicio}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerta: check-outs pendientes (autos no devueltos) */}
      {pendingCheckouts.length > 0 && (
        <div className="rounded-xl border border-amber-700 bg-amber-600 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-white shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {pendingCheckouts.length} vehículo{pendingCheckouts.length !== 1 ? 's' : ''} con check-in pendiente
              </p>
              <p className="text-xs text-amber-50 mt-0.5">La fecha de devolución ha pasado y el auto no fue devuelto.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingCheckouts.map(r => (
                  <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-amber-800 border border-amber-900 rounded-lg px-2 py-1 text-white font-medium">
                    <Car className="h-3 w-3" />
                    {r.vehiculo?.patente ?? `Veh.${r.vehiculo_id}`} · {r.cliente?.nombre_completo ?? `Cliente ${r.cliente_id}`} · vencida {r.fecha_fin}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-600 border border-red-700 text-white text-sm">
          {error}
        </div>
      )}

      {/* Tabla Light / Excel-like */}
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : reservas.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p>No hay reservas para mostrar</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-left">
                <th className={cn(cellPad, 'border-r border-slate-200 w-16')}>ID</th>
                <th className={cn(cellPad, 'border-r border-slate-200')}>Vehículo</th>
                <th className={cn(cellPad, 'border-r border-slate-200')}>Cliente</th>
                <th className={cn(cellPad, 'border-r border-slate-200')}>Fechas</th>
                <th className={cn(cellPad, 'border-r border-slate-200')}>Precio</th>
                <th className={cn(cellPad, 'border-r border-slate-200')}>Estado</th>
                <th className={cn(cellPad, 'text-right')}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reservas.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                  <td className={cn(cellPad, 'text-slate-500 font-mono font-medium border-r border-slate-200')}>
                    #{r.id}
                  </td>
                  <td className={cn(cellPad, 'border-r border-slate-200')}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className={cn('font-bold text-slate-800', compacta && 'text-xs')}>
                          {r.vehiculo ? `${r.vehiculo.marca} ${r.vehiculo.modelo}` : `Veh. ${r.vehiculo_id}`}
                        </div>
                        {r.vehiculo && !compacta && (
                          <div className="text-xs text-slate-500">{r.vehiculo.patente}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={cn(cellPad, 'border-r border-slate-200')}>
                    <div className={cn('text-slate-800 font-medium', compacta && 'text-xs')}>
                      {/* Una solicitud web sin cupo puede no tener cliente
                          todavía: el contacto vive en la reserva (D-04). */}
                      {r.cliente?.nombre_completo ?? r.web_contacto_nombre ?? `Cliente ${r.cliente_id}`}
                    </div>
                    {/* El canal, debajo del cliente: quién reservó y cómo
                        reservó son la misma pregunta. Va acá y no en una
                        columna propia para no ensanchar la tabla. */}
                    <BadgeCanal
                      origen={r.origen}
                      creadoPor={r.usuario_nombre}
                      size="sm"
                      className="mt-0.5"
                    />
                  </td>
                  <td className={cn(cellPad, 'border-r border-slate-200')}>
                    <div className="text-slate-800 text-xs font-medium">
                      {r.fecha_inicio} <span className="text-slate-400">→</span> {r.fecha_fin}
                    </div>
                    {r.late_checkout && !compacta && (
                      <div className="text-xs text-amber-600 mt-1 font-medium bg-amber-50 inline-block px-1.5 py-0.5 rounded">
                        Late checkout
                      </div>
                    )}
                  </td>
                  <td className={cn(cellPad, 'border-r border-slate-200')}>
                    {r.precio_total ? (
                      <span className={cn('text-emerald-700 font-bold', compacta && 'text-xs')}>
                        ${parseFloat(r.precio_total).toLocaleString('es-AR')}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Sin precio</span>
                    )}
                  </td>
                  <td className={cn(cellPad, 'border-r border-slate-200')}>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${ESTADO_COLORS[r.estado] ?? ''}`}>
                      {ESTADO_ICONS[r.estado]} {ESTADO_RESERVA_LABEL[r.estado] ?? r.estado}
                    </span>
                    {/* Estado del contrato, siempre visible.
                        D-34: el que reclama acción va sólido y no
                        transparente. "Sin contrato" con el auto ya afuera es
                        lo más grave y por eso pisa a los demás. Los tres
                        desaparecen solos: nadie tiene que acordarse de
                        sacarlos. */}
                    {/* El cartel dejo de ser solo un cartel: emite, regenera
                        o copia el link sin salir del listado. El aviso rojo de
                        D-34 se conserva -- el auto salio sin papel firmado y eso
                        tiene que verse de lejos -- pero ahora trae debajo las
                        acciones para resolverlo, en vez de mandarte a otra
                        pantalla justo cuando mas apurado estas. */}
                    <AccionesContrato
                      reservaId={r.id}
                      estado={r.contrato_estado}
                      entregadoSinContrato={r.entregado_sin_contrato}
                      onCambio={() => { loadReservas().catch(() => {}); }}
                      onAbrir={() => setEditReserva(r)}
                    />
                    {r.bloqueada_por_solape && !compacta && (
                      <div className="text-xs text-amber-600 mt-1 font-medium">⚠️ Solape pendiente</div>
                    )}
                  </td>
                  <td className={cellPad}>
                    <div className="flex items-center justify-end gap-2">
                      {/* PDF de confirmación — se genera al vuelo con los
                          datos actuales, sirve para reenviárselo al cliente */}
                      <button
                        onClick={() => descargarPdfReserva(r.id).catch(() => {})}
                        title="Descargar PDF de la reserva"
                        className="px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors"
                      >
                        PDF
                      </button>

                      {/* Resolver: cobrar, asignar el auto y emitir el
                          contrato, sin salir del listado.
                          Aparece cuando falta algo de eso — el caso típico es
                          la reserva web, que llega sin plata y sin auto, pero
                          una de mostrador cargada por categoría tiene el
                          mismo agujero. */}
                      {!r.alquiler_id && r.estado !== 'cancelada' &&
                        (r.estado === 'pendiente_pago' || !r.vehiculo_id) && (
                        <button
                          onClick={() => setResolverReserva(r)}
                          title="Cobrar, asignar el vehículo y emitir el contrato"
                          className="px-3 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold transition-colors inline-flex items-center gap-1"
                        >
                          <Wrench className="w-3 h-3" />
                          Resolver
                        </button>
                      )}

                      {/* Editar / Cancelar (solo si no hay alquiler) */}
                      {!r.alquiler_id && r.estado !== 'cancelada' && (
                        <>
                          <button
                            onClick={() => setEditReserva(r)}
                            className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setCancelarId(r.id)}
                            className="px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors"
                          >
                            Cancelar
                          </button>
                        </>
                      )}

                      {/* Check-out (entregar auto al cliente) */}
                      {!r.alquiler_id && r.estado !== 'cancelada' && (
                        <div className="flex items-center gap-1.5">
                          <SemaforoDot reservaId={r.id} momento="checkout" />
                          <button
                            onClick={() => setCheckoutReserva(r)}
                            className="px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors"
                          >
                            Check-out
                          </button>
                        </div>
                      )}

                      {/* Check-in + Extender + Editar (auto entregado, pendiente devolución) */}
                      {r.alquiler_id && r.alquiler_estado === 'activo' && (
                        <>
                          <button
                            onClick={() => setEditReserva(r)}
                            className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setExtenderReserva(r)}
                            className="px-3 py-1.5 rounded bg-muted hover:bg-accent text-foreground text-xs font-bold transition-colors"
                          >
                            Extender
                          </button>
                          <SemaforoDot reservaId={r.id} momento="checkin" />
                          <button
                            onClick={() => setCheckinReserva(r)}
                            className="px-3 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold transition-colors"
                          >
                            Check-in
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm font-medium text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modales */}
      {resolverReserva && (
        <PanelResolverReserva
          reserva={resolverReserva}
          onClose={() => { setResolverReserva(null); loadReservas().catch(() => {}); }}
          onCambio={() => { loadReservas().catch(() => {}); }}
        />
      )}
      {showCreateModal && (
        <ReservaModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(_r, _w) => { setShowCreateModal(false); loadReservas(); }}
        />
      )}
      {editReserva && (
        <ReservaModal
          reserva={editReserva}
          onClose={() => setEditReserva(null)}
          onSuccess={(_r, _w) => { setEditReserva(null); loadReservas(); }}
        />
      )}
      {checkoutReserva && (
        <CheckoutModal
          reserva={checkoutReserva}
          onClose={() => setCheckoutReserva(null)}
          onSuccess={() => { setCheckoutReserva(null); loadReservas(); }}
        />
      )}
      {checkinReserva && checkinReserva.alquiler_id && (
        <CheckinModal
          alquilerId={checkinReserva.alquiler_id}
          vehiculoInfo={checkinReserva.vehiculo ? `${checkinReserva.vehiculo.marca} ${checkinReserva.vehiculo.modelo} (${checkinReserva.vehiculo.patente})` : `Veh. ${checkinReserva.vehiculo_id}`}
          clienteNombre={checkinReserva.cliente?.nombre_completo ?? `Cliente ${checkinReserva.cliente_id}`}
          kmCheckout={0}
          garantiaTipo={checkinReserva.garantia_tipo ?? null}
          garantiaMonto={checkinReserva.garantia_monto ?? null}
          reserva={checkinReserva}
          onClose={() => setCheckinReserva(null)}
          onSuccess={() => { setCheckinReserva(null); loadReservas(); }}
        />
      )}
      {extenderReserva && extenderReserva.alquiler_id && (
        <ExtenderModal
          alquilerId={extenderReserva.alquiler_id}
          vehiculoInfo={extenderReserva.vehiculo ? `${extenderReserva.vehiculo.marca} ${extenderReserva.vehiculo.modelo} (${extenderReserva.vehiculo.patente})` : `Veh. ${extenderReserva.vehiculo_id}`}
          clienteNombre={extenderReserva.cliente?.nombre_completo ?? `Cliente ${extenderReserva.cliente_id}`}
          fechaInicioActual={extenderReserva.fecha_inicio}
          fechaFinActual={extenderReserva.fecha_fin}
          horaFinActual={extenderReserva.hora_fin}
          precioTotalActual={extenderReserva.precio_total}
          onClose={() => setExtenderReserva(null)}
          onSuccess={() => { setExtenderReserva(null); loadReservas(); }}
        />
      )}

      <MotivoDialog
        open={cancelarId !== null}
        onOpenChange={open => !open && setCancelarId(null)}
        title="Cancelar reserva"
        description="La seña, si la hay, no se devuelve — queda registrada como ingreso. El motivo es obligatorio."
        confirmLabel="Cancelar reserva"
        loading={loading}
        onConfirm={handleCancelar}
      />
    </div>
  );
}
