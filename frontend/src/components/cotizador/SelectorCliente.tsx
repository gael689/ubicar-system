import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { Cliente } from '@/types';

export interface ClienteElegido {
  /** `null` cuando el cliente es suelto — se cotizó a un nombre y nada más. */
  id: number | null;
  empresa: string;
  contacto: string;
  email: string;
}

interface Props {
  valor: ClienteElegido;
  onCambiar: (v: ClienteElegido) => void;
}

/**
 * Elegir a quién se le cotiza.
 *
 * **Tres caminos, y los tres tienen que existir:**
 *
 * 1. **Buscar uno que ya está.** Es el caso normal y el que permite seguirle
 *    el rastro a la cotización: sin `cliente_id`, un presupuesto es un PDF
 *    suelto que no se puede cruzar con nada.
 * 2. **Escribirlo a mano, sin asociar.** Cotizar es la primera conversación
 *    con alguien que quizás no vuelva; obligar a crear una ficha para mandar
 *    un precio agrega trabajo y ensucia la base de clientes que nunca fueron.
 * 3. **Crearlo en el momento.** Cuando la conversación sí avanza, se lo da de
 *    alta sin salir de la pantalla ni perder lo cargado.
 *
 * ### Por qué tolera no tener API
 *
 * Esta pantalla vive en **dos lugares**: dentro del sistema (con sesión de
 * Clerk) y como build suelto (`cotizador.html`), que se abre sin login. En el
 * segundo, `/clientes` responde 401 — y eso **no es un error a mostrar**: es el
 * modo esperado. Cuando pasa, el componente se convierte en tres campos de
 * texto y el cotizador sigue funcionando igual que siempre.
 */
export function SelectorCliente({ valor, onCambiar }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // `null` = todavía no se sabe. Se resuelve en la primera búsqueda.
  const [hayApi, setHayApi] = useState<boolean | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera: sin esto la lista queda flotando sobre el
  // formulario y tapa los campos de abajo.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  // Búsqueda con retardo: sin el debounce se dispara una consulta por tecla.
  useEffect(() => {
    if (hayApi === false) return;
    const termino = busqueda.trim();
    if (termino.length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/clientes', {
          params: { search: termino, page_size: 8, activo: true },
        });
        if (cancelado) return;
        setResultados(data?.data ?? data?.items ?? []);
        setHayApi(true);
      } catch {
        if (cancelado) return;
        // Sin sesión o sin backend: el cotizador suelto funciona igual, a mano.
        setResultados([]);
        setHayApi(false);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(t); };
  }, [busqueda, hayApi]);

  const elegir = (c: Cliente) => {
    onCambiar({
      id: c.id,
      empresa: c.razon_social || c.nombre_completo,
      contacto: c.razon_social ? c.nombre_completo : '',
      email: c.email || '',
    });
    setBusqueda('');
    setAbierto(false);
  };

  const soltar = () => onCambiar({ ...valor, id: null });

  const crear = async () => {
    if (!valor.empresa.trim()) {
      toast.error('Completá el nombre antes de crear el cliente');
      return;
    }
    setGuardando(true);
    try {
      const { data } = await api.post('/clientes', {
        nombre_completo: valor.contacto.trim() || valor.empresa.trim(),
        razon_social: valor.contacto.trim() ? valor.empresa.trim() : null,
        // El alta desde acá es mínima a propósito: lo que falta se completa en
        // la ficha. Pedir DNI y teléfono para mandar un presupuesto es la
        // fricción que hace que nadie use el botón.
        dni_cuit: 'A COMPLETAR',
        telefono: 'A COMPLETAR',
        email: valor.email.trim() || null,
        tipo: valor.contacto.trim() ? 'empresa' : 'particular',
        notas: 'Alta desde el cotizador. Faltan DNI/CUIT y teléfono.',
      });
      const creado = data?.data ?? data;
      onCambiar({ ...valor, id: creado.id });
      setCreando(false);
      toast.success('Cliente creado. Completá DNI y teléfono en su ficha.');
    } catch (err) {
      // El motivo real, no un "no pudimos": es lo único que dice qué hacer.
      toast.error(extractError(err) || 'No pudimos crear el cliente. Probá desde la pantalla de Clientes.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="col-span-2 space-y-2" ref={contenedor}>
      {/* Buscador — sólo si hay API. En el cotizador suelto ni aparece: un
          buscador que nunca encuentra nada es peor que no tenerlo. */}
      {hayApi !== false && (
        <div className="relative">
          <Label className="text-xs text-muted-foreground mb-1 block">
            Buscar cliente existente
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setAbierto(true); }}
              onFocus={() => setAbierto(true)}
              placeholder="Nombre, razón social o CUIT…"
              className="h-8 pl-8 text-sm"
            />
            {buscando && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {abierto && busqueda.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
              {resultados.length === 0 && !buscando ? (
                <p className="px-3 py-2.5 text-xs text-muted-foreground">
                  Sin resultados. Escribí los datos abajo y cotizá igual, o creá
                  el cliente.
                </p>
              ) : (
                resultados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegir(c)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {c.razon_social || c.nombre_completo}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.dni_cuit}{c.email ? ` · ${c.email}` : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Estado: asociado o suelto. Es lo que decide si la cotización se puede
          rastrear después, así que se muestra siempre, no se deduce. */}
      {valor.id ? (
        <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--ubicar-green))]/40 bg-[hsl(var(--ubicar-green))]/5 px-2.5 py-1.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ubicar-green))]" />
          <span className="min-w-0 flex-1 truncate text-xs">
            Asociada al cliente <strong>#{valor.id}</strong> — queda en su historial
          </span>
          <button
            type="button"
            onClick={soltar}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Desasociar y cotizar a nombre suelto"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        hayApi !== false && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              Cotización suelta: no queda en el historial de ningún cliente.
            </span>
            {creando ? (
              <Button size="sm" className="h-6 gap-1 px-2 text-xs" onClick={crear} disabled={guardando}>
                {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Confirmar alta
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => setCreando(true)}
              >
                <UserPlus className="h-3 w-3" />
                Crear cliente
              </Button>
            )}
          </div>
        )
      )}

      {creando && (
        <p className="text-xs text-muted-foreground">
          Se da de alta con el nombre y el mail de abajo. DNI/CUIT y teléfono
          quedan pendientes en su ficha.
        </p>
      )}
    </div>
  );
}
