import { AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type EstadoLicencia = 'vigente' | 'por_vencer' | 'vencida' | 'sin_datos';

export function estadoLicencia(vencimiento?: string | null): EstadoLicencia {
  if (!vencimiento) return 'sin_datos';
  const hoy = new Date();
  const venc = new Date(vencimiento);
  const diffDias = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDias < 0) return 'vencida';
  if (diffDias <= 30) return 'por_vencer';
  return 'vigente';
}

const CONFIG: Record<EstadoLicencia, {
  label: string;
  className: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  vigente: {
    label: 'Licencia OK',
    className: 'bg-success/10 text-success border-success/30',
    Icon: CheckCircle,
  },
  por_vencer: {
    label: 'Por vencer',
    className: 'bg-warning/10 text-warning border-warning/30',
    Icon: AlertTriangle,
  },
  vencida: {
    label: 'Vencida',
    className: 'bg-danger/10 text-danger border-danger/30',
    Icon: AlertTriangle,
  },
  sin_datos: {
    label: 'Sin licencia',
    className: 'bg-muted/40 text-muted-foreground border-border',
    Icon: HelpCircle,
  },
};

interface Props {
  vencimiento?: string | null;
  showLabel?: boolean;
  className?: string;
}

export function LicenciaBadge({ vencimiento, showLabel = true, className }: Props) {
  const estado = estadoLicencia(vencimiento);
  const { label, className: colorClass, Icon } = CONFIG[estado];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && label}
    </span>
  );
}
