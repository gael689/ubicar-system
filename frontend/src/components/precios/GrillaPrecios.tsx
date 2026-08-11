import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { COLOR_FECHA_ESPECIAL, TIPO_FECHA_ESPECIAL_LABEL } from '@/lib/constants';
import { indexarPorDia } from '@/hooks/useFechasEspeciales';
import type { CalendarioPrecios, DiaCalendarioPrecio, FechaEspecial } from '@/types';

const DIA_LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Un rango marcado sobre la grilla, listo para ponerle precio. */
export interface SeleccionPrecio {
  categoriaId: number;
  categoriaNombre: string;
  /** `YYYY-MM-DD`, inclusivo. */
  desde: string;
  /** `YYYY-MM-DD`, **inclusivo**: es el rango de vigencia de una regla, no un check-out. */
  hasta: string;
}

/**
 * Recorta un rango a lo que se está viendo. Las fechas ISO se comparan como
 * strings porque el orden lexicográfico y el cronológico coinciden.
 */
function recorte(fechas: string[], desde: string, hasta: string): { d: number; h: number } | null {
  let d = -1;
  let h = -1;
  for (let i = 0; i < fechas.length; i++) {
    if (fechas[i] >= desde && fechas[i] <= hasta) {
      if (d === -1) d = i;
      h = i;
    }
  }
  return d === -1 ? null : { d, h };
}

/** $150.000 → "150.000" cómodo, "150k" compacto. */
function precioCorto(precio: string, compacto: boolean): string {
  const n = Number(precio);
  if (!Number.isFinite(n)) return '—';
  if (!compacto) return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

interface Props {
  data: CalendarioPrecios;
  /** Se dibujan como barras arriba de los días, con su nombre. */
  fechasEspeciales?: FechaEspecial[];
  seleccion?: SeleccionPrecio | null;
  /** Se dispara al soltar el arrastre (o al hacer clic en un solo día). */
  onSeleccion?: (s: SeleccionPrecio) => void;
  onFechaEspecial?: (fe: FechaEspecial) => void;
  /** Celdas chicas y precios abreviados, para ver muchos días de una. */
  compacto?: boolean;
}

/**
 * Calendario de precios: categorías en filas, días en columnas.
 *
 * **Dejó de ser una tabla de sólo lectura y pasó a ser la herramienta de
 * carga.** Antes esto se miraba y el precio se cargaba en un formulario aparte
 * de doce campos, donde había que volver a escribir a mano el rango que uno
 * acababa de mirar acá. Ahora se arrastra sobre la fila de la categoría —"de
 * acá a acá"— y el panel de abajo pide lo único que falta: cuánto sale el día.
 *
 * Sigue mostrando el precio **ya resuelto** de cada día, no las reglas crudas:
 * quien mira quiere saber "cuánto sale el 24 de diciembre", no deducirlo de
 * tres reglas superpuestas. Los estados de una celda:
 *
 * - **promo** (ámbar sólido): hay una promoción ese día.
 * - **calendario**: precio cargado a mano para esa fecha.
 * - **banda** (atenuado): ninguna regla lo cubre, cae a la tarifa por duración.
 * - **sin precio** (rojo): ni regla ni tarifa. Ese día no se puede cotizar.
 */
export function GrillaPrecios({
  data,
  fechasEspeciales = [],
  seleccion = null,
  onSeleccion,
  onFechaEspecial,
  compacto = false,
}: Props) {
  const fechas = useMemo(() => data.filas[0]?.dias.map(d => d.fecha) ?? [], [data.filas]);
  const hoy = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [arrastre, setArrastre] = useState<{ catId: number; ancla: number; actual: number } | null>(null);

  // El arrastre se confirma al soltar el botón **en cualquier lado**: si se
  // suelta fuera de la grilla y no escuchamos en window, la selección queda
  // pegada al mouse y hay que hacer clic de nuevo para despegarla.
  const estado = useRef({ arrastre, filas: data.filas, fechas, onSeleccion });
  estado.current = { arrastre, filas: data.filas, fechas, onSeleccion };

  useEffect(() => {
    function soltar() {
      const { arrastre: a, filas, fechas: fs, onSeleccion: cb } = estado.current;
      if (!a) return;
      setArrastre(null);
      const fila = filas.find(f => f.categoria_id === a.catId);
      if (!fila || !cb) return;
      cb({
        categoriaId: a.catId,
        categoriaNombre: fila.categoria_nombre,
        desde: fs[Math.min(a.ancla, a.actual)],
        hasta: fs[Math.max(a.ancla, a.actual)],
      });
    }
    window.addEventListener('mouseup', soltar);
    return () => window.removeEventListener('mouseup', soltar);
  }, []);

  const marcado = useMemo(() => {
    if (arrastre) {
      return {
        catId: arrastre.catId,
        d: Math.min(arrastre.ancla, arrastre.actual),
        h: Math.max(arrastre.ancla, arrastre.actual),
      };
    }
    if (!seleccion) return null;
    const r = recorte(fechas, seleccion.desde, seleccion.hasta);
    return r ? { catId: seleccion.categoriaId, ...r } : null;
  }, [arrastre, seleccion, fechas]);

  // Barras de fechas especiales, repartidas en carriles para que dos que se
  // solapan no se pisen. Es lo que contesta "¿qué pasa ese fin de semana?"
  // sin salir de la pantalla.
  const barras = useMemo(() => {
    if (fechas.length === 0) return [];
    const primera = fechas[0];
    const ultima = fechas[fechas.length - 1];
    const carriles: number[] = [];
    return fechasEspeciales
      .filter(f => f.fecha_desde <= ultima && f.fecha_hasta >= primera)
      .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde))
      .map(fe => {
        const r = recorte(fechas, fe.fecha_desde, fe.fecha_hasta)!;
        let carril = carriles.findIndex(fin => fin < r.d);
        if (carril === -1) carril = carriles.push(r.h) - 1;
        else carriles[carril] = r.h;
        return { fe, inicio: r.d, largo: r.h - r.d + 1, carril };
      });
  }, [fechas, fechasEspeciales]);

  const cantidadCarriles = barras.reduce((m, b) => Math.max(m, b.carril + 1), 0);
  const especialesPorDia = useMemo(() => indexarPorDia(fechasEspeciales), [fechasEspeciales]);

  const meses = useMemo(() => {
    const segs: { label: string; inicio: number; largo: number }[] = [];
    fechas.forEach((f, i) => {
      const [anio, mes] = f.split('-');
      const label = `${MESES[Number(mes) - 1]} ${anio}`;
      const ultimo = segs[segs.length - 1];
      if (ultimo && ultimo.label === label) ultimo.largo++;
      else segs.push({ label, inicio: i, largo: 1 });
    });
    return segs;
  }, [fechas]);

  const empezar = useCallback((catId: number, idx: number) => {
    setArrastre({ catId, ancla: idx, actual: idx });
  }, []);

  const estirar = useCallback((catId: number, idx: number) => {
    setArrastre(a => (a && a.catId === catId ? { ...a, actual: idx } : a));
  }, []);

  if (fechas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay categorías activas para mostrar.
      </p>
    );
  }

  const template = `10rem repeat(${fechas.length}, ${compacto ? '3.25rem' : '4.25rem'})`;
  const altoCelda = compacto ? 'h-7' : 'h-10';
  const filaCarril = cantidadCarriles > 0 ? cantidadCarriles : 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-max select-none">
        {/* Encabezado: meses, fechas especiales y días. */}
        <div className="grid border-b border-border" style={{ gridTemplateColumns: template }}>
          <div
            className="sticky left-0 z-20 border-r border-border bg-card"
            style={{ gridRow: 1, gridColumn: 1 }}
          />
          {meses.map(s => (
            <div
              key={s.label}
              style={{ gridRow: 1, gridColumn: `${2 + s.inicio} / span ${s.largo}` }}
              className="border-l border-border px-2 py-1 text-xs font-semibold text-foreground"
            >
              {s.label}
            </div>
          ))}

          {Array.from({ length: cantidadCarriles }).map((_, i) => (
            <div
              key={`carril-${i}`}
              style={{ gridRow: 2 + i, gridColumn: 1 }}
              className="sticky left-0 z-20 border-r border-border bg-card px-2 text-[10px] leading-4 text-muted-foreground"
            >
              {i === 0 ? 'Fechas especiales' : ''}
            </div>
          ))}
          {barras.map(b => (
            <button
              key={b.fe.id}
              type="button"
              onClick={() => onFechaEspecial?.(b.fe)}
              style={{ gridRow: 2 + b.carril, gridColumn: `${2 + b.inicio} / span ${b.largo}` }}
              title={`${b.fe.nombre} — ${TIPO_FECHA_ESPECIAL_LABEL[b.fe.tipo]}`}
              className={cn(
                'mx-px mb-0.5 truncate rounded px-1.5 text-left text-[10px] font-semibold leading-4',
                'hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-foreground',
                COLOR_FECHA_ESPECIAL[b.fe.color].chip
              )}
            >
              {b.fe.nombre}
            </button>
          ))}

          <div
            style={{ gridRow: 2 + filaCarril, gridColumn: 1 }}
            className="sticky left-0 z-20 border-r border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground"
          >
            Categoría
          </div>
          {fechas.map((f, i) => {
            const d = new Date(`${f}T12:00:00`);
            const finde = d.getDay() === 0 || d.getDay() === 6;
            const especiales = especialesPorDia.get(f) ?? [];
            return (
              <div
                key={f}
                style={{ gridRow: 2 + filaCarril, gridColumn: 2 + i }}
                className={cn(
                  'px-1 py-1 text-center',
                  finde && 'bg-muted/50',
                  f === hoy && 'bg-primary/10'
                )}
                title={especiales.map(e => e.nombre).join(' · ') || undefined}
              >
                <div className="text-[10px] leading-3 text-muted-foreground">{DIA_LETRA[d.getDay()]}</div>
                <div className={cn('text-sm leading-4 tabular-nums', finde ? 'font-bold text-foreground' : 'text-foreground')}>
                  {d.getDate()}
                </div>
                <div className="flex justify-center gap-0.5">
                  {especiales.slice(0, 3).map(e => (
                    <span key={e.id} className={cn('h-1 w-1 rounded-full', COLOR_FECHA_ESPECIAL[e.color].punto)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cuerpo: una fila por categoría. Acá se arrastra. */}
        <div className="grid" style={{ gridTemplateColumns: template }}>
          {data.filas.map(fila => (
            <Fragment key={fila.categoria_id}>
              <div
                className={cn(
                  'sticky left-0 z-20 flex items-center border-r border-t border-border bg-card px-2 text-xs font-medium text-foreground',
                  altoCelda
                )}
              >
                <span className="truncate">{fila.categoria_nombre}</span>
              </div>
              {fila.dias.map((dia, i) => (
                <Celda
                  key={dia.fecha}
                  dia={dia}
                  compacto={compacto}
                  alto={altoCelda}
                  esHoy={dia.fecha === hoy}
                  especiales={especialesPorDia.get(dia.fecha) ?? []}
                  marcada={!!marcado && marcado.catId === fila.categoria_id && i >= marcado.d && i <= marcado.h}
                  inicioMarca={!!marcado && marcado.catId === fila.categoria_id && i === marcado.d}
                  finMarca={!!marcado && marcado.catId === fila.categoria_id && i === marcado.h}
                  onMouseDown={() => empezar(fila.categoria_id, i)}
                  onMouseEnter={() => estirar(fila.categoria_id, i)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function Celda({
  dia, compacto, alto, esHoy, especiales, marcada, inicioMarca, finMarca, onMouseDown, onMouseEnter,
}: {
  dia: DiaCalendarioPrecio;
  compacto: boolean;
  alto: string;
  esHoy: boolean;
  especiales: FechaEspecial[];
  marcada: boolean;
  inicioMarca: boolean;
  finMarca: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
}) {
  const titulo = [
    dia.precio ? `${dia.regla_nombre ?? 'Sin nombre'}` : 'Sin precio configurado para este día',
    dia.etiqueta_promo,
    ...especiales.map(e => `${e.nombre} (${TIPO_FECHA_ESPECIAL_LABEL[e.tipo]})`),
  ].filter(Boolean).join(' · ');

  return (
    <div
      role="button"
      tabIndex={0}
      title={titulo}
      onMouseDown={e => { e.preventDefault(); onMouseDown(); }}
      onMouseEnter={onMouseEnter}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMouseDown(); } }}
      className={cn(
        'relative flex cursor-pointer items-center justify-center border-t border-r border-border/60 text-[11px] tabular-nums',
        alto,
        !marcada && dia.origen === 'sin_precio' && 'bg-danger font-semibold text-white',
        !marcada && dia.origen === 'banda' && 'bg-muted/40 text-muted-foreground',
        !marcada && dia.origen === 'calendario' && !dia.es_promocional && 'bg-primary/15 font-semibold text-primary',
        !marcada && dia.origen === 'calendario' && dia.es_promocional && 'bg-amber-500 font-bold text-white',
        !marcada && 'hover:bg-primary/25',
        marcada && 'z-10 border-y-2 border-primary bg-primary/25 font-bold text-primary',
        marcada && inicioMarca && 'rounded-l border-l-2',
        marcada && finMarca && 'rounded-r border-r-2',
        esHoy && !marcada && 'ring-1 ring-inset ring-primary/40'
      )}
    >
      {/* Franja de la fecha especial: se ve incluso cuando la celda está
          seleccionada o promocionada, que es cuando más importa. */}
      {especiales.length > 0 && (
        <span
          className={cn('absolute inset-x-0 top-0 h-[3px]', COLOR_FECHA_ESPECIAL[especiales[0].color].punto)}
        />
      )}
      {dia.precio ? precioCorto(dia.precio, compacto) : '—'}
    </div>
  );
}
