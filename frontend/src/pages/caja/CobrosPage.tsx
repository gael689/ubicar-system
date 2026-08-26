import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePagos, type FiltrosCobros } from '@/hooks/usePagos';
import { useClientes } from '@/hooks/useClientes';
import { useEmitirReciboDePago } from '@/hooks/useRecibos';
import { formatCurrency, extractError } from '@/lib/utils';
import { METODO_PAGO_LABEL } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { MetodoPago } from '@/types';

const MEDIOS: MetodoPago[] = [
  'efectivo', 'transferencia', 'tarjeta', 'cheque', 'echeq', 'cuenta_corriente', 'wapa',
];

const MEDIO_COLOR: Record<string, string> = {
  efectivo: 'bg-emerald-100 text-emerald-700',
  transferencia: 'bg-blue-100 text-blue-700',
  tarjeta: 'bg-purple-100 text-purple-700',
  cheque: 'bg-amber-100 text-amber-700',
  echeq: 'bg-orange-100 text-orange-700',
  cuenta_corriente: 'bg-slate-100 text-slate-700',
};

const VACIO: FiltrosCobros = { page: 1, page_size: 50 };

/**
 * Historial de cobros con filtros.
 *
 * Complementa a Caja, que muestra **un día**. Acá se contesta lo otro: cuánto
 * entró en efectivo este mes, qué le cobramos a tal cliente, qué cobros
 * quedaron sin factura.
 *
 * El total de arriba lo calcula el backend sobre **todo lo filtrado**, no
 * sobre la página que se está viendo. Es la diferencia entre un listado y algo
 * con lo que se puede cerrar la caja.
 */
export function CobrosPage() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState<FiltrosCobros>(VACIO);
  const [buscaCliente, setBuscaCliente] = useState('');
  const clienteQ = useDebouncedValue(buscaCliente, 300);

  const { data, isLoading, isFetching } = usePagos(filtros);
  const emitirRecibo = useEmitirReciboDePago();
  const { data: clientesData } = useClientes({ q: clienteQ, page: 1, page_size: 8 });
  const sugerencias = clienteQ.length >= 2 ? (clientesData?.data ?? []) : [];

  const pagos = data?.data ?? [];
  const resumen = data?.resumen;
  const total = data?.total ?? 0;
  const page = filtros.page ?? 1;
  const pageSize = filtros.page_size ?? 50;
  const ultimaPagina = Math.max(1, Math.ceil(total / pageSize));

  // Cualquier cambio de filtro vuelve a la página 1: quedarse en la 4 de un
  // resultado que ahora tiene 2 muestra una tabla vacía y parece un error.
  const set = (cambio: Partial<FiltrosCobros>) =>
    setFiltros(f => ({ ...f, ...cambio, page: 1 }));

  const toggleMedio = (m: MetodoPago) =>
    set({
      medio_pago: filtros.medio_pago?.includes(m)
        ? filtros.medio_pago.filter(x => x !== m)
        : [...(filtros.medio_pago ?? []), m],
    });

  const hayFiltros =
    JSON.stringify({ ...filtros, page: 1 }) !== JSON.stringify(VACIO);

  const clienteElegido = clientesData?.data?.find(c => c.id === filtros.cliente_id);

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="f-desde" className="text-xs text-muted-foreground">Desde</label>
            <input
              id="f-desde" type="date" className="input-base w-40"
              value={filtros.fecha_desde ?? ''}
              onChange={e => set({ fecha_desde: e.target.value || undefined })}
            />
          </div>
          <div>
            <label htmlFor="f-hasta" className="text-xs text-muted-foreground">Hasta</label>
            <input
              id="f-hasta" type="date" className="input-base w-40"
              value={filtros.fecha_hasta ?? ''}
              onChange={e => set({ fecha_hasta: e.target.value || undefined })}
            />
          </div>

          <div className="relative min-w-[220px] flex-1">
            <label htmlFor="f-cliente" className="text-xs text-muted-foreground">Cliente</label>
            {filtros.cliente_id ? (
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-border px-3 text-sm">
                <span className="truncate">{clienteElegido?.nombre_completo ?? `#${filtros.cliente_id}`}</span>
                <button
                  onClick={() => { set({ cliente_id: undefined }); setBuscaCliente(''); }}
                  aria-label="Quitar cliente"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="f-cliente" className="input-base pl-8"
                    placeholder="Nombre o DNI/CUIT"
                    value={buscaCliente}
                    onChange={e => setBuscaCliente(e.target.value)}
                  />
                </div>
                {sugerencias.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
                    {sugerencias.map(c => (
                      <li key={c.id}>
                        <button
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => { set({ cliente_id: c.id }); setBuscaCliente(''); }}
                        >
                          {c.nombre_completo}
                          <span className="ml-2 text-xs text-muted-foreground">{c.dni_cuit}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="f-factura" className="text-xs text-muted-foreground">Facturación</label>
            <select
              id="f-factura" className="input-base w-36"
              value={filtros.con_factura === undefined ? '' : String(filtros.con_factura)}
              onChange={e => set({ con_factura: e.target.value === '' ? undefined : e.target.value === 'true' })}
            >
              <option value="">Todos</option>
              <option value="true">Con factura</option>
              <option value="false">Sin factura</option>
            </select>
          </div>

          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={() => { setFiltros(VACIO); setBuscaCliente(''); }}>
              <X className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </div>

        {/* Los medios como chips y no como <select>: elegir "efectivo +
            transferencia" juntos es el caso normal de cerrar la caja. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Cómo se cobró:</span>
          {MEDIOS.map(m => {
            const activo = filtros.medio_pago?.includes(m) ?? false;
            return (
              <button
                key={m}
                onClick={() => toggleMedio(m)}
                aria-pressed={activo}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activo
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {METODO_PAGO_LABEL[m] ?? m}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Resumen ─────────────────────────────────────────────────── */}
      {resumen && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Total {hayFiltros ? 'filtrado' : 'general'} · {resumen.cantidad} cobro(s)
            </p>
            <p className="text-xl font-bold text-primary">{formatCurrency(resumen.total)}</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {MEDIOS.filter(m => resumen.por_medio[m] > 0).map(m => (
              <div key={m}>
                <p className="text-[11px] text-muted-foreground">{METODO_PAGO_LABEL[m] ?? m}</p>
                <p className="text-sm font-semibold">{formatCurrency(resumen.por_medio[m])}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabla ───────────────────────────────────────────────────── */}
      <div className={`mt-3 flex-1 ${isFetching && !isLoading ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : pagos.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-medium">No hay cobros con esos filtros</p>
            <p className="text-sm text-muted-foreground">Probá ampliar el rango de fechas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium">Vehículo</th>
                  <th className="px-3 py-2 text-left font-medium">Medio</th>
                  <th className="px-3 py-2 text-left font-medium">Recibo</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30"
                    onClick={() => p.reserva_id && navigate('/reservas')}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-3 py-2">{p.cliente_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.vehiculo_patente ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${MEDIO_COLOR[p.medio_pago] ?? 'bg-muted'}`}>
                        {METODO_PAGO_LABEL[p.medio_pago] ?? p.medio_pago}
                      </span>
                      {p.con_factura && (
                        <span className="ml-1 rounded border border-border px-1 text-[10px] text-muted-foreground">
                          Factura
                        </span>
                      )}
                    </td>
                    {/* El recibo se emite de un click desde acá.
                        Sigue siendo manual —es una decisión, no un
                        automatismo— pero no cuesta más que apretar un botón:
                        el concepto lo arma el backend con los datos del
                        cobro. Obligar a tipearlo es lo que hacía que el
                        recibo quedara sin emitir. */}
                    <td className="px-3 py-2 text-xs">
                      {p.recibo_numero ? (
                        <span className="text-muted-foreground">{p.recibo_numero}</span>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                          disabled={emitirRecibo.isPending}
                          onClick={async e => {
                            e.stopPropagation();
                            try {
                              await emitirRecibo.mutateAsync({ pagoId: p.id });
                              toast.success('Recibo emitido');
                            } catch (err) {
                              toast.error(extractError(err));
                            }
                          }}
                        >
                          <Receipt className="h-3 w-3" /> Emitir
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ultimaPagina > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <Button
            variant="ghost" size="sm" disabled={page <= 1}
            onClick={() => setFiltros(f => ({ ...f, page: page - 1 }))}
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-muted-foreground">Página {page} de {ultimaPagina}</span>
          <Button
            variant="ghost" size="sm" disabled={page >= ultimaPagina}
            onClick={() => setFiltros(f => ({ ...f, page: page + 1 }))}
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
