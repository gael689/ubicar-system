import React, { useState } from 'react';
import { Car } from 'lucide-react';
import { useAlquileres } from '@/hooks/useAlquileres';
import { DaniosPreexistentes } from '@/components/flota/DaniosPreexistentes';
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
  const [cargoCheckoutTardio, setCargoCheckoutTardio] = useState('');
  const [motivoCheckoutTardio, setMotivoCheckoutTardio] = useState('');

  const garantia = reserva.garantia_tipo && reserva.garantia_tipo !== 'no_aplica'
    ? reserva.garantia_tipo
    : null;

  // D-17: no hay estado NO_SHOW — si el auto sale más tarde de lo previsto,
  // se ofrece un cargo editable con motivo obligatorio (no automático).
  const inicioPrevisto = new Date(`${reserva.fecha_inicio}T${reserva.hora_inicio}`);
  const checkoutReal = fecha && hora ? new Date(`${fecha}T${hora}`) : null;
  const esCheckoutTardio = !!checkoutReal && checkoutReal > inicioPrevisto;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!km) { setLocalError('Ingrese el kilometraje actual'); return; }
    const cargo = cargoCheckoutTardio ? parseFloat(cargoCheckoutTardio) : 0;
    if (cargo > 0 && !motivoCheckoutTardio.trim()) {
      setLocalError('Cobrar un cargo por checkout tardío requiere un motivo.');
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
              <h2 className="text-lg font-semibold text-foreground">Registrar Check-out</h2>
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
                    {reserva.garantia_tarjeta_numero && ` · **** ${reserva.garantia_tarjeta_numero.slice(-4)}`}
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
            <DaniosPreexistentes vehiculoId={reserva.vehiculo_id} />
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

          {esCheckoutTardio && (
            <div className="space-y-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-800">
                ⚠ El auto sale más tarde de lo previsto (reserva a las {reserva.hora_inicio.slice(0, 5)}). No hay estado de "no-show" — si corresponde, se puede cargar un monto con su motivo.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cargo (opcional)</label>
                  <input
                    type="number" min={0} step={100}
                    value={cargoCheckoutTardio}
                    onChange={e => setCargoCheckoutTardio(e.target.value)}
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

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="tiempo-real"
              checked={registradoEnTiempoReal}
              onChange={e => setRegistradoEnTiempoReal(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="tiempo-real" className="text-sm text-muted-foreground">
              Registrado en tiempo real (no carga retroactiva)
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
            <Car className="h-4 w-4" /> Registrar Check-out
          </button>
        </div>
      </div>
    </div>
  );
}
