import { useState } from 'react';
import { Sidebar, MobileNav } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
  /** Elimina el padding y habilita overflow-hidden para páginas con layout propio (ej: Cotizador) */
  fullBleed?: boolean;
}

export function AppLayout({ title, children, fullBleed = false }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Desktop sidebar */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} onMenuClick={() => setMobileMenuOpen(true)} />

        <main
          className={
            fullBleed
              ? 'flex-1 overflow-hidden'
              : 'flex-1 overflow-y-auto p-4 pb-20 md:pb-6'
          }
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
