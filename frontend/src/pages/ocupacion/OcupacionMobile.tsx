import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Globe, ArrowUpRight, ArrowDownLeft, Ban, CalendarDays, Rows3 } from 'lucide-react';
import { MenuNuevaOperacion } from '@/components/reservas/MenuNuevaOperacion';
import { ESTADO_RESERVA_LABEL } from '@/lib/constants';
import { abreviarLugar } from '@/lib/lugares';
import { cn, fechaLocal } from '@/lib/utils';
import type { EventoOcupacion, VehiculoOcupacion } from '@/types';

/**
 * Ocupación en el teléfono, **vista simple** (14/10).
 *
 * Pedido: *"muchos botones que ya molestan para vista mobile. Si la idea es que
 * se vea el calendario bien, que si tocás una reserva puedas tener la
 * información"*. Lo que en el escritorio es útil —leyenda de estados, filtros
 * de canal y categoría, zoom, tres vistas— en una pantalla de 390 px tapaba el
 * calendario. Acá queda lo que se usa parado en el mostrador o en la calle:
 *
 * - el mes, estilo calendario del iPhone, con puntos de color por día;
 * - el día elegido, partido en **Salen**, **Vuelven** y **En la calle**, que
 *   es como se piensa el día de una rentadora;
 * - tocar una reserva abre su ficha.
 *
 * Todo lo demás sigue estando, detrás de "Vista avanzada".
 *
 * Deslizar el mes de costado cambia de mes; deslizar la lista cambia de día.
 */

/** Color del punto del día y de la barra de la tarjeta, por estado. */
const COLOR_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-400',
  pendiente_pago: 'bg-violet-500',
  confirmada: 'bg-blue-600',
  activa: 'bg-emerald-600',
  vencida: 'bg-red-600',
  finalizada: 'bg-slate-400',
};
const COLOR_BLOQUEO = 'bg-slate-600';

/** Del más urgente al menos: el punto del día muestra primero lo que te necesita. */
const PRIORIDAD = ['vencida', 'activa', 'confirmada', 'pendiente', 'pendiente_pago', 'finalizada'];

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const esBloqueo = (ev: EventoOcupacion) => ev.tipo === 'bloqueo';
const colorDe = (ev: EventoOcupacion) => (esBloqueo(ev) ? COLOR_BLOQUEO : COLOR_ESTADO[ev.estado] ?? 'bg-slate-400');

/** Cuándo vuelve el auto: la devolución **acordada**, que puede ser otro día. */
function vuelveEl(ev: EventoOcupacion): string {
  return ev.fecha_devolucion_acordada || ev.fecha_fin;
}
function vuelveA(ev: EventoOcupacion): string {
  return (ev.hora_devolucion_acordada || ev.hora_fin).slice(0, 5);
}

/** Lo que falta confirmar: una entrega que ya pasó y nadie registró. */
function sinCheckout(ev: EventoOcupacion): boolean {
  if (esBloqueo(ev)) return false;
  const salida = new Date(`${ev.fecha_inicio}T${ev.hora_inicio}`);
  return (!ev.tiene_alquiler && ev.estado === 'activa') || (ev.estado === 'confirmada' && salida < new Date());
}

interface Props {
  eventos: EventoOcupacion[];
  vehiculos: VehiculoOcupacion[];
  /** Reservas vendidas sin auto. Sólo el número: la lista ya existe. */
  sinAsignar: number;
  loading: boolean;
  fecha: Date;
  onFecha: (d: Date) => void;
  onReserva: (id: number) => void;
  onCheckoutPrompt: (id: number, fecha: string, hora: string) => void;
  onNuevaReserva: (fecha: string) => void;
  onNuevoContrato: (tipo: 'alquiler' | 'uber', fecha: string) => void;
  onVerSinAsignar: () => void;
  /** Pasar a la grilla de autos en fila (la vista de escritorio). */
  onGrilla: () => void;
}

export function OcupacionMobile({
  eventos, vehiculos, sinAsignar, loading, fecha, onFecha, onReserva, onCheckoutPrompt,
  onNuevaReserva, onNuevoContrato, onVerSinAsignar, onGrilla,
}: Props) {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth();
  const hoy = fechaLocal(new Date());
  const elegido = fechaLocal(fecha);

  // ── El mes ────────────────────────────────────────────────────────────────
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    const corrimiento = (primero.getDay() + 6) % 7; // semana arranca el lunes
    const out: (Date | null)[] = Array(corrimiento).fill(null);
    for (let d = 1; d <= ultimo; d++) out.push(new Date(anio, mes, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [anio, mes]);

  /** Los estados presentes cada día, ya ordenados por urgencia (hasta 3). */
  const puntosPorDia = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of celdas) {
      if (!d) continue;
      const iso = fechaLocal(d);
      const delDia = eventos.filter(e => e.fecha_inicio <= iso && e.fecha_fin >= iso);
      if (!delDia.length) continue;
      const colores = new Set<string>();
      const orden = [...delDia].sort((a, b) => rango(a) - rango(b));
      for (const ev of orden) {
        colores.add(colorDe(ev));
        if (colores.size === 3) break;
      }
      m.set(iso, [...colores]);
    }
    return m;
  }, [celdas, eventos]);

  // ── El día ────────────────────────────────────────────────────────────────
  const dia = useMemo(() => {
    const delDia = eventos.filter(e => e.fecha_inicio <= elegido && e.fecha_fin >= elegido);
    const salen = delDia.filter(e => !esBloqueo(e) && e.fecha_inicio === elegido)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    const vuelven = delDia.filter(e => !esBloqueo(e) && e.fecha_inicio !== elegido && vuelveEl(e) === elegido)
      .sort((a, b) => vuelveA(a).localeCompare(vuelveA(b)));
    // Un auto que vuelve un día después de `fecha_fin` (late check-in) también
    // vuelve "hoy" aunque el evento del calendario ya haya terminado ayer.
    const vuelvenTarde = eventos.filter(
      e => !esBloqueo(e) && e.fecha_fin < elegido && vuelveEl(e) === elegido,
    );
    const enLaCalle = delDia.filter(
      e => !esBloqueo(e) && e.fecha_inicio !== elegido && vuelveEl(e) !== elegido,
    );
    const bloqueados = delDia.filter(esBloqueo);
    const ocupados = new Set(delDia.map(e => e.vehiculo_id)).size;
    return { salen, vuelven: [...vuelven, ...vuelvenTarde], enLaCalle, bloqueados, ocupados };
  }, [eventos, elegido]);

  const irAMes = (delta: number) => {
    // Cae en el mismo día del mes, o en el último si no existe (31 → 30).
    const destino = new Date(anio, mes + delta, 1);
    const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
    destino.setDate(Math.min(fecha.getDate(), ultimo));
    onFecha(destino);
  };
  const irADia = (delta: number) => {
    const d = new Date(fecha);
    d.setDate(d.getDate() + delta);
    onFecha(d);
  };

  const deslizarMes = useDeslizar(irAMes);
  const deslizarDia = useDeslizar(irADia);

  const [mostrarCalle, setMostrarCalle] = useState(false);
  // Mayúscula sólo la primera: `capitalize` de CSS escribía "14 De Octubre".
  const tituloCrudo = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(fecha);
  const titulo = tituloCrudo.charAt(0).toUpperCase() + tituloCrudo.slice(1);
  const esHoy = elegido === hoy;

  return (
    <div className="-mx-2 -mt-2 flex min-h-0 flex-1 flex-col sm:-mx-3 sm:-mt-3">
      {/* ── Encabezado: el mes, Hoy, el cambio de vista y +. Nada más. ── */}
      <div className="flex items-center gap-1 px-3 pb-1 pt-2">
        <h2 className="flex-1 text-[22px] font-bold leading-tight tracking-tight text-slate-900">
          {MESES[mes]} <span className="font-semibold text-slate-400">{anio}</span>
        </h2>
        <button
          type="button"
          onClick={() => onFecha(new Date())}
          disabled={esHoy}
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-primary transition-colors active:bg-primary/10 disabled:text-slate-300"
        >
          Hoy
        </button>
        <SelectorVistaMobile vista="calendario" onCambiar={v => { if (v === 'grilla') onGrilla(); }} />
        <MenuNuevaOperacion
          onNuevaReserva={() => onNuevaReserva(elegido)}
          onNuevoContrato={tipo => onNuevoContrato(tipo, elegido)}
          variante="icono"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm active:bg-primary/90"
        />
      </div>

      {/* ── El mes ── */}
      <div {...deslizarMes} className="touch-pan-y select-none px-1">
        <div className="grid grid-cols-7">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className={cn('py-1 text-center text-[11px] font-semibold', i >= 5 ? 'text-slate-400' : 'text-slate-500')}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-b border-slate-200 pb-1">
          {celdas.map((d, i) => {
            if (!d) return <div key={i} className="h-11" />;
            const iso = fechaLocal(d);
            const sel = iso === elegido;
            const deHoy = iso === hoy;
            const puntos = puntosPorDia.get(iso) ?? [];
            return (
              <button
                key={i}
                type="button"
                onClick={() => onFecha(d)}
                aria-label={iso}
                aria-pressed={sel}
                className="flex h-11 flex-col items-center justify-start pt-0.5"
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-[15px] tabular-nums',
                    sel && deHoy && 'bg-primary font-bold text-white',
                    sel && !deHoy && 'bg-slate-900 font-bold text-white',
                    !sel && deHoy && 'font-bold text-primary',
                    !sel && !deHoy && 'text-slate-800',
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="mt-px flex h-1.5 gap-[3px]">
                  {puntos.map(c => <span key={c} className={cn('h-1.5 w-1.5 rounded-full', c)} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── El día ── */}
      <div {...deslizarDia} className="min-h-0 flex-1 touch-pan-y overflow-y-auto px-3 pb-6 pt-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">{titulo}</h3>
            {vehiculos.length > 0 && (
              <p className="text-xs text-slate-500">
                {dia.ocupados} de {vehiculos.length} autos ocupados
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={() => irADia(-1)} aria-label="Día anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => irADia(1)} aria-label="Día siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {sinAsignar > 0 && (
          <button
            type="button"
            onClick={onVerSinAsignar}
            className="mb-3 flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left active:bg-amber-100"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <span className="flex-1 text-sm font-semibold text-amber-950">
              {sinAsignar} reserva{sinAsignar !== 1 ? 's' : ''} sin auto asignado
            </span>
            <ChevronRight className="h-4 w-4 text-amber-700" />
          </button>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-5">
            <Seccion titulo="Salen" icono={<ArrowUpRight className="h-4 w-4" />} vacio="Nadie retira este día.">
              {dia.salen.map(ev => (
                <Tarjeta key={`s-${ev.tipo}-${ev.id}`} ev={ev} vehiculos={vehiculos}
                  hora={ev.hora_inicio.slice(0, 5)} lugar={ev.lugar_entrega}
                  onClick={() => onReserva(ev.id)}
                  onCheckout={sinCheckout(ev) ? () => onCheckoutPrompt(ev.id, ev.fecha_inicio, ev.hora_inicio) : undefined} />
              ))}
            </Seccion>

            <Seccion titulo="Vuelven" icono={<ArrowDownLeft className="h-4 w-4" />} vacio="No vuelve ningún auto.">
              {dia.vuelven.map(ev => (
                <Tarjeta key={`v-${ev.tipo}-${ev.id}`} ev={ev} vehiculos={vehiculos}
                  hora={vuelveA(ev)} lugar={ev.lugar_devolucion}
                  onClick={() => onReserva(ev.id)} />
              ))}
            </Seccion>

            {/* En la calle va plegada: es el dato que menos se consulta y el
                que más ocupa. Con el número a la vista alcanza. */}
            {dia.enLaCalle.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setMostrarCalle(v => !v)}
                  className="mb-2 flex w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"
                >
                  <ChevronRight className={cn('h-4 w-4 transition-transform', mostrarCalle && 'rotate-90')} />
                  En la calle · {dia.enLaCalle.length}
                </button>
                {mostrarCalle && (
                  <div className="space-y-2">
                    {dia.enLaCalle.map(ev => (
                      <Tarjeta key={`c-${ev.tipo}-${ev.id}`} ev={ev} vehiculos={vehiculos}
                        hora={null} lugar={null} vuelve={`Vuelve ${fmtCorta(vuelveEl(ev))} ${vuelveA(ev)}`}
                        onClick={() => onReserva(ev.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {dia.bloqueados.length > 0 && (
              <Seccion titulo="Fuera de servicio" icono={<Ban className="h-4 w-4" />} vacio="">
                {dia.bloqueados.map(ev => (
                  <Tarjeta key={`b-${ev.id}`} ev={ev} vehiculos={vehiculos} hora={null} lugar={null} />
                ))}
              </Seccion>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Calendario o autos en fila, con un toque (14/10).
 *
 * *"Que se pueda cambiar de vista rápidamente, a la siguiente"*: antes la
 * grilla estaba detrás de "Vista avanzada", junto con todos los filtros. Es el
 * mismo selector en las dos vistas, en el mismo lugar, como el de la app de
 * calendario del teléfono.
 */
export function SelectorVistaMobile({ vista, onCambiar }: {
  vista: 'calendario' | 'grilla';
  onCambiar: (v: 'calendario' | 'grilla') => void;
}) {
  const opciones = [
    { v: 'calendario' as const, icono: <CalendarDays className="h-[18px] w-[18px]" />, label: 'Calendario' },
    { v: 'grilla' as const, icono: <Rows3 className="h-[18px] w-[18px]" />, label: 'Autos en fila' },
  ];
  return (
    <div role="group" aria-label="Vista" className="flex shrink-0 rounded-full bg-slate-100 p-0.5">
      {opciones.map(o => (
        <button
          key={o.v}
          type="button"
          aria-label={o.label}
          aria-pressed={vista === o.v}
          title={o.label}
          onClick={() => vista !== o.v && onCambiar(o.v)}
          className={cn(
            'flex h-8 w-9 items-center justify-center rounded-full transition-colors',
            vista === o.v ? 'bg-white text-primary shadow-sm' : 'text-slate-500',
          )}
        >
          {o.icono}
        </button>
      ))}
    </div>
  );
}

function rango(ev: EventoOcupacion): number {
  if (esBloqueo(ev)) return PRIORIDAD.length;
  const i = PRIORIDAD.indexOf(ev.estado);
  return i === -1 ? PRIORIDAD.length : i;
}

function fmtCorta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function Seccion({ titulo, icono, vacio, children }: {
  titulo: string; icono: React.ReactNode; vacio: string; children: React.ReactNode[];
}) {
  const hay = children.length > 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icono} {titulo}{hay && ` · ${children.length}`}
      </div>
      {hay ? <div className="space-y-2">{children}</div> : (
        vacio ? <p className="pl-6 text-sm text-slate-400">{vacio}</p> : null
      )}
    </div>
  );
}

/**
 * Una reserva, como en la agenda del iPhone: la hora a la izquierda, una barra
 * del color del estado y, a la derecha, **el auto primero** (es lo que se busca
 * en el playón) y después el cliente.
 */
function Tarjeta({ ev, vehiculos, hora, lugar, vuelve, onClick, onCheckout }: {
  ev: EventoOcupacion;
  vehiculos: VehiculoOcupacion[];
  hora: string | null;
  lugar?: string | null;
  vuelve?: string;
  onClick?: () => void;
  onCheckout?: () => void;
}) {
  const v = vehiculos.find(x => x.id === ev.vehiculo_id);
  const bloqueo = esBloqueo(ev);
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={cn(
        'flex items-stretch gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200',
        onClick && 'active:bg-slate-50',
      )}
    >
      {hora !== null && (
        <div className="w-11 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-slate-900">{hora}</div>
      )}
      <div className={cn('w-1 shrink-0 rounded-full', colorDe(ev))} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold tracking-wide text-slate-900">{v?.patente ?? 'Sin auto'}</span>
          <span className="truncate text-xs text-slate-500">{v ? `${v.marca} ${v.modelo}` : ''}</span>
        </div>
        <div className="flex items-center gap-1 truncate text-sm text-slate-700">
          <span className="truncate">{ev.cliente_nombre}</span>
          {!bloqueo && ev.origen === 'web' && <Globe className="h-3 w-3 shrink-0 text-primary" />}
        </div>
        {(lugar || vuelve || !bloqueo) && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            {lugar && <span className="truncate">{abreviarLugar(lugar)}</span>}
            {vuelve && <span>{vuelve}</span>}
            {!bloqueo && (
              <span className="ml-auto shrink-0 text-[11px] font-medium">{(ESTADO_RESERVA_LABEL as Record<string, string>)[ev.estado] ?? ev.estado}</span>
            )}
          </div>
        )}
      </div>
      {onCheckout && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onCheckout(); }}
          aria-label="Falta confirmar la entrega"
          className="flex shrink-0 items-center self-center rounded-lg bg-[#FFE500] px-2 py-1.5 text-black ring-1 ring-black"
        >
          <AlertTriangle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Deslizar de costado: a la izquierda avanza, a la derecha retrocede.
 *
 * Sólo cuenta si el gesto es claramente horizontal (más de 50 px y más ancho
 * que alto): un scroll vertical de la lista no puede cambiar el día.
 */
function useDeslizar(mover: (delta: number) => void) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      inicio.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const i = inicio.current;
      inicio.current = null;
      if (!i) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - i.x;
      const dy = t.clientY - i.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) mover(dx < 0 ? 1 : -1);
    },
  };
}

