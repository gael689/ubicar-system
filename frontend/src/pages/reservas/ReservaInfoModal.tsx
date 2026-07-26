import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car, User, Calendar, MapPin, Clock, DollarSign, Pencil, XCircle, Flag, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useReservas } from '@/hooks/useReservas';
import type { Reserva, ApiResponse } from '@/types';
import { ESTADO_RESERVA_LABEL, ESTADO_RESERVA_COLOR } from '@/lib/constants';
import { ReservaModal } from './ReservaModal';
import { CheckoutModal } from './CheckoutModal';
import { CheckinModal } from './CheckinModal';
import { ExtenderModal } from './ExtenderModal';

interface Props {
  reservaId: number;
  onClose: () => void;
  onActionComplete?: () => void;
}

export function ReservaInfoModal({ reservaId, onClose, onActionComplete }: Props) {
  const { cancelarReserva } = useReservas();
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [extenderOpen, setExtenderOpen] = useState(false);

  const { data: reserva, isLoading, refetch } = useQuery({
    queryKey: ['reserva', reservaId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Reserva>>(`/reservas/${reservaId}`);
      return res.data.data;
    },
  });

  const handleSuccess = () => {
    refetch();
    onActionComplete?.();
    onClose();
  };

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar esta reserva?')) return;
    try {
      await cancelarReserva(reservaId);
      handleSuccess();
    } catch (e) {
      alert('No se pudo cancelar la reserva');
    }
  };

  if (isLoading || !reserva) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-background p-6 rounded-xl shadow-xl flex items-center gap-3 text-foreground">
          <Clock className="w-5 h-5 animate-spin text-primary" />
          <span className="font-medium text-sm">Cargando reserva...</span>
        </div>
      </div>
    );
  }

  // Sub-modales abren encima sin cerrar el info
  if (editOpen) {
    return (
      <ReservaModal
        reserva={reserva}
        onClose={() => setEditOpen(false)}
        onSuccess={() => { setEditOpen(false); handleSuccess(); }}
      />
    );
  }
  if (checkoutOpen) {
    return (
      <CheckoutModal
        reserva={reserva}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={() => { setCheckoutOpen(false); handleSuccess(); }}
      />
    );
  }
  if (checkinOpen && reserva.alquiler_id) {
    return (
      <CheckinModal
        alquilerId={reserva.alquiler_id}
        vehiculoInfo={reserva.vehiculo ? `${reserva.vehiculo.marca} ${reserva.vehiculo.modelo} (${reserva.vehiculo.patente})` : `Veh. ${reserva.vehiculo_id}`}
        clienteNombre={reserva.cliente?.nombre_completo ?? `Cliente ${reserva.cliente_id}`}
        kmCheckout={0}
        garantiaTipo={reserva.garantia_tipo ?? null}
        garantiaMonto={reserva.garantia_monto ?? null}
        reserva={reserva}
        onClose={() => setCheckinOpen(false)}
        onSuccess={() => { setCheckinOpen(false); handleSuccess(); }}
      />
    );
  }
  if (extenderOpen && reserva.alquiler_id) {
    return (
      <ExtenderModal
        alquilerId={reserva.alquiler_id}
        vehiculoInfo={reserva.vehiculo ? `${reserva.vehiculo.marca} ${reserva.vehiculo.modelo} (${reserva.vehiculo.patente})` : `Veh. ${reserva.vehiculo_id}`}
        clienteNombre={reserva.cliente?.nombre_completo ?? `Cliente ${reserva.cliente_id}`}
        fechaFinActual={reserva.fecha_fin}
        horaFinActual={reserva.hora_fin}
        onClose={() => setExtenderOpen(false)}
        onSuccess={() => { setExtenderOpen(false); handleSuccess(); }}
      />
    );
  }

  const sinAlquiler = !reserva.alquiler_id;
  const conAlquilerActivo = reserva.alquiler_id && reserva.alquiler_estado === 'activo';
  const cancelable = reserva.estado === 'confirmada' && sinAlquiler;
  const editable = reserva.estado === 'confirmada' || reserva.estado === 'activa' || reserva.estado === 'vencida';
  const puedeCheckout = sinAlquiler && reserva.estado !== 'cancelada' && reserva.estado !== 'finalizada';
  const puedeCheckin = conAlquilerActivo;
  const puedeExtender = conAlquilerActivo;

  const fechaInicio = new Date(`${reserva.fecha_inicio}T${reserva.hora_inicio}`);
  const fechaFin = new Date(`${reserva.fecha_fin}T${reserva.hora_fin}`);
  const fmtFecha = (d: Date) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  const fmtHora = (s: string) => s.slice(0, 5);

  const hoy = new Date();
  // 'vencida' es el estado autoritativo que calcula el backend (pasó la hora de
  // devolución y el auto no volvió). Antes se aproximaba en el cliente con
  // estado==='activa' && fechaFin<hoy, lo que dependía del reloj del navegador.
  const checkinVencido = reserva.estado === 'vencida';
  const checkoutVencido = reserva.estado === 'confirmada' && fechaInicio < hoy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-background border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">#{reserva.id}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase border ${ESTADO_RESERVA_COLOR[reserva.estado]}`}>
                {ESTADO_RESERVA_LABEL[reserva.estado]}
              </span>
            </div>
            <h2 className="text-base font-semibold text-foreground mt-1">
              Detalle de reserva
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Alertas contextuales */}
          {checkoutVencido && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                <strong>Check-out pendiente:</strong> esta reserva debió entregarse el {fmtFecha(fechaInicio)} a las {fmtHora(reserva.hora_inicio)}.
              </p>
            </div>
          )}
          {checkinVencido && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-800">
                <strong>Check-in pendiente:</strong> el vehículo debió devolverse el {fmtFecha(fechaFin)} a las {fmtHora(reserva.hora_fin)}.
              </p>
            </div>
          )}

          {/* Vehículo */}
          <div className="flex items-start gap-3">
            <Car className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehículo</p>
              <p className="text-sm font-medium text-foreground">
                {reserva.vehiculo ? `${reserva.vehiculo.marca} ${reserva.vehiculo.modelo}` : `Veh. ${reserva.vehiculo_id}`}
              </p>
              {reserva.vehiculo?.patente && (
                <p className="text-xs text-muted-foreground font-mono">{reserva.vehiculo.patente}</p>
              )}
            </div>
          </div>

          {/* Cliente */}
          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="text-sm font-medium text-foreground">
                {reserva.cliente?.nombre_completo ?? `Cliente ${reserva.cliente_id}`}
              </p>
            </div>
          </div>

          {/* Fechas */}
          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período</p>
              <p className="text-sm text-foreground">
                {fmtFecha(fechaInicio)} {fmtHora(reserva.hora_inicio)}
                <span className="text-muted-foreground mx-2">→</span>
                {fmtFecha(fechaFin)} {fmtHora(reserva.hora_fin)}
              </p>
              {reserva.late_checkout && (
                <p className="text-xs text-amber-600 mt-0.5">Late checkout</p>
              )}
            </div>
          </div>

          {/* Lugares */}
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entrega / Devolución</p>
              <p className="text-sm text-foreground">
                {reserva.lugar_entrega || '—'}
                {reserva.lugar_devolucion && reserva.lugar_devolucion !== reserva.lugar_entrega && (
                  <> <span className="text-muted-foreground">→</span> {reserva.lugar_devolucion}</>
                )}
              </p>
            </div>
          </div>

          {/* Precio */}
          {reserva.precio_total && (
            <div className="flex items-start gap-3">
              <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Precio total</p>
                <p className="text-sm font-bold text-success">
                  ${parseFloat(reserva.precio_total).toLocaleString('es-AR')}
                </p>
                {reserva.anticipo_monto && (
                  <p className="text-xs text-muted-foreground">
                    Anticipo: ${parseFloat(reserva.anticipo_monto).toLocaleString('es-AR')} ({reserva.anticipo_medio_pago})
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notas */}
          {reserva.notas && (
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{reserva.notas}</p>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 space-y-2 sticky bottom-0">
          {puedeCheckout && (
            <button
              onClick={() => setCheckoutOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Car className="h-4 w-4" /> Registrar Check-out (entrega)
            </button>
          )}
          {puedeCheckin && (
            <button
              onClick={() => setCheckinOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Flag className="h-4 w-4" /> Registrar Check-in (devolución)
            </button>
          )}
          {puedeExtender && (
            <button
              onClick={() => setExtenderOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-secondary hover:bg-accent text-foreground text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <TrendingUp className="h-4 w-4" /> Extender alquiler
            </button>
          )}
          <div className="flex items-center gap-2">
            {editable && (
              <button
                onClick={() => setEditOpen(true)}
                className="flex-1 px-3 py-2 rounded-lg bg-muted hover:bg-accent text-foreground text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
            {cancelable && (
              <button
                onClick={handleCancelar}
                className="flex-1 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
