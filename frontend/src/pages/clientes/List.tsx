import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClienteFilters, type ClienteFiltersState } from '@/components/clientes/ClienteFilters';
import { ClienteTable } from '@/components/clientes/ClienteTable';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { useClientes } from '@/hooks/useClientes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const INITIAL_FILTERS: ClienteFiltersState = {
  q: '',
  tipo: '',
  frecuente: null,
};

export function ClientesList() {
  const [filters, setFilters] = useState<ClienteFiltersState>(INITIAL_FILTERS);
  const debouncedQ = useDebouncedValue(filters.q, 300);

  const queryParams = useMemo(
    () => ({
      q: debouncedQ || undefined,
      tipo: filters.tipo || undefined,
      frecuente: filters.frecuente !== null ? filters.frecuente : undefined,
      page: 1,
      page_size: 50,
    }),
    [debouncedQ, filters.tipo, filters.frecuente]
  );

  const { data, isLoading, isError, error } = useClientes(queryParams);
  const [createOpen, setCreateOpen] = useState(false);

  const clientes = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clientes"
        description="Gestión de clientes y conductores adicionales. Las bajas son lógicas y reversibles a nivel de DB."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        }
      />

      <Card className="p-4">
        <ClienteFilters value={filters} onChange={setFilters} />
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-danger">
            No se pudieron cargar los clientes. {(error as Error)?.message}
          </div>
        ) : clientes.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasActiveFilters(filters) ? 'Sin resultados' : 'Todavía no hay clientes'}
            description={
              hasActiveFilters(filters)
                ? 'Probá ajustar los filtros o el término de búsqueda.'
                : 'Empezá registrando tu primer cliente.'
            }
            action={
              !hasActiveFilters(filters) && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Registrar cliente
                </Button>
              )
            }
          />
        ) : (
          <>
            <ClienteTable clientes={clientes} />
            <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              {total} {total === 1 ? 'cliente' : 'clientes'} en total
            </div>
          </>
        )}
      </Card>

      <ClienteFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function hasActiveFilters(f: ClienteFiltersState): boolean {
  return !!(f.q || f.tipo || f.frecuente !== null);
}
