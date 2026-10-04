import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Car, Calendar, ClipboardList, FileText,
  Users, Calculator, Wallet, BookOpen, CreditCard, BarChart2,
  X, AlertTriangle, Settings, Bell, CalendarDays, CalendarRange, Package, Globe, CalendarClock,
  ShieldCheck, Store, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from '@/lib/constants';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificacionesPanel } from '@/components/layout/NotificacionesPanel';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Car, Calendar, ClipboardList, FileText,
  Users, Calculator, Wallet, BookOpen, CreditCard, BarChart2, AlertTriangle, Settings, Bell,
  CalendarDays, CalendarRange, Package, Globe, CalendarClock, ShieldCheck, Store, Inbox,
};

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

const MOBILE_NAV = NAV_ITEMS.slice(0, 5);

export function MobileNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-border bg-card md:hidden">
      {MOBILE_NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.path || pathname.startsWith(item.path + '/');
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', active && 'text-primary')} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

interface SidebarProps {
  onMobileClose?: () => void;
  mobileOpen?: boolean;
}

function coincide(ruta: string, pathname: string): boolean {
  return pathname === ruta || pathname.startsWith(ruta + '/');
}

/** Largo de la ruta del item que coincide con la actual (0 si ninguna). */
function largoCoincidencia(item: NavItem, pathname: string): number {
  const rutas = [item.path, ...(item.matches ?? [])].filter((r) => coincide(r, pathname));
  return rutas.length ? Math.max(...rutas.map((r) => r.length)) : 0;
}

/**
 * El ítem activo de **todo el menú**: el más específico, no todos los que
 * coinciden. Con `startsWith` a secas, en `/precios/simulador` se marcarían
 * "Precios" y el Simulador a la vez.
 */
function itemActivo(pathname: string): string | null {
  let mejor: string | null = null;
  let largo = 0;
  for (const seccion of NAV_SECTIONS) {
    for (const i of seccion.items) {
      const l = largoCoincidencia(i, pathname);
      if (l > largo) { largo = l; mejor = i.path; }
    }
  }
  return mejor;
}

export function Sidebar({ onMobileClose, mobileOpen }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const { pathname } = useLocation();
  const effectiveCollapsed = sidebarCollapsed;
  const activo = itemActivo(pathname);

  const sidebarContent = (
    <aside
      className={cn(
        // Fondo claro de Ubicar (`surface`), no blanco ni azul oscuro.
        'flex h-full flex-col border-r border-ubicar-border bg-surface transition-all duration-200',
        effectiveCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo — clickeable: minimiza/expande el menú, sin efectos de hover */}
      <button
        type="button"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        className={cn(
          'flex h-16 shrink-0 items-center justify-center border-b border-ubicar-border bg-white transition-colors cursor-pointer',
          effectiveCollapsed ? 'px-2' : 'px-4',
        )}
      >
        <img
          src="/logo.png"
          alt="Ubicar Rent"
          className={cn(
            'object-contain transition-all pointer-events-none',
            effectiveCollapsed ? 'h-9 w-9 [object-position:left]' : 'h-10 w-auto',
          )}
          // En colapsado mostramos solo la "u" inicial del logo recortando al cuadrado
          style={effectiveCollapsed ? { objectFit: 'cover', objectPosition: '0 50%' } : {}}
        />
      </button>

      {/* Cuatro secciones con nombre; todos los ítems a la vista. */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Menú principal">
          {NAV_SECTIONS.map((seccion, n) => (
            <div key={seccion.titulo} className={cn(n > 0 && 'mt-5')}>
              {effectiveCollapsed ? (
                n > 0 && <div className="mx-2 mb-2 h-px bg-ubicar-border" />
              ) : (
                <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ubicar-dark/70">
                  {seccion.titulo}
                </p>
              )}
              <div className="space-y-0.5">
                {seccion.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const esActivo = activo === item.path;
                  const link = (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onMobileClose}
                      aria-current={esActivo ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        esActivo
                          ? 'bg-ubicar-primary font-semibold text-white shadow-sm'
                          : 'font-medium text-ubicar-text hover:bg-white hover:text-ubicar-dark',
                        effectiveCollapsed && 'justify-center px-2',
                      )}
                    >
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', !esActivo && 'text-ubicar-primary')} />
                      {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                  if (!effectiveCollapsed) return link;
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </TooltipProvider>

      {/* Panel de notificaciones (desktop only) */}
      <div className="shrink-0 border-t border-ubicar-border p-2 hidden md:flex flex-col gap-1">
        <div className={cn('flex items-center', effectiveCollapsed ? 'justify-center' : 'justify-between px-1')}>
          <NotificacionesPanel />
          {!effectiveCollapsed && (
            <span className="text-xs text-muted-foreground">Alertas</span>
          )}
        </div>
      </div>
    </aside>
  );

  // Mobile drawer overlay
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex h-full">{sidebarContent}</div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <div className="relative flex h-full w-64 flex-col">
            <button
              onClick={onMobileClose}
              className="absolute right-2 top-3 z-10 p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
