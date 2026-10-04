import type { ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, CreditCard, BookOpen, Receipt, Landmark } from 'lucide-react';
import { CajaPage } from '@/pages/caja/CajaPage';
import { CajaSociosPage } from '@/pages/caja/CajaSociosPage';
import { CobrosPage } from '@/pages/caja/CobrosPage';
import { EcheqsPage } from '@/pages/echeqs/EcheqsPage';
import { CuentasCorrientesPage } from '@/pages/cuentas-corrientes/CuentasCorrientesPage';

type Tab = 'libro' | 'caja' | 'cobros' | 'echeqs' | 'cc';

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  // La caja como la pidió Franco: alquileres, a cobrar, mes con socios y lo propio.
  { id: 'libro', label: 'Caja', icon: Landmark },
  { id: 'caja', label: 'Hoy', icon: Wallet },
  { id: 'cobros', label: 'Cobros', icon: Receipt },
  { id: 'echeqs', label: 'Echeqs', icon: CreditCard },
  { id: 'cc', label: 'Cuentas corrientes', icon: BookOpen },
];

function esTab(valor: string | null): valor is Tab {
  return TABS.some(t => t.id === valor);
}

/**
 * La pestaña vive en la URL (`/finanzas?tab=echeqs`) y no en un estado local.
 *
 * Así funcionan los accesos viejos (`/echeqs`, `/cuentas-corrientes`, `/caja`
 * redirigen acá con su pestaña), los links de las notificaciones (un echeq por
 * cobrar lleva directo a Echeqs) y el botón "atrás" del navegador. Con estado
 * local todos caían en "Caja del día" y había que buscar la pestaña a mano.
 */
export function FinanzasPage({ defaultTab }: { defaultTab?: Tab }) {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab');
  const tab: Tab = esTab(pedida) ? pedida : (defaultTab ?? 'libro');

  function elegir(id: Tab) {
    setParams(prev => {
      const siguiente = new URLSearchParams(prev);
      siguiente.set('tab', id);
      return siguiente;
    }, { replace: true });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 border-b border-border bg-card shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => elegir(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'libro' && <CajaSociosPage />}
        {tab === 'caja' && <CajaPage />}
        {tab === 'cobros' && <CobrosPage />}
        {tab === 'echeqs' && <EcheqsPage />}
        {tab === 'cc' && <CuentasCorrientesPage />}
      </div>
    </div>
  );
}
