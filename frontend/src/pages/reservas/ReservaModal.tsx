import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, AlertTriangle, Calendar, MapPin, Clock, CreditCard, Sparkles, DollarSign, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReservas, descargarPdfReserva } from '@/hooks/useReservas';
import { useVehiculos } from '@/hooks/useVehiculos';
import { useClientes, useConductores } from '@/hooks/useClientes';
import { useAdicionales } from '@/hooks/useAdicionales';
import api from '@/lib/api';
import type { Adicional, Reserva, ReservaCreate, ReservaUpdate, SolapeWarning, Tarifa, ApiResponse, PaginatedResponse } from '@/types';

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

const LUGARES_PREDEFINIDOS = ['Paraguay 241', 'Alsina 350', 'Aeropuerto Comandante Espora', 'Juan Francisco Seguí 3607'];

function formatTime(t: string) { return t.slice(0, 5); }
function today() { return new Date().toISOString().split('T')[0]; }
function formatFecha(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

export function ReservaModal({ reserva, initialVehiculoId, initialFechaInicio, onClose, onSuccess }: Props) {
  const isEdit = !!reserva;
  const { createReserva, updateReserva, loading, error } = useReservas();

  const { data: vehiculosData } = useVehiculos({ incluir_inactivos: false, page_size: 100 });
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const { data: clientesData } = useClientes({ q: clientSearch || undefined, page_size: 100 });

  const [vehiculoId, setVehiculoId]           = useState(reserva?.vehiculo_id?.toString() ?? initialVehiculoId?.toString() ?? '');
  const [clienteId, setClienteId]             = useState(reserva?.cliente_id?.toString() ?? '');
  const [conductorId, setConductorId]         = useState(reserva?.conductor_id?.toString() ?? '');
  const { data: conductoresCliente } = useConductores(clienteId ? Number(clienteId) : 0);
  const [fechaInicio, setFechaInicio]         = useState(reserva?.fecha_inicio ?? initialFechaInicio ?? today());
  const [horaInicio, setHoraInicio]           = useState(reserva ? formatTime(reserva.hora_inicio) : '10:00');
  const [fechaFin, setFechaFin]               = useState(reserva?.fecha_fin ?? '');
  // D-18: el auto se devuelve a la misma hora en que se entrega — hora_fin se
  // deriva de hora_inicio, no es un campo libre. La única excepción es un
  // "late checkout acordado" (más abajo), que define hora_devolucion_acordada.
  const horaFin = horaInicio;
  const [lugarEntrega, setLugarEntrega]       = useState(reserva?.lugar_entrega ?? '');
  const [lugarDevolucion, setLugarDevolucion] = useState(reserva?.lugar_devolucion ?? '');
  const esLugarPersonalizado = (v: string) => !!v && !LUGARES_PREDEFINIDOS.includes(v);
  const [entregaEsOtro, setEntregaEsOtro]         = useState(esLugarPersonalizado(reserva?.lugar_entrega ?? ''));
  const [devolucionEsOtro, setDevolucionEsOtro]   = useState(esLugarPersonalizado(reserva?.lugar_devolucion ?? ''));
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

  const selectCliente = (c: { id: number; nombre_completo: string; tipo?: string; razon_social?: string | null; condicion_pago_default?: string | null }) => {
    setClienteId(c.id.toString());
    setConductorId('');
    setClientSearch(c.nombre_completo);
    setClientDropdownOpen(false);
    if (!isEdit) {
      if (c.condicion_pago_default) setCondicionPago(c.condicion_pago_default);
      setFacturaANombreDe(c.tipo === 'empresa' && c.razon_social ? c.razon_social : c.nombre_completo);
    }
  };

  const duracionDias = fechaInicio && fechaFin
    ? Math.max(0, (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000)
    : 0;

  // Precio
  const initialPrecioTotal  = reserva?.precio_total ? parseFloat(reserva.precio_total as string) : 0;
  const initialPrecioPorDia = duracionDias > 0 && initialPrecioTotal ? initialPrecioTotal / duracionDias : 0;

  const [precioTotal, setPrecioTotal]   = useState<number | ''>(initialPrecioTotal || '');
  const [precioPorDia, setPrecioPorDia] = useState<number | ''>(initialPrecioPorDia || '');
  const [conFactura, setConFactura] = useState(reserva?.con_factura ?? false);

  // Adicionales contratados: { adicional_id → cantidad }. No entran en
  // `precio_total` (ese es el precio del auto) — se suman al facturar.
  const [adicionales, setAdicionales] = useState<Record<number, number>>(() =>
    Object.fromEntries((reserva?.adicionales ?? []).map(a => [a.adicional_id, a.cantidad]))
  );
  const { data: catalogoAdicionales = [] } = useAdicionales();
  // Después del check-out el alquiler ya se facturó en la cuenta corriente:
  // el backend rechaza el cambio, así que acá no se ofrece.
  const adicionalesBloqueados = Boolean(reserva?.alquiler_id);

  function toggleAdicional(a: Adicional) {
    setAdicionales(prev => {
      const copia = { ...prev };
      if (copia[a.id] !== undefined) {
        delete copia[a.id];
        return copia;
      }
      // Las coberturas son excluyentes: elegir una reemplaza a la anterior.
      // El backend lo valida igual; acá se evita el error en vez de mostrarlo.
      if (a.grupo === 'cobertura') {
        for (const otra of catalogoAdicionales) {
          if (otra.grupo === 'cobertura') delete copia[otra.id];
        }
      }
      copia[a.id] = 1;
      return copia;
    });
  }

  // Espejo de la fórmula del backend (`ReservaService._subtotal_adicional`).
  // Es sólo una vista previa: el importe que se cobra lo calcula el servidor.
  const totalAdicionales = useMemo(() => {
    return catalogoAdicionales.reduce((acc, a) => {
      const cantidad = adicionales[a.id];
      if (cantidad === undefined) return acc;
      const multiplicador = a.unidad_cobro === 'por_dia' ? cantidad * duracionDias : cantidad;
      return acc + Number(a.precio) * multiplicador;
    }, 0);
  }, [catalogoAdicionales, adicionales, duracionDias]);
  const [descuentoMotivo, setDescuentoMotivo] = useState(reserva?.descuento_motivo ?? '');
  const lastEditedRef = useRef<'dia' | 'total'>('dia');

  // Condición de pago (sin default de ancla — lo elige quien carga la reserva)
  const [condicionPago, setCondicionPago] = useState(reserva?.condicion_pago ?? 'contado');
  const [condicionPagoAncla, setCondicionPagoAncla] = useState<'checkout' | 'checkin' | 'fecha_especifica' | ''>(
    reserva?.condicion_pago_ancla ?? ''
  );
  const [condicionPagoFechaAncla, setCondicionPagoFechaAncla] = useState(reserva?.condicion_pago_fecha_ancla ?? '');
  const [tipoFactura, setTipoFactura] = useState<'A' | 'B' | 'C' | ''>(reserva?.tipo_factura ?? '');
  const [facturaANombreDe, setFacturaANombreDe] = useState(reserva?.factura_a_nombre_de ?? '');
  const [echeqBanco, setEcheqBanco] = useState(reserva?.echeq_banco ?? '');
  const [echeqNumeroCheque, setEcheqNumeroCheque] = useState(reserva?.echeq_numero_cheque ?? '');
  const [echeqFechaCobro, setEcheqFechaCobro] = useState(reserva?.echeq_fecha_cobro ?? '');

  // Verificar si el vehículo tiene check-out pendiente (activo = auto fue entregado pero no devuelto)
  const vehiculosActivos = (vehiculosData?.data ?? []).filter(
    v => v.activo && ['disponible', 'reservado', 'en_transicion', 'alquilado'].includes(v.estado)
  );
  const vehiculoSeleccionado = vehiculosActivos.find(v => v.id.toString() === vehiculoId);
  const tieneCheckoutPendiente = vehiculoSeleccionado?.estado === 'alquilado';
  const categoriaId = vehiculoSeleccionado?.categoria_id ?? null;

  // Si el vehículo está afuera, buscamos su reserva bloqueante actual para
  // saber cuándo se espera que vuelva — así el cartel sólo alarma cuando hay
  // riesgo real de choque con la reserva nueva, no siempre que el auto esté
  // afuera (aunque la nueva reserva sea para dentro de un mes).
  const { data: reservasVehiculoActual } = useQuery({
    queryKey: ['reservas-vehiculo-actual', vehiculoId],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Reserva>>('/reservas', { params: { vehiculo_id: vehiculoId, page_size: 50 } });
      return res.data.data;
    },
    enabled: !isEdit && !!vehiculoId && tieneCheckoutPendiente,
    staleTime: 30_000,
  });
  const reservaQueOcupaVehiculo = (reservasVehiculoActual ?? [])
    .filter(r => r.estado === 'activa' || r.estado === 'vencida')
    .sort((a, b) => `${b.fecha_fin}T${b.hora_fin}`.localeCompare(`${a.fecha_fin}T${a.hora_fin}`))[0];
  const devolucionEsperadaDt = reservaQueOcupaVehiculo
    ? `${reservaQueOcupaVehiculo.fecha_fin}T${(reservaQueOcupaVehiculo.hora_devolucion_acordada || reservaQueOcupaVehiculo.hora_fin).slice(0, 8)}`
    : null;
  const nuevaReservaInicioDt = fechaInicio ? `${fechaInicio}T${horaInicio}:00` : null;
  const hayRiesgoRealDeChoque = !devolucionEsperadaDt || !nuevaReservaInicioDt || nuevaReservaInicioDt <= devolucionEsperadaDt;

  // Tarifas del vehículo seleccionado
  const { data: tarifasVehiculo, isLoading: cargandoTarifasVehiculo } = useQuery({
    queryKey: ['tarifas', vehiculoId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Tarifa[]>>(`/vehiculos/${vehiculoId}/tarifas`);
      return res.data.data;
    },
    enabled: !!vehiculoId,
    staleTime: 60_000,
  });

  // Tarifas de la categoría del vehículo (D-08): si no tiene tarifa propia,
  // usa la de su categoría — ver domain/tarifas.py::seleccionar_tarifa.
  const { data: tarifasCategoria, isLoading: cargandoTarifasCategoria } = useQuery({
    queryKey: ['tarifas-categoria', categoriaId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Tarifa[]>>(`/categorias/${categoriaId}/tarifas`);
      return res.data.data;
    },
    enabled: !!categoriaId,
    staleTime: 60_000,
  });

  const tarifasData = [...(tarifasVehiculo ?? []), ...(tarifasCategoria ?? [])];
  const cargandoTarifas = cargandoTarifasVehiculo || (!!categoriaId && cargandoTarifasCategoria);

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
  // La específica del vehículo gana sobre la de categoría (D-08), igual que en el backend.
  const tarifaRecomendada = tarifasDisponibles.find(t => t.tipo === tipoRecomendado && t.vehiculo_id != null)
    ?? tarifasDisponibles.find(t => t.tipo === tipoRecomendado);
  const precioListaEstimado = tarifaRecomendada ? parseFloat(tarifaRecomendada.monto) * duracionDias : null;
  const hayDescuentoManual = precioListaEstimado !== null && precioTotal !== '' && Math.round(precioTotal) !== Math.round(precioListaEstimado);
  const requiereDatosEcheq = formaPagoPrevista === 'echeq' || (estadoPago !== 'pendiente' && anticipoMedioPago === 'echeq');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setWarnings([]);

    if (!vehiculoId || !clienteId || !fechaInicio || !fechaFin) {
      setLocalError('Complete todos los campos requeridos (Vehículo, Cliente, Fechas).');
      return;
    }
    if (!lugarEntrega || !lugarDevolucion) {
      setLocalError('Complete el lugar de entrega y de devolución.');
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
    if (!isEdit && hayDescuentoManual && !descuentoMotivo.trim()) {
      setLocalError(`El precio cargado difiere del precio de lista ($${precioListaEstimado?.toLocaleString('es-AR')}) — indique el motivo de la diferencia.`);
      return;
    }
    if (garantiaTipo !== 'no_aplica' && !garantiaMonto) {
      setLocalError('Ingrese el monto de garantía.');
      return;
    }
    if (!isEdit && condicionPago !== 'contado' && !condicionPagoAncla) {
      setLocalError('Indique a partir de cuándo se cuentan los días de la condición de pago (check-out, check-in, u otra fecha).');
      return;
    }
    if (!isEdit && condicionPagoAncla === 'fecha_especifica' && !condicionPagoFechaAncla) {
      setLocalError('Ingrese la fecha a partir de la cual se cuenta el plazo de pago.');
      return;
    }
    if (estadoPago === 'anticipo') {
      if (!anticipoMonto || !anticipoFecha || !anticipoMedioPago) {
        setLocalError('Si hubo un anticipo, complete el monto, fecha y medio de pago.');
        return;
      }
      if (parseFloat(anticipoMonto as string) >= parseFloat(String(precioTotal))) {
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
          conductor_id: conductorId ? parseInt(conductorId) : null,
          fecha_inicio: fechaInicio,
          hora_inicio: horaInicio + ':00',
          fecha_fin: fechaFin,
          hora_fin: horaFin + ':00',
          lugar_entrega: lugarEntrega,
          lugar_devolucion: lugarDevolucion,
          notas: notas || null,
          precio_total: precioTotal || null,
          // Sólo se mandan si se pueden cambiar: después del check-out el
          // backend los rechaza, y mandarlos igual rompería la edición.
          ...(adicionalesBloqueados ? {} : {
            adicionales: Object.entries(adicionales).map(([id, cantidad]) => ({
              adicional_id: Number(id), cantidad,
            })),
          }),
          forma_pago_prevista: formaPagoPrevista || null,
          estado_pago: estadoPago,
          anticipo_monto: estadoPago === 'anticipo' ? parseFloat(anticipoMonto as string) : (estadoPago === 'pagado' ? parseFloat(String(precioTotal)) : null),
          anticipo_fecha: estadoPago !== 'pendiente' ? anticipoFecha : null,
          anticipo_medio_pago: estadoPago !== 'pendiente' ? anticipoMedioPago : null,
        };
        const r = await updateReserva(reserva!.id, payload);
        onSuccess(r, []);
      } else {
        const payload: ReservaCreate = {
          vehiculo_id: parseInt(vehiculoId),
          cliente_id: parseInt(clienteId),
          conductor_id: conductorId ? parseInt(conductorId) : null,
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
          adicionales: Object.entries(adicionales).map(([id, cantidad]) => ({
            adicional_id: Number(id), cantidad,
          })),
          garantia_tipo: garantiaTipo !== 'no_aplica' ? garantiaTipo : null,
          garantia_monto: garantiaTipo !== 'no_aplica' && garantiaMonto ? parseFloat(garantiaMonto as string) : null,
          garantia_tarjeta_numero: garantiaTipo === 'tarjeta' ? garantiaTarjetaNumero || null : null,
          garantia_tarjeta_vencimiento: garantiaTipo === 'tarjeta' ? garantiaTarjetaVenc || null : null,
          garantia_tarjeta_titular: garantiaTipo === 'tarjeta' ? garantiaTarjetaTitular || null : null,
          forma_pago_prevista: formaPagoPrevista || null,
          estado_pago: estadoPago,
          anticipo_monto: estadoPago === 'anticipo' ? parseFloat(anticipoMonto as string) : (estadoPago === 'pagado' ? parseFloat(String(precioTotal)) : null),
          anticipo_fecha: estadoPago !== 'pendiente' ? anticipoFecha : null,
          anticipo_medio_pago: estadoPago !== 'pendiente' ? anticipoMedioPago : null,
          con_factura: conFactura,
          descuento_motivo: hayDescuentoManual ? descuentoMotivo.trim() : null,
          condicion_pago: condicionPago,
          condicion_pago_ancla: condicionPago !== 'contado' ? (condicionPagoAncla || null) : null,
          condicion_pago_fecha_ancla: condicionPagoAncla === 'fecha_especifica' ? condicionPagoFechaAncla || null : null,
          tipo_factura: conFactura ? (tipoFactura || null) : null,
          factura_a_nombre_de: conFactura ? (facturaANombreDe.trim() || null) : null,
          echeq_banco: requiereDatosEcheq ? (echeqBanco.trim() || null) : null,
          echeq_numero_cheque: requiereDatosEcheq ? (echeqNumeroCheque.trim() || null) : null,
          echeq_fecha_cobro: requiereDatosEcheq ? (echeqFechaCobro || null) : null,
        };
        const { reserva: r, warnings: w } = await createReserva(payload);
        if (w.length > 0) setWarnings(w);
        // El PDF de confirmación se descarga solo para mandárselo al cliente.
        // Si la descarga falla no se pierde nada: el backend ya lo archivó en
        // el perfil del cliente y se puede volver a bajar desde el listado.
        descargarPdfReserva(r.id).catch(() => {});
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
          {/* Alerta check-out pendiente — sólo aplica al crear: si estamos editando
              la reserva que generó justamente ese alquiler activo, la alerta se
              dispararía sobre sí misma sin sentido. */}
          {!isEdit && tieneCheckoutPendiente && hayRiesgoRealDeChoque && (
            <div className="rounded-xl bg-warning p-3 flex items-start gap-2 shadow-sm">
              <AlertTriangle className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <p className="text-sm text-white">
                <span className="font-semibold">Check-out pendiente:</span> este vehículo tiene un alquiler activo sin devolución registrada.
                La nueva reserva se creará de todas formas, pero verificá el estado.
              </p>
            </div>
          )}
          {!isEdit && tieneCheckoutPendiente && !hayRiesgoRealDeChoque && reservaQueOcupaVehiculo && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Este vehículo tiene un check-out programado para el {formatFecha(reservaQueOcupaVehiculo.fecha_fin)}, antes del inicio de esta reserva.
            </p>
          )}

          {/* Vehículo y Cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Vehículo *</label>
              <select
                value={vehiculoId}
                onChange={e => setVehiculoId(e.target.value)}
                disabled={isEdit}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-slate-100 disabled:text-slate-500"
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-slate-100"
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
                            className="px-3 py-2 text-sm text-slate-700 hover:bg-primary/10 cursor-pointer"
                            onClick={() => selectCliente(c)}
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

          {/* Conductor (si es distinto de quien paga) */}
          {clienteId && conductoresCliente && conductoresCliente.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Conductor</label>
              <select
                value={conductorId}
                onChange={e => setConductorId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">El cliente es el conductor</option>
                {conductoresCliente.filter(c => c.activo).map(c => (
                  <option key={c.id} value={c.id}>{c.nombre_completo}{c.dni ? ` (DNI ${c.dni})` : ''}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Para empresas: quién retira el auto, si no es quien paga/firma.</p>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Inicio *
              </label>
              <div className="flex gap-2">
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
                <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                  className="w-24 px-2 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Fin *
                {duracionDias > 0 && <span className="text-primary font-normal">({duracionDias} días)</span>}
              </label>
              <div className="flex gap-2">
                <input type="date" value={fechaFin} min={fechaInicio} onChange={e => setFechaFin(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
                <input type="time" value={horaFin} disabled title="Se devuelve a la misma hora en que se entrega"
                  className="w-24 px-2 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-sm cursor-not-allowed" />
              </div>
            </div>
          </div>

          {/* Late checkout (solo crear) */}
          {!isEdit && (
            <div className="rounded-xl bg-warning p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-3">
                <input id="late-checkout" type="checkbox" checked={lateCheckout}
                  onChange={e => setLateCheckout(e.target.checked)}
                  className="w-4 h-4 accent-white" />
                <label htmlFor="late-checkout" className="text-sm text-white font-semibold flex items-center gap-2 cursor-pointer">
                  <Clock className="w-5 h-5" /> Late Checkout acordado
                </label>
              </div>
              {lateCheckout && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/90">Hora de devolución acordada</label>
                    <input type="time" value={horaDevolucionAcordada} onChange={e => setHoraDevolucionAcordada(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-white/40 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/60" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/90">Cargo adicional ($)</label>
                    <input type="number" value={cargoLateCheckout}
                      onChange={e => setCargoLateCheckout(parseFloat(e.target.value) || 0)}
                      min={0} step={100}
                      className="w-full px-3 py-2 rounded-lg border border-white/40 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/60" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lugares */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Lugar de entrega *
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {LUGARES_PREDEFINIDOS.map(l => (
                  <button key={l} type="button"
                    onClick={() => { setLugarEntrega(l); setEntregaEsOtro(false); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      !entregaEsOtro && lugarEntrega === l
                        ? 'bg-primary/15 border-primary/35 text-primary'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10 hover:border-primary/25'
                    }`}
                  >
                    {l}
                  </button>
                ))}
                <button type="button"
                  onClick={() => setEntregaEsOtro(true)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    entregaEsOtro
                      ? 'bg-primary/15 border-primary/35 text-primary'
                      : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10 hover:border-primary/25'
                  }`}
                >
                  Otro
                </button>
              </div>
              {entregaEsOtro && (
                <input type="text" value={lugarEntrega} onChange={e => setLugarEntrega(e.target.value)}
                  placeholder="Dirección específica"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Lugar de devolución *
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {LUGARES_PREDEFINIDOS.map(l => (
                  <button key={l} type="button"
                    onClick={() => { setLugarDevolucion(l); setDevolucionEsOtro(false); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      !devolucionEsOtro && lugarDevolucion === l
                        ? 'bg-primary/15 border-primary/35 text-primary'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10 hover:border-primary/25'
                    }`}
                  >
                    {l}
                  </button>
                ))}
                <button type="button"
                  onClick={() => setDevolucionEsOtro(true)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    devolucionEsOtro
                      ? 'bg-primary/15 border-primary/35 text-primary'
                      : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10 hover:border-primary/25'
                  }`}
                >
                  Otro
                </button>
              </div>
              {devolucionEsOtro && (
                <input type="text" value={lugarDevolucion} onChange={e => setLugarDevolucion(e.target.value)}
                  placeholder="Dirección específica"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
              )}
            </div>
          </div>

          {/* Cotización y Pago OBLIGATORIA */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" /> Cotización y Pago *
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
                            ? 'bg-primary/15 border-primary/35 text-primary shadow-sm'
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10 hover:border-primary/25'
                        }`}
                      >
                        {TIPO_TARIFA_LABEL[t.tipo]}: ${parseFloat(t.monto).toLocaleString('es-AR')}/día
                        {esRecomendada && <span className="ml-0.5 text-primary">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {!tipoRecomendado && (
                  <p className="text-xs text-slate-400 italic">Configure las fechas para ver la tarifa recomendada.</p>
                )}
              </div>
            )}
            {vehiculoId && tarifasDisponibles.length === 0 && !cargandoTarifas && (
              <p className="text-xs text-slate-400 italic">Este vehículo no tiene tarifas cargadas (ni propias ni de su categoría).</p>
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
                  className={`w-full px-3 py-2 rounded-lg border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
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
                  className={`w-full px-3 py-2 rounded-lg border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    localError?.includes('cotización') && precioTotal === '' ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
                  }`}
                />
              </div>
            </div>
            {duracionDias === 0 && (
              <p className="text-xs text-slate-500 italic">Configure las fechas para calcular la cotización.</p>
            )}

            {/* Adicionales — van APARTE del precio del vehículo: se suman al
                facturar, igual que el cargo por late checkout. */}
            {catalogoAdicionales.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">Adicionales</label>
                  {totalAdicionales > 0 && (
                    <span className="text-xs font-semibold text-slate-700 tabular-nums">
                      + ${totalAdicionales.toLocaleString('es-AR')}
                    </span>
                  )}
                </div>

                {adicionalesBloqueados ? (
                  <p className="text-xs text-slate-500 italic">
                    {Object.keys(adicionales).length > 0
                      ? (reserva?.adicionales ?? []).map(a => `${a.nombre} ×${a.cantidad}`).join(' · ')
                      : 'Sin adicionales.'}
                    {' '}No se pueden modificar: el alquiler ya se facturó en la cuenta corriente.
                  </p>
                ) : (
                  <>
                    {(['cobertura', 'extra'] as const).map(grupo => {
                      const delGrupo = catalogoAdicionales.filter(a => a.grupo === grupo);
                      if (delGrupo.length === 0) return null;
                      return (
                        <div key={grupo} className="space-y-1">
                          <p className="text-[11px] font-medium text-slate-500">
                            {grupo === 'cobertura' ? 'Cobertura (elegí una)' : 'Extras'}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {delGrupo.map(a => {
                              const elegido = adicionales[a.id] !== undefined;
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => toggleAdicional(a)}
                                  title={a.descripcion ?? undefined}
                                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                    elegido
                                      ? 'border-primary bg-primary text-white'
                                      : 'border-slate-300 bg-white text-slate-600 hover:border-primary/50'
                                  }`}
                                >
                                  {a.nombre}
                                  {Number(a.precio) > 0 && (
                                    <span className="ml-1 opacity-75">
                                      ${Number(a.precio).toLocaleString('es-AR')}
                                      {a.unidad_cobro === 'por_dia' ? '/día' : ''}
                                    </span>
                                  )}
                                  {elegido && adicionales[a.id] > 1 && ` ×${adicionales[a.id]}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {totalAdicionales > 0 && precioTotal !== '' && (
                      <p className="text-xs text-slate-600">
                        Total a facturar: <strong className="tabular-nums">
                          ${(Number(precioTotal) + totalAdicionales).toLocaleString('es-AR')}
                        </strong>
                        {' '}(auto ${Number(precioTotal).toLocaleString('es-AR')} + adicionales ${totalAdicionales.toLocaleString('es-AR')})
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {!isEdit && hayDescuentoManual && (
              <div className="space-y-1.5">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ El precio cargado difiere del precio de lista (${precioListaEstimado?.toLocaleString('es-AR')}). Indicá el motivo — queda auditado.
                </p>
                <textarea
                  value={descuentoMotivo}
                  onChange={e => setDescuentoMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ej: cliente frecuente, descuento autorizado por gerencia"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            )}
            {!isEdit && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <label className="text-xs font-medium text-slate-600">Condición de pago *</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'contado', label: 'Contado (en el momento)' },
                    { value: 'cta_cte_15', label: '15 días' },
                    { value: 'cta_cte_30', label: '30 días' },
                    { value: 'cta_cte_60', label: '60 días' },
                    { value: 'cta_cte_90', label: '90 días' },
                  ].map(o => (
                    <button
                      key={o.value} type="button"
                      onClick={() => { setCondicionPago(o.value); if (o.value === 'contado') { setCondicionPagoAncla(''); setCondicionPagoFechaAncla(''); } }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        condicionPago === o.value ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {condicionPago !== 'contado' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-slate-600">¿A partir de cuándo se cuentan los días? *</label>
                    <div className="flex gap-2 flex-wrap items-center">
                      {[
                        { value: 'checkout', label: 'Check-out' },
                        { value: 'checkin', label: 'Check-in' },
                        { value: 'fecha_especifica', label: 'Otra fecha' },
                      ].map(o => (
                        <button
                          key={o.value} type="button"
                          onClick={() => setCondicionPagoAncla(o.value as typeof condicionPagoAncla)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                            condicionPagoAncla === o.value ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                      {condicionPagoAncla === 'fecha_especifica' && (
                        <input
                          type="date"
                          value={condicionPagoFechaAncla}
                          onChange={e => setCondicionPagoFechaAncla(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={conFactura} onChange={e => setConFactura(e.target.checked)} className="accent-primary" />
              Con factura
            </label>
            {conFactura && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Tipo de factura</label>
                  <div className="flex gap-2">
                    {(['A', 'B', 'C'] as const).map(t => (
                      <button
                        key={t} type="button"
                        onClick={() => setTipoFactura(t === tipoFactura ? '' : t)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          tipoFactura === t ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">A nombre de</label>
                  <input
                    type="text"
                    value={facturaANombreDe}
                    onChange={e => setFacturaANombreDe(e.target.value)}
                    placeholder="Razón social / nombre"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
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
                        formaPagoPrevista === m ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
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
                    <input type="radio" checked={estadoPago === 'pendiente'} onChange={() => setEstadoPago('pendiente')} className="accent-primary" />
                    No, está pendiente
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="radio" checked={estadoPago === 'anticipo'} onChange={() => setEstadoPago('anticipo')} className="accent-primary" />
                    Abonó un anticipo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="radio" checked={estadoPago === 'pagado'} onChange={() => setEstadoPago('pagado')} className="accent-primary" />
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
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Medio de pago *</label>
                    <select value={anticipoMedioPago} onChange={e => setAnticipoMedioPago(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
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

              {!isEdit && requiereDatosEcheq && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="text-xs font-medium text-slate-600">Datos del echeq (opcional)</label>
                  <p className="text-xs text-slate-400">
                    Podés completarlo ahora o dejarlo pendiente — se puede cargar después desde el cliente.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Banco</label>
                      <input type="text" value={echeqBanco} onChange={e => setEcheqBanco(e.target.value)}
                        placeholder="Ej: Banco Nación"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Número de cheque</label>
                      <input type="text" value={echeqNumeroCheque} onChange={e => setEcheqNumeroCheque(e.target.value)}
                        placeholder="Ej: 00012345"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Fecha de cobro</label>
                      <input type="date" value={echeqFechaCobro} onChange={e => setEcheqFechaCobro(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Garantía / Depósito */}
          {!isEdit && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Garantía / Depósito
              </h3>
              <div className="flex gap-2 flex-wrap">
                {GARANTIA_TIPOS.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => { setGarantiaTipo(g.value); if (g.value === 'no_aplica') setGarantiaMonto(''); }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      garantiaTipo === g.value
                        ? 'bg-primary/15 border-primary/35 text-primary'
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
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {garantiaTipo === 'tarjeta' && (
                    <div className="rounded-lg bg-primary/10 border border-primary/25 p-3 space-y-3">
                      <p className="text-xs font-semibold text-primary/90 flex items-center gap-1.5">
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
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Notas internas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
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
            className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm">
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
            {isEdit ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </div>
      </div>
    </div>
  );
}
