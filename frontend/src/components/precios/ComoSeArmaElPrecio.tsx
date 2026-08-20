import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * El mismo texto en las tres pantallas donde se cargan precios.
 *
 * **Por qué existe.** El sistema tiene dos lugares que fijan precios —la
 * tarifa por duración, en Flota; y las reglas del calendario, en Precios— y
 * ninguna de las dos pantallas decía qué relación tenían entre sí. Quien
 * cargaba una tarifa no sabía si el calendario la iba a pisar, y quien miraba
 * la grilla del calendario no sabía de dónde salía el número cuando no había
 * ninguna regla. Se ponía en duda el precio, que es lo último que uno quiere
 * dudando.
 *
 * Va colapsado: quien ya lo entendió no lo lee dos veces.
 */
export function ComoSeArmaElPrecio({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={cn('rounded-xl border border-border bg-muted/40', className)}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 text-xs font-semibold text-foreground">
          ¿Cómo se combinan la tarifa del vehículo y el calendario de precios?
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            abierto && 'rotate-180'
          )}
        />
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            Son <strong>dos capas</strong>, y no compiten: una es el precio de
            siempre y la otra es la excepción con fecha.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                1 · La tarifa
              </p>
              <p className="mt-1 font-semibold text-foreground">El precio de siempre</p>
              <p className="mt-1">
                Diaria, semanal y mensual. <strong>Sin fechas</strong>: vale
                todo el año hasta que la cambien. Se carga en{' '}
                <Link to="/flota/categorias" className="text-primary underline underline-offset-2">
                  Flota → Categorías
                </Link>{' '}
                o en la ficha de un auto puntual.
              </p>
              <p className="mt-1.5 rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                Vale para <strong>los dos canales</strong>. La tarifa no
                distingue web de mostrador.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                2 · La regla del calendario
              </p>
              <p className="mt-1 font-semibold text-foreground">La excepción con fecha</p>
              <p className="mt-1">
                Un precio <strong>por día</strong> para un período concreto:
                temporada alta, un feriado, una promo. Se carga en las pantallas
                de Precios, <strong>una por canal</strong>.
              </p>
              <p className="mt-1.5 rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                Acá sí se puede tener un precio en la web y otro en el mostrador.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="font-semibold text-foreground">El sistema resuelve día por día:</p>
            <ol className="mt-1.5 space-y-1">
              <li>
                <strong className="text-foreground">1.</strong> ¿Hay una regla del
                calendario que cubra ese día, en ese canal? → se cobra la de{' '}
                <strong className="text-foreground">mayor prioridad</strong>.
              </li>
              <li>
                <strong className="text-foreground">2.</strong> ¿Ninguna? → se cobra
                la <strong className="text-foreground">tarifa</strong>.
              </li>
            </ol>
            <p className="mt-2">
              Después suma los días, resta el descuento por duración y suma los
              seguros y extras. La edad no cambia el precio: el recargo por
              conductor joven se retiró.
            </p>
          </div>

          <p>
            <strong className="text-foreground">En criollo:</strong> la tarifa es
            el piso y nunca sobra — es lo que se cobra los 300 días del año en que
            no pasa nada especial. Las reglas son para los días que sí. Por eso,
            si la grilla muestra el mismo número todos los días, es que{' '}
            <strong className="text-foreground">no hay ninguna regla cargada</strong>{' '}
            y todo está cayendo a la tarifa.
          </p>
        </div>
      )}
    </div>
  );
}
