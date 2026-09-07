import { CalendarPlus, FileSignature, Plus } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  onNuevaReserva: () => void;
  onNuevoContrato: () => void;
  /** `boton` para el botón grande del header; `celda` para el `+` de la grilla. */
  variante?: 'boton' | 'celda';
  className?: string;
}

/**
 * Las dos formas de arrancar una operación, en el mismo lugar.
 *
 * **Pedido textual del dueño:**
 *
 * > *"El botón `+` que ahora lleva a nueva reserva sería genial que cuando lo
 * > aprieto me dé 2 opciones: 1) Nuevo contrato, para que yo pueda directamente
 * > hacer el contrato. 2) Nueva reserva (lo que ya está hecho)."*
 *
 * El caso es el de último momento: alguien llega al mostrador, hay que
 * entregarle el auto ya, y recorrer los seis pasos del wizard con la persona
 * enfrente es lo que hace que la reserva se anote en un papel. El camino corto
 * no reemplaza al largo — lo saltea cuando no hay tiempo.
 *
 * **Nueva reserva no cambió en nada.** Es el mismo `ReservaModal` de siempre,
 * con los mismos seis pasos; lo único que se agregó es la puerta de al lado.
 */
export function MenuNuevaOperacion({
  onNuevaReserva, onNuevoContrato, variante = 'boton', className,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variante === 'boton' ? (
          <button
            type="button"
            className={className ?? 'px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors flex items-center gap-2'}
          >
            <Plus className="w-4 h-4" /> Nueva operación
          </button>
        ) : (
          // El `+` fantasma de la celda del calendario. Se mantiene invisible
          // hasta el hover, igual que antes — lo único que cambia es que ahora
          // despliega en vez de abrir directo.
          <button
            type="button"
            onClick={e => e.stopPropagation()}
            title="Nueva reserva o contrato para este auto y este día"
            className={className ?? 'w-full h-full flex items-center justify-center'}
          >
            <Plus className="w-5 h-5 text-primary/35" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onClick={onNuevaReserva}
          className="flex items-start gap-2.5 py-2.5 cursor-pointer"
        >
          <CalendarPlus className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Nueva reserva</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              El paso a paso completo: cliente, fechas, auto, precio y pago.
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onNuevoContrato}
          className="flex items-start gap-2.5 py-2.5 cursor-pointer"
        >
          <FileSignature className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Nuevo contrato (rápido)</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Una sola pantalla, y sale el contrato para firmar o mandar.
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
