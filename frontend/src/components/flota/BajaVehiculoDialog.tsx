import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDeactivateVehiculo, useInactivarVehiculo } from '@/hooks/useVehiculos';
import { cn, codigoDeError, extractError } from '@/lib/utils';
import type { Vehiculo } from '@/types';

export const MOTIVOS_BAJA = [
  'Vendido',
  'Siniestro / destrucción total',
  'Robo',
  'Fin de leasing',
  'Otro',
] as const;

interface Props {
  vehiculo: Pick<Vehiculo, 'id' | 'patente'> | null;
  onOpenChange: (open: boolean) => void;
  onHecho?: () => void;
}

/**
 * Dar de baja un vehículo, con el motivo.
 *
 * Pedido del cliente (27/09): la baja era un "¿seguro?" sin más, y meses
 * después nadie sabía si el auto inactivo se vendió, se chocó o se lo robaron.
 * Los motivos habituales son botones; "Otro" pide escribirlo. Cualquiera
 * admite un detalle ("vendido a Juan Pérez").
 *
 * **Dos vueltas si hay reservas sin cerrar**, como antes: el backend frena la
 * primera con 409 y acá se muestra qué pasa; confirmar de nuevo va por
 * `/inactivar`, con el mismo motivo.
 */
export function BajaVehiculoDialog({ vehiculo, onOpenChange, onHecho }: Props) {
  const [motivo, setMotivo] = useState<string>('');
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<string | null>(null);

  const deactivate = useDeactivateVehiculo();
  const inactivar = useInactivarVehiculo();
  const cargando = deactivate.isPending || inactivar.isPending;

  function cerrar(open: boolean) {
    if (!open) {
      setMotivo('');
      setDetalle('');
      setError(null);
      setConflicto(null);
    }
    onOpenChange(open);
  }

  function textoMotivo(): string | null {
    if (!motivo) return null;
    const d = detalle.trim();
    if (motivo === 'Otro') return d || null;
    return d ? `${motivo} — ${d}` : motivo;
  }

  async function confirmar() {
    if (!vehiculo) return;
    const texto = textoMotivo();
    if (!texto) {
      setError(motivo === 'Otro' ? 'Escribí el motivo.' : 'Elegí el motivo de la baja.');
      return;
    }
    setError(null);
    try {
      if (conflicto) {
        // Segunda vuelta: la persona ya leyó qué reservas quedan afectadas.
        await inactivar.mutateAsync({ id: vehiculo.id, motivo: texto });
      } else {
        await deactivate.mutateAsync({ id: vehiculo.id, motivo: texto });
      }
      cerrar(false);
      onHecho?.();
    } catch (err) {
      if (codigoDeError(err) === 'vehiculo_con_reservas') {
        setConflicto(extractError(err));
      } else {
        toast.error(extractError(err));
      }
    }
  }

  return (
    <Dialog open={!!vehiculo} onOpenChange={cerrar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {conflicto ? 'El vehículo tiene reservas sin cerrar' : `Dar de baja ${vehiculo?.patente ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            {conflicto
              ? `${conflicto} Si lo das de baja igual, esas reservas quedan sobre un vehículo inactivo y hay que reasignarlas a mano.`
              : 'No se borra del sistema: queda inactivo con el motivo y la fecha, y se puede reactivar.'}
          </DialogDescription>
        </DialogHeader>

        {!conflicto && (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">¿Por qué se da de baja? *</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MOTIVOS_BAJA.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMotivo(m); setError(null); }}
                    className={cn(
                      'rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors',
                      motivo === m
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'border-border text-foreground hover:border-primary/40',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {motivo && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {motivo === 'Otro' ? 'Motivo *' : 'Detalle (opcional)'}
                </label>
                <textarea
                  value={detalle}
                  onChange={e => setDetalle(e.target.value)}
                  rows={2}
                  autoFocus={motivo === 'Otro'}
                  placeholder={motivo === 'Otro' ? 'Contá por qué se da de baja…' : 'Ej: a quién se vendió, número de siniestro…'}
                  className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={cargando}>Cancelar</Button>
          <Button variant="destructive" onClick={confirmar} disabled={cargando}>
            {cargando ? 'Procesando…' : conflicto ? 'Darlo de baja igual' : 'Dar de baja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
