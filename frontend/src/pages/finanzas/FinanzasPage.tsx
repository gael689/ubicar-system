import { useState } from 'react';
import type { ComponentType } from 'react';
import { Wallet, CreditCard, BookOpen, Receipt } from 'lucide-react';
import { CajaPage } from '@/pages/caja/CajaPage';
import { CobrosPage } from '@/pages/caja/CobrosPage';
import { EcheqsPage } from '@/pages/echeqs/EcheqsPage';
import { CuentasCorrientesPage } from '@/pages/cuentas-corrientes/CuentasCorrientesPage';

type Tab = 'caja' | 'cobros' | 'echeqs' | 'cc';

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'caja', label: 'Caja del día', icon: Wallet },
  { id: 'cobros', label: 'Cobros', icon: Receipt },
  { id: 'echeqs', label: 'Echeqs', icon: CreditCard },
  { id: 'cc', label: 'Cuentas Corrientes', icon: BookOpen },
];

export function FinanzasPage({ defaultTab }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'caja');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 border-b border-border bg-card shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
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
        {tab === 'caja' && <CajaPage />}
        {tab === 'cobros' && <CobrosPage />}
        {tab === 'echeqs' && <EcheqsPage />}
        {tab === 'cc' && <CuentasCorrientesPage />}
      </div>
    </div>
  );
}
