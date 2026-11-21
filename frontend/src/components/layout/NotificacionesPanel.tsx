import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Lightbulb, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGenerarNotificaciones, useLeerTodas, useNotificaciones, useOportunidades,
} from '@/hooks/useNotificaciones';
import { AvisoItem } from '@/components/avisos/AvisoItem';
import { moduloVisual, porUrgencia } from '@/lib/notificaciones';
import { cn, extractError } from '@/lib/utils';

interface Props {
  /**
   * Dónde vive la campana. En el menú lateral (escritorio) el panel se abre
   * hacia el costado; en la barra de arriba (celular) baja y ocupa el ancho.
   */
  variante?: 'sidebar' | 'header';
}

/**
 * La campana: qué hay que atender, **separado por área**.
 *
 * El reporte (21/11/2026): *"hay demasiadas notificaciones desordenadas, las
 * modularizaría"*. Antes era una lista larga con quince títulos mezclados. Ahora
 * arriba hay una pestaña por módulo —Operación, Cobranzas, Flota…— con su
 * contador, y cada aviso trae un botón que dice qué hacer.
 *
 * Las oportunidades 💡 no entran acá: son sugerencias, no pendientes. Abajo
 * hay un acceso a su pestaña cuando hay alguna.
 */
export function NotificacionesPanel({ variante = 'sidebar' }: Props) {
  const [open, setOpen] = useState(false);
  const [modulo, setModulo] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useNotificaciones();
  const { data: oportunidades } = useOportunidades();
  const generar = useGenerarNotificaciones();
  const leerTodas = useLeerTodas();
  const navigate = useNavigate();

  const total = data?.total ?? 0;
  const criticas = data?.criticas ?? 0;
  const urgentes = data?.urgentes ?? 0;
  const porModulo = data?.por_modulo ?? [];
  // Si el módulo elegido se vació (se leyó todo), se vuelve a "Todo".
  const moduloActivo = modulo && porModulo.some(m => m.modulo === modulo) ? modulo : null;

  const visibles = useMemo(() => {
    const items = data?.items ?? [];
    return (moduloActivo ? items.filter(i => i.modulo === moduloActivo) : items).slice().sort(porUrgencia);
  }, [data, moduloActivo]);

  function ir(url: string) {
    navigate(url);
    setOpen(false);
  }

  async function actualizar() {
    try {
      await generar.mutateAsync();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function marcarTodo() {
    try {
      await leerTodas.mutateAsync(moduloActivo);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  const etiquetaActiva = moduloActivo ? moduloVisual(moduloActivo).label : null;
  const cuantasOportunidades = oportunidades?.total ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
          variante === 'sidebar'
            ? 'text-ubicar-primary hover:bg-white hover:text-ubicar-dark'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        title={total > 0 ? `${total} aviso(s), ${urgentes} urgente(s)` : 'Avisos'}
        aria-label="Avisos"
      >
        <Bell className="h-5 w-5" />
        {/* **El número es lo urgente** (críticas y altas), no todo lo activo.
            Contar también lo de fondo —datos por completar, vencimientos a
            15 días— lo dejaba clavado en "99+" y un número que nunca baja
            deja de decir algo. Lo demás sigue en la lista; acá sólo un
            puntito avisa que hay algo sin mirar. */}
        {urgentes > 0 ? (
          <span className={cn(
            'absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
            criticas > 0 ? 'bg-red-600' : 'bg-red-500',
          )}>
            {urgentes > 99 ? '99+' : urgentes}
          </span>
        ) : total > 0 ? (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500" />
        ) : null}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Avisos"
            className={cn(
              'z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl shadow-black/10',
              variante === 'sidebar'
                ? 'absolute bottom-0 left-12 max-h-[80vh] w-[26rem]'
                // En el celular ocupa el ancho de la pantalla, debajo de la barra.
                : 'fixed inset-x-2 top-14 max-h-[calc(100dvh-9rem)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[26rem]',
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Para atender</span>
                {total > 0 && <span className="text-xs text-muted-foreground">({total})</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={actualizar}
                  disabled={isFetching || generar.isPending}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Actualizar (vuelve a revisar todo)"
                  aria-label="Actualizar"
                >
                  <RefreshCw className={cn('h-4 w-4', (isFetching || generar.isPending) && 'animate-spin')} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Una pestaña por módulo, sólo los que tienen algo. */}
            {porModulo.length > 0 && (
              <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2" role="tablist" aria-label="Módulos">
                <Chip activo={moduloActivo === null} onClick={() => setModulo(null)} label="Todo" total={total} />
                {porModulo.map(m => {
                  const v = moduloVisual(m.modulo, m.label);
                  return (
                    <Chip
                      key={m.modulo}
                      activo={moduloActivo === m.modulo}
                      onClick={() => setModulo(m.modulo)}
                      label={m.label}
                      total={m.total}
                      urgente={m.urgentes > 0}
                      icono={<v.icono className={cn('h-3.5 w-3.5', moduloActivo === m.modulo ? '' : v.color)} />}
                    />
                  );
                })}
              </div>
            )}

            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {isLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground">Cargando avisos…</div>
              )}

              {!isLoading && total === 0 && (
                <div className="py-8 text-center">
                  <Bell className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-30" />
                  <p className="text-sm font-medium text-foreground">Nada para atender</p>
                  <p className="mt-1 text-xs text-muted-foreground">Todo en orden 👌</p>
                </div>
              )}

              {visibles.map(item => (
                <AvisoItem key={item.id} item={item} onIr={ir} compacto />
              ))}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
              {total > 0 ? (
                <button
                  onClick={marcarTodo}
                  disabled={leerTodas.isPending}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {etiquetaActiva ? `Marcar ${etiquetaActiva} como leído` : 'Marcar todo como leído'}
                </button>
              ) : <span />}
              <div className="flex items-center gap-1">
                {cuantasOportunidades > 0 && (
                  <button
                    onClick={() => ir('/notificaciones?tab=oportunidades')}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    {cuantasOportunidades} oportunidad{cuantasOportunidades !== 1 ? 'es' : ''}
                  </button>
                )}
                <button
                  onClick={() => ir('/notificaciones')}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
                >
                  Ver todo
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  activo, onClick, label, total, urgente = false, icono,
}: {
  activo: boolean;
  onClick: () => void;
  label: string;
  total: number;
  urgente?: boolean;
  icono?: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        activo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/50',
      )}
    >
      {icono}
      {label}
      <span className={cn('tabular-nums', activo ? 'opacity-90' : 'text-muted-foreground')}>{total}</span>
      {urgente && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-background" title="Tiene urgentes" />
      )}
    </button>
  );
}
