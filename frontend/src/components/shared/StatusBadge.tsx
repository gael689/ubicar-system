import { cn } from '@/lib/utils';
import {
  ESTADO_VEHICULO_LABEL,
  ESTADO_VEHICULO_COLOR,
  ESTADO_RESERVA_LABEL,
  ESTADO_RESERVA_COLOR,
  ESTADO_ECHEQ_LABEL,
  ESTADO_ECHEQ_COLOR,
} from '@/lib/constants';
import type { EstadoVehiculo, EstadoReserva, EstadoEcheq } from '@/types';

type StatusType =
  | { type: 'vehiculo'; estado: EstadoVehiculo }
  | { type: 'reserva'; estado: EstadoReserva }
  | { type: 'echeq'; estado: EstadoEcheq };

type Props = StatusType & { className?: string };

export function StatusBadge({ type, estado, className }: Props) {
  let label = '';
  let color = '';

  if (type === 'vehiculo') {
    label = ESTADO_VEHICULO_LABEL[estado];
    color = ESTADO_VEHICULO_COLOR[estado];
  } else if (type === 'reserva') {
    label = ESTADO_RESERVA_LABEL[estado];
    color = ESTADO_RESERVA_COLOR[estado];
  } else if (type === 'echeq') {
    label = ESTADO_ECHEQ_LABEL[estado];
    color = ESTADO_ECHEQ_COLOR[estado];
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        color,
        className,
      )}
    >
      {label}
    </span>
  );
}
