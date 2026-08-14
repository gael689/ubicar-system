import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailsTab } from '@/components/emails/EmailsTab';
import { useHistorialNotificaciones } from '@/hooks/useNotificaciones';
import { formatDate } from '@/lib/utils';
import type { EstadoNotificacion } from '@/types';
import {
  FAMILIAS, tiposDeFamilia, grupoDe,
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

/**
 * Notificaciones y mails, en la misma pantalla.
 *
 * Son la misma pregunta vista desde los dos lados: "¿de qué avisó el sistema
 * puertas adentro?" y "¿qué le mandó al cliente?". Separarlos en dos módulos
 * distintos obligaría a recordar cuál de los dos abrir cuando alguien llama
 * preguntando si le llegó la confirmación — que es la única razón por la que
 * cualquiera de las dos pantallas se abre.
 */
export function NotificacionesPage() {
  return (
    <Tabs defaultValue="notificaciones" className="max-w-4xl mx-auto space-y-4">
      <TabsList>
        <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
        <TabsTrigger value="emails">Mails enviados</TabsTrigger>
      </TabsList>
      <TabsContent value="notificaciones">
        <HistorialNotificaciones />
      </TabsContent>
      <TabsContent value="emails">
        <EmailsTab />
      </TabsContent>
    </Tabs>
  );
}

function HistorialNotificaciones() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [fecha, setFecha] = useState('');
  const [anio, setAnio] = useState<number | null>(new Date().getFullYear());
  const [mes, setMes] = useState<number | null>(null);
  const [familia, setFamilia] = useState('');
  const [urgencias, setUrgencias] = useState<string[]>([]);

  const { data, isLoading } = useHistorialNotificaciones({
    page,
    soloResueltas: false,
    fecha: fecha || null,
    anio,
    mes,
    // Se filtra por familia y no por `tipo` suelto: nadie busca
    // "poliza_vencimiento", busca "documentos de vehículos". La familia se
    // traduce a la lista de tipos que el backend entiende.
    tipos: familia ? tiposDeFamilia(familia) : undefined,
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
            <label htmlFor="f-familia" className="text-xs font-medium text-muted-foreground">
              Tipo de notificación
            </label>
            <select
              id="f-familia"
              value={familia}
              onChange={e => { setFamilia(e.target.value); setPage(1); }}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background block min-w-[220px]"
            >
              <option value="">Todas</option>
              {FAMILIAS.map(f => <option key={f} value={f}>{f}</option>)}
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

          {(familia || urgencias.length > 0) && (
            <button
              onClick={() => { setFamilia(''); setUrgencias([]); setPage(1); }}
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
                  {grupoDe(n.tipo)} · {formatDate(n.created_at)}
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
