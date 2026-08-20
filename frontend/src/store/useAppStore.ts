import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Densidad = 'comoda' | 'compacta';

/**
 * Filtro de canal del listado de reservas.
 *
 * Va persistido y no en el estado local de la pantalla porque es una forma de
 * trabajar, no una búsqueda: quien atiende el mostrador se para en "Mostrador"
 * y espera seguir ahí mañana. El resto de los filtros del listado (texto,
 * fecha, estado) sí son búsquedas y siguen siendo locales.
 */
export type CanalReserva = 'todas' | 'web' | 'mostrador';

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  // Fase 3 §5.2: toggle de densidad de la tabla de Reservas, persistido.
  reservasDensidad: Densidad;
  setReservasDensidad: (value: Densidad) => void;
  // Reestructuración Fase 1: el canal deja de ser invisible.
  reservasCanal: CanalReserva;
  setReservasCanal: (value: CanalReserva) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      reservasDensidad: 'comoda',
      setReservasDensidad: (value) => set({ reservasDensidad: value }),
      // Arranca en "todas": el listado unificado tiene que mostrar todo hasta
      // que alguien decida acotarlo.
      reservasCanal: 'todas',
      setReservasCanal: (value) => set({ reservasCanal: value }),
    }),
    { name: 'ubicar-app-store' }
  )
);
