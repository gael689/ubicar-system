import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Car, ClipboardList, CornerDownLeft } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useBusquedaGlobal, type ResultadoBusqueda } from '@/hooks/useBusquedaGlobal';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPO_ICON: Record<ResultadoBusqueda['tipo'], React.ComponentType<{ className?: string }>> = {
  cliente: Users,
  vehiculo: Car,
  reserva: ClipboardList,
};

const TIPO_LABEL: Record<ResultadoBusqueda['tipo'], string> = {
  cliente: 'Clientes',
  vehiculo: 'Flota',
  reserva: 'Reservas',
};

// Fase 3, ítem 42: búsqueda global — Cmd/Ctrl+K desde cualquier pantalla,
// busca cliente, patente/vehículo y reserva en un solo lugar.
export function GlobalSearch({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: resultados = [], isFetching } = useBusquedaGlobal(debounced);

  useEffect(() => setSelected(0), [resultados]);

  const grupos = useMemo(() => {
    const acc: Record<string, ResultadoBusqueda[]> = {};
    for (const r of resultados) {
      (acc[r.tipo] ??= []).push(r);
    }
    return acc;
  }, [resultados]);

  function irA(r: ResultadoBusqueda) {
    navigate(r.url);
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && resultados[selected]) {
      e.preventDefault();
      irA(resultados[selected]);
    }
  }

  let indiceGlobal = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar cliente, patente, reserva…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {debounced.trim() === '' && (
            <p className="text-xs text-muted-foreground text-center py-6">Empezá a escribir para buscar</p>
          )}
          {debounced.trim() !== '' && isFetching && resultados.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Buscando…</p>
          )}
          {debounced.trim() !== '' && !isFetching && resultados.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Sin resultados para "{debounced}"</p>
          )}

          {(['cliente', 'vehiculo', 'reserva'] as const).map((tipo) => {
            const items = grupos[tipo];
            if (!items || items.length === 0) return null;
            const Icon = TIPO_ICON[tipo];
            return (
              <div key={tipo} className="mb-2 last:mb-0">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                  {TIPO_LABEL[tipo]}
                </div>
                {items.map((r) => {
                  indiceGlobal += 1;
                  const idx = indiceGlobal;
                  return (
                    <button
                      key={`${r.tipo}-${r.id}`}
                      onClick={() => irA(r)}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                        idx === selected ? 'bg-primary/10' : 'hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.subtitulo}</p>
                      </div>
                      {idx === selected && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
