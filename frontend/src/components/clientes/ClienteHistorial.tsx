import { useEffect, useState } from 'react';
import { CheckCircle2, Car, Flag, XCircle } from 'lucide-react';
import { useReservas } from '@/hooks/useReservas';
import { Reserva } from '@/types';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

interface Props {
  clienteId: number;
}

const ESTADO_ICONS: Record<string, React.ReactNode> = {
  confirmada: <CheckCircle2 className="w-3.5 h-3.5" />,
  activa: <Car className="w-3.5 h-3.5" />,
  finalizada: <Flag className="w-3.5 h-3.5" />,
  cancelada: <XCircle className="w-3.5 h-3.5" />,
};

const ESTADO_COLORS: Record<string, string> = {
  confirmada: 'bg-blue-100 text-blue-800 border-blue-200',
  activa: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  finalizada: 'bg-slate-200 text-slate-800 border-slate-300',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
};

export function ClienteHistorial({ clienteId }: Props) {
  const { listReservas, loading } = useReservas();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    listReservas({ cliente_id: clienteId, page_size: 100 })
      .then(res => {
        setReservas(res.data);
        setFetched(true);
      })
      .catch(console.error);
  }, [clienteId, listReservas]);

  if (loading && !fetched) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }

  if (fetched && reservas.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Car}
          title="Sin historial"
          description="Este cliente aún no tiene reservas ni alquileres registrados."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground border-b border-border">
            <tr>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Vehículo</th>
              <th className="px-4 py-3 font-medium">Desde</th>
              <th className="px-4 py-3 font-medium">Hasta</th>
              <th className="px-4 py-3 font-medium text-right">Precio Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reservas.map(r => (
              <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[r.estado] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                    {ESTADO_ICONS[r.estado]}
                    <span className="capitalize">{r.estado}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.vehiculo ? (
                    <div>
                      <div className="font-semibold text-foreground uppercase tracking-wide">
                        {r.vehiculo.patente}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.vehiculo.marca} {r.vehiculo.modelo}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">Sin vehículo</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{formatDate(r.fecha_inicio)}</div>
                  <div className="text-xs text-muted-foreground">{r.hora_inicio.slice(0, 5)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{formatDate(r.fecha_fin)}</div>
                  <div className="text-xs text-muted-foreground">{r.hora_fin.slice(0, 5)}</div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  {r.precio_total ? `$${Number(r.precio_total).toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
