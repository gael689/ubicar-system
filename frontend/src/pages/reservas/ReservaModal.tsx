import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, AlertTriangle, Calendar, MapPin, Clock, CreditCard, Sparkles } from 'lucide-react';
import { CurrencyDollarIcon, CreditCardIcon as HeroCreditCardIcon, ClockIcon as HeroClockIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { useReservas } from '@/hooks/useReservas';
import { useVehiculos } from '@/hooks/useVehiculos';
import { useClientes } from '@/hooks/useClientes';
import api from '@/lib/api';
import type { Reserva, ReservaCreate, ReservaUpdate, SolapeWarning, Tarifa, ApiResponse } from '@/types';

interface Props {
  reserva?: Reserva;
  initialVehiculoId?: number;
  initialFechaInicio?: string;
  onClose: () => void;
  onSuccess: (reserva: Reserva, warnings: SolapeWarning[]) => void;
}

const GARANTIA_TIPOS = [
  { value: 'no_aplica',     label: 'Sin garantía' },
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'tarjeta',       label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
];

function formatTime(t: string) { return t.slice(0, 5); }
function today() { return new Date().toISOString().split('T')[0]; }

export function ReservaModal({ reserva, initialVehiculoId, initialFechaInicio, onClose, onSuccess }: Props) {
  const isEdit = !!reserva;
  const { createReserva, updateReserva, loading, error } = useReservas();

  const { data: vehiculosData } = useVehiculos({ incluir_inactivos: false, page_size: 100 });
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const { data: clientesData } = useClientes({ q: clientSearch || undefined, page_size: 100 });

  const [vehiculoId, setVehiculoId]           = useState(reserva?.vehiculo_id?.toString() ?? initialVehiculoId?.toString() ?? '');
  const [clienteId, setClienteId]             = useState(reserva?.cliente_id?.toString() ?? '');
  const [fechaInicio, setFechaInicio]         = useState(reserva?.fecha_inicio ?? initialFechaInicio ?? today());
  const [horaInicio, setHoraInicio]           = useState(reserva ? formatTime(reserva.hora_inicio) : '10:00');
  const [fechaFin, setFechaFin]               = useState(reserva?.fecha_fin ?? '');
  // D-18: el auto se devuelve a la misma hora en que se entrega — hora_fin se
  // deriva de hora_inicio, no es un campo libre. La única excepción es un
  // "late checkout acordado" (más abajo), que define hora_devolucion_acordada.
  const horaFin = horaInicio;
  const [lugarEntrega, setLugarEntrega]       = useState(reserva?.lugar_entrega ?? '');
  const [lugarDevolucion, setLugarDevolucion] = useState(reserva?.lugar_devolucion ?? '');
  const [notas, setNotas]                     = useState(reserva?.notas ?? '');
  const [lateCheckout, setLateCheckout]       = useState(reserva?.late_checkout ?? false);
  const [horaDevolucionAcordada, setHoraDevolucionAcordada] = useState(
    reserva?.hora_devolucion_acordada ? formatTime(reserva.hora_devolucion_acordada) : ''
  );
  const [cargoLateCheckout, setCargoLateCheckout] = useState(reserva ? parseFloat(reserva.cargo_late_checkout) : 0);

  // Garantía
  const [garantiaTipo, setGarantiaTipo]                   = useState(reserva?.garantia_tipo ?? 'no_aplica');
  const [garantiaMonto, setGarantiaMonto]                 = useState(reserva?.garantia_monto ?? '');
  const [garantiaTarjetaNumero, setGarantiaTarjetaNumero] = useState(reserva?.garantia_tarjeta_numero ?? '');
  const [garantiaTarjetaVenc, setGarantiaTarjetaVenc]     = useState(reserva?.garantia_tarjeta_vencimiento ?? '');
  const [garantiaTarjetaTitular, setGarantiaTarjetaTitular] = useState(reserva?.garantia_tarjeta_titular ?? '');

  // Pago
  const [formaPagoPrevista, setFormaPagoPrevista] = useState(reserva?.forma_pago_prevista ?? '');
  const [estadoPago, setEstadoPago]               = useState(reserva?.estado_pago ?? 'pendiente');
  const [anticipoMonto, setAnticipoMonto]         = useState(reserva?.anticipo_monto ?? '');
  const [anticipoFecha, setAnticipoFecha]         = useState(reserva?.anticipo_fecha ?? today());
  const [anticipoMedioPago, setAnticipoMedioPago] = useState(reserva?.anticipo_medio_pago ?? '');

  const [warnings, setWarnings]     = useState<SolapeWarning[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const filteredClientes = useMemo(() => (clientesData?.data ?? []).filter(c => c.activo), [clientesData]);

  useEffect(() => {
    if (reserva && !clientSearch && reserva.cliente?.nombre_completo) {
      setClientSearch(reserva.cliente.nombre_completo);
    }
  }, [reserva]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectCliente = (id: string, nombre: string) => {
    setClienteId(id);
    setClientSearch(nombre);
    setClientDropdownOpen(false);
  };

  const duracionDias = fechaInicio && fechaFin
    ? Math.max(0, (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000)
    : 0;

  // Precio
  const initialPrecioTotal  = reserva?.precio_total ? parseFloat(reserva.precio_total as string) : 0;
  const initialPrecioPorDia = duracionDias > 0 && initialPrecioTotal ? initialPrecioTotal / duracionDias : 0;

  const [precioTotal, setPrecioTotal]   = useState<number | ''>(initialPrecioTotal || '');
  const [precioPorDia, setPrecioPorDia] = useState<number | ''>(initialPrecioPorDia || '');
  const lastEditedRef = useRef<'dia' | 'total'>('dia');

  // Tarifas del vehículo seleccionado
  const { data: tarifasData } = useQuery({
    queryKey: ['tarifas', vehiculoId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Tarifa[]>>(`/vehiculos/${vehiculoId}/tarifas`);
      return res.data.data;
    },
    enabled: !!vehiculoId,
    staleTime: 60_000,
  });

  // Verificar si el vehículo tiene check-out pendiente (activo = auto fue entregado pero no devuelto)
  const vehiculosActivos = (vehiculosData?.data ?? []).filter(
    v => v.activo && ['disponible', 'reservado', 'en_transicion', 'alquilado'].includes(v.estado)
  );
  const vehiculoSeleccionado = vehiculosActivos.find(v => v.id.toString() === vehiculoId);
  const tieneCheckoutPendiente = vehiculoSeleccionado?.estado === 'alquilado';

  useEffect(() => {
    if (duracionDias > 0) {
      if (lastEditedRef.current === 'dia' && precioPorDia !== '') {
        setPrecioTotal(precioPorDia * duracionDias);
      } else if (lastEditedRef.current === 'total' && precioTotal !== '') {
        setPrecioPorDia(precioTotal / duracionDias);
      }
    } else {
      setPrecioTotal('');
      setPrecioPorDia('');
    }
  }, [duracionDias]);

  const handlePrecioPorDiaChange = (val: string) => {
    lastEditedRef.current = 'dia';
    if (val === '') { setPrecioPorDia(''); setPrecioTotal(''); return; }
    const num = parseFloat(val);
    setPrecioPorDia(num);
    if (duracionDias > 0) setPrecioTotal(num * duracionDias);
  };

  const handlePrecioTotalChange = (val: string) => {
    lastEditedRef.current = 'total';
    if (val === '') { setPrecioTotal(''); setPrecioPorDia(''); return; }
    const num = parseFloat(val);
    setPrecioTotal(num);
    if (duracionDias > 0) setPrecioPorDia(num / duracionDias);
  };

  const aplicarTarifa = (tarifa: Tarifa) => {
    const montoDia = parseFloat(tarifa.monto);
    lastEditedRef.current = 'dia';
    setPrecioPorDia(montoDia);
    if (duracionDias > 0) setPrecioTotal(montoDia * duracionDias);
  };

  const tipoRecomendado = duracionDias > 0
    ? (duracionDias < 7 ? 'diaria' : duracionDias < 30 ? 'semanal' : 'mensual')
    : null;
  const tarifasDisponibles = (tarifasData ?? []).filter(t => t.activo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setWarnings([]);

    if (!vehiculoId || !clienteId || !fechaInicio || !fechaFin) {
      setLocalError('Complete todos los campos requeridos (Vehículo, Cliente, Fechas).');
      return;
    }
    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      setLocalError('La fecha de fin debe ser posterior a la de inicio');
      return;
    }
    if (!precioTotal) {
      setLocalError('La cotización es obligatoria. Ingrese el precio total o por día.');
      return;
    }
    if (garantiaTipo !== 'no_aplica' && !garantiaMonto) {
      setLocalError('Ingrese el monto de garantía.');
      return;
    }
    if (estadoPago === 'anticipo') {
      if (!anticipoMonto || !anticipoFecha || !anticipoMedioPago) {
        setLocalError('Si hubo un anticipo, complete el monto, fecha y medio de pago.');
        return;
      }
      if (parseFloat(anticipoMonto as string) >= parseFloat(precioTotal as string)) {
        setLocalError('El anticipo debe ser menor al precio total. Si abonó el total, seleccione "Abonó el total".');
        return;
      }
    }
    if (estadoPago === 'pagado') {
      if (!anticipoFecha || !anticipoMedioPago) {
        setLocalError('Si abonó el total, complete la fecha y medio de pago.');
        return;
      }
    }

    try {
      if (isEdit) {
        const payload: ReservaUpdate = {
          vehiculo_id: parseInt(vehiculoId),
          fecha_inicio: fechaInicio,
          hora_inicio: horaInicio + ':00',
          fecha_fin: fechaFin,
          hora_fin: horaFin + ':00',
          lugar_entrega: lugarEntrega,
          lugar_devolucion: lugarDevolucion,
          notas: notas || null,
          precio_total: precioTotal || null,
          forma_pago_prevista: formaPagoPrevista || null,
          estado_pago: estadoPago,
          anticipo_monto: estadoPago === 'anticipo' ? parseFloat(anticipoMonto as string) : (estadoPago === 'pagado' ? parseFloat(precioTotal as string) : null),
          anticipo_fecha: estadoPago !== 'pendiente' ? anticipoFecha : null,
          anticipo_medio_pago: estadoPago !== 'pendiente' ? anticipoMedioPago : null,
        };
        const r = await updateReserva(reserva!.id, payload);
        onSuccess(r, []);
      } else {
        const payload: ReservaCreate = {
          vehiculo_id: parseInt(vehiculoId),
          cliente_id: parseInt(clienteId),
          fecha_inicio: fechaInicio,
          hora_inicio: horaInicio + ':00',
          fecha_fin: fechaFin,
          hora_fin: horaFin + ':00',
          lugar_entrega: lugarEntrega,
          lugar_devolucion: lugarDevolucion,
          notas: notas || null,
          late_checkout: lateCheckout,
          hora_devolucion_acordada: lateCheckout && horaDevolucionAcordada ? horaDevolucionAcordada + ':00' : null,
          cargo_late_checkout: lateCheckout ? cargoLateCheckout : 0,
          precio_total: precioTotal || null,
          garantia_tipo: garantiaTipo !== 'no_aplica' ? garantiaTipo : null,
          garantia_monto: garantiaTipo !== 'no_aplica' && garantiaMonto ? parseFloat(garantiaMonto as string) : null,
          garantia_tarjeta_numero: garantiaTipo === 'tarjeta' ? garantiaTarjetaNumero || null : null,
          garantia_tarjeta_vencimiento: garantiaTipo === 'tarjeta' ? garantiaTarjetaVenc || null : null,
          garantia_tarjeta_titular: garantiaTipo === 'tarjeta' ? garantiaTarjetaTitular || null : null,
          forma_pago_prevista: formaPagoPrevista || null,
          estado_pago: estadoPago,
          anticipo_monto: estadoPago === 'anticipo' ? parseFloat(anticipoMonto as string) : (estadoPago === 'pagado' ? parseFloat(precioTotal as string) : null),
          anticipo_fecha: estadoPago !== 'pendiente' ? anticipoFecha : null,
          anticipo_medio_pago: estadoPago !== 'pendiente' ? anticipoMedioPago : null,
        };
        const { reserva: r, warnings: w } = await createReserva(payload);
        if (w.length > 0) setWarnings(w);
        onSuccess(r, w);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.code === 'solapamiento') {
        setLocalError(detail.message);
      } else {
        setLocalError(typeof detail === 'string' ? detail : 'Error al guardar la reserva');
      }
    }
  }

  const TIPO_TARIFA_LABEL: Record<string, string> = { diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">
            {isEdit ? 'Editar Reserva' : 'Nueva Reserva'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="reserva-form" onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Alerta check-out pendiente */}
          {tieneCheckoutPendiente && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Check-out pendiente:</span> este vehículo tiene un alquiler activo sin devolución registrada.
                La nueva reserva se creará de todas formas, pero verificá el estado.
              </p>
            </div>
          )}

          {/* Vehículo y Cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Vehículo *</label>
              <select
                value={vehiculoId}
                onChange={e => setVehiculoId(e.target.value)}
                disabled={isEdit}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:bg-slate-100 disabled:text-slate-500"
                required
              >
                <option value="">Seleccionar vehículo...</option>
                {vehiculosActivos.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.patente} - {v.marca} {v.modelo}
                    {v.estado === 'alquilado' ? ' ⚠️' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5" ref={dropdownRef}>
              <label className="text-sm font-semibold text-slate-700">Cliente *</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, DNI o CUIT..."
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setClienteId(''); setClientDropdownOpen(true); }}
                  onFocus={() => setClientDropdownOpen(true)}
                  disabled={isEdit}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:bg-slate-100"
                />
                {clientDropdownOpen && !isEdit && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                    {filteredClientes.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500 text-center">No se encontraron clientes</div>
                    ) : (
                      <ul className="py-1">
                        {filteredClientes.map(c => (
                          <li
                            key={c.id}
                            className="px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 cursor-pointer"
                            onClick={() => selectCliente(c.id.toString(), c.nombre_completo)}
                          >
                            <div className="font-medium">{c.nombre_completo}</div>
                            {c.dni_cuit && <div className="text-xs text-slate-500">DNI/CUIT: {c.dni_cuit}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Inicio *
              </label>
              <div className="flex gap-2">
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" required />
                <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                  className="w-24 px-2 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Fin *
                {duracionDias > 0 && <span className="text-indigo-600 font-normal">({duracionDias} días)</span>}
              </label>
              <div className="flex gap-2">
                <input type="date" value={fechaFin} min={fechaInicio} onChange={e => setFechaFin(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" required />
                <input type="time" value={horaFin} disabled title="Se devuelve a la misma hora en que se entrega"
                  className="w-24 px-2 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-sm cursor-not-allowed" />
              </div>
              <p className="text-xs text-slate-400">Misma hora que la entrega. Si acuerdan una devolución más tarde, activá "Late Checkout acordado" abajo.</p>
            </div>
          </div>

          {/* Lugares */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Lugar de entrega *
              </label>
              <input type="text" value={lugarEntrega} onChange={e => setLugarEntrega(e.target.value)}
                placeholder="Oficina, Aeropuerto, etc."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Lugar de devolución *
              </label>
              <input type="text" value={lugarDevolucion} onChange={e => setLugarDevolucion(e.target.value)}
                placeholder="Oficina, Hotel, etc."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" required />
            </div>
          </div>

          {/* Cotización y Pago OBLIGATORIA */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <CurrencyDollarIcon className="w-5 h-5 text-indigo-600" /> Cotización y Pago *
            </h3>

            {/* Tarifas seleccionables */}
            {vehiculoId && tarifasDisponibles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Tarifas del vehículo — click para aplicar:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tarifasDisponibles.map(t => {
                    const esRecomendada = tipoRecomendado === t.tipo;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => aplicarTarifa(t)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                          esRecomendada
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-800 shadow-sm'
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200'
                        }`}
                      >
                        {TIPO_TARIFA_LABEL[t.tipo]}: ${parseFloat(t.monto).toLocaleString('es-AR')}/día
                        {esRecomendada && <span className="ml-0.5 text-indigo-600">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {!tipoRecomendado && (
                  <p className="text-xs text-slate-400 italic">Configure las fechas para ver la tarifa recomendada.</p>
                )}
              </div>
            )}
            {vehiculoId && tarifasDisponibles.length === 0 && tarifasData !== undefined && (
              <p className="text-xs text-slate-400 italic">Este vehículo no tiene tarifas cargadas.</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio x Día ($) *</label>
                <input
                  type="number"
                  value={precioPorDia === '' ? '' : precioPorDia}
                  onChange={e => handlePrecioPorDiaChange(e.target.value)}
                  min={0} step={100}
                  placeholder="Ej: 35000"
                  className={`w-full px-3 py-2 rounded-lg border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    localError?.includes('cotización') && precioTotal === '' ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
                  }`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio Total ($) *</label>
                <input
                  type="number"
                  value={precioTotal === '' ? '' : precioTotal}
                  onChange={e => handlePrecioTotalChange(e.target.value)}
                  min={0} step={100}
                  placeholder="Ej: 140000"
                  className={`w-full px-3 py-2 rounded-lg border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    localError?.includes('cotización') && precioTotal === '' ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
                  }`}
                />
              </div>
            </div>
            {duracionDias === 0 && (
              <p className="text-xs text-slate-500 italic">Configure las fechas para calcular la cotización.</p>
            )}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Forma de pago esperada (opcional)</label>
                <div className="flex gap-2 flex-wrap">
                  {['efectivo', 'transferencia', 'tarjeta', 'cheque', 'echeq', 'cuenta_corriente'].map(m => (
                    <button
                      key={m} type="button"
                      onClick={() => setFormaPagoPrevista(m === formaPagoPrevista ? '' : m)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        formaPagoPrevista === m ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {m.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="text-xs font-medium text-slate-600">¿El cliente ya abonó algo?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="radio" checked={estadoPago === 'pendiente'} onChange={() => setEstadoPago('pendiente')} className="accent-indigo-600" />
                    No, está pendiente
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="radio" checked={estadoPago === 'anticipo'} onChange={() => setEstadoPago('anticipo')} className="accent-indigo-600" />
                    Abonó un anticipo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="radio" checked={estadoPago === 'pagado'} onChange={() => setEstadoPago('pagado')} className="accent-indigo-600" />
                    Abonó el total
                  </label>
                </div>
              </div>

              {estadoPago !== 'pendiente' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {estadoPago === 'anticipo' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Monto anticipo ($) *</label>
                      <input type="number" value={anticipoMonto} onChange={e => setAnticipoMonto(e.target.value)} min={0}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                  )}
                  {estadoPago === 'pagado' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Monto total ($)</label>
                      <input type="text" value={precioTotal || 0} disabled
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-500 text-sm" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Fecha de pago *</label>
                    <input type="date" value={anticipoFecha} onChange={e => setAnticipoFecha(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Medio de pago *</label>
                    <select value={anticipoMedioPago} onChange={e => setAnticipoMedioPago(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                      <option value="">Seleccionar...</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="cheque">Cheque</option>
                      <option value="echeq">Echeq</option>
                      <option value="cuenta_corriente">Cuenta Cte.</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Garantía / Depósito */}
          {!isEdit && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-indigo-600" /> Garantía / Depósito
              </h3>
              <div className="flex gap-2 flex-wrap">
                {GARANTIA_TIPOS.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => { setGarantiaTipo(g.value); if (g.value === 'no_aplica') setGarantiaMonto(''); }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      garantiaTipo === g.value
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {garantiaTipo !== 'no_aplica' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Monto retenido ($) *</label>
                    <input
                      type="number"
                      value={garantiaMonto}
                      onChange={e => setGarantiaMonto(e.target.value)}
                      min={0}
                      placeholder="ej: 50000"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>

                  {garantiaTipo === 'tarjeta' && (
                    <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 space-y-3">
                      <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" /> Datos de la tarjeta
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs text-slate-600">Titular</label>
                          <input
                            type="text"
                            value={garantiaTarjetaTitular}
                            onChange={e => setGarantiaTarjetaTitular(e.target.value)}
                            placeholder="Nombre como en la tarjeta"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">Número</label>
                          <input
                            type="text"
                            value={garantiaTarjetaNumero}
                            onChange={e => setGarantiaTarjetaNumero(e.target.value)}
                            placeholder="**** **** **** 1234"
                            maxLength={19}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">Vencimiento</label>
                          <input
                            type="text"
                            value={garantiaTarjetaVenc}
                            onChange={e => setGarantiaTarjetaVenc(e.target.value)}
                            placeholder="MM/AA"
                            maxLength={5}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Late checkout (solo crear) */}
          {!isEdit && (
            <div className="rounded-xl bg-amber-100 border border-amber-400 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <input id="late-checkout" type="checkbox" checked={lateCheckout}
                  onChange={e => setLateCheckout(e.target.checked)}
                  className="w-4 h-4 accent-amber-600" />
                <label htmlFor="late-checkout" className="text-sm text-amber-900 font-semibold flex items-center gap-2 cursor-pointer">
                  <HeroClockIcon className="w-5 h-5" /> Late Checkout acordado
                </label>
              </div>
              {lateCheckout && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Hora de devolución acordada</label>
                    <input type="time" value={horaDevolucionAcordada} onChange={e => setHoraDevolucionAcordada(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Cargo adicional ($)</label>
                    <input type="number" value={cargoLateCheckout}
                      onChange={e => setCargoLateCheckout(parseFloat(e.target.value) || 0)}
                      min={0} step={100}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Notas internas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              placeholder="Observaciones, acuerdos especiales..." />
          </div>

          {/* Warnings de solape */}
          {warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
              <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Esta reserva solapa con reservas pendientes:
              </p>
              <ul className="list-disc pl-5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-700">
                    Reserva #{w.reserva_id} — {w.cliente} ({w.fecha_inicio} → {w.fecha_fin})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error */}
          {(error || localError) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{localError || error}</span>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button type="submit" form="reserva-form" disabled={loading}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm">
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
            {isEdit ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </div>
      </div>
    </div>
  );
}
