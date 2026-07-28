import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Car, Calendar, ClipboardList, FileText,
  Users, Calculator, Wallet, BookOpen, CreditCard, BarChart2,
  ChevronDown, X, AlertTriangle, Settings, Bell, CalendarDays, CalendarRange, Package, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { NAV_ITEMS, NAV_GROUPS, NAV_GROUP_COLOR } from '@/lib/constants';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NotificacionesPanel } from '@/components/layout/NotificacionesPanel';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Car, Calendar, ClipboardList, FileText,
  Users, Calculator, Wallet, BookOpen, CreditCard, BarChart2, AlertTriangle, Settings, Bell,
  CalendarDays, CalendarRange, Package, Globe,
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

function isGroupActive(group: (typeof NAV_GROUPS)[number], pathname: string): boolean {
  return group.items.some((i) => pathname === i.path || pathname.startsWith(i.path + '/'));
}

export function Sidebar({ onMobileClose, mobileOpen }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const { pathname } = useLocation();
  const effectiveCollapsed = sidebarCollapsed;

  // Los grupos con más de un item arrancan expandidos si contienen la ruta activa.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((g) => g.items.length > 1 && isGroupActive(g, pathname)).map((g) => g.label))
  );
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => g.items.length > 1 && isGroupActive(g, pathname));
    if (activeGroup) {
      setExpanded((prev) => (prev.has(activeGroup.label) ? prev : new Set(prev).add(activeGroup.label)));
    }
  }, [pathname]);

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const sidebarContent = (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-all duration-200',
        effectiveCollapsed ? 'w-16' : 'w-52'
      )}
    >
      {/* Logo — clickeable: minimiza/expande el menú, sin efectos de hover */}
      <button
        type="button"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        className={cn(
          'flex h-16 shrink-0 items-center justify-center border-b border-border bg-white hover:bg-accent/40 transition-colors cursor-pointer',
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

      {/* Nav groups */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = ICONS[group.icon];
            const groupActive = isGroupActive(group, pathname);
            const color = NAV_GROUP_COLOR[group.label];

            // Grupo de un solo item: link directo, sin fricción de expandir/colapsar.
            if (group.items.length === 1) {
              const item = group.items[0];
              const Icon = ICONS[item.icon];
              const link = (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onMobileClose}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    groupActive
                      ? (color?.active ?? 'bg-primary/10 text-primary')
                      : group.principal
                        ? cn(color?.text ?? 'text-foreground', 'font-semibold hover:bg-accent')
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    effectiveCollapsed && 'justify-center px-2'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!effectiveCollapsed && <span>{group.label}</span>}
                </NavLink>
              );
              if (effectiveCollapsed) {
                return (
                  <Tooltip key={group.label}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{group.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            }

            // Grupo con sub-items: colapsado → dropdown al hacer click (más
            // intuitivo que confiar en hover, y accesible en touch).
            if (effectiveCollapsed) {
              return (
                <DropdownMenu key={group.label}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            'flex w-full items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                            groupActive
                              ? (color?.active ?? 'bg-primary/10 text-primary')
                              : group.principal
                                ? cn(color?.text ?? 'text-foreground', 'hover:bg-accent')
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          <GroupIcon className="h-4 w-4 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">{group.label}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent side="right" align="start">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <NavLink to={item.path} onClick={onMobileClose}>{item.label}</NavLink>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            // Grupo con sub-items, sidebar expandido: sección plegable.
            const isOpen = expanded.has(group.label);
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    groupActive && !isOpen
                      ? (color?.active ?? 'bg-primary/10 text-primary')
                      : group.principal
                        ? cn(color?.text ?? 'text-foreground', 'font-semibold hover:bg-accent')
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="mt-0.5 ml-3.5 space-y-0.5 border-l border-border pl-3">
                    {group.items.map((item) => {
                      const Icon = ICONS[item.icon];
                      const active = pathname === item.path || pathname.startsWith(item.path + '/');
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={onMobileClose}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                            active
                              ? (color?.active ?? 'bg-primary/10 text-primary')
                              : group.principal
                                ? cn(color?.text ?? 'text-muted-foreground', 'hover:bg-accent hover:text-foreground')
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </TooltipProvider>

      {/* Panel de notificaciones (desktop only) */}
      <div className="shrink-0 border-t border-border p-2 hidden md:flex flex-col gap-1">
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
          <div className="relative flex h-full w-60 flex-col">
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
