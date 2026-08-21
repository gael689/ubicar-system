import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface DatosDeCancelacion {
  motivo: string;
  responsable: 'cliente' | 'ubicar';
  reembolso_medio: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La seña ya cobrada, formateada. Se muestra sólo si hay. */
  senaFormateada?: string | null;
  loading?: boolean;
  onConfirm: (datos: DatosDeCancelacion) => void | Promise<void>;
}

/**
 * Cancelar una reserva, y quién no pudo cumplir.
 *
 * **La pregunta que faltaba.** D-11 dice que la seña no se devuelve, con una
 * excepción escrita: *"si el que no puede cumplir es Ubicar Rent, se reintegra
 * el 100% o se ofrece otro vehículo"*. El diálogo anterior sólo pedía el
 * motivo, así que esa excepción no existía en el sistema — la única forma de
 * devolverle la seña a alguien era no usar el sistema.
 *
 * Se pregunta con las dos opciones a la vista y el default en "el cliente",
 * que es el caso común. Cada una dice qué va a pasar con la plata **antes** de
 * confirmar: es la última pantalla donde eso se puede corregir sin un
 * contra-asiento.
 */
export function CancelarReservaDialog({
  open,
  onOpenChange,
  senaFormateada,
  loading = false,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState('');
  const [responsable, setResponsable] = useState<'cliente' | 'ubicar'>('cliente');
  const [medio, setMedio] = useState('transferencia');
  const [touched, setTouched] = useState(false);
  const vacio = !motivo.trim();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMotivo('');
      setResponsable('cliente');
      setMedio('transferencia');
      setTouched(false);
    }
    onOpenChange(next);
  }

  async function confirmar() {
    setTouched(true);
    if (vacio) return;
    await onConfirm({
      motivo: motivo.trim(),
      responsable,
      reembolso_medio: medio,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar reserva</DialogTitle>
          <DialogDescription>
            El motivo es obligatorio y queda registrado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            ¿Quién no pudo cumplir?
          </label>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setResponsable('cliente')}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                responsable === 'cliente'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40'
              }`}
            >
              <span className="font-medium">El cliente</span>
              <span className="block text-xs text-muted-foreground">
                {senaFormateada
                  ? `La seña de ${senaFormateada} queda para Ubicar Rent y no se devuelve.`
                  : 'No hay seña cargada: no se genera ningún movimiento.'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setResponsable('ubicar')}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                responsable === 'ubicar'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40'
              }`}
            >
              <span className="font-medium">Ubicar Rent</span>
              <span className="block text-xs text-muted-foreground">
                {senaFormateada
                  ? `Se le reintegran los ${senaFormateada} completos y salen de la caja de hoy.`
                  : 'No hay seña cargada: no hay nada que reintegrar.'}
              </span>
            </button>
          </div>
        </div>

        {responsable === 'ubicar' && senaFormateada && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              ¿Por dónde se le devuelve?
            </label>
            <select
              value={medio}
              onChange={e => setMedio(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
            >
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="mercado_pago">Mercado Pago</option>
              <option value="wapa">Wapa (Patagonia)</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Motivo *</label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder="Explicá brevemente qué pasó…"
            className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background resize-none"
          />
          {touched && vacio && <p className="text-xs text-danger">El motivo es obligatorio</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={loading}>
            Volver
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={loading}>
            {loading ? 'Procesando…' : 'Cancelar reserva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
