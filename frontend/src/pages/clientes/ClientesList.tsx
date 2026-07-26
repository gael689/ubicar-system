import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Phone, Mail, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { LicenciaBadge } from '@/components/clientes/LicenciaBadge';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';

import { useClientes, type ClienteFilters } from '@/hooks/useClientes';
import { useDebounce } from '@/hooks/useDebounce';
import type { Cliente } from '@/types';

export function ClientesList() {
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState('');
  const [soloFrecuentes, setSoloFrecuentes] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const filters: ClienteFilters = {
    q: debouncedSearch || undefined,
    tipo: tipo || undefined,
    frecuente: soloFrecuentes || undefined,
    incluir_inactivos: showInactivos || undefined,
    page,
    page_size: 20,
  };

  const { data, isLoading } = useClientes(filters);
  const clientes = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clientes"
        description={total > 0 ? `${total} cliente${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}` : undefined}
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar por nombre, DNI, teléfono..."
            value={search}
            onChange={handleSearchChange}
            className="flex-1 min-w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={tipo}
            onChange={e => { setTipo(e.target.value); setPage(1); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Todos los tipos</option>
            <option value="particular">Particular</option>
            <option value="empresa">Empresa</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={soloFrecuentes}
              onChange={e => { setSoloFrecuentes(e.target.checked); setPage(1); }}
              className="rounded border-border"
            />
            Solo frecuentes
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showInactivos}
              onChange={e => { setShowInactivos(e.target.checked); setPage(1); }}
              className="rounded border-border"
            />
            Mostrar inactivos
          </label>
        </div>
      </Card>

      {/* Tabla */}
      {isLoading ? (
        <Card className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </Card>
      ) : clientes.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description={search ? 'No se encontraron clientes con esa búsqueda.' : 'Agregá el primer cliente para empezar.'}
            action={
              !search ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" /> Nuevo cliente
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {clientes.map(c => (
            <ClienteRow key={c.id} cliente={c} />
          ))}
        </Card>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <ClienteFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function ClienteRow({ cliente }: { cliente: Cliente }) {
  const iniciales = cliente.nombre_completo
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <Link
      to={`/clientes/${cliente.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors"
    >
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-sm font-semibold text-primary">{iniciales}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{cliente.nombre_completo}</span>
          {cliente.es_frecuente && (
            <Star className="h-3.5 w-3.5 text-warning fill-warning" />
          )}
          {!cliente.activo && (
            <span className="inline-flex items-center rounded-md bg-muted/40 border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Inactivo
            </span>
          )}
          <span className="inline-flex items-center rounded-md bg-surface border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {cliente.tipo === 'empresa' ? 'Empresa' : 'Particular'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{cliente.dni_cuit}</span>
          {cliente.telefono && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {cliente.telefono}
            </span>
          )}
          {cliente.email && (
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" /> {cliente.email}
            </span>
          )}
        </div>
      </div>

      <LicenciaBadge vencimiento={cliente.licencia_vencimiento} />
    </Link>
  );
}
