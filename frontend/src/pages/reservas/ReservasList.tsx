import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Car, Flag, XCircle, Plus, FileText, Search, X, Calendar, AlertTriangle, AlarmClockOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReservas } from '@/hooks/useReservas';
import api from '@/lib/api';
import type { Reserva, EstadoReserva, PaginatedResponse } from '@/types';
import { ReservaModal } from './ReservaModal';
import { CheckoutModal } from './CheckoutModal';
import { CheckinModal } from './CheckinModal';
import { ExtenderModal } from './ExtenderModal';

const ESTADOS: { value: EstadoReserva | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'activa', label: 'Activa' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'cancelada', label: 'Cancelada' },
];

const ESTADO_COLORS: Record<string, string> = {
  confirmada: 'bg-blue-100 text-blue-800 border-blue-200',
  activa: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  vencida: 'bg-red-100 text-red-800 border-red-300 animate-pulse',
  finalizada: 'bg-slate-200 text-slate-800 border-slate-300',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
};

const ESTADO_ICONS: Record<string, React.ReactNode> = {
  confirmada: <CheckCircle2 className="w-3.5 h-3.5" />,
  activa: <Car className="w-3.5 h-3.5" />,
  vencida: <AlarmClockOff className="w-3.5 h-3.5" />,
  finalizada: <Flag className="w-3.5 h-3.5" />,
  cancelada: <XCircle className="w-3.5 h-3.5" />,
};

export function ReservasList() {
  // Reservas "vencidas": pasó la hora de devolución y el auto no volvió.
  // Antes esto se aproximaba filtrando 'activa' + fecha_fin < hoy en el cliente;
  // ahora el backend ya calcula el estado 'vencida' de forma autoritativa.
  const { data: pendingCheckouts = [] } = useQuery({
    queryKey: ['reservas', 'pending-checkout-alerts'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', {
        params: { estado: 'vencida', page_size: 50, page: 1 },
      });
      return data.data;
    },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const { loading, error, listReservas, cancelarReserva } = useReservas();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState<string>('');
  const [search, setSearch] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [checkoutReserva, setCheckoutReserva] = useState<Reserva | null>(null);
  const [checkinReserva, setCheckinReserva] = useState<Reserva | null>(null);
  const [editReserva, setEditReserva] = useState<Reserva | null>(null);
  const [extenderReserva, setExtenderReserva] = useState<Reserva | null>(null);
  const pageSize = 20;

  const loadReservas = useCallback(async () => {
    const resp = await listReservas({
      estado: estado || undefined,
      q: search.trim() || undefined,
      fecha: fechaFiltro || undefined,
      page,
      page_size: pageSize,
    });
    setReservas(resp.data);
    setTotal(resp.total);
  }, [listReservas, estado, search, fechaFiltro, page]);

  useEffect(() => {
    loadReservas().catch(() => {});
  }, [loadReservas]);

  const handleCancelar = async (id: number) => {
    if (!confirm('¿Cancelar esta reserva?')) return;
    try {
      await cancelarReserva(id);
      await loadReservas();
    } catch {/* errors shown in hook */}
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reservas y Alquileres</h1>
          <p className="text-sm text-slate-500 mt-1">{total} resultado{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva Reserva
        </button>
      </div>

      {/* Buscador y filtro de fecha */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o DNI/CUIT del cliente..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 px-3">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={fechaFiltro}
            onChange={e => { setFechaFiltro(e.target.value); setPage(1); }}
            className="border-none bg-transparent text-sm text-slate-700 focus:ring-0 py-2"
            title="Filtrar por dia especifico"
          />
          {fechaFiltro && (
            <button onClick={() => { setFechaFiltro(''); setPage(1); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-2 flex-wrap">
        {ESTADOS.map((e) => (
          <button
            key={e.value}
            onClick={() => { setEstado(e.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
              estado === e.value
                ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {e.label}
          </button>
        ))}
        {(search || fechaFiltro) && (
          <button
            onClick={() => { setSearch(''); setFechaFiltro(''); setPage(1); }}
            className="px-4 py-1.5 rounded-full text-sm font-medium border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-all"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Alerta: check-outs pendientes (autos no devueltos) */}
      {pendingCheckouts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {pendingCheckouts.length} vehículo{pendingCheckouts.length !== 1 ? 's' : ''} con check-in pendiente
              </p>
              <p className="text-xs text-amber-700 mt-0.5">La fecha de devolución ha pasado y el auto no fue devuelto.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingCheckouts.map(r => (
                  <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-amber-100 border border-amber-200 rounded-lg px-2 py-1 text-amber-800 font-medium">
                    <Car className="h-3 w-3" />
                    {r.vehiculo?.patente ?? `Veh.${r.vehiculo_id}`} · {r.cliente?.nombre_completo ?? `Cliente ${r.cliente_id}`} · vencida {r.fecha_fin}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Tabla Light / Excel-like */}
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : reservas.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p>No hay reservas para mostrar</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-left">
                <th className="px-4 py-3 border-r border-slate-200 w-16">ID</th>
                <th className="px-4 py-3 border-r border-slate-200">Vehículo</th>
                <th className="px-4 py-3 border-r border-slate-200">Cliente</th>
                <th className="px-4 py-3 border-r border-slate-200">Fechas</th>
                <th className="px-4 py-3 border-r border-slate-200">Precio</th>
                <th className="px-4 py-3 border-r border-slate-200">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reservas.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3 text-slate-500 font-mono font-medium border-r border-slate-200">
                    #{r.id}
                  </td>
                  <td className="px-4 py-3 border-r border-slate-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-slate-800">
                          {r.vehiculo ? `${r.vehiculo.marca} ${r.vehiculo.modelo}` : `Veh. ${r.vehiculo_id}`}
                        </div>
                        {r.vehiculo && (
                          <div className="text-xs text-slate-500">{r.vehiculo.patente}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 border-r border-slate-200">
                    <div className="text-slate-800 font-medium">
                      {r.cliente?.nombre_completo ?? `Cliente ${r.cliente_id}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 border-r border-slate-200">
                    <div className="text-slate-800 text-xs font-medium">
                      {r.fecha_inicio} <span className="text-slate-400">→</span> {r.fecha_fin}
                    </div>
                    {r.late_checkout && (
                      <div className="text-xs text-amber-600 mt-1 font-medium bg-amber-50 inline-block px-1.5 py-0.5 rounded">
                        Late checkout
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 border-r border-slate-200">
                    {r.precio_total ? (
                      <span className="text-emerald-700 font-bold">
                        ${parseFloat(r.precio_total).toLocaleString('es-AR')}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Sin precio</span>
                    )}
                  </td>
                  <td className="px-4 py-3 border-r border-slate-200">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${ESTADO_COLORS[r.estado] ?? ''}`}>
                      {ESTADO_ICONS[r.estado]} {r.estado}
                    </span>
                    {r.bloqueada_por_solape && (
                      <div className="text-xs text-amber-600 mt-1 font-medium">⚠️ Solape pendiente</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Editar / Cancelar (solo si no hay alquiler) */}
                      {!r.alquiler_id && r.estado !== 'cancelada' && (
                        <>
                          <button
                            onClick={() => setEditReserva(r)}
                            className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleCancelar(r.id)}
                            className="px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors"
                          >
                            Cancelar
                          </button>
                        </>
                      )}

                      {/* Check-out (entregar auto al cliente) */}
                      {!r.alquiler_id && r.estado !== 'cancelada' && (
                        <button
                          onClick={() => setCheckoutReserva(r)}
                          className="px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors"
                        >
                          Check-out
                        </button>
                      )}

                      {/* Check-in + Extender (auto entregado, pendiente devolución) */}
                      {r.alquiler_id && r.alquiler_estado === 'activo' && (
                        <>
                          <button
                            onClick={() => setExtenderReserva(r)}
                            className="px-3 py-1.5 rounded bg-muted hover:bg-accent text-foreground text-xs font-bold transition-colors"
                          >
                            Extender
                          </button>
                          <button
                            onClick={() => setCheckinReserva(r)}
                            className="px-3 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold transition-colors"
                          >
                            Check-in
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm font-medium text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modales */}
      {showCreateModal && (
        <ReservaModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(_r, _w) => { setShowCreateModal(false); loadReservas(); }}
        />
      )}
      {editReserva && (
        <ReservaModal
          reserva={editReserva}
          onClose={() => setEditReserva(null)}
          onSuccess={(_r, _w) => { setEditReserva(null); loadReservas(); }}
        />
      )}
      {checkoutReserva && (
        <CheckoutModal
          reserva={checkoutReserva}
          onClose={() => setCheckoutReserva(null)}
          onSuccess={() => { setCheckoutReserva(null); loadReservas(); }}
        />
      )}
      {checkinReserva && checkinReserva.alquiler_id && (
        <CheckinModal
          alquilerId={checkinReserva.alquiler_id}
          vehiculoInfo={checkinReserva.vehiculo ? `${checkinReserva.vehiculo.marca} ${checkinReserva.vehiculo.modelo} (${checkinReserva.vehiculo.patente})` : `Veh. ${checkinReserva.vehiculo_id}`}
          clienteNombre={checkinReserva.cliente?.nombre_completo ?? `Cliente ${checkinReserva.cliente_id}`}
          kmCheckout={0}
          garantiaTipo={checkinReserva.garantia_tipo ?? null}
          garantiaMonto={checkinReserva.garantia_monto ?? null}
          reserva={checkinReserva}
          onClose={() => setCheckinReserva(null)}
          onSuccess={() => { setCheckinReserva(null); loadReservas(); }}
        />
      )}
      {extenderReserva && extenderReserva.alquiler_id && (
        <ExtenderModal
          alquilerId={extenderReserva.alquiler_id}
          vehiculoInfo={extenderReserva.vehiculo ? `${extenderReserva.vehiculo.marca} ${extenderReserva.vehiculo.modelo} (${extenderReserva.vehiculo.patente})` : `Veh. ${extenderReserva.vehiculo_id}`}
          clienteNombre={extenderReserva.cliente?.nombre_completo ?? `Cliente ${extenderReserva.cliente_id}`}
          fechaFinActual={extenderReserva.fecha_fin}
          horaFinActual={extenderReserva.hora_fin}
          onClose={() => setExtenderReserva(null)}
          onSuccess={() => { setExtenderReserva(null); loadReservas(); }}
        />
      )}
    </div>
  );
}
