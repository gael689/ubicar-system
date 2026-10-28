import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Un mes puntual: `mes` va de 0 (enero) a 11. */
export interface MesDelAnio {
  anio: number;
  mes: number;
}

/**
 * **Doce meses seguidos desde el mes en curso, cruzando el año** (28/10).
 *
 * Antes era un año calendario rotado: en octubre se veía octubre → diciembre
 * y después volvía a enero → septiembre **del mismo año**, o sea meses que ya
 * pasaron. Pedido del mostrador: *"después de diciembre, un enero 2027, y que
 * continúe el año"*. Lo que se mira acá es lo que viene, y lo que viene cruza
 * diciembre.
 */
export function inicioDeVentana(hoy: Date): Date {
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
}

export function mesesDeLaVentana(inicio: Date): MesDelAnio[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });
}

/** Del 1° del primer mes al último día del duodécimo, para pedir los datos. */
export function rangoDeLaVentana(inicio: Date): { desde: string; hasta: string } {
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 12, 0);
  return { desde: ymd(inicio), hasta: ymd(fin) };
}

/** "Octubre 2026 – Septiembre 2027". */
export function nombreDeLaVentana(inicio: Date): string {
  const meses = mesesDeLaVentana(inicio);
  const [a, b] = [meses[0], meses[11]];
  return `${MESES_NOMBRE[a.mes]} ${a.anio} – ${MESES_NOMBRE[b.mes]} ${b.anio}`;
}

/**
 * Cuánto lugar ocupa el cuadro.
 *
 * - `compacto` (default): el de Fechas especiales, que comparte la pantalla
 *   con un panel. Queda exactamente como estaba.
 * - `grande`: la vista anual de Ocupación, que es el calendario principal y
 *   tiene todo el ancho. Menos meses por fila en pantallas medianas, números
 *   más grandes y más oscuros, y el día de hoy con un anillo más grueso —
 *   *"a veces está todo tan clarito que no se ve bien"*.
 */
export type TamanoCalendario = 'compacto' | 'grande';

interface EstilosCalendario {
  grilla: string;
  mes: string;
  titulo: string;
  semana: string;
  celdas: string;
  dia: string;
  vacio: string;
  hoySolo: string;
  hoyConColor: string;
}

const ESTILOS: Record<TamanoCalendario, EstilosCalendario> = {
  compacto: {
    grilla: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    mes: 'p-3',
    titulo: 'text-sm',
    semana: 'text-[9px] font-semibold text-muted-foreground/60',
    celdas: 'gap-0.5',
    dia: 'aspect-square rounded text-[10px]',
    vacio: 'text-muted-foreground',
    hoySolo: 'ring-2 ring-primary text-primary font-bold',
    hoyConColor: 'ring-2 ring-slate-900',
  },
  grande: {
    grilla: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
    mes: 'p-3 border-slate-300',
    titulo: 'text-base',
    semana: 'text-[11px] font-bold text-slate-600 pb-0.5',
    celdas: 'gap-1',
    dia: 'aspect-[5/4] rounded-md text-sm',
    vacio: 'text-slate-800 bg-slate-50',
    hoySolo: 'ring-[3px] ring-primary bg-primary text-white font-extrabold',
    hoyConColor: 'ring-[3px] ring-offset-1 ring-slate-900 font-extrabold',
  },
};

export interface CeldaDia {
  /** Clases del chip del día — color de fondo, texto, anillo, etc. */
  className?: string;
  /** Tooltip al pasar el mouse. */
  title?: string;
  /** Lo que se dibuja adentro del chip; por default, el número de día. */
  contenido?: React.ReactNode;
}

/**
 * Los doce meses del año en un cuadro — plan de conexión (13/08), 2.8.
 *
 * Es la generalización de `MesMini`, que vivía sólo en
 * `FechasEspecialesPage.tsx` y le gustó al dueño ahí. **No se duplica**: acá
 * queda el armado de la grilla (offset del primer día, 7 columnas arrancando
 * en lunes, navegación de a doce meses) y quien lo usa decide **qué pinta cada día**
 * vía `renderDia` — un feriado se pinta distinto de una celda de ocupación,
 * pero el cuadro de 12 meses es el mismo objeto en las dos pantallas.
 */
export function CalendarioAnual({
  inicio,
  onInicioChange,
  onSelectMes,
  onSelectDia,
  renderDia,
  contadorMes,
  hoy = new Date(),
  tamano = 'compacto',
}: {
  /** El 1° del primer mes de los doce que se muestran. */
  inicio: Date;
  onInicioChange: (inicio: Date) => void;
  /** Click en el nombre del mes — salta a la vista de ese mes. */
  onSelectMes?: (anio: number, mes: number) => void;
  /** Click en un día — salta a ese día puntual. */
  onSelectDia?: (fechaISO: string) => void;
  renderDia: (fechaISO: string, dia: number, esHoy: boolean) => CeldaDia | null;
  /** Contador chico junto al nombre del mes (ej: "3 días"). */
  contadorMes?: (anio: number, mes: number) => number | null;
  hoy?: Date;
  tamano?: TamanoCalendario;
}) {
  const hoyStr = ymd(hoy);
  const estilos = ESTILOS[tamano];
  // Las flechas mueven la ventana entera: doce meses para atrás o adelante.
  const mover = (meses: number) =>
    onInicioChange(new Date(inicio.getFullYear(), inicio.getMonth() + meses, 1));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        <Button variant="outline" size="sm" onClick={() => mover(-12)} title="12 meses antes">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onInicioChange(inicioDeVentana(hoy))}>
          Hoy
        </Button>
        <Button variant="outline" size="sm" onClick={() => mover(12)} title="12 meses después">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className={estilos.grilla}>
        {mesesDeLaVentana(inicio).map(({ anio, mes }) => (
          <MesMini
            key={`${anio}-${mes}`}
            anio={anio}
            mes={mes}
            nombre={MESES_NOMBRE[mes]}
            hoyStr={hoyStr}
            renderDia={renderDia}
            contador={contadorMes ? contadorMes(anio, mes) : null}
            onSelectMes={onSelectMes}
            onSelectDia={onSelectDia}
            estilos={estilos}
          />
        ))}
      </div>
    </div>
  );
}

function MesMini({
  anio, mes, nombre, hoyStr, renderDia, contador, onSelectMes, onSelectDia, estilos,
}: {
  anio: number;
  mes: number;
  nombre: string;
  hoyStr: string;
  renderDia: (fechaISO: string, dia: number, esHoy: boolean) => CeldaDia | null;
  contador?: number | null;
  onSelectMes?: (anio: number, mes: number) => void;
  onSelectDia?: (fechaISO: string) => void;
  estilos: EstilosCalendario;
}) {
  const primero = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offset = (primero.getDay() + 6) % 7; // 0 = lunes

  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];

  return (
    <div className={cn('rounded-xl border border-border', estilos.mes)}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectMes?.(anio, mes)}
          disabled={!onSelectMes}
          className={cn(
            estilos.titulo, 'font-semibold text-foreground',
            onSelectMes && 'hover:text-primary hover:underline',
          )}
        >
          {nombre}
          {/* El año en cada mes: la ventana cruza diciembre, y un "Enero" sin
              año no dice de cuál. */}
          <span className="ml-1 font-normal text-muted-foreground">{anio}</span>
        </button>
        {contador != null && contador > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{contador} día{contador !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className={cn('grid grid-cols-7', estilos.celdas)}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className={cn('text-center', estilos.semana)}>{d}</div>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) return <div key={i} />;
          const fechaISO = ymd(new Date(anio, mes, dia));
          const esHoy = fechaISO === hoyStr;
          const celda = renderDia(fechaISO, dia, esHoy) ?? {};
          return (
            <button
              key={i}
              type="button"
              title={celda.title}
              onClick={() => onSelectDia?.(fechaISO)}
              disabled={!onSelectDia}
              className={cn(
                'relative flex items-center justify-center transition-colors',
                estilos.dia,
                onSelectDia && 'cursor-pointer hover:brightness-95',
                celda.className || estilos.vacio,
                // Anillos sólidos, sin opacidad: sobre un chip de color, un
                // borde translúcido se mezcla con el fondo y deja de marcar
                // el día de hoy, que es justo lo que tiene que saltar.
                esHoy && !celda.className && estilos.hoySolo,
                esHoy && celda.className && estilos.hoyConColor,
              )}
            >
              {celda.contenido ?? dia}
            </button>
          );
        })}
      </div>
    </div>
  );
}
