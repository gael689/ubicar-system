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
 * en lunes, navegación por año) y quien lo usa decide **qué pinta cada día**
 * vía `renderDia` — un feriado se pinta distinto de una celda de ocupación,
 * pero el cuadro de 12 meses es el mismo objeto en las dos pantallas.
 */
export function CalendarioAnual({
  anio,
  onAnioChange,
  onSelectMes,
  onSelectDia,
  renderDia,
  contadorMes,
  hoy = new Date(),
}: {
  anio: number;
  onAnioChange: (anio: number) => void;
  /** Click en el nombre del mes — salta a la vista de ese mes. */
  onSelectMes?: (mes: number) => void;
  /** Click en un día — salta a ese día puntual. */
  onSelectDia?: (fechaISO: string) => void;
  renderDia: (fechaISO: string, dia: number, esHoy: boolean) => CeldaDia | null;
  /** Contador chico junto al nombre del mes (ej: "3 días"). */
  contadorMes?: (mes: number) => number | null;
  hoy?: Date;
}) {
  const hoyStr = ymd(hoy);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        <Button variant="outline" size="sm" onClick={() => onAnioChange(anio - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAnioChange(hoy.getFullYear())}>
          Hoy
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAnioChange(anio + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MESES_NOMBRE.map((nombre, mes) => (
          <MesMini
            key={mes}
            anio={anio}
            mes={mes}
            nombre={nombre}
            hoyStr={hoyStr}
            renderDia={renderDia}
            contador={contadorMes ? contadorMes(mes) : null}
            onSelectMes={onSelectMes}
            onSelectDia={onSelectDia}
          />
        ))}
      </div>
    </div>
  );
}

function MesMini({
  anio, mes, nombre, hoyStr, renderDia, contador, onSelectMes, onSelectDia,
}: {
  anio: number;
  mes: number;
  nombre: string;
  hoyStr: string;
  renderDia: (fechaISO: string, dia: number, esHoy: boolean) => CeldaDia | null;
  contador?: number | null;
  onSelectMes?: (mes: number) => void;
  onSelectDia?: (fechaISO: string) => void;
}) {
  const primero = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offset = (primero.getDay() + 6) % 7; // 0 = lunes

  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <button
          type="button"
          onClick={() => onSelectMes?.(mes)}
          disabled={!onSelectMes}
          className={cn(
            'text-sm font-semibold text-foreground',
            onSelectMes && 'hover:text-primary hover:underline',
          )}
        >
          {nombre}
        </button>
        {contador != null && contador > 0 && (
          <span className="text-[10px] text-muted-foreground">{contador} día{contador !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground/60">{d}</div>
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
                'relative aspect-square flex items-center justify-center rounded text-[10px] transition-colors',
                onSelectDia && 'cursor-pointer hover:brightness-95',
                celda.className || 'text-muted-foreground',
                // Anillos sólidos, sin opacidad: sobre un chip de color, un
                // borde translúcido se mezcla con el fondo y deja de marcar
                // el día de hoy, que es justo lo que tiene que saltar.
                esHoy && !celda.className && 'ring-2 ring-primary text-primary font-bold',
                esHoy && celda.className && 'ring-2 ring-slate-900',
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
