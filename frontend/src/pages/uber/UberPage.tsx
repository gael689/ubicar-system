/**
 * Tablero de Uber (21/11/2026).
 *
 * Pedido de Gael: *"la parte de Uber bien funcional, fácil de usar todo"*.
 * Ubicar alquila autos por semana a choferes de Uber, y hasta ahora saber quién
 * había pagado la semana era ir a Cobros o a la cuenta corriente, buscar al
 * cliente y mirar cuota por cuota. Acá está todo junto: cada chofer con su
 * semana en curso, si está al día o debe, y lo que se hace con él —cobrar,
 * escribirle, cargar el km, renovar— a un clic.
 *
 * **Ordenado por urgencia**: primero los que deben, después los que pagan hoy,
 * después los que están al día. Lo que no necesita atención queda abajo.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CalendarPlus, Car, CheckCircle2, ChevronDown, ChevronUp, Clock, Gauge,
  MessageCircle, Plus, Search, Wallet,
} from 'lucide-react';

import { ContratoRapidoModal } from '@/pages/reservas/ContratoRapidoModal';
import { ReservaInfoModal } from '@/pages/reservas/ReservaInfoModal';
import {
  useTableroUber, type ContratoUber, type CuotaUber, type EstadoUber,
} from '@/hooks/useUber';
import { etiquetaMedio } from '@/lib/mediosPago';
import { ETIQUETA_MODALIDAD, fechaCorta, linkWhatsappUber, mensajeWhatsappUber } from '@/lib/uber';
import { cn, formatMiles } from '@/lib/utils';
import { CargarKmDialog, CobrarSemanaDialog, RenovarDialog } from './DialogosUber';

const pesos = (n: number) => `$${formatMiles(n, 0)}`;
const km = (n: number) => formatMiles(Math.round(n), 0);

const ESTADO: Record<EstadoUber, { label: string; borde: string; chip: string }> = {
  atrasado: { label: 'Atrasado', borde: 'border-l-danger', chip: 'bg-danger-bg text-danger' },
  vence_hoy: { label: 'Vence hoy', borde: 'border-l-warning', chip: 'bg-warning-bg text-warning' },
  al_dia: { label: 'Al día', borde: 'border-l-success', chip: 'bg-success-bg text-success' },
  a_entregar: { label: 'A entregar', borde: 'border-l-slate-300', chip: 'bg-muted text-muted-foreground' },
};

type Filtro = 'todos' | EstadoUber;

const boton = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';
const botonSecundario = `${boton} border border-slate-300 bg-white text-slate-700 hover:bg-primary/10`;

type Accion = { tipo: 'cobrar' | 'km' | 'renovar'; contrato: ContratoUber };

export function UberPage() {
  const { data, isLoading, isError, refetch } = useTableroUber();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [verReserva, setVerReserva] = useState<number | null>(null);
  // `undefined`: cerrado. `null`: contrato nuevo sin auto elegido.
  const [nuevoCon, setNuevoCon] = useState<number | null | undefined>(undefined);

  const contratos = useMemo(() => data?.contratos ?? [], [data]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contratos.filter(c => {
      if (filtro !== 'todos' && c.estado !== filtro) return false;
      if (!q) return true;
      return [c.chofer, c.patente, c.vehiculo, c.telefono].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [contratos, filtro, busqueda]);

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando el tablero de Uber…</p>;
  }
  if (isError || !data) {
    return <p className="p-6 text-sm text-danger">No se pudo cargar el tablero de Uber. Probá recargar la página.</p>;
  }

  const { resumen, libres, pie } = data;
  const filtros: { id: Filtro; label: string; cantidad: number }[] = [
    { id: 'todos', label: 'Todos', cantidad: contratos.length },
    { id: 'atrasado', label: 'Atrasados', cantidad: resumen.atrasados },
    { id: 'vence_hoy', label: 'Vence hoy', cantidad: resumen.vence_hoy },
    { id: 'al_dia', label: 'Al día', cantidad: resumen.al_dia },
    { id: 'a_entregar', label: 'A entregar', cantidad: resumen.a_entregar },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Uber</h1>
          <p className="text-sm text-muted-foreground">Quién pagó la semana, quién debe y qué auto está libre.</p>
        </div>
        <button type="button" onClick={() => setNuevoCon(null)}
          className={`${boton} bg-primary text-white hover:bg-primary/90`}>
          <Plus className="h-4 w-4" /> Nuevo contrato Uber
        </button>
      </div>

      {/* Los cuatro números */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero titulo="Choferes activos" valor={String(resumen.activos)}
          detalle={resumen.a_entregar ? `+ ${resumen.a_entregar} por entregar` : undefined} />
        <Numero titulo="Al día" valor={String(resumen.al_dia)} tono="success"
          detalle={resumen.vence_hoy ? `${resumen.vence_hoy} ${resumen.vence_hoy === 1 ? 'paga' : 'pagan'} hoy` : undefined} />
        <Numero titulo="Con atraso" valor={String(resumen.atrasados)} tono={resumen.atrasados ? 'danger' : undefined}
          detalle={resumen.atrasados ? `${pesos(resumen.adeudado)} adeudados` : 'Nadie debe'} />
        <Numero titulo="A cobrar esta semana" valor={pesos(resumen.a_cobrar_semana)}
          detalle="lo que vence de lunes a domingo" />
      </div>

      {/* Autos de Uber sin chofer */}
      {libres.length > 0 && (
        <section aria-label="Libres para asignar" className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Car className="h-4 w-4 text-primary" /> Libres para asignar
            <span className="font-normal text-muted-foreground">({libres.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {libres.map(v => (
              <div key={v.vehiculo_id} className="flex items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-3 pr-1.5 text-sm">
                <span><strong>{v.patente}</strong> <span className="text-muted-foreground">{v.vehiculo}</span></span>
                <button type="button" onClick={() => setNuevoCon(v.vehiculo_id)}
                  aria-label={`Nuevo contrato Uber con ${v.patente}`}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90">
                  <CalendarPlus className="h-3.5 w-3.5" /> Nuevo contrato Uber
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtro rápido y buscador */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {filtros.map(f => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                filtro === f.id ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-primary/10',
              )}>
              {f.label} <span className="opacity-75">{f.cantidad}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar chofer o patente" aria-label="Buscar chofer o patente"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      {/* Los contratos */}
      {contratos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay contratos de Uber vigentes.</p>
          <button type="button" onClick={() => setNuevoCon(null)} className={`${boton} mt-3 bg-primary text-white hover:bg-primary/90`}>
            <Plus className="h-4 w-4" /> Nuevo contrato Uber
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Ningún contrato coincide con el filtro.
        </p>
      ) : (
        <ul className="space-y-3">
          {visibles.map(c => (
            <Tarjeta
              key={c.reserva_id}
              c={c}
              abierto={abierto === c.reserva_id}
              onAbrir={() => setAbierto(abierto === c.reserva_id ? null : c.reserva_id)}
              onAccion={tipo => setAccion({ tipo, contrato: c })}
              onVerReserva={() => setVerReserva(c.reserva_id)}
            />
          ))}
        </ul>
      )}

      {/* El pie: los números del negocio */}
      <footer className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground sm:grid-cols-3">
        <span>Ingreso semanal comprometido: <strong className="text-foreground">{pesos(pie.ingreso_semanal)}</strong></span>
        <span>
          Cobranza del mes:{' '}
          <strong className="text-foreground">
            {pie.cobranza_mes_pct === null ? 'sin vencimientos' : `${pie.cobranza_mes_pct} %`}
          </strong>
          {pie.cobranza_mes_pct !== null && <> ({pesos(pie.cobrado_mes)} de {pesos(pie.vencio_mes)})</>}
        </span>
        <span>
          Autos de Uber: <strong className="text-foreground">{pie.autos_ocupados} ocupados</strong> · {pie.autos_libres} libres
        </span>
      </footer>

      {accion?.tipo === 'cobrar' && <CobrarSemanaDialog contrato={accion.contrato} onClose={() => setAccion(null)} />}
      {accion?.tipo === 'km' && <CargarKmDialog contrato={accion.contrato} onClose={() => setAccion(null)} />}
      {accion?.tipo === 'renovar' && <RenovarDialog contrato={accion.contrato} onClose={() => setAccion(null)} />}
      {verReserva !== null && (
        <ReservaInfoModal reservaId={verReserva} onClose={() => setVerReserva(null)} onActionComplete={() => { setVerReserva(null); void refetch(); }} />
      )}
      {nuevoCon !== undefined && (
        <ContratoRapidoModal
          tipo="uber"
          initialVehiculoId={nuevoCon ?? undefined}
          onClose={() => setNuevoCon(undefined)}
          onCreada={() => { void refetch(); }}
        />
      )}
    </div>
  );
}

function Numero({ titulo, valor, detalle, tono }: {
  titulo: string; valor: string; detalle?: string; tono?: 'success' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className={cn(
        'mt-0.5 text-2xl font-bold tabular-nums text-foreground',
        tono === 'success' && 'text-success', tono === 'danger' && 'text-danger',
      )}>
        {valor}
      </p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

/** Lo que dice el estado, en una frase que se lee sola. */
function fraseDeEstado(c: ContratoUber): string {
  if (c.estado === 'atrasado') {
    const semanas = c.semanas_adeudadas === 1 ? '1 semana' : `${c.semanas_adeudadas} semanas`;
    const dias = c.dias_atraso === 1 ? '1 día' : `${c.dias_atraso} días`;
    return `Debe ${semanas} · ${pesos(c.adeudado)} · ${dias} de atraso`;
  }
  if (c.estado === 'vence_hoy') return `Hoy paga la semana ${c.cuota_a_cobrar?.numero ?? c.semana.numero} · ${pesos(c.exigible)}`;
  if (c.estado === 'a_entregar') return `Se entrega el ${fechaCorta(c.fecha_inicio)}`;
  if (c.proxima_fecha) return `Próximo pago: ${fechaCorta(c.proxima_fecha)} · ${pesos(c.proximo_monto)}`;
  return 'Tiene todo el contrato pago';
}

function fraseDeFin(c: ContratoUber): string {
  const d = c.dias_para_terminar;
  if (d < 0) return `Terminó hace ${-d} ${d === -1 ? 'día' : 'días'}`;
  if (d === 0) return 'Termina hoy';
  return `Termina en ${d} ${d === 1 ? 'día' : 'días'}`;
}

function Tarjeta({ c, abierto, onAbrir, onAccion, onVerReserva }: {
  c: ContratoUber;
  abierto: boolean;
  onAbrir: () => void;
  onAccion: (tipo: Accion['tipo']) => void;
  onVerReserva: () => void;
}) {
  const estilo = ESTADO[c.estado];
  const entregado = c.tipo_fila === 'contrato';
  const auto = [c.vehiculo, c.patente].filter(Boolean).join(' ') || 'auto';
  const whatsapp = linkWhatsappUber(c.telefono, mensajeWhatsappUber({
    chofer: c.chofer,
    estado: c.estado,
    auto,
    semana: c.cuota_a_cobrar?.numero ?? c.semana.numero,
    monto: c.estado === 'atrasado' ? c.adeudado : c.estado === 'vence_hoy' ? c.exigible : c.proximo_monto,
    semanasAdeudadas: c.semanas_adeudadas,
    proximaFecha: c.proxima_fecha,
  }));
  const consumo = c.km?.consumo ?? null;
  const pasadoDeKm = !!consumo && consumo.excedidos > 0;
  const porTerminar = entregado && c.dias_para_terminar <= 3;

  return (
    <li data-testid={`contrato-${c.reserva_id}`} data-estado={c.estado}
      className={cn('rounded-xl border border-l-4 border-border bg-card', estilo.borde)}>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center md:p-4">
        {/* Chofer y auto */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{c.chofer}</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', estilo.chip)}>{estilo.label}</span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            <strong className="text-foreground">{c.patente ?? 'Sin auto'}</strong> {c.vehiculo}
            {c.telefono ? ` · ${c.telefono}` : ''}
          </p>
        </div>

        {/* Semana y estado */}
        <div className="min-w-0 text-sm">
          <p className="text-foreground">
            <span className="font-medium">Semana {c.semana.numero} de {c.semana.total}</span>
            <span className="text-muted-foreground"> · {fechaCorta(c.semana.desde)} – {fechaCorta(c.semana.hasta)} · {pesos(c.valor_semana)}</span>
          </p>
          <p className={cn(
            'font-medium',
            c.estado === 'atrasado' && 'text-danger', c.estado === 'vence_hoy' && 'text-warning',
            c.estado === 'al_dia' && 'text-success', c.estado === 'a_entregar' && 'text-muted-foreground',
          )}>
            {fraseDeEstado(c)}
          </p>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {c.estado === 'atrasado' && c.proxima_fecha && <span>Próximo pago: {fechaCorta(c.proxima_fecha)}</span>}
            <span className={cn(porTerminar && 'font-semibold text-warning')}>
              <Clock className="mr-0.5 inline h-3 w-3" />{fraseDeFin(c)} ({fechaCorta(c.fecha_fin)})
            </span>
            {consumo && consumo.permitidos !== null && (
              <span className={cn(pasadoDeKm && 'font-semibold text-warning')}>
                <Gauge className="mr-0.5 inline h-3 w-3" />
                {km(consumo.recorridos)} de {km(consumo.permitidos)} km
                {pasadoDeKm ? ` · ${km(consumo.excedidos)} de más` : ''}
              </span>
            )}
            {entregado && !consumo && c.km?.km_semana ? <span><Gauge className="mr-0.5 inline h-3 w-3" />Sin lecturas de km</span> : null}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {entregado && c.cuota_a_cobrar && (
            <button type="button" onClick={() => onAccion('cobrar')} className={`${boton} bg-primary text-white hover:bg-primary/90`}>
              <Wallet className="h-4 w-4" /> Cobrar semana
            </button>
          )}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={botonSecundario}
              aria-label={`WhatsApp a ${c.chofer}`}>
              <MessageCircle className="h-4 w-4 text-success" /> WhatsApp
            </a>
          ) : (
            <span className={`${botonSecundario} cursor-not-allowed opacity-50`} title="El cliente no tiene un teléfono válido cargado">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </span>
          )}
          {entregado && (
            <>
              <button type="button" onClick={() => onAccion('km')} className={botonSecundario}>
                <Gauge className="h-4 w-4" /> Cargar km
              </button>
              <button type="button" onClick={() => onAccion('renovar')} className={botonSecundario}>
                <CalendarPlus className="h-4 w-4" /> Renovar semanas
              </button>
            </>
          )}
          <button type="button" onClick={onAbrir} aria-expanded={abierto}
            aria-label={`${abierto ? 'Ocultar' : 'Ver'} el detalle de ${c.chofer}`}
            className={`${botonSecundario} px-2`}>
            {abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="space-y-4 border-t border-border bg-muted/30 p-3 md:p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-1.5 text-sm font-semibold text-foreground">Semanas</h4>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm">
                {c.cuotas.map(q => <FilaCuota key={q.numero} q={q} />)}
              </ul>
              {!entregado && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Las cuotas se cargan a la cuenta corriente recién al entregar el auto.
                </p>
              )}
            </div>
            <div>
              <h4 className="mb-1.5 text-sm font-semibold text-foreground">Kilómetros</h4>
              {c.km?.km_semana ? (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {km(c.km.km_semana)} km por semana
                  {c.km.precio_km_extra ? ` · ${pesos(c.km.precio_km_extra)} el km extra` : ''}
                  {c.km.permitidos_hoy !== null ? ` · a hoy puede llevar ${km(c.km.permitidos_hoy)} km` : ''}
                </p>
              ) : (
                <p className="mb-1.5 text-xs text-muted-foreground">Sin tope de km en el contrato.</p>
              )}
              {c.lecturas.length === 0 ? (
                <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                  Todavía no se cargó ninguna lectura.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm">
                  {c.lecturas.map(l => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1.5">
                      <span>{fechaCorta(l.fecha)} · <strong>{km(l.km)} km</strong></span>
                      <span className={cn('text-xs', l.excedidos > 0 ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                        {km(l.recorridos)}{l.permitidos !== null ? ` de ${km(l.permitidos)}` : ''} km
                        {l.excedidos > 0 ? ` · ${km(l.excedidos)} de más` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <button type="button" onClick={onVerReserva} className="font-medium text-primary underline-offset-2 hover:underline">
              Ver contrato / reserva #{c.reserva_id}
            </button>
            <Link to={`/clientes/${c.cliente_id}?tab=cuenta-corriente`} className="font-medium text-primary underline-offset-2 hover:underline">
              Cuenta corriente
            </Link>
            <span className="text-xs text-muted-foreground">
              {ETIQUETA_MODALIDAD[c.modalidad]}{c.nota_condicion ? ` — ${c.nota_condicion}` : ''} · desde el {fechaCorta(c.fecha_inicio)}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

function FilaCuota({ q }: { q: CuotaUber }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1.5">
      <span>
        <span className="font-medium">Semana {q.numero}</span>
        <span className="text-muted-foreground"> · {fechaCorta(q.vencimiento)} · {pesos(q.monto)}</span>
      </span>
      {q.estado === 'paga' && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Paga
          {q.fecha_pago ? ` el ${fechaCorta(q.fecha_pago)}` : ''}{q.medio_pago ? ` · ${etiquetaMedio(q.medio_pago)}` : ''}
        </span>
      )}
      {q.estado === 'vencida' && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
          <AlertTriangle className="h-3.5 w-3.5" /> Vencida · debe {pesos(q.saldo)}
        </span>
      )}
      {q.estado === 'vence_hoy' && (
        <span className="text-xs font-semibold text-warning">Vence hoy · {pesos(q.saldo)}</span>
      )}
      {q.estado === 'parcial' && (
        <span className="text-xs font-medium text-muted-foreground">Pagó {pesos(q.pagado)} · falta {pesos(q.saldo)}</span>
      )}
      {q.estado === 'pendiente' && <span className="text-xs text-muted-foreground">Pendiente</span>}
    </li>
  );
}
