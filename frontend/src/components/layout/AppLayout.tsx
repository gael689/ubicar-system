import { useState } from 'react';
import { Sidebar, MobileNav } from './Sidebar';
import { Header } from './Header';
import { GlobalSearch } from './GlobalSearch';
import { AvisoReservasPendientes } from '@/components/reservas/AvisoReservasPendientes';

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

        {/* Va acá y no adentro de una pantalla: una reserva web pagada entra
            confirmada **pero sin auto**, y sin auto no tiene fila donde
            dibujarse en el calendario. Estaba sólo al pie de Ocupación y
            colapsada, así que desde cualquier otra pantalla era invisible.
            Fuera del `<main>` para que no scrollee con el contenido. */}
        <AvisoReservasPendientes />
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
