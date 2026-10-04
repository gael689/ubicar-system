import type { ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen, CalendarDays, CreditCard, FileSpreadsheet, Lock, Receipt, Wallet, ListChecks,
} from 'lucide-react';
import { CajaPage } from '@/pages/caja/CajaPage';
import { CajaSociosPage, type VistaDeCaja } from '@/pages/caja/CajaSociosPage';
import { CobrosPage } from '@/pages/caja/CobrosPage';
import { EcheqsPage } from '@/pages/echeqs/EcheqsPage';
import { CuentasCorrientesPage } from '@/pages/cuentas-corrientes/CuentasCorrientesPage';

/**
 * Los sub-módulos de la Caja. Los cuatro primeros son la planilla de Franco
 * (alquileres, a cobrar, mes, propio); los otros cuatro son lo de siempre.
 *
 * Los ids viejos siguen valiendo: `caja` es **Hoy** (la caja del día), y
 * `libro` —el nombre que tuvo la planilla un rato— vale `alquileres`.
 */
export type TabDeCaja =
  | VistaDeCaja | 'caja' | 'cobros' | 'echeqs' | 'cc';

export const TABS_DE_CAJA: {
  id: TabDeCaja; label: string; icon: ComponentType<{ className?: string }>; grupo: 'planilla' | 'diario';
}[] = [
  { id: 'alquileres', label: 'Alquileres', icon: FileSpreadsheet, grupo: 'planilla' },
  { id: 'a-cobrar', label: 'A cobrar', icon: ListChecks, grupo: 'planilla' },
  { id: 'mes', label: 'Mes', icon: CalendarDays, grupo: 'planilla' },
  { id: 'propio', label: 'Propio', icon: Lock, grupo: 'planilla' },
  { id: 'caja', label: 'Hoy', icon: Wallet, grupo: 'diario' },
  { id: 'cobros', label: 'Cobros', icon: Receipt, grupo: 'diario' },
  { id: 'echeqs', label: 'Echeqs', icon: CreditCard, grupo: 'diario' },
  { id: 'cc', label: 'Cuentas corrientes', icon: BookOpen, grupo: 'diario' },
];

const ALIAS: Record<string, TabDeCaja> = { libro: 'alquileres' };

function aTab(valor: string | null): TabDeCaja | null {
  if (!valor) return null;
  const v = ALIAS[valor] ?? valor;
  return TABS_DE_CAJA.some(t => t.id === v) ? (v as TabDeCaja) : null;
}

/**
 * **Caja.** Todo lo de la plata en un solo lugar, con una sola barra de
 * sub-módulos: la planilla (Alquileres · A cobrar · Mes · Propio) y lo diario
 * (Hoy · Cobros · Echeqs · Cuentas corrientes).
 *
 * La pestaña vive en la URL (`/caja?tab=echeqs`) y no en un estado local, así
 * funcionan los accesos viejos (`/finanzas`, `/echeqs`, `/cuentas-corrientes`
 * redirigen acá), los links de las notificaciones, el menú lateral y el botón
 * "atrás" del navegador.
 *
 * **El contenido scrollea por su cuenta** (`absolute inset-0`): antes quedaba
 * cortado, porque el contenedor tenía `overflow-hidden` sin un alto definido y
 * lo que no entraba en la pantalla no se podía alcanzar.
 */
export function FinanzasPage({ defaultTab }: { defaultTab?: TabDeCaja }) {
  const [params, setParams] = useSearchParams();
  const tab: TabDeCaja = aTab(params.get('tab')) ?? defaultTab ?? 'alquileres';

  function elegir(id: TabDeCaja) {
    setParams(prev => {
      const siguiente = new URLSearchParams(prev);
      siguiente.set('tab', id);
      return siguiente;
    }, { replace: true });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav
        aria-label="Sub-módulos de la Caja"
        className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-ubicar-border bg-card px-3"
      >
        {TABS_DE_CAJA.map(({ id, label, icon: Icon, grupo }, i) => (
          <div key={id} className="flex items-stretch">
            {i > 0 && grupo !== TABS_DE_CAJA[i - 1].grupo && (
              <span aria-hidden className="mx-2 my-2 w-px shrink-0 bg-ubicar-border" />
            )}
            <button
              onClick={() => elegir(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-ubicar-primary text-ubicar-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          </div>
        ))}
      </nav>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto">
          {(tab === 'alquileres' || tab === 'a-cobrar' || tab === 'mes' || tab === 'propio') && (
            <CajaSociosPage vista={tab} />
          )}
          {tab === 'caja' && <CajaPage />}
          {tab === 'cobros' && <CobrosPage />}
          {tab === 'echeqs' && <EcheqsPage />}
          {tab === 'cc' && <CuentasCorrientesPage />}
        </div>
      </div>
    </div>
  );
}
