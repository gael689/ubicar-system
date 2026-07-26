import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ClienteFiltersState {
  q: string;
  tipo: string;
  frecuente: boolean | null;
}

interface Props {
  value: ClienteFiltersState;
  onChange: (value: ClienteFiltersState) => void;
}

export function ClienteFilters({ value, onChange }: Props) {
  const handleChange = (key: keyof ClienteFiltersState, val: any) => {
    onChange({ ...value, [key]: val });
  };

  const handleClear = () => {
    onChange({ q: '', tipo: '', frecuente: null });
  };

  const hasFilters = Boolean(value.q || value.tipo || value.frecuente !== null);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {/* Búsqueda */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por DNI, nombre, email..."
            value={value.q}
            onChange={(e) => handleChange('q', e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Tipo */}
        <select
          value={value.tipo}
          onChange={(e) => handleChange('tipo', e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos los tipos</option>
          <option value="particular">Particular</option>
          <option value="empresa">Empresa</option>
        </select>

        {/* Frecuente */}
        <select
          value={value.frecuente === null ? '' : value.frecuente.toString()}
          onChange={(e) => {
            const val = e.target.value;
            handleChange('frecuente', val === '' ? null : val === 'true');
          }}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">Cualquier habitualidad</option>
          <option value="true">Cliente frecuente</option>
          <option value="false">Cliente regular</option>
        </select>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={handleClear} className="h-9 shrink-0 px-3">
          <X className="mr-2 h-4 w-4" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
