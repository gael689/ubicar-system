import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn, extractError, formatDocumento } from '@/lib/utils';
import type { Cliente } from '@/types';

export interface ClienteBuscado {
  id: number;
  nombre_completo: string;
  razon_social?: string | null;
}

interface Props {
  valor: ClienteBuscado | null;
  onCambiar: (c: ClienteBuscado | null) => void;
  /** De dónde sale el alta rápida: queda en las notas de la ficha. */
  origenAlta: string;
  placeholder?: string;
  className?: string;
}

/**
 * Buscar un cliente por nombre, razón social o CUIT, o crearlo en el momento.
 *
 * Reemplaza a los `<select>` con los primeros 200 clientes: pasados los 200 el
 * cliente buscado simplemente no estaba, y no había forma de escribirlo. Mismo
 * patrón que el selector del cotizador y el alta rápida de la reserva: se
 * crea con el nombre y **DNI y teléfono quedan "A COMPLETAR"**, visible en la
 * ficha y reclamado por la campana hasta que alguien los cargue.
 */
export function BuscadorCliente({ valor, onCambiar, origenAlta, placeholder, className }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera: si no, la lista tapa los campos de abajo.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  // Con retardo: sin él se dispara una consulta por tecla.
  useEffect(() => {
    const termino = busqueda.trim();
    if (termino.length < 2) { setResultados([]); return; }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        // El backend lee el término como `q` (`search` se ignoraba y volvía la
        // primera página sin filtrar). Los inactivos ya quedan afuera por defecto.
        const { data } = await api.get('/clientes', { params: { q: termino, page_size: 8 } });
        if (!cancelado) setResultados(data?.data ?? data?.items ?? []);
      } catch {
        if (!cancelado) setResultados([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(t); };
  }, [busqueda]);

  function elegir(c: Cliente) {
    onCambiar({ id: c.id, nombre_completo: c.nombre_completo, razon_social: c.razon_social });
    setBusqueda('');
    setAbierto(false);
  }

  async function crear() {
    const nombre = busqueda.trim();
    if (nombre.length < 3) return;
    setCreando(true);
    try {
      const { data } = await api.post('/clientes', {
        nombre_completo: nombre,
        dni_cuit: 'A COMPLETAR',
        telefono: 'A COMPLETAR',
        tipo: 'particular',
        notas: `Alta rápida desde ${origenAlta}. Faltan DNI/CUIT y teléfono.`,
      });
      const creado = data?.data ?? data;
      onCambiar({ id: creado.id, nombre_completo: creado.nombre_completo });
      setBusqueda('');
      setAbierto(false);
      toast.success('Cliente creado. Falta cargarle DNI y teléfono.');
    } catch (err) {
      // El motivo real: es lo único que dice qué hacer.
      toast.error(extractError(err, 'No pudimos crear el cliente. Probá desde la pantalla de Clientes.'));
    } finally {
      setCreando(false);
    }
  }

  if (valor) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-2.5 py-1.5', className)}>
        <Check className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {valor.razon_social || valor.nombre_completo}
        </span>
        <button
          type="button"
          onClick={() => onCambiar(null)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Quitar el cliente"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const termino = busqueda.trim();
  return (
    <div className={cn('relative', className)} ref={contenedor}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          placeholder={placeholder ?? 'Buscar por nombre, razón social o CUIT…'}
          className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-8 text-sm"
        />
        {buscando && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {abierto && termino.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {resultados.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegir(c)}
              className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{c.razon_social || c.nombre_completo}</span>
              <span className="text-xs text-muted-foreground">{formatDocumento(c.dni_cuit)}</span>
            </button>
          ))}
          {resultados.length === 0 && !buscando && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No hay ningún cliente con ese nombre.</p>
          )}
          {termino.length >= 3 && (
            <button
              type="button"
              onClick={crear}
              disabled={creando}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
            >
              {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Crear cliente "{termino}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
