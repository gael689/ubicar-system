import React, { useState } from 'react';
import { Car } from 'lucide-react';
import { useAlquileres } from '@/hooks/useAlquileres';
import { DaniosPreexistentes } from '@/components/flota/DaniosPreexistentes';
import { InputMoneda } from '@/components/shared/InputMoneda';
import { formatMiles } from '@/lib/utils';
import type { Reserva } from '@/types';

interface Props {
  reserva: Reserva;
  onClose: () => void;
  onSuccess: () => void;
  defaultTime?: string;
  defaultDate?: string;
}

const FUEL_LEVELS = [
  { value: 0,   label: 'Vacío',  color: 'bg-red-50 border-red-300 text-red-700' },
  { value: 25,  label: '¼',      color: 'bg-orange-50 border-orange-300 text-orange-700' },
  { value: 50,  label: '½',      color: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
  { value: 75,  label: '¾',      color: 'bg-lime-50 border-lime-300 text-lime-700' },
  { value: 100, label: 'Lleno',  color: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
];

const LIMPIEZA_OPTIONS = [
  { value: 'limpio',                   label: 'Limpio',          icon: '✅' },
  { value: 'sucio',                    label: 'Sucio normal',    icon: '🟡' },
  { value: 'requiere_lavado_profundo', label: 'Lavado profundo', icon: '🔴' },
];

const GARANTIA_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
};

export function CheckoutModal({ reserva, onClose, onSuccess, defaultTime, defaultDate }: Props) {
  const { checkout, loading, error } = useAlquileres();

  const [fecha, setFecha] = useState(defaultDate || reserva.fecha_inicio);
  const [hora, setHora] = useState(defaultTime || reserva.hora_inicio.slice(0, 5));
  const [km, setKm] = useState(reserva.vehiculo?.km_actual?.toString() || '');
  const [combustible, setCombustible] = useState(100);
  const [limpieza, setLimpieza] = useState('limpio');
  const [descripcion, setDescripcion] = useState('');
  const [registradoEnTiempoReal, setRegistradoEnTiempoReal] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cargoCheckoutTardio, setCargoCheckoutTardio] = useState<number | ''>('');
  const [motivoCheckoutTardio, setMotivoCheckoutTardio] = useState('');

  // ── Cobrar al entregar ────────────────────────────────────────────────
  //
  // **El backend acepta `pago_inmediato` en el check-out desde siempre y esta
  // pantalla nunca lo ofreció.** Por eso *"puse contado al momento del
  // check-out"* no dejaba registro de plata en ningún lado: la condición de
  // pago decía cuándo correspondía cobrar, pero no había dónde decir que se
  // cobró. El operador tenía que acordarse de ir a Caja después.
  //
  // Arranca apagado: entregar el auto y cobrar son dos hechos, y forzar el
  // segundo haría que alguien lo tilde sin mirar.
  const [cobrarAhora, setCobrarAhora] = useState(false);
  const [pagoMonto, setPagoMonto] = useState<number | ''>('');
  const [pagoMedio, setPagoMedio] = useState('efectivo');
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().split('T')[0]);
  // D-34: el contrato no bloquea la entrega, pero si el auto sale sin firmar
  // el motivo es obligatorio y queda constancia visible en la ficha.
  const [motivoSinContrato, setMotivoSinContrato] = useState('');

  const garantia = reserva.garantia_tipo && reserva.garantia_tipo !== 'no_aplica'
    ? reserva.garantia_tipo
    : null;

  // D-17: no hay estado NO_SHOW — si el auto sale más tarde de lo previsto,
  // se ofrece un cargo editable con motivo obligatorio (no automático).
  // Todo lo que la reserva factura. Los adicionales y el cargo por late
  // check-in viven **fuera** de `precio_total` (ver `Reserva.total_adicionales`
  // en el backend): un saldo calculado sólo contra `precio_total` cobra de menos.
  const totalReserva =
    Number(reserva.precio_total ?? 0)
    + Number(reserva.cargo_late_checkout ?? 0)
    + Number(reserva.total_adicionales ?? 0);
  const yaCobrado = Number(reserva.anticipo_monto ?? 0);
  const saldoAlEntregar = Math.max(0, totalReserva - yaCobrado);

  const inicioPrevisto = new Date(`${reserva.fecha_inicio}T${reserva.hora_inicio}`);
  const checkoutReal = fecha && hora ? new Date(`${fecha}T${hora}`) : null;
  const esCheckoutTardio = !!checkoutReal && checkoutReal > inicioPrevisto;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!km) { setLocalError('Ingrese el kilometraje actual'); return; }
    const cargo = cargoCheckoutTardio === '' ? 0 : Number(cargoCheckoutTardio);
    if (cargo > 0 && !motivoCheckoutTardio.trim()) {
      setLocalError('Cobrar un cargo por entregar más tarde requiere un motivo.');
      return;
    }
    if (cobrarAhora && (pagoMonto === '' || Number(pagoMonto) <= 0)) {
      setLocalError('Ingresá el monto que estás cobrando.');
      return;
    }

    try {
      await checkout(reserva.id, {
        checkout_fecha: fecha,
        checkout_hora: hora + ':00',
        checkout_km: parseInt(km),
        checkout_combustible: combustible,
        checkout_descripcion: descripcion || null,
        registrado_en_tiempo_real: registradoEnTiempoReal,
        checkout_estado_limpieza: limpieza,
        cargo_checkout_tardio: cargo,
        motivo_checkout_tardio: cargo > 0 ? motivoCheckoutTardio.trim() : null,
        motivo_sin_contrato: motivoSinContrato.trim() || null,
        pago_inmediato: cobrarAhora && pagoMonto !== '' ? {
          monto: Number(pagoMonto),
          medio_pago: pagoMedio,
          fecha: pagoFecha,
          notas: 'Cobro al entregar el auto',
        } : undefined,
      });
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setLocalError(detail?.message || (typeof detail === 'string' ? detail : 'Error al registrar check-out'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-background border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
          <div>
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Entregar el vehículo</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reserva #{reserva.id} · {reserva.vehiculo?.patente} · {reserva.cliente?.nombre_completo}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {garantia && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
              <span className="text-lg mt-0.5">🔒</span>
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Garantía registrada en reserva</p>
                <p className="text-sm text-foreground font-medium">
                  {GARANTIA_LABEL[garantia] ?? garantia}
                  {reserva.garantia_monto && ` · $${parseFloat(reserva.garantia_monto).toLocaleString('es-AR')}`}
                </p>
                {reserva.garantia_tarjeta_titular && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {reserva.garantia_tarjeta_titular}
                    {reserva.garantia_tarjeta_ultimos4 && ` · **** ${reserva.garantia_tarjeta_ultimos4}`}
                  </p>
                )}
                {/* Qué va a pasar con la plata. Antes el operador veía el monto
                    pactado y nada más: la garantía en efectivo se guardaba en el
                    cajón y el sistema no lo sabía, así que al cerrar el día ese
                    efectivo estaba de más y nadie podía explicar por qué. */}
                {(garantia === 'efectivo' || garantia === 'transferencia') && reserva.garantia_monto && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Entra a la caja de hoy como garantía retenida. No es un cobro:
                    no le suma deuda al cliente y se le devuelve al cerrar el alquiler.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha *</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hora *</label>
              <input
                type="time"
                value={hora}
                onChange={e => setHora(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Kilometraje de salida *
              {reserva.vehiculo?.km_actual != null && (
                <span className="ml-2 normal-case font-normal text-muted-foreground">
                  (registrado: {reserva.vehiculo.km_actual.toLocaleString('es-AR')} km)
                </span>
              )}
            </label>
            <input
              type="number"
              value={km}
              onChange={e => setKm(e.target.value)}
              min={0}
              placeholder="ej: 45000"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nivel de combustible *</label>
            <div className="flex gap-2">
              {FUEL_LEVELS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setCombustible(f.value)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                    combustible === f.value
                      ? f.color + ' scale-105 shadow-sm'
                      : 'bg-muted border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado de limpieza</label>
            <div className="flex gap-2">
              {LIMPIEZA_OPTIONS.map(l => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLimpieza(l.value)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    limpieza === l.value
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <span>{l.icon}</span> {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado del vehículo</label>
            {reserva.vehiculo_id && <DaniosPreexistentes vehiculoId={reserva.vehiculo_id} />}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observaciones</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Estado del vehículo al entregarse al cliente..."
            />
          </div>

          {/* D-34 · Entrega sin contrato. No se bloquea —el día que falle el
              PDF o se corte internet el negocio no se para— pero se advierte
              fuerte y el motivo queda registrado y visible después. */}
          <div className="space-y-2 rounded-xl bg-warning p-3 text-white">
            <p className="text-xs font-semibold">
              ¿El cliente ya firmó el contrato?
            </p>
            <p className="text-xs">
              Si el auto sale sin contrato firmado, escribí el motivo. Se puede entregar igual,
              pero queda registrado en la ficha del alquiler hasta que se firme.
            </p>
            <input
              type="text"
              value={motivoSinContrato}
              onChange={e => setMotivoSinContrato(e.target.value)}
              placeholder="Dejar vacío si ya está firmado. Ej: se firma al volver, impresora sin papel"
              className="w-full px-3 py-2 rounded-lg border border-white/40 bg-white/95 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>

          {esCheckoutTardio && (
            <div className="space-y-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-800">
                ⚠ El auto sale más tarde de lo previsto (reserva a las {reserva.hora_inicio.slice(0, 5)}). No hay estado de "no-show" — si corresponde, se puede cargar un monto con su motivo.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cargo (opcional)</label>
                  <InputMoneda
                    value={cargoCheckoutTardio}
                    onChange={setCargoCheckoutTardio}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Motivo (obligatorio si hay cargo)</label>
                  <input
                    type="text"
                    value={motivoCheckoutTardio}
                    onChange={e => setMotivoCheckoutTardio(e.target.value)}
                    placeholder="Ej: vuelo demorado, no es responsabilidad nuestra"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── ¿Se cobra al entregar? ────────────────────────────────

              **Este bloque no existía**, y el backend acepta el cobro en el
              check-out desde siempre. Por eso *"puse contado al momento del
              check-out"* no dejaba plata registrada en ningún lado: la reserva
              decía cuándo correspondía cobrar, pero no había dónde decir que se
              había cobrado, y había que acordarse de ir a Caja después.

              Arranca apagado a propósito: entregar y cobrar son dos hechos
              distintos, y prender esto por default haría que se confirme sin
              mirar. */}
          {saldoAlEntregar > 0 && (
            <div className="rounded-xl border border-warning overflow-hidden">
              <div className="bg-warning px-4 py-2.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cobrarAhora}
                    onChange={e => {
                      setCobrarAhora(e.target.checked);
                      if (e.target.checked && pagoMonto === '') setPagoMonto(saldoAlEntregar);
                    }}
                    className="w-4 h-4 accent-white"
                  />
                  <span className="text-sm font-semibold text-white">
                    Cobrar ahora — quedan ${formatMiles(saldoAlEntregar)} pendientes
                  </span>
                </label>
              </div>
              {cobrarAhora && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-background">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Monto *</label>
                    <InputMoneda
                      value={pagoMonto}
                      onChange={setPagoMonto}
                      placeholder={String(saldoAlEntregar)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Medio *</label>
                    <select
                      value={pagoMedio}
                      onChange={e => setPagoMedio(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="mercado_pago">Mercado Pago</option>
                      <option value="wapa">Wapa</option>
                      <option value="cheque">Cheque</option>
                      <option value="echeq">E-cheq</option>
                      {/* "Se lo anotamos en la cuenta" **no es un cobro**: deja
                          la constancia de la decisión pero no baja la deuda.
                          Ver `caja_service.es_plata_que_entro`. */}
                      <option value="cuenta_corriente">Anotar en la cuenta</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Fecha *</label>
                    <input
                      type="date"
                      value={pagoFecha}
                      onChange={e => setPagoFecha(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {saldoAlEntregar <= 0 && totalReserva > 0 && (
            <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
              Ya está todo cobrado (${formatMiles(yaCobrado)}). No queda saldo al entregar.
            </p>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="tiempo-real"
              checked={registradoEnTiempoReal}
              onChange={e => setRegistradoEnTiempoReal(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="tiempo-real" className="text-sm text-muted-foreground">
              Se está entregando ahora (no es una carga de algo que ya pasó)
            </label>
          </div>

          {(error || localError) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              ❌ {localError || error}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 sticky bottom-0 bg-background">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
            <Car className="h-4 w-4" /> Entregar el vehículo
          </button>
        </div>
      </div>
    </div>
  );
}
