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
    /**
     * `h-dvh` y no `h-screen`. **En el teléfono no son lo mismo.**
     *
     * `h-screen` es `100vh`, y en Chrome de Android y en Safari de iOS `100vh`
     * mide la pantalla **con la barra de direcciones escondida** — o sea, más
     * alto que lo que se ve. Con la barra a la vista, la aplicación entera
     * queda unos 60-100 px más larga que el visor, y el documento gana un
     * scroll propio arriba del que ya tiene `<main>`.
     *
     * Ese scroll de más es el que rompía el encabezado fijo del listado: el
     * `sticky top-0` se queda quieto respecto de `<main>`, pero `<main>`
     * entero se desplaza con el documento, así que el título se va igual.
     * Reportado así:
     *
     * > *"Cuando scrolleo para abajo el titular Reservas y alquileres sigue
     * > bajando, debería quedar fijado, no?"*
     *
     * Lo mismo hacía saltar la barra de navegación de abajo. `100dvh` sigue
     * el alto real del visor mientras la barra aparece y desaparece: la
     * aplicación no desborda nunca y el único que scrollea es `<main>`.
     *
     * `h-screen` queda de respaldo para un navegador sin `dvh`, y el `supports`
     * lo pisa donde sí existe. Va con `@supports` y no con las dos clases
     * sueltas porque así el orden en el CSS no depende de cómo Tailwind ordene
     * la escala de alturas: una regla dentro de `@supports` se emite después.
     */
    <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] overflow-hidden bg-surface">
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
