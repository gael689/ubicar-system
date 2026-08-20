import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key, ArrowDownToLine, AlertTriangle, ChevronDown, Globe, Store, Calendar,
} from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useReservasPendientes } from '@/hooks/useReservasWeb';
import { PanelResolverReserva } from '@/components/reservas/PanelResolverReserva';
import { cn } from '@/lib/utils';
import type { DashboardDetalle, Reserva } from '@/types';

type FlujoEvento = DashboardDetalle['flujo_del_dia'][number];

function hoyISO(): string {
  return new Date().toISOString().split('T')[0];
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

/**
 * Etiqueta legible del día elegido, en la forma en que alguien lo diría.
 *
 * Se compara contra strings ISO y no contra `Date`: `new Date('2026-09-01')`
 * se parsea como UTC y en Argentina cae un día antes — el mismo motivo por el
 * que `formatDate` de `lib/utils` parte el string en vez de construir fechas.
 */
function etiquetaDia(iso: string): string {
  if (iso === hoyISO()) return 'Hoy';
  if (iso === sumarDias(hoyISO(), 1)) return 'Mañana';
  if (iso === sumarDias(hoyISO(), -1)) return 'Ayer';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Lo que hay que hacer, debajo del calendario.
 *
 * **Por qué debajo y no en solapas.** El calendario es lo que se mira todo el
 * día y no cede tamaño: sigue ocupando lo mismo. Esto va abajo, colapsado a una
 * franja de una línea con los números.
 *
 * **Y por qué la franja es números y no una lista.** Ya se intentó una vez:
 * había una franja fija de 220px con el flujo del día, que la mayor parte del
 * tiempo decía "aún no hay movimientos" y le comía un cuarto de pantalla al
 * calendario para no decir nada. Por eso terminó en un modal. La diferencia
 * ahora es que colapsada ocupa una línea, informa igual —"3 salidas · 2
 * devoluciones"— y que Pendientes casi nunca está vacío, porque no depende del
 * día.
 *
 * **El día lo elige esta barra**, no el calendario de arriba: Salidas y
 * Devoluciones son la agenda de un día concreto, y hay que poder mirar mañana
 * sin perder de vista la grilla.
 */
export function PanelHoy() {
  const navigate = useNavigate();
  const [dia, setDia] = useState(hoyISO());
  const [abierto, setAbierto] = useState(false);
  const [resolviendo, setResolviendo] = useState<Reserva | null>(null);

  const { data: stats, isLoading } = useDashboardStats(dia);
  const { data: pendientesData } = useReservasPendientes();
  const pendientes = pendientesData ?? [];

  // El backend ya manda el flujo del día partido por tipo de evento, así que
  // separar salidas de devoluciones no necesita ninguna consulta nueva.
  const { salidas, devoluciones } = useMemo(() => {
    const flujo = stats?.flujo_del_dia ?? [];
    return {
      salidas: flujo.filter(e => e.tipo === 'check_out'),
      devoluciones: flujo.filter(e => e.tipo === 'devolucion'),
    };
  }, [stats]);

  const criticas = pendientes.some(r => r.estado === 'revision_sin_cupo');
  const hayAlgo = salidas.length + devoluciones.length + pendientes.length > 0;

  return (
    <>
      <div className={cn(
        'shrink-0 border-t bg-card',
        // Deja lugar a la barra de navegación de celular, que es fija.
        'mb-16 md:mb-0',
        criticas ? 'border-danger' : 'border-border',
      )}>
        {/* La franja: una línea, siempre visible */}
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          <button
            onClick={() => setAbierto(v => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm transition-colors hover:opacity-80"
          >
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
            <span className="shrink-0 font-semibold text-foreground">{etiquetaDia(dia)}</span>
            {hayAlgo ? (
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Key className="h-3.5 w-3.5 text-emerald-600" />
                  {salidas.length} salida{salidas.length !== 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-blue-600" />
                  {devoluciones.length} devolución{devoluciones.length !== 1 ? 'es' : ''}
                </span>
                {pendientes.length > 0 && (
                  <span className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    criticas ? 'text-danger' : 'text-amber-700',
                  )}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sin movimientos</span>
            )}
          </button>

          {/* Ir a otro día sin perder el calendario de vista */}
          <div className="flex shrink-0 items-center gap-1">
            {dia !== hoyISO() && (
              <button
                onClick={() => setDia(hoyISO())}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
              >
                Hoy
              </button>
            )}
            <button
              onClick={() => setDia(sumarDias(dia, -1))}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              title="Día anterior"
            >
              ←
            </button>
            <button
              onClick={() => setDia(sumarDias(dia, 1))}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              title="Día siguiente"
            >
              →
            </button>
            <label className="hidden items-center sm:inline-flex" title="Elegir un día">
              <Calendar className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={dia}
                onChange={e => e.target.value && setDia(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            </label>
          </div>
        </div>

        {abierto && (
          <div className="grid max-h-[38vh] gap-4 overflow-y-auto border-t border-border px-3 py-3 sm:px-4 md:grid-cols-3">
            <Seccion
              titulo={`Salidas · ${etiquetaDia(dia)}`}
              icono={<Key className="h-4 w-4 text-emerald-600" />}
              vacio="Nada sale este día."
              cargando={isLoading}
              eventos={salidas}
              onVer={() => navigate('/reservas')}
            />
            <Seccion
              titulo={`Devoluciones · ${etiquetaDia(dia)}`}
              icono={<ArrowDownToLine className="h-4 w-4 text-blue-600" />}
              vacio="Nada vuelve este día."
              cargando={isLoading}
              eventos={devoluciones}
              onVer={() => navigate('/reservas')}
            />
            <SeccionPendientes
              reservas={pendientes}
              onResolver={setResolviendo}
            />
          </div>
        )}
      </div>

      {resolviendo && (
        <PanelResolverReserva
          reserva={resolviendo}
          onClose={() => setResolviendo(null)}
        />
      )}
    </>
  );
}

function Seccion({
  titulo, icono, vacio, cargando, eventos, onVer,
}: {
  titulo: string;
  icono: React.ReactNode;
  vacio: string;
  cargando: boolean;
  eventos: FlujoEvento[];
  onVer: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icono} {titulo}
      </div>
      {cargando ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : eventos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="space-y-1.5">
          {eventos.map((e, i) => (
            <li key={i}>
              <button
                onClick={onVer}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
              >
                <p className="truncate text-xs font-medium text-foreground">{e.descripcion}</p>
                <p className="text-[10px] text-muted-foreground">
                  {/* `hora_real` sólo viene cuando el movimiento ya ocurrió:
                      es lo que distingue "falta hacer" de "ya está hecho". */}
                  {e.hora_real
                    ? <>Hecho {e.hora_real} <span className="opacity-70">· previsto {e.hora_programada}</span></>
                    : <>Previsto {e.hora_programada ?? e.hora}</>}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeccionPendientes({
  reservas, onResolver,
}: {
  reservas: Reserva[];
  onResolver: (r: Reserva) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> Pendientes
      </div>
      {reservas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada trabado.</p>
      ) : (
        <ul className="space-y-1.5">
          {/* El backend ya las ordena por urgencia y después por antigüedad.
              No se reordena acá: dos criterios de urgencia en dos lados
              terminan contradiciéndose. */}
          {reservas.map(r => (
            <li key={r.id}>
              <button
                onClick={() => onResolver(r)}
                className={cn(
                  'w-full rounded-lg border bg-background px-2.5 py-1.5 text-left transition-colors hover:bg-accent',
                  r.estado === 'revision_sin_cupo' ? 'border-danger/50' : 'border-border',
                )}
              >
                <p className="truncate text-xs font-medium text-foreground">
                  {r.cliente?.nombre_completo ?? r.web_contacto_nombre ?? `Reserva #${r.id}`}
                </p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {r.origen === 'web' ? <Globe className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                  {r.estado === 'revision_sin_cupo'
                    ? 'Pagó y no hay auto'
                    : r.estado === 'pendiente_pago'
                      ? 'Esperando el pago'
                      : !r.vehiculo_id
                        ? 'Falta asignar auto'
                        : 'Falta emitir el contrato'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
