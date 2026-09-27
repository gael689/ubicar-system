import { cn } from '@/lib/utils';

// Botones grandes de "elegí uno" para la entrega y la devolución del auto.
//
// **Por qué el color y no sólo el borde:** con el estilo anterior (fondo
// primario al 10 %) el botón elegido casi no se distinguía de los otros, y en
// el mostrador se confirmaba "limpio" cuando el operador había tocado "sucio"
// sin darse cuenta de que el toque no había entrado. Los botones de
// combustible ya lo hacían bien: cada opción tiene su color y la elegida crece.

export interface OpcionDeEstado {
  value: string;
  label: string;
  icon?: string;
  /** Clases de la opción elegida: fondo, borde y texto de su color. */
  color: string;
}

export const LIMPIEZA_OPTIONS: OpcionDeEstado[] = [
  { value: 'limpio',                   label: 'Limpio',          icon: '✅', color: 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-emerald-500/40' },
  { value: 'sucio',                    label: 'Sucio',           icon: '🟡', color: 'bg-amber-50 border-amber-500 text-amber-800 ring-amber-500/40' },
  { value: 'requiere_lavado_profundo', label: 'Lavado profundo', icon: '🔴', color: 'bg-red-50 border-red-500 text-red-800 ring-red-500/40' },
];

interface Props {
  opciones: OpcionDeEstado[];
  valor: string;
  onChange: (valor: string) => void;
  className?: string;
}

export function BotonesDeEstado({ opciones, valor, onChange, className }: Props) {
  return (
    <div className={cn('flex gap-2', className)} role="radiogroup">
      {opciones.map(o => {
        const elegido = valor === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={elegido}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 py-3 px-2 rounded-xl border-2 text-sm transition-all flex items-center justify-center gap-1.5',
              elegido
                ? cn(o.color, 'scale-105 shadow-md font-bold ring-2')
                : 'bg-muted border-border text-muted-foreground font-medium hover:border-primary/30',
            )}
          >
            {o.icon && <span>{o.icon}</span>} {o.label}
          </button>
        );
      })}
    </div>
  );
}
