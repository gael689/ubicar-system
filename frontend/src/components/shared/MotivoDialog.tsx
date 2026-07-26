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

interface MotivoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: (motivo: string) => void | Promise<void>;
}

/**
 * Confirmación que exige un motivo obligatorio en un textarea — patrón D-19,
 * reusado en bonificar multa, anular recibo y rechazar echeq: siempre que se
 * revierte un movimiento de cuenta corriente, el motivo queda documentado.
 */
export function MotivoDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = true,
  loading = false,
  onConfirm,
}: MotivoDialogProps) {
  const [motivo, setMotivo] = useState('');
  const [touched, setTouched] = useState(false);
  const vacio = !motivo.trim();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMotivo('');
      setTouched(false);
    }
    onOpenChange(next);
  }

  async function handleConfirm() {
    setTouched(true);
    if (vacio) return;
    await onConfirm(motivo.trim());
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Motivo *</label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder="Explicá brevemente el motivo…"
            className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background resize-none"
            autoFocus
          />
          {touched && vacio && <p className="text-xs text-danger">El motivo es obligatorio</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm} disabled={loading}>
            {loading ? 'Procesando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
