import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Car, User, Calendar, MapPin, Clock, DollarSign, Pencil, XCircle, Flag, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useReservas } from '@/hooks/useReservas';
import { CancelarReservaDialog, type DatosDeCancelacion } from '@/components/reservas/CancelarReservaDialog';
import { extractError } from '@/lib/utils';
import type { Reserva, ApiResponse } from '@/types';
import { ESTADO_RESERVA_LABEL, ESTADO_RESERVA_COLOR } from '@/lib/constants';
import { ReservaModal } from './ReservaModal';
import { PanelResolverReserva } from '@/components/reservas/PanelResolverReserva';
import { CheckoutModal } from './CheckoutModal';
import { CheckinModal } from './CheckinModal';
import { ExtenderModal } from './ExtenderModal';
import { ContratoPanel } from '@/components/alquileres/ContratoPanel';
import { BadgeCanal } from '@/components/reservas/BadgeCanal';

interface Props {
  reservaId: number;
  onClose: () => void;
  onActionComplete?: () => void;
}

export function ReservaInfoModal({ reservaId, onClose, onActionComplete }: Props) {
  const { cancelarReserva, loading: cancelando } = useReservas();
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [extenderOpen, setExtenderOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [asignarOpen, setAsignarOpen] = useState(false);

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

  const handleCancelar = async (datos: DatosDeCancelacion) => {
    try {
      await cancelarReserva(reservaId, datos.motivo, {
        responsable: datos.responsable,
        reembolso_medio: datos.reembolso_medio,
      });
      toast.success(
        datos.responsable === 'ubicar'
          ? 'Reserva cancelada — la seña se reintegró'
          : 'Reserva cancelada',
      );
      setCancelarOpen(false);
      handleSuccess();
    } catch (err) {
      toast.error(extractError(err));
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
  if (asignarOpen) {
    /**
     * **Es el panel de siempre, no un camino nuevo.**
     *
     * `PanelResolverReserva` es el único lugar del sistema que asigna un auto:
     * revalida disponibilidad en el momento, avisa si es upgrade o downgrade,
     * deja corregir el precio con motivo auditado y dispara la emisión del
     * contrato (D-47). Hacer un "cambiar auto" propio acá sería el segundo
     * camino de asignación, que es justo lo que ese panel vino a eliminar.
     */
    return (
      <PanelResolverReserva
        reserva={reserva}
        onClose={() => setAsignarOpen(false)}
        onCambio={() => { refetch(); onActionComplete?.(); }}
      />
    );
  }

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
        fechaInicioActual={reserva.fecha_inicio}
        fechaFinActual={reserva.fecha_fin}
        horaFinActual={reserva.hora_fin}
        precioTotalActual={reserva.precio_total}
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
  /**
   * Cambiar el auto se puede mientras no haya salido.
   *
   * **El backend lo corta igual** (`asignar_vehiculo` rechaza con
   * `alquiler_en_curso`), y con razón: con el auto ya entregado hay que cerrar
   * ese alquiler con su check-in y abrir otro, porque el kilometraje y el
   * combustible de salida son de ese vehículo. Acá sólo se evita ofrecer un
   * botón que va a fallar.
   */
  const puedeCambiarAuto =
    sinAlquiler && reserva.estado !== 'cancelada' && reserva.estado !== 'finalizada';
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">#{reserva.id}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase border ${ESTADO_RESERVA_COLOR[reserva.estado]}`}>
                {ESTADO_RESERVA_LABEL[reserva.estado]}
              </span>
              {/* De dónde vino y quién la cargó. Este modal no lo decía en
                  ningún lado, así que una reserva web confirmada se veía
                  exactamente igual que una de mostrador. */}
              <BadgeCanal origen={reserva.origen} creadoPor={reserva.usuario_nombre} />
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
              {reserva.conductor && (
                <p className="text-xs text-muted-foreground">
                  Conductor: {reserva.conductor.nombre_completo}
                </p>
              )}
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
                <p className="text-xs text-ubicar-dark mt-0.5">Late checkout</p>
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
                  {reserva.con_factura && (
                    <span className="ml-2 align-middle inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Con factura
                    </span>
                  )}
                </p>
                {reserva.precio_lista && parseFloat(reserva.precio_lista) !== parseFloat(reserva.precio_total) && (
                  <p className="text-xs text-amber-600">
                    Precio de lista: ${parseFloat(reserva.precio_lista).toLocaleString('es-AR')}
                    {reserva.descuento_motivo && ` — ${reserva.descuento_motivo}`}
                  </p>
                )}
                {reserva.anticipo_monto && (
                  <p className="text-xs text-muted-foreground">
                    Anticipo: ${parseFloat(reserva.anticipo_monto).toLocaleString('es-AR')} ({reserva.anticipo_medio_pago})
                  </p>
                )}
                {/* Los adicionales se facturan aparte del precio del auto,
                    por eso se listan y se muestra el total real a cobrar. */}
                {reserva.adicionales && reserva.adicionales.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                    {reserva.adicionales.map(a => (
                      <p key={a.id} className="text-xs text-muted-foreground flex justify-between gap-2">
                        <span className="truncate">
                          {a.nombre}{a.cantidad > 1 && ` ×${a.cantidad}`}
                          {a.unidad_cobro === 'por_dia' && ' (por día)'}
                        </span>
                        <span className="tabular-nums shrink-0">
                          ${parseFloat(a.subtotal).toLocaleString('es-AR')}
                        </span>
                      </p>
                    ))}
                    <p className="text-sm font-bold text-foreground flex justify-between gap-2 pt-1">
                      <span>Total a facturar</span>
                      <span className="tabular-nums">
                        ${(parseFloat(reserva.precio_total) + parseFloat(reserva.total_adicionales ?? '0')).toLocaleString('es-AR')}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {reserva.estado === 'cancelada' && reserva.motivo_cancelacion && (
            <div className="rounded-lg bg-danger/10 border border-danger/20 p-3">
              <p className="text-xs font-semibold text-danger uppercase tracking-wide mb-1">Motivo de cancelación</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{reserva.motivo_cancelacion}</p>
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

        {/* Contrato — siempre visible, con alquiler o sin él.
            Antes aparecía sólo después del check-out, así que hasta el momento
            de entregar el auto no había forma de saber si la reserva tenía
            contrato ni de emitirlo con tiempo. */}
        <div className="px-6 pb-4">
          <ContratoPanel reservaId={reserva.id} antesDeEntregar={!reserva.alquiler_id} />
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
          {puedeCambiarAuto && (
            <button
              onClick={() => setAsignarOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-secondary hover:bg-accent text-foreground text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Car className="h-4 w-4" />
              {reserva.vehiculo_id ? 'Cambiar el auto' : 'Asignar auto'}
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
                onClick={() => setCancelarOpen(true)}
                className="flex-1 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      <CancelarReservaDialog
        open={cancelarOpen}
        onOpenChange={setCancelarOpen}
        senaFormateada={
          reserva?.anticipo_monto && parseFloat(String(reserva.anticipo_monto)) > 0
            ? `$${parseFloat(String(reserva.anticipo_monto)).toLocaleString('es-AR')}`
            : null
        }
        loading={cancelando}
        onConfirm={handleCancelar}
      />
    </div>
  );
}
