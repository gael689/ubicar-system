import { Globe, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * De dónde vino la reserva: del sitio o del mostrador.
 *
 * **Por qué existe este componente y no se pinta a mano en cada lugar.** El
 * canal se guarda desde la migración 047 y hasta ahora se mostraba en un solo
 * lugar de todo el sistema (la bandeja web), donde además es redundante porque
 * ahí ya se sabe que todo es web. Fuera de esa pantalla, una reserva web
 * confirmada era indistinguible de una de mostrador: sin columna, sin ícono,
 * sin filtro. Ahora se muestra en listado, detalle, calendario y contratos, y
 * un único componente es lo que evita que en cada pantalla termine con un
 * ícono o un texto distinto.
 *
 * **El canal va como ícono, nunca como color de fondo.** El color ya está
 * tomado por el estado de la reserva, que tiene su leyenda; meterle una
 * segunda dimensión encima hace ilegibles las dos.
 */
export function BadgeCanal({
  origen,
  creadoPor,
  size = 'md',
  className,
}: {
  origen?: string | null;
  /** Nombre de quien la cargó. Se ignora si vino de la web. */
  creadoPor?: string | null;
  /** `sm` para tablas densas y bloques del calendario; `md` para fichas. */
  size?: 'sm' | 'md';
  className?: string;
}) {
  const esWeb = origen === 'web';
  const Icono = esWeb ? Globe : Store;

  // "Sitio web" y no el nombre del usuario: una reserva web la carga el usuario
  // "Sistema", que no le dice nada a nadie. El dato verdadero es que entró sola.
  const autor = esWeb ? 'Sitio web' : creadoPor || null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-muted-foreground',
        size === 'sm' ? 'text-[11px]' : 'text-xs',
        className,
      )}
      title={autor ? `Creada por ${autor}` : undefined}
    >
      <Icono className={size === 'sm' ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
      <span>{esWeb ? 'Web' : 'Mostrador'}</span>
      {autor && !esWeb && (
        <span className="hidden sm:inline text-muted-foreground/70">· {autor}</span>
      )}
    </span>
  );
}
