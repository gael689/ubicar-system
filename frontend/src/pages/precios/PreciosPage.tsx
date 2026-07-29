import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarRange, Calculator, Globe, Store } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GrillaPrecios } from '@/components/precios/GrillaPrecios';
import { ReglasPrecioPanel } from '@/components/precios/ReglasPrecioPanel';
import { DescuentosDuracionPanel } from '@/components/precios/DescuentosDuracionPanel';
import { useCalendarioPrecios, useCalcularPrecio } from '@/hooks/usePrecios';
import { useCategorias } from '@/hooks/useCategorias';
import { useAdicionales } from '@/hooks/useAdicionales';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Adicional, Canal } from '@/types';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Todo lo que cambia entre las dos pantallas, en un solo lugar. */
const POR_CANAL = {
  mostrador: {
    titulo: 'Precios de mostrador',
    descripcion:
      'Lo que se cobra cuando el cliente reserva por teléfono, por WhatsApp o en el local. ' +
      'La regla de mayor prioridad que cubre el día es la que se cobra.',
    otro: { label: 'Ver precios de la web', path: '/precios/web' },
  },
  web: {
    titulo: 'Precios de la web',
    descripcion:
      'Lo que ve y paga un cliente que reserva solo desde ubicar-rent.com.ar. ' +
      'La regla de mayor prioridad que cubre el día es la que se cobra.',
    otro: { label: 'Ver precios de mostrador', path: '/precios/mostrador' },
  },
} as const;

/**
 * Calendario de precios (Fase 5, ítem 57 — plan §7.2).
 *
 * Es la pantalla donde Franco y Martín cargan los precios ellos mismos:
 * "planificar precios base, y precios por fecha… que tengan la posibilidad
 * de poner precios promocionales para incentivar más al marketing".
 *
 * **Hay una pantalla por canal, no una con un interruptor.** Antes el canal
 * era un botoncito arriba de la grilla que sólo cambiaba lo que se veía: la
 * lista de reglas de abajo mostraba las de los dos canales mezcladas y el
 * alta traía "web y mostrador" por defecto. Con eso, cargar un precio pensando
 * en la web le cambiaba el precio al mostrador sin que nadie lo pidiera. Ahora
 * el canal lo define en qué pantalla estás parado, y no hay forma de
 * confundirse.
 */
export function PreciosPage({ canal }: { canal: 'web' | 'mostrador' }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());

  const cfg = POR_CANAL[canal];
  const desde = ymd(new Date(anio, mes, 1));
  const hasta = ymd(new Date(anio, mes + 1, 0));
  const { data: calendario, isLoading } = useCalendarioPrecios({ desde, hasta, canal });

  function moverMes(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={cfg.titulo}
        description={cfg.descripcion}
        actions={
          <Link to={cfg.otro.path}>
            <Button variant="outline" size="sm">
              {canal === 'web' ? <Store className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              {cfg.otro.label}
            </Button>
          </Link>
        }
      />

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {MESES[mes]} {anio}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => moverMes(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => { setAnio(hoy.getFullYear()); setMes(hoy.getMonth()); }}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => moverMes(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : calendario ? (
          <GrillaPrecios data={calendario} />
        ) : null}

        <div className="flex flex-wrap gap-4 pt-3 border-t border-border">
          <Leyenda clase="bg-primary/15 text-primary" texto="Precio cargado para esa fecha" />
          <Leyenda clase="bg-amber-500 text-white" texto="Promoción" />
          <Leyenda clase="bg-muted text-muted-foreground" texto="Sin regla — usa la tarifa por duración" />
          <Leyenda clase="bg-danger text-white" texto="Sin precio configurado" />
        </div>
      </Card>

      <ProbadorDePrecio canal={canal} />
      <ReglasPrecioPanel canal={canal} />
      <DescuentosDuracionPanel />
    </div>
  );
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-3.5 w-6 rounded', clase)} />
      {texto}
    </span>
  );
}

/**
 * Probador de precio: cotiza un rango real contra el mismo endpoint que usan
 * las reservas y la web.
 *
 * No es un extra: sin esto, cargar tres reglas superpuestas y entender qué
 * va a pagar el cliente es adivinar. Acá se ve el desglose día por día y de
 * qué regla salió cada precio.
 */
function ProbadorDePrecio({ canal }: { canal: Canal }) {
  const { data: categorias = [] } = useCategorias();
  const { data: adicionalesDisponibles = [] } = useAdicionales();
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [elegidos, setElegidos] = useState<number[]>([]);

  function toggleAdicional(a: Adicional) {
    setElegidos(prev => {
      if (prev.includes(a.id)) return prev.filter(x => x !== a.id);
      // Las coberturas son excluyentes: elegir una reemplaza a la anterior.
      // El backend lo valida igual, pero acá evita el error en vez de mostrarlo.
      if (a.grupo === 'cobertura') {
        const otrasCoberturas = adicionalesDisponibles
          .filter(x => x.grupo === 'cobertura')
          .map(x => x.id);
        return [...prev.filter(x => !otrasCoberturas.includes(x)), a.id];
      }
      return [...prev, a.id];
    });
  }

  const { data: cotizacion, isLoading, error } = useCalcularPrecio(
    categoriaId && fechaInicio && fechaFin
      ? {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          categoria_id: Number(categoriaId),
          canal,
          adicionales: elegidos.map(id => ({ adicional_id: id, cantidad: 1 })),
        }
      : null
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Probar un precio</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Cotiza contra el mismo motor que usan las reservas y la web, en el canal{' '}
        <strong>{canal}</strong>. Sirve para verificar cómo quedaron las reglas antes
        de que las use un cliente.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className="input-base">
            <option value="">Elegir…</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Retira</label>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="input-base" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Devuelve</label>
          <input type="date" value={fechaFin} min={fechaInicio || undefined}
            onChange={e => setFechaFin(e.target.value)} className="input-base" />
        </div>
      </div>

      {adicionalesDisponibles.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Adicionales</label>
          <div className="flex flex-wrap gap-1.5">
            {adicionalesDisponibles.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAdicional(a)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  elegidos.includes(a.id)
                    ? 'border-primary bg-primary text-white'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                )}
              >
                {a.nombre}
                {Number(a.precio) > 0 && (
                  <span className="ml-1 opacity-75">
                    {formatCurrency(a.precio)}{a.unidad_cobro === 'por_dia' ? '/día' : ''}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-24 w-full" />}

      {error && (
        <div className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">
          No se pudo cotizar: falta cargar un precio para alguno de esos días.
        </div>
      )}

      {cotizacion && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-y-auto">
            {cotizacion.dias.map(d => (
              <div key={d.fecha} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{formatDate(d.fecha)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {d.regla_nombre}
                  {d.etiqueta_promo && (
                    <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {d.etiqueta_promo}
                    </span>
                  )}
                </span>
                {d.precio_referencia && (
                  <span className="shrink-0 text-muted-foreground line-through tabular-nums">
                    {formatCurrency(d.precio_referencia)}
                  </span>
                )}
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatCurrency(d.precio)}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-muted/50 p-3 space-y-1 text-sm">
            <Linea label={`Subtotal (${cotizacion.duracion_dias} días)`} valor={formatCurrency(cotizacion.subtotal)} />
            {Number(cotizacion.descuento_monto) > 0 && (
              <Linea
                label={`Descuento ${cotizacion.descuento_nombre} (−${Number(cotizacion.descuento_porcentaje)}%)`}
                valor={`−${formatCurrency(cotizacion.descuento_monto)}`}
                clase="text-emerald-600"
              />
            )}
            {cotizacion.adicionales.map(a => (
              <Linea
                key={a.id}
                label={`${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}${a.unidad_cobro === 'por_dia' ? ` (${cotizacion.duracion_dias} días)` : ''}`}
                valor={formatCurrency(a.subtotal)}
              />
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="font-semibold text-foreground">Total</span>
              <div className="text-right">
                {cotizacion.tiene_promocion &&
                  cotizacion.total_referencia &&
                  Number(cotizacion.total_referencia) > Number(cotizacion.total) && (
                    <span className="mr-2 text-xs text-muted-foreground line-through tabular-nums">
                      {formatCurrency(cotizacion.total_referencia)}
                    </span>
                  )}
                <span className="text-base font-bold tabular-nums text-foreground">
                  {formatCurrency(cotizacion.total)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {formatCurrency(cotizacion.precio_dia_promedio)} por día promedio
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Linea({ label, valor, clase }: { label: string; valor: string; clase?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', clase ?? 'text-foreground')}>{valor}</span>
    </div>
  );
}
