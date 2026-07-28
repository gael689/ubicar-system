import { useState } from 'react';
import { FileText, CheckCircle2, PenLine, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ContratoPanel } from '@/components/alquileres/ContratoPanel';
import { useListaReservas } from '@/hooks/useReservas';
import { formatDate } from '@/lib/utils';
import type { Reserva } from '@/types';

type Tab = 'sin_emitir' | 'sin_firmar' | 'emitido';

const TABS: { id: Tab; label: string; icono: typeof FileText; vacio: string }[] = [
  {
    id: 'sin_emitir',
    label: 'Falta emitir',
    icono: FileText,
    vacio: 'Todas las reservas vivas tienen su contrato.',
  },
  {
    id: 'sin_firmar',
    label: 'Emitidos sin firmar',
    icono: PenLine,
    vacio: 'No hay contratos esperando firma.',
  },
  {
    id: 'emitido',
    label: 'Con contrato',
    icono: CheckCircle2,
    vacio: 'Todavía no se emitió ningún contrato.',
  },
];

/**
 * Contratos, ordenados por lo que falta hacer.
 *
 * Existe porque el contrato antes sólo se podía tocar entrando reserva por
 * reserva desde el calendario: no había ninguna pantalla que contestara
 * "¿cuáles me faltan?". Y esa es la pregunta — un contrato sin emitir no
 * molesta hasta el día que hay que oponerlo.
 *
 * El orden de las solapas es el orden en que conviene trabajarlas: lo que
 * falta emitir, lo que falta firmar, y al final lo que ya está.
 */
export function ContratosPage() {
  const [tab, setTab] = useState<Tab>('sin_emitir');
  const [abierta, setAbierta] = useState<Reserva | null>(null);

  const { data, isLoading, isFetching } = useListaReservas({
    contrato: tab,
    page_size: 100,
  });
  const reservas = data?.data ?? [];
  const actual = TABS.find(t => t.id === tab)!;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contratos"
        description="El contrato se emite desde la reserva, sin esperar a la entrega."
      />

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ id, label, icono: Icono }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icono className="h-3.5 w-3.5" />
            {label}
            {tab === id && data && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                {data.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : reservas.length === 0 ? (
        <Card className="p-10 text-center">
          <actual.icono className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium text-foreground">Nada pendiente acá</p>
          <p className="text-sm text-muted-foreground">{actual.vacio}</p>
        </Card>
      ) : (
        <div className={`overflow-x-auto rounded-lg border border-border bg-card ${isFetching ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Reserva</th>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Vehículo</th>
                <th className="px-3 py-2 text-left font-medium">Período</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Contrato</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map(r => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">#{r.id}</td>
                  <td className="px-3 py-2">{r.cliente?.nombre_completo ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.vehiculo ? `${r.vehiculo.marca} ${r.vehiculo.modelo}` : 'Por categoría'}
                    {r.vehiculo?.patente && (
                      <span className="ml-1 text-xs">({r.vehiculo.patente})</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatDate(r.fecha_inicio)} → {formatDate(r.fecha_fin)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs uppercase text-muted-foreground">
                      {r.estado}
                    </span>
                    {/* El auto ya salió y sigue sin papel: eso no es "falta
                        emitir", es un problema abierto. */}
                    {r.entregado_sin_contrato && (
                      <span className="ml-1 rounded-md bg-danger px-2 py-0.5 text-xs font-bold uppercase text-white">
                        Entregado sin contrato
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setAbierta(r)}>
                      {r.contrato_estado === 'sin_emitir' ? 'Emitir' : 'Ver'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* El panel es el mismo de la reserva: emitir, firmar, descargar y
          anular viven en un solo lugar y no en dos que se desincronizan. */}
      {abierta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-card px-4 py-3">
              <div>
                <p className="font-semibold text-foreground">Reserva #{abierta.id}</p>
                <p className="text-xs text-muted-foreground">
                  {abierta.cliente?.nombre_completo ?? '—'}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAbierta(null)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ContratoPanel reservaId={abierta.id} antesDeEntregar={!abierta.alquiler_id} />
          </div>
        </div>
      )}
    </div>
  );
}
