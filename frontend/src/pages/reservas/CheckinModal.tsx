import React, { useState, useEffect, useCallback } from 'react';
import { Flag } from 'lucide-react';
import { useAlquileres } from '@/hooks/useAlquileres';
import type { CheckinCreate, DecisionExcedente, PreviewExcedente, Reserva } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagosPendientes } from '@/hooks/usePagos';

const FUEL_LEVELS = [
  { value: 0,   label: 'Vacío',  color: 'bg-red-50 border-red-300 text-red-700' },
  { value: 25,  label: '¼',      color: 'bg-orange-50 border-orange-300 text-orange-700' },
  { value: 50,  label: '½',      color: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
  { value: 75,  label: '¾',      color: 'bg-lime-50 border-lime-300 text-lime-700' },
  { value: 100, label: 'Lleno',  color: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
];

const LIMPIEZA_OPTIONS = [
  { value: 'limpio',                   label: 'Limpio',          icon: '✅' },
  { value: 'sucio',                    label: 'Sucio',           icon: '🟡' },
  { value: 'requiere_lavado_profundo', label: 'Lavado prof.',    icon: '🔴' },
];

const GARANTIA_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
};

interface Props {
  alquilerId: number;
  vehiculoInfo: string;
  clienteNombre: string;
  kmCheckout: number;
  combustibleCheckout?: number;
  garantiaTipo?: string | null;
  garantiaMonto?: string | null;
  reserva: Reserva;
  onClose: () => void;
  onSuccess: () => void;
}

const DECISION_OPTIONS: { value: DecisionExcedente; label: string; desc: string }[] = [
  { value: 'cobrar_completo', label: 'Cobrar completo', desc: 'Aplicar el monto sugerido por el sistema' },
  { value: 'cobrar_parcial',  label: 'Cobrar parcial',  desc: 'Ingresar la cantidad de horas a cobrar' },
  { value: 'no_cobrar',       label: 'No cobrar',       desc: 'Bonificar el excedente (requiere motivo)' },
];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function CheckinModal({
  alquilerId,
  vehiculoInfo,
  clienteNombre,
  kmCheckout,
  combustibleCheckout,
  garantiaTipo,
  garantiaMonto,
  reserva,
  onClose,
  onSuccess,
}: Props) {
  const { checkin, previewExcedente, getAlquiler, loading: alquilerLoading, error } = useAlquileres();
  const { data: pagosPendientes } = usePagosPendientes();

  const [fecha, setFecha] = useState(todayStr());
  const [hora, setHora] = useState(reserva.hora_fin.slice(0, 5));
  const [km, setKm] = useState('');
  const [combustible, setCombustible] = useState(100);
  const [limpieza, setLimpieza] = useState('limpio');
  const [descripcion, setDescripcion] = useState('');
  const [registradoEnTiempoReal, setRegistradoEnTiempoReal] = useState(true);
  const [decision, setDecision] = useState<DecisionExcedente>('cobrar_completo');
  const [horasACobrar, setHorasACobrar] = useState('');
  const [motivo, setMotivo] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewExcedente | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [garantiaEstado, setGarantiaEstado] = useState('devuelta');
  const [garantiaMontoDevuelto, setGarantiaMontoDevuelto] = useState(garantiaMonto ?? '');
  const [cobrarAhora, setCobrarAhora] = useState(false);
  const [pagoMonto, setPagoMonto] = useState<number | ''>('');
  const [pagoMedio, setPagoMedio] = useState('efectivo');
  const [pagoFecha, setPagoFecha] = useState(todayStr());
  const [pagoNotas, setPagoNotas] = useState('');

  const [realKmCheckout, setRealKmCheckout] = useState(kmCheckout);
  const [loadingAlquiler, setLoadingAlquiler] = useState(true);

  const debouncedFecha = useDebounce(fecha, 500);
  const debouncedHora  = useDebounce(hora,  500);

  useEffect(() => {
    getAlquiler(alquilerId).then(alq => {
      setRealKmCheckout(alq.checkout_km);
      setLoadingAlquiler(false);
    }).catch(() => {
      setLoadingAlquiler(false);
    });
  }, [alquilerId, getAlquiler]);

  const fetchPreview = useCallback(async () => {
    if (!debouncedFecha || !debouncedHora) return;
    setLoadingPreview(true);
    try {
      const result = await previewExcedente(alquilerId, debouncedFecha, debouncedHora);
      setPreview(result);
    } catch { /* non-blocking */ } finally {
      setLoadingPreview(false);
    }
  }, [alquilerId, debouncedFecha, debouncedHora, previewExcedente]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  // Calcular saldo financiero
  const precioAlquiler = parseFloat(reserva.precio_total as string) || 0;
  const cargoLate = parseFloat(reserva.cargo_late_checkout as string) || 0;
  const anticipoPagado = parseFloat(reserva.anticipo_monto as string) || 0;
  const pagoPendiente = pagosPendientes?.find(p => p.tipo === 'alquiler_checkout' && p.id_origen === alquilerId);
  const saldoBase = pagoPendiente?.saldo_pendiente || Math.max(0, precioAlquiler + cargoLate - anticipoPagado);

  // Excedente estimado según la decisión actual
  const excedentePorCobrar = (() => {
    if (!preview || preview.dentro_de_gracia) return 0;
    if (decision === 'no_cobrar') return 0;
    if (decision === 'cobrar_completo') return parseFloat(preview.cargo_sugerido.toString());
    if (decision === 'cobrar_parcial' && horasACobrar) {
      return parseFloat(horasACobrar) * parseFloat(preview.tarifa_hora_excedente.toString());
    }
    return 0;
  })();
  const totalACobrarAhora = saldoBase + excedentePorCobrar;

  const formatMoney = (v: string | number | undefined) =>
    v !== undefined ? `$${parseFloat(v.toString()).toLocaleString('es-AR')}` : '$0';

  const hasGarantia = garantiaTipo && garantiaTipo !== 'no_aplica';

  function handleCobrarAhoraChange(checked: boolean) {
    setCobrarAhora(checked);
    if (checked && pagoMonto === '') {
      setPagoMonto(totalACobrarAhora > 0 ? totalACobrarAhora : '');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!km) { setLocalError('Ingrese el kilometraje de llegada'); return; }
    if (parseInt(km) < realKmCheckout) {
      setLocalError(`El KM de llegada (${km}) no puede ser menor al de salida (${realKmCheckout})`);
      return;
    }
    if (decision === 'cobrar_parcial' && !horasACobrar) {
      setLocalError('Ingrese la cantidad de horas a cobrar');
      return;
    }
    if (decision === 'no_cobrar' && !motivo.trim()) {
      setLocalError('Ingrese un motivo para bonificar el excedente');
      return;
    }
    if (cobrarAhora) {
      if (!pagoMonto || pagoMonto <= 0) { setLocalError('Ingrese el monto a cobrar'); return; }
      if (!pagoMedio) { setLocalError('Seleccione el medio de pago'); return; }
      if (!pagoFecha) { setLocalError('Seleccione la fecha de pago'); return; }
    }

    const payload: CheckinCreate = {
      checkin_fecha: fecha,
      checkin_hora: hora + ':00',
      checkin_km: parseInt(km),
      checkin_combustible: combustible,
      checkin_descripcion: descripcion || null,
      checkin_estado_limpieza: limpieza,
      decision_excedente: decision,
      horas_a_cobrar: decision === 'cobrar_parcial' ? parseFloat(horasACobrar) : null,
      motivo_bonificacion: decision === 'no_cobrar' ? motivo : null,
      registrado_en_tiempo_real: registradoEnTiempoReal,
      garantia_estado: garantiaTipo && garantiaTipo !== 'no_aplica' ? garantiaEstado : undefined,
      garantia_monto_devuelto: garantiaEstado === 'ejecutada_parcial' ? parseFloat(garantiaMontoDevuelto as string) : undefined,
      pago_inmediato: cobrarAhora && pagoMonto ? {
        monto: Number(pagoMonto),
        medio_pago: pagoMedio,
        fecha: pagoFecha,
        notas: pagoNotas || null,
      } : undefined,
    };

    try {
      await checkin(alquilerId, payload);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setLocalError(detail?.message || (typeof detail === 'string' ? detail : 'Error al registrar check-in'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-background border border-border shadow-2xl">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-foreground">Registrar Check-in</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{vehiculoInfo} · {clienteNombre}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Fecha y hora */}
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Hora * <span className="normal-case font-normal text-muted-foreground">(pactada: {reserva.hora_fin.slice(0, 5)})</span>
              </label>
              <input
                type="time"
                value={hora}
                onChange={e => setHora(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
          </div>

          {/* Resumen financiero */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumen financiero</h3>
            </div>
            <div className="p-4 space-y-2 bg-background">
              <div className="flex justify-between text-sm text-foreground">
                <span className="text-muted-foreground">Precio alquiler</span>
                <span>{formatMoney(reserva.precio_total ?? 0)}</span>
              </div>
              {cargoLate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Cargo late checkout</span>
                  <span className="text-amber-600">+{formatMoney(cargoLate)}</span>
                </div>
              )}
              {anticipoPagado > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-success">Anticipo pagado</span>
                  <span className="text-success">-{formatMoney(anticipoPagado)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-foreground pt-2 border-t border-border">
                <span>Saldo base pendiente</span>
                <span className={saldoBase > 0 ? 'text-danger' : 'text-success'}>
                  {formatMoney(saldoBase)}
                </span>
              </div>
              {excedentePorCobrar > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>+ Excedente (estimado)</span>
                  <span>{formatMoney(excedentePorCobrar)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Preview excedente */}
          <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview excedente</span>
              {loadingPreview && (
                <div className="animate-spin w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full" />
              )}
            </div>
            {preview ? (
              preview.dentro_de_gracia ? (
                <div className="flex items-center gap-2 text-success text-sm">
                  <span>✅</span>
                  <span>Dentro del período de gracia (40 min) — Sin cargo adicional</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {preview.aplica_dia_completo ? (
                    <div className="text-amber-600 text-sm font-medium">
                      ⚠️ Excedente de {preview.horas_excedidas}h → Se cobra {preview.dias_completos_cobrados} día(s) completo(s)
                    </div>
                  ) : (
                    <div className="text-amber-600 text-sm font-medium">
                      🕐 Excedente de {preview.horas_excedidas}h cobradas
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 text-xs text-center">
                    <div className="rounded-lg bg-muted p-2">
                      <div className="text-muted-foreground">Cargo/hora</div>
                      <div className="text-foreground font-semibold">{formatMoney(preview.tarifa_hora_excedente)}</div>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <div className="text-muted-foreground">Horas excedidas</div>
                      <div className="text-foreground font-semibold">{preview.horas_excedidas}h</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <div className="text-amber-700">Cargo sugerido</div>
                      <div className="text-amber-800 font-bold">{formatMoney(preview.cargo_sugerido)}</div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="text-xs text-muted-foreground">Selecciona fecha/hora para ver el preview</div>
            )}
          </div>

          {/* KM llegada */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              KM devolución * (salida: {loadingAlquiler ? '...' : realKmCheckout})
            </label>
            <input
              type="number"
              value={km}
              onChange={e => setKm(e.target.value)}
              min={realKmCheckout}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>

          {/* Combustible */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Combustible devolución *
              {combustibleCheckout != null && combustible < combustibleCheckout && (
                <span className="ml-2 text-amber-600 normal-case">⚠️ Menos que la salida</span>
              )}
            </label>
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

          {/* Limpieza */}
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

          {/* Resolución de garantía */}
          {hasGarantia && (
            <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resolver garantía</label>
                <span className="text-xs text-muted-foreground">
                  {GARANTIA_LABEL[garantiaTipo!] ?? garantiaTipo}
                  {garantiaMonto && ` · $${parseFloat(garantiaMonto).toLocaleString('es-AR')}`}
                </span>
              </div>
              <div className="flex gap-2">
                {[
                  { value: 'devuelta',          label: 'Devuelta',          icon: '✅' },
                  { value: 'ejecutada_parcial',  label: 'Retención parcial', icon: '⚠️' },
                  { value: 'retenida',           label: 'Retenida',          icon: '🔒' },
                ].map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGarantiaEstado(g.value)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                      garantiaEstado === g.value
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-muted border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {g.icon} {g.label}
                  </button>
                ))}
              </div>
              {garantiaEstado === 'ejecutada_parcial' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Monto a devolver</label>
                  <input
                    type="number"
                    value={garantiaMontoDevuelto}
                    onChange={e => setGarantiaMontoDevuelto(e.target.value)}
                    min={0}
                    placeholder="ej: 30000"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}
            </div>
          )}

          {/* Decisión de cobro de excedente */}
          {preview && !preview.dentro_de_gracia && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Decisión de cobro de excedente *</label>
              <div className="space-y-2">
                {DECISION_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      decision === opt.value
                        ? 'bg-primary/5 border-primary/40'
                        : 'bg-muted/30 border-border hover:border-primary/20'
                    }`}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      checked={decision === opt.value}
                      onChange={() => setDecision(opt.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              {decision === 'cobrar_parcial' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horas a cobrar *</label>
                  <input
                    type="number"
                    value={horasACobrar}
                    onChange={e => setHorasACobrar(e.target.value)}
                    min={0.5}
                    max={preview.horas_excedidas}
                    step={0.5}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={`Máx: ${preview.horas_excedidas}`}
                  />
                </div>
              )}
              {decision === 'no_cobrar' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motivo de bonificación *</label>
                  <input
                    type="text"
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Ej: Cliente frecuente, error del sistema..."
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Registrar cobro ahora */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cobrarAhora}
                  onChange={e => handleCobrarAhoraChange(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Cobrar al cliente ahora
                  {totalACobrarAhora > 0 && (
                    <span className="ml-2 normal-case font-medium text-muted-foreground">
                      (total: {formatMoney(totalACobrarAhora)})
                    </span>
                  )}
                </span>
              </label>
            </div>
            {cobrarAhora && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-background">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Monto ($) *</label>
                  <input
                    type="number"
                    value={pagoMonto}
                    onChange={e => setPagoMonto(parseFloat(e.target.value) || '')}
                    min={0}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Medio de pago *</label>
                  <select
                    value={pagoMedio}
                    onChange={e => setPagoMedio(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="cheque">Cheque</option>
                    <option value="echeq">Echeq</option>
                    <option value="cuenta_corriente">Cuenta Corriente</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Fecha del cobro *</label>
                  <input
                    type="date"
                    value={pagoFecha}
                    onChange={e => setPagoFecha(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
                  <input
                    type="text"
                    value={pagoNotas}
                    onChange={e => setPagoNotas(e.target.value)}
                    placeholder="Ej: Efectivo en mano"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observaciones</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Estado del vehículo al devolver..."
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="tiempo-real-ci"
              checked={registradoEnTiempoReal}
              onChange={e => setRegistradoEnTiempoReal(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="tiempo-real-ci" className="text-sm text-muted-foreground">
              Registrado en tiempo real
            </label>
          </div>

          {(error || localError) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              ❌ {localError || error}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={alquilerLoading}
            className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {alquilerLoading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
            <Flag className="h-4 w-4" /> Registrar Check-in
          </button>
        </div>
      </div>
    </div>
  );
}
