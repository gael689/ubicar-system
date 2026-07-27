import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Densidad = 'comoda' | 'compacta';

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  // Fase 3 §5.2: toggle de densidad de la tabla de Reservas, persistido.
  reservasDensidad: Densidad;
  setReservasDensidad: (value: Densidad) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      reservasDensidad: 'comoda',
      setReservasDensidad: (value) => set({ reservasDensidad: value }),
    }),
    { name: 'ubicar-app-store' }
  )
);
