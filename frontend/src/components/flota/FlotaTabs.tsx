import { NavLink, useLocation } from 'react-router-dom';
import { Car, Tags, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Las pestañas de la sección Flota: Vehículos, Categorías y precios, Multas.
 *
 * Pedido del mostrador (27/09): *"en flota, que sea una sola página con
 * pestañas grandes"*. Eran tres entradas sueltas en el menú y, como
 * `/flota/categorias` empieza con `/flota`, el menú marcaba dos a la vez. Ahora
 * el menú tiene un solo "Flota" y el cambio de sección es acá arriba, en
 * pestañas grandes. Cada pestaña sigue siendo su ruta (los links y los avisos
 * que apuntan a `/flota/categorias` o `/multas` siguen andando).
 */
export const FLOTA_TABS: { path: string; label: string; ayuda: string; icon: LucideIcon }[] = [
  { path: '/flota', label: 'Vehículos', ayuda: 'Los autos, su estado y sus papeles', icon: Car },
  { path: '/flota/categorias', label: 'Categorías y precios', ayuda: 'Precios base y franquicias', icon: Tags },
  { path: '/multas', label: 'Multas', ayuda: 'Buscar al responsable y cobrarlas', icon: AlertTriangle },
];

/** La pestaña activa: la de ruta más larga que coincide (así `/flota/3` es Vehículos). */
export function pestanaFlotaActiva(pathname: string): string | null {
  const coinciden = FLOTA_TABS.filter(t => pathname === t.path || pathname.startsWith(t.path + '/'));
  if (coinciden.length === 0) return null;
  return coinciden.sort((a, b) => b.path.length - a.path.length)[0].path;
}

export function FlotaTabs() {
  const { pathname } = useLocation();
  const activa = pestanaFlotaActiva(pathname);
  return (
    <nav className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Secciones de flota">
      {FLOTA_TABS.map(t => {
        const Icon = t.icon;
        const esActiva = activa === t.path;
        return (
          <NavLink
            key={t.path}
            to={t.path}
            end
            aria-current={esActiva ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all',
              esActiva
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent',
            )}
          >
            <Icon className="h-6 w-6 shrink-0" />
            <span className="min-w-0">
              <span className="block text-base font-bold leading-tight">{t.label}</span>
              <span className={cn('block text-xs', esActiva ? 'text-primary/80' : 'text-muted-foreground')}>
                {t.ayuda}
              </span>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
