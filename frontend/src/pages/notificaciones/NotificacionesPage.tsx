import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailsTab } from '@/components/emails/EmailsTab';
import { AvisoItem } from '@/components/avisos/AvisoItem';
import { OportunidadCard } from '@/components/avisos/OportunidadCard';
import {
  useHistorialNotificaciones, useLeerTodas, useNotificaciones, useOportunidades,
} from '@/hooks/useNotificaciones';
import { cn, extractError, formatDate } from '@/lib/utils';
import type { EstadoNotificacion } from '@/types';
import {
  MODULOS, moduloVisual, pesosRedondos, porUrgencia,
  URGENCIAS, URGENCIA_LABEL, URGENCIA_COLOR,
} from '@/lib/notificaciones';

const ESTADO_LABEL: Record<EstadoNotificacion, string> = {
  pendiente: 'Pendiente',
  enviada: 'Enviada',
  leida: 'Leída',
  pospuesta: 'Pospuesta',
  descartada: 'Descartada',
  resuelta: 'Resuelta sola',
};

const ESTADO_COLOR: Record<EstadoNotificacion, string> = {
  pendiente: 'bg-muted text-muted-foreground',
  enviada: 'bg-muted text-muted-foreground',
  leida: 'bg-primary text-white',
  pospuesta: 'bg-warning text-white',
  descartada: 'bg-danger text-white',
  resuelta: 'bg-success text-white',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ANIOS = [2024, 2025, 2026, 2027];

/** Las pestañas, en orden. `?tab=` acepta cualquiera de estas claves. */
const PESTANAS = ['atender', 'oportunidades', 'historial', 'emails'] as const;
type Pestana = typeof PESTANAS[number];

/**
 * Centro de avisos: lo que hay que atender, lo que conviene aprovechar, lo que
 * pasó y los mails que salieron.
 *
 * Los mails viven acá desde antes por la misma razón que el resto: cuando
 * alguien llama preguntando si le llegó la confirmación, la pregunta es "¿qué
 * avisó el sistema?", y tener que recordar en qué pantalla estaba cada cosa era
 * el problema. La pestaña sale de la URL (`?tab=oportunidades`) para que el
 * menú, la campana y el panel de Hoy puedan mandar directo a una.
 */
export function NotificacionesPage() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab');
  // `notificaciones` era la pestaña del historial antes del Centro de avisos.
  const tab: Pestana = pedida === 'notificaciones'
    ? 'historial'
    : (PESTANAS as readonly string[]).includes(pedida ?? '') ? pedida as Pestana : 'atender';

  function cambiar(v: string) {
    const p = new URLSearchParams(params);
    if (v === 'atender') p.delete('tab'); else p.set('tab', v);
    setParams(p, { replace: true });
  }

  return (
    <Tabs value={tab} onValueChange={cambiar} className="max-w-4xl mx-auto space-y-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="atender">Para atender</TabsTrigger>
        <TabsTrigger value="oportunidades">
          <Lightbulb className="mr-1 h-3.5 w-3.5 text-amber-600" /> Oportunidades
        </TabsTrigger>
        <TabsTrigger value="historial">Historial</TabsTrigger>
        <TabsTrigger value="emails">Mails enviados</TabsTrigger>
      </TabsList>
      <TabsContent value="atender">
        <ParaAtender />
      </TabsContent>
      <TabsContent value="oportunidades">
        <Oportunidades />
      </TabsContent>
      <TabsContent value="historial">
        <HistorialNotificaciones />
      </TabsContent>
      <TabsContent value="emails">
        <EmailsTab />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Lo activo, **agrupado por módulo** en el orden del catálogo, y dentro de
 * cada módulo lo urgente primero. Es la campana con aire: misma fuente, mismas
 * acciones.
 */
function ParaAtender() {
  const navigate = useNavigate();
  const { data, isLoading } = useNotificaciones();
  const leerTodas = useLeerTodas();

  const grupos = useMemo(() => {
    const items = data?.items ?? [];
    return (data?.por_modulo ?? []).map(m => ({
      ...m,
      items: items.filter(i => i.modulo === m.modulo).sort(porUrgencia),
    })).filter(g => g.items.length > 0);
  }, [data]);

  async function leerModulo(modulo: string) {
    try {
      await leerTodas.mutateAsync(modulo);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Cargando…</div>;
  }
  if (grupos.length === 0) {
    return (
      <div className="text-center py-16">
        <Bell className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
        <p className="text-sm text-foreground font-medium">Nada para atender</p>
        <p className="mt-1 text-xs text-muted-foreground">Todo en orden 👌</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grupos.map(g => {
        const v = moduloVisual(g.modulo, g.label);
        return (
          <section key={g.modulo} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <v.icono className={cn('h-4 w-4', v.color)} />
                {g.label}
                <span className="text-xs font-normal text-muted-foreground">
                  {g.total}{g.urgentes > 0 ? ` · ${g.urgentes} urgente${g.urgentes !== 1 ? 's' : ''}` : ''}
                </span>
              </h2>
              <button
                onClick={() => leerModulo(g.modulo)}
                disabled={leerTodas.isPending}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar leído
              </button>
            </div>
            <div className="space-y-1.5">
              {g.items.map(item => (
                <AvisoItem key={item.id} item={item} onIr={url => navigate(url)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Las oportunidades 💡, la que más plata mueve primero (así las manda el
 * backend). Arriba, cuántas son y cuánto suman: es lo que hace que valga la
 * pena abrir esta pestaña.
 */
function Oportunidades() {
  const navigate = useNavigate();
  const { data, isLoading } = useOportunidades();
  const total = data?.total ?? 0;
  const impacto = data?.impacto_total ?? 0;

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Buscando oportunidades…</div>;
  }
  if (total === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border py-14 px-6 text-center">
        <Lightbulb className="mx-auto mb-3 h-10 w-10 text-amber-500 opacity-60" />
        <p className="text-sm font-semibold text-foreground">Por ahora no hay oportunidades a la vista</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Todos los días el sistema revisa autos parados, clientes para volver a llamar, fechas
          fuertes con lugar y lo que la web no pudo vender. Cuando aparezca algo, va a estar acá.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <Lightbulb className="h-4 w-4 self-center text-amber-600" />
        <span className="text-sm font-semibold text-foreground">
          {total} oportunidad{total !== 1 ? 'es' : ''}
        </span>
        {impacto > 0 && (
          <span className="text-sm text-amber-800">· ≈ {pesosRedondos(impacto)} en juego</span>
        )}
        <span className="w-full text-xs text-muted-foreground sm:w-auto sm:ml-auto">
          Montos estimados, para decidir por dónde empezar.
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data?.items.map(item => (
          <OportunidadCard key={item.id} item={item} onIr={url => navigate(url)} />
        ))}
      </div>
    </div>
  );
}

function HistorialNotificaciones() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [fecha, setFecha] = useState('');
  const [anio, setAnio] = useState<number | null>(new Date().getFullYear());
  const [mes, setMes] = useState<number | null>(null);
  const [modulo, setModulo] = useState('');
  const [urgencias, setUrgencias] = useState<string[]>([]);

  const { data, isLoading } = useHistorialNotificaciones({
    page,
    soloResueltas: false,
    fecha: fecha || null,
    anio,
    mes,
    // Se filtra por módulo y no por `tipo` suelto: nadie busca
    // "poliza_vencimiento", busca "lo de la flota". El backend traduce el
    // módulo a sus tipos con el mismo catálogo con que los muestra.
    modulos: modulo ? [modulo] : undefined,
    urgencias: urgencias.length ? urgencias : undefined,
  });

  const toggleUrgencia = (u: string) => {
    setUrgencias(prev => (prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]));
    setPage(1);
  };

  function handleFecha(v: string) {
    setFecha(v);
    setPage(1);
  }
  function handleAnio(v: string) {
    setAnio(v ? Number(v) : null);
    setPage(1);
  }
  function handleMes(v: string) {
    setMes(v ? Number(v) : null);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-6 bg-card border border-border rounded-xl p-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Día exacto</label>
          <input
            type="date"
            value={fecha}
            onChange={e => handleFecha(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background block"
          />
        </div>

        <div className="hidden sm:block self-stretch w-px bg-border" />
        <span className="text-xs text-muted-foreground">o filtrar por período</span>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Año</label>
            <select
              value={anio ?? ''}
              onChange={e => handleAnio(e.target.value)}
              disabled={!!fecha}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background disabled:opacity-50"
            >
              <option value="">Todos</option>
              {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Mes</label>
            <select
              value={mes ?? ''}
              onChange={e => handleMes(e.target.value)}
              disabled={!!fecha}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background disabled:opacity-50"
            >
              <option value="">Todos los meses</option>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>

        {fecha && (
          <button
            onClick={() => handleFecha('')}
            className="text-xs text-primary hover:underline pb-2"
          >
            Quitar filtro de día
          </button>
        )}

        <div className="w-full border-t border-border pt-4 flex flex-wrap items-end gap-6">
          <div className="space-y-1.5">
            <label htmlFor="f-modulo" className="text-xs font-medium text-muted-foreground">
              Módulo
            </label>
            <select
              id="f-modulo"
              value={modulo}
              onChange={e => { setModulo(e.target.value); setPage(1); }}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background block min-w-[220px]"
            >
              <option value="">Todos</option>
              {MODULOS.map(m => <option key={m.clave} value={m.clave}>{m.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground block">Urgencia</span>
            <div className="flex flex-wrap gap-1.5">
              {URGENCIAS.map(u => {
                const activa = urgencias.includes(u);
                return (
                  <button
                    key={u}
                    onClick={() => toggleUrgencia(u)}
                    aria-pressed={activa}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      activa
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {URGENCIA_LABEL[u]}
                  </button>
                );
              })}
            </div>
          </div>

          {(modulo || urgencias.length > 0) && (
            <button
              onClick={() => { setModulo(''); setUrgencias([]); setPage(1); }}
              className="text-xs text-primary hover:underline pb-2"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">Cargando...</div>
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && (
          <div className="text-center py-16">
            <Bell className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
            <p className="text-sm text-foreground font-medium">Sin notificaciones en este período</p>
          </div>
        )}
        {data?.data.map(n => (
          <button
            key={n.id}
            onClick={() => navigate(n.url_destino)}
            className="w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{n.titulo}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${URGENCIA_COLOR[n.urgencia] ?? ''}`}>
                    {URGENCIA_LABEL[n.urgencia as keyof typeof URGENCIA_LABEL] ?? n.urgencia}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${ESTADO_COLOR[n.estado]}`}>
                    {ESTADO_LABEL[n.estado]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{n.descripcion}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {n.modulo_label || moduloVisual(n.modulo).label} · {formatDate(n.created_at)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="text-sm text-muted-foreground disabled:opacity-40 hover:text-foreground"
          >
            ← Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {data.page} de {Math.ceil(data.total / data.page_size)} ({data.total} en total)
          </span>
          <button
            disabled={page * data.page_size >= data.total}
            onClick={() => setPage(p => p + 1)}
            className="text-sm text-muted-foreground disabled:opacity-40 hover:text-foreground"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
