import { useState } from 'react';
import { Sidebar, MobileNav } from './Sidebar';
import { Header } from './Header';
import { GlobalSearch } from './GlobalSearch';

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
  /** Elimina el padding y habilita overflow-hidden para páginas con layout propio (ej: Cotizador) */
  fullBleed?: boolean;
}

export function AppLayout({ title, children, fullBleed = false }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Desktop sidebar */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} onMenuClick={() => setMobileMenuOpen(true)} onSearchClick={() => setSearchOpen(true)} />

        <main
          className={
            fullBleed
              ? 'flex-1 overflow-hidden'
              : 'flex-1 overflow-y-auto p-4 pb-20 md:pb-6'
          }
        >
          {children}
        </main>

        {/* El aviso de reservas pendientes **salió de acá**.
            Vivía en el layout, o sea en todas las pantallas, porque una reserva
            web pagada entra confirmada pero sin auto y no tenía dónde verse.
            Ahora tiene dos lugares propios: la sección Pendientes de la
            pantalla de inicio, y la fila "Por asignar" del calendario. Dejarlo
            además acá sería la misma información en tres lugares, que es
            justamente el problema que esta reestructuración viene a sacar. */}
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
