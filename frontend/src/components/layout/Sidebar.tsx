import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Car, Calendar, ClipboardList, FileText,
  Users, Calculator, Wallet, BookOpen, CreditCard, BarChart2,
  ChevronLeft, ChevronRight, X, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { NAV_ITEMS } from '@/lib/constants';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificacionesPanel } from '@/components/layout/NotificacionesPanel';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Car, Calendar, ClipboardList, FileText,
  Users, Calculator, Wallet, BookOpen, CreditCard, BarChart2, AlertTriangle,
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

export function Sidebar({ onMobileClose, mobileOpen }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const { pathname } = useLocation();

  const sidebarContent = (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-all duration-200',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center justify-center border-b border-border bg-white',
          sidebarCollapsed ? 'px-2' : 'px-4',
        )}
      >
        <img
          src="/logo.png"
          alt="Ubicar Rent"
          className={cn(
            'object-contain transition-all',
            sidebarCollapsed ? 'h-9 w-9 [object-position:left]' : 'h-10 w-auto',
          )}
          // En colapsado mostramos solo la "u" inicial del logo recortando al cuadrado
          style={sidebarCollapsed ? { objectFit: 'cover', objectPosition: '0 50%' } : {}}
        />
      </div>

      {/* Nav items */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.path || pathname.startsWith(item.path + '/');

            const link = (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  sidebarCollapsed && 'justify-center px-2'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </nav>
      </TooltipProvider>

      {/* Panel de notificaciones + Collapse toggle (desktop only) */}
      <div className="shrink-0 border-t border-border p-2 hidden md:flex flex-col gap-1">
        <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between px-1')}>
          <NotificacionesPanel />
          {!sidebarCollapsed && (
            <span className="text-xs text-muted-foreground">Alertas</span>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
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
