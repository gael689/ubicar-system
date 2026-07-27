import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePreCheckout, usePreCheckin } from '@/hooks/useSemaforo';

const COLOR: Record<string, string> = {
  rojo: 'bg-red-500',
  amarillo: 'bg-amber-500',
  verde: 'bg-emerald-500',
};

interface Props {
  reservaId: number;
  momento: 'checkout' | 'checkin';
}

// Fase 3, ítem 39: adelanta lo que el check-out/check-in va a advertir o
// bloquear, sin tener que abrir el modal. La mayoría de los ítems son
// advertencias informativas — "el sistema informa, la persona decide".
export function SemaforoDot({ reservaId, momento }: Props) {
  const checkout = usePreCheckout(reservaId, momento === 'checkout');
  const checkin = usePreCheckin(reservaId, momento === 'checkin');
  const { data, isLoading } = momento === 'checkout' ? checkout : checkin;

  if (isLoading || !data || data.items.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${COLOR[data.semaforo]}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <ul className="text-xs space-y-1">
            {data.items.map((item) => (
              <li key={item.codigo}>
                {item.severidad === 'bloqueante' ? '🔴' : '🟡'} {item.mensaje}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
