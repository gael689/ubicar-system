import { useState } from 'react';
import { FileText, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectorCliente, type ClienteElegido } from '@/components/cotizador/SelectorCliente';
import { usePresupuestosHuerfanos, useAsignarClienteAPresupuesto } from '@/hooks/usePresupuestos';
import { formatDate } from '@/lib/utils';

/**
 * Cotizaciones guardadas sin cliente.
 *
 * **El caso que resuelve:** se le cotiza a alguien que llamó preguntando
 * precios y todavía no es cliente. Hasta ahora había dos salidas malas —crear
 * un cliente por cada consulta, que llena la base de gente que nunca alquiló, o
 * no guardar nada y que la cotización sea un PDF sin rastro—. Ahora se guarda
 * suelta, y cuando esa persona vuelve y se da de alta, se le asigna acá y pasa
 * a su historial.
 *
 * **Vive en un sub-módulo propio, no en el formulario.** Antes se dibujaba
 * entre "Fecha de emisión" y "Empresa cliente", o sea en el medio del camino de
 * armar una cotización nueva — que es lo que uno hace el 95 % de las veces que
 * abre esta pantalla. Asignarle dueño a una cotización vieja es otra tarea, de
 * otro momento, y mezclarlas obligaba a saltear un bloque que no tenía nada que
 * ver con lo que se estaba haciendo.
 *
 * Ahora se abre desde el botón del encabezado, que además lleva el contador: si
 * hay pendientes se ven sin entrar, y si no hay, el botón no aparece.
 */
export function CotizacionesHuerfanas({ onCerrar }: { onCerrar?: () => void }) {
  const { data: huerfanas } = usePresupuestosHuerfanos();
  const asignar = useAsignarClienteAPresupuesto();
  const [asignando, setAsignando] = useState<number | null>(null);
  const [elegido, setElegido] = useState<ClienteElegido>({ id: null, empresa: '', contacto: '', email: '' });

  // Sin ninguna pendiente el sub-módulo no tiene nada que mostrar. El botón
  // que lo abre tampoco se dibuja, así que a esto no se llega — queda igual
  // por si alguien lo monta desde otro lado.
  if (!huerfanas || huerfanas.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No hay cotizaciones sin cliente.
      </p>
    );
  }

  const confirmar = (presupuestoId: number) => {
    if (!elegido.id) return;
    asignar.mutate(
      { id: presupuestoId, clienteId: elegido.id },
      {
        onSuccess: () => {
          setAsignando(null);
          setElegido({ id: null, empresa: '', contacto: '', email: '' });
          // Si era la última, el sub-módulo se cierra solo: quedarse mirando
          // una bandeja vacía obliga a un click que no aporta nada.
          if ((huerfanas?.length ?? 0) <= 1) onCerrar?.();
        },
      },
    );
  };

  return (
    <Card className="p-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Cotizaciones sin cliente ({huerfanas.length})
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Se cotizaron a alguien que todavía no está dado de alta. Asignales el
        cliente cuando exista y pasan a su historial.
      </p>

      <ul className="space-y-2">
        {huerfanas.map(p => (
          <li key={p.id} className="rounded-lg border border-border px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {p.notas ?? `Cotización #${p.id}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.created_at.slice(0, 10))} ·{' '}
                  ${Number(p.total).toLocaleString('es-AR')}
                </p>
              </div>
              {asignando === p.id ? (
                <Button size="sm" variant="ghost" onClick={() => setAsignando(null)}>
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setAsignando(p.id)}>
                  <UserPlus className="h-3.5 w-3.5" /> Asignar cliente
                </Button>
              )}
            </div>

            {asignando === p.id && (
              <div className="mt-2 space-y-2 border-t border-border pt-2">
                {/* Se reusa el selector del cotizador: busca clientes reales y
                    además permite crear uno al vuelo, que es justo lo que hace
                    falta cuando la persona por fin se da de alta. */}
                <SelectorCliente valor={elegido} onCambiar={setElegido} />
                <Button
                  size="sm"
                  disabled={!elegido.id || asignar.isPending}
                  onClick={() => confirmar(p.id)}
                >
                  {asignar.isPending ? 'Asignando…' : 'Confirmar'}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
