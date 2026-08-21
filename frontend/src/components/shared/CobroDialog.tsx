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

/** Los mismos valores que `Pago.medio_pago` en el backend. */
export const MEDIOS_DE_COBRO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'echeq', label: 'Echeq' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'wapa', label: 'Wapa (Patagonia)' },
] as const;

export interface DatosDeCobro {
  medio_pago: string;
  fecha_cobro: string;
}

interface CobroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Lo que se va a cobrar, ya formateado. Se muestra grande: es el control. */
  monto?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: (datos: DatosDeCobro) => void | Promise<void>;
}

/**
 * Confirmación de un cobro que **entra a la caja del día**.
 *
 * Existe porque cobrar una multa o un daño dejó de ser sólo un asiento en la
 * cuenta corriente: desde el arreglo de `PLAN_DINERO.md` §1.4 genera también el
 * `Pago`, y una caja sin medio de pago no se puede arquear. La fecha se
 * pregunta porque la plata puede haber entrado antes de que alguien cargue la
 * resolución — una transferencia que se ve en el extracto dos días después.
 */
export function CobroDialog({
  open,
  onOpenChange,
  title,
  description,
  monto,
  confirmLabel = 'Registrar cobro',
  loading = false,
  onConfirm,
}: CobroDialogProps) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [medioPago, setMedioPago] = useState('efectivo');
  const [fecha, setFecha] = useState(hoy);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMedioPago('efectivo');
      setFecha(hoy);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {monto && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Importe</p>
            <p className="text-lg font-semibold tabular-nums">{monto}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Medio de pago *</label>
            <select
              value={medioPago}
              onChange={e => setMedioPago(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
              autoFocus
            >
              {MEDIOS_DE_COBRO.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Fecha del cobro *</label>
            <input
              type="date"
              value={fecha}
              max={hoy}
              onChange={e => setFecha(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Entra a la caja del día {fecha.split('-').reverse().join('/')} y cancela la deuda en
          la cuenta corriente del cliente.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm({ medio_pago: medioPago, fecha_cobro: fecha })}
            disabled={loading || !fecha}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
