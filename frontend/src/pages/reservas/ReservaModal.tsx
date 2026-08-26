import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, AlertTriangle, Calendar, MapPin, Clock, CreditCard, Sparkles, DollarSign, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReservas, descargarPdfReserva } from '@/hooks/useReservas';
import { useVehiculos } from '@/hooks/useVehiculos';
import { useClientes, useConductores } from '@/hooks/useClientes';
import { useAdicionales } from '@/hooks/useAdicionales';
import { useCalcularPrecio } from '@/hooks/usePrecios';
import { useConfiguracion } from '@/hooks/useConfiguracion';
import { useCategorias } from '@/hooks/useCategorias';
import { useDisponibilidadInterna, useVehiculosLibres } from '@/hooks/useDisponibilidad';
import { useBorradorReserva, haceCuanto } from '@/hooks/useBorradorReserva';
import { usePreCheckoutPrevio } from '@/hooks/useSemaforo';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import { toast } from 'sonner';
import type { Adicional, CategoriaConCupo, Reserva, ReservaCreate, ReservaUpdate, Semaforo, SolapeWarning, Tarifa, ApiResponse, PaginatedResponse } from '@/types';

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

/**
 * Último recurso si `web.lugares_retiro` no responde.
 *
 * **Antes esta lista era la fuente de verdad del mostrador, y tenía cuatro
 * valores**: los tres reales más `Juan Francisco Seguí 3607`, la dirección de
 * Capital Federal que D-39 sacó de todo el resto del sistema. La web ya leía
 * los tres de configuración (D-56), así que el mostrador ofrecía un lugar de
 * retiro que el sitio no ofrecía y en el que la empresa no opera.
 *
 * Queda como fallback y no como lista viva: si la configuración no carga, es
 * mejor ofrecer los tres correctos que un selector vacío.
 */
/** Los criterios de desempate del motor, en corto para un renglón. */
const MOTIVO_CORTO: Record<string, string> = {
  unica: 'ser la única que cubre esas fechas',
  prioridad: 'tener la prioridad más alta',
  especificidad: 'ser más específica',
  rango_mas_corto: 'tener el rango más corto',
  mas_reciente: 'ser la más reciente',
};

const LUGARES_FALLBACK = ['Paraguay 241', 'Alsina 350', 'Aeropuerto Comandante Espora'];

function formatTime(t: string) { return t.slice(0, 5); }
function today() { return new Date().toISOString().split('T')[0]; }
function formatFecha(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

/** Suma días a una fecha ISO sin pasar por Date local (evita corrimientos de zona). */
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// Un `<input type="date">` vacío obliga a tipear el año entero, y el año casi
// siempre es el corriente. Arrancando con una fecha real, el campo ya viene con
// el año puesto y sólo se corrige el día y el mes. `min`/`max` no lo bloquean:
// acotan el calendario a la ventana en la que se opera, y llegan hasta el fin
// del año que viene para que una reserva de la próxima temporada entre igual.
const ANIO_ACTUAL = new Date().getFullYear();
const FECHA_MIN = `${ANIO_ACTUAL}-01-01`;
const FECHA_MAX = `${ANIO_ACTUAL + 1}-12-31`;

export function ReservaModal({ reserva, initialVehiculoId, initialFechaInicio, onClose, onSuccess }: Props) {
  const isEdit = !!reserva;
  const { createReserva, updateReserva, loading, error } = useReservas();

  const { data: vehiculosData } = useVehiculos({ incluir_inactivos: false, page_size: 100 });
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const { data: clientesData } = useClientes({ q: clientSearch || undefined, page_size: 100 });

  const [vehiculoId, setVehiculoId]           = useState(reserva?.vehiculo_id?.toString() ?? initialVehiculoId?.toString() ?? '');
  const [clienteId, setClienteId]             = useState(reserva?.cliente_id?.toString() ?? '');
  const [conductorId, setConductorId]         = useState(reserva?.conductor_id?.toString() ?? '');
  const { data: conductoresCliente } = useConductores(clienteId ? Number(clienteId) : 0);
  const [fechaInicio, setFechaInicio]         = useState(reserva?.fecha_inicio ?? initialFechaInicio ?? today());
  const [horaInicio, setHoraInicio]           = useState(reserva ? formatTime(reserva.hora_inicio) : '10:00');
  // La devolución arranca al día siguiente del retiro: es el alquiler más corto
  // posible y deja el campo con año y mes ya cargados.
  const [fechaFin, setFechaFin]               = useState(
    reserva?.fecha_fin ?? sumarDias(initialFechaInicio ?? today(), 1)
  );
  // D-18: el auto se devuelve a la misma hora en que se entrega — hora_fin se
  // deriva de hora_inicio, no es un campo libre. La única excepción es un
  // "late checkout acordado" (más abajo), que define hora_devolucion_acordada.
  const horaFin = horaInicio;
  const [lugarEntrega, setLugarEntrega]       = useState(reserva?.lugar_entrega ?? '');
  const [lugarDevolucion, setLugarDevolucion] = useState(reserva?.lugar_devolucion ?? '');
  // Los lugares salen de `web.lugares_retiro` (D-56: una sola fuente), no de
  // una lista en el código. Es la misma clave que lee el sitio público, así
  // que mostrador y web ofrecen exactamente lo mismo.
  const { data: configItems } = useConfiguracion();
  const lugares = useMemo(() => {
    const item = configItems?.find(c => c.clave === 'web.lugares_retiro');
    const valores = (item?.valor ?? '').split(',').map(s => s.trim()).filter(Boolean);
    return valores.length ? valores : LUGARES_FALLBACK;
  }, [configItems]);
  const esLugarPersonalizado = (v: string) => !!v && !lugares.includes(v);

  /**
   * Si el mostrador está pidiendo garantía/depósito al armar una reserva.
   *
   * **Sale de `configuracion` y no de una constante acá.** Es una decisión
   * comercial —se apagó mientras se define la política— y el día que vuelva no
   * tiene que hacer falta un deploy: se prende desde la pantalla de
   * Configuración.
   *
   * La misma clave la lee el semáforo del backend
   * (`domain/bloqueos.py::_pide_garantia`). Si sólo se escondiera el bloque, la
   * advertencia "no tiene garantía/depósito definido" saldría en **todas** las
   * reservas y sin forma de resolverla.
   *
   * `true` por default: es el comportamiento histórico, y quien no tenga la
   * fila cargada sigue viendo el bloque como antes.
   */
  const pideGarantia = useMemo(() => {
    const item = configItems?.find(c => c.clave === 'reservas.pide_garantia');
    if (!item) return true;
    return ['true', '1', 'si', 'sí', 'yes', 'on'].includes(
      (item.valor ?? '').trim().toLowerCase(),
    );
  }, [configItems]);
  const [entregaEsOtro, setEntregaEsOtro]         = useState(esLugarPersonalizado(reserva?.lugar_entrega ?? ''));
  const [devolucionEsOtro, setDevolucionEsOtro]   = useState(esLugarPersonalizado(reserva?.lugar_devolucion ?? ''));
  // Los dos flags de arriba se calculan en el primer render, cuando la
  // configuración todavía puede no haber llegado y `lugares` es el fallback.
  // Si la lista real trae un lugar más, una reserva vieja con ese lugar
  // aparecería marcada como "Otro" sin serlo. Se corrige **una sola vez**, al
  // llegar la config: volver a correrlo en cada cambio pisaría el "Otro" que
  // la persona acaba de tildar y todavía no completó.
  const lugaresSincronizados = useRef(false);
  useEffect(() => {
    if (lugaresSincronizados.current || !configItems) return;
    lugaresSincronizados.current = true;
    setEntregaEsOtro(esLugarPersonalizado(reserva?.lugar_entrega ?? ''));
    setDevolucionEsOtro(esLugarPersonalizado(reserva?.lugar_devolucion ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configItems]);
  const [notas, setNotas]                     = useState(reserva?.notas ?? '');
  const [lateCheckout, setLateCheckout]       = useState(reserva?.late_checkout ?? false);
  const [horaDevolucionAcordada, setHoraDevolucionAcordada] = useState(
    reserva?.hora_devolucion_acordada ? formatTime(reserva.hora_devolucion_acordada) : ''
  );
  const [cargoLateCheckout, setCargoLateCheckout] = useState(reserva ? parseFloat(reserva.cargo_late_checkout) : 0);

  // Garantía
  const [garantiaTipo, setGarantiaTipo]                   = useState(reserva?.garantia_tipo ?? 'no_aplica');
  const [garantiaMonto, setGarantiaMonto]                 = useState(reserva?.garantia_monto ?? '');
  // Sólo los últimos cuatro: el número completo dejó de guardarse (migración
  // 078). Es lo único que sirve para reconocer la tarjeta frente al cliente.
  const [garantiaTarjetaUltimos4, setGarantiaTarjetaUltimos4] = useState(reserva?.garantia_tarjeta_ultimos4 ?? '');
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

  /**
   * Da de alta un cliente con lo mínimo y lo deja seleccionado.
   *
   * **El caso es el mostrador con alguien enfrente**: llega uno que no está en
   * el sistema y hay que reservarle ahora. Antes el formulario frenaba y había
   * que irse a Clientes, cargar la ficha entera y volver a empezar la reserva
   * desde cero. Con el cliente esperando, eso no pasa: se anota en un papel y
   * el sistema deja de ser el lugar donde está la verdad.
   *
   * Se crea con el nombre. **DNI y teléfono quedan marcados como pendientes**,
   * con ese texto exacto para que se vea de lejos en la ficha, y la campana los
   * reclama hasta que alguien los complete. Es a propósito que sea visible y
   * molesto: un cliente sin DNI no puede firmar un contrato.
   */
  const crearClienteRapido = async () => {
    const nombre = clientSearch.trim();
    if (nombre.length < 3) return;
    setCreandoCliente(true);
    try {
      const { data } = await api.post('/clientes', {
        nombre_completo: nombre,
        dni_cuit: 'A COMPLETAR',
        telefono: 'A COMPLETAR',
        tipo: 'particular',
        notas: 'Alta rápida desde una reserva. Faltan DNI/CUIT y teléfono.',
      });
      const creado = data?.data ?? data;
      selectCliente({ id: creado.id, nombre_completo: creado.nombre_completo });
      toast.success('Cliente creado. Falta cargarle DNI y teléfono.');
    } catch (err) {
      // **Se muestra el motivo, no un "no pudimos".** El alta rápida falló
      // durante meses con "Ya existe un cliente con el DNI/CUIT A COMPLETAR" y
      // desde el mostrador se veía como que el botón no andaba: el mensaje que
      // explicaba el problema se estaba tirando en este catch vacío.
      toast.error(extractError(err) || 'No pudimos crear el cliente. Probá desde la pantalla de Clientes.');
    } finally {
      setCreandoCliente(false);
    }
  };

  /**
   * El nombre tipeado cuando todavía no hay ningún cliente elegido.
   *
   * Es lo que permite avanzar sin cliente: la reserva viaja con este nombre y
   * el cliente se crea recién al guardar. Vacío si ya hay uno elegido — ahí no
   * hay nada pendiente.
   */
  const nombreClientePendiente = clienteId ? '' : clientSearch.trim();

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

  // Espejo de la fórmula del backend (`PrecioService._cargar_adicionales`).
  // Es sólo una vista previa: el importe que se cobra lo calcula el servidor.
  //
  // **Contempla las coberturas por porcentaje (D-53), que antes se mostraban
  // en $0.** Una cobertura cuyo precio es un % del alquiler tiene `precio = 0`
  // y el porcentaje en `porcentaje_sobre_alquiler`; multiplicar por `precio`
  // daba cero, así que el mostrador veía "Total a facturar" sin la cobertura
  // mientras el backend sí la cobraba. Las dos coberturas cargadas hoy son
  // justamente de ese tipo (10% y 30%).
  //
  // El porcentaje se calcula sobre el subtotal del vehículo y **no** se
  // multiplica por los días: el porcentaje ya escala con la duración, y
  // volver a multiplicarlo lo cobraría al cuadrado.
  const totalAdicionales = useMemo(() => {
    const subtotalVehiculo = Number(precioTotal) || 0;
    return catalogoAdicionales.reduce((acc, a) => {
      const cantidad = adicionales[a.id];
      if (cantidad === undefined) return acc;
      const pct = Number(a.porcentaje_sobre_alquiler ?? 0);
      if (pct > 0) return acc + (subtotalVehiculo * pct / 100) * cantidad;
      const multiplicador = a.unidad_cobro === 'por_dia' ? cantidad * duracionDias : cantidad;
      return acc + Number(a.precio) * multiplicador;
    }, 0);
  }, [catalogoAdicionales, adicionales, duracionDias, precioTotal]);
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
  /**
   * La categoría, cuando se reserva **sin elegir auto**.
   *
   * Si hay vehículo elegido la categoría se deriva de él y este campo no se
   * usa. Sólo aparece al dejar el vehículo en blanco, que es el caso "todavía
   * no sé qué unidad le doy".
   */
  /**
   * En qué paso del wizard está.
   *
   * **Los mismos campos de siempre, en el orden en que uno piensa una
   * reserva.** El formulario era una sola pantalla de 39 controles que
   * arrancaba pidiendo el vehículo —una lista plana de patentes— y terminaba
   * con una sección de pago enorme donde casi siempre la respuesta es la
   * misma. No se sacó ni se agregó ningún campo: se reordenaron y se plegó lo
   * que casi nunca se toca.
   *
   * **Editando se muestra todo junto.** Editar es corregir un dato puntual, y
   * obligar a recorrer seis pasos para cambiar una hora sería peor que el muro
   * original.
   */
  const [paso, setPaso] = useState(1);
  const [errorPaso, setErrorPaso] = useState('');
  /**
   * Si el detalle de pago está abierto.
   *
   * Arranca cerrado en una reserva nueva —el default cubre casi todos los
   * casos— y abierto si ya hay algo cargado, para no esconder datos que
   * alguien puso.
   */
  const [pagoDetalladoAbierto, setPagoDetalladoAbierto] = useState(
    Boolean(reserva?.con_factura || reserva?.forma_pago_prevista || (reserva?.estado_pago && reserva.estado_pago !== 'pendiente'))
  );
  /** Editando no hay pasos: se muestra todo junto para corregir un dato suelto. */
  const enPasos = !isEdit;

  const [categoriaManualId, setCategoriaManualId] = useState(
    reserva?.vehiculo_id ? '' : (reserva?.categoria_id?.toString() ?? '')
  );

  const vehiculoSeleccionado = vehiculosActivos.find(v => v.id.toString() === vehiculoId);
  const tieneCheckoutPendiente = vehiculoSeleccionado?.estado === 'alquilado';
  /**
   * La categoría de la reserva.
   *
   * Sale del auto elegido, y si no hay auto, de la categoría que se eligió a
   * mano. **Sin esta segunda mitad, reservar por categoría dejaba al formulario
   * sin franquicia y sin precio sugerido**, y el resumen avisaba "esta
   * categoría no tiene franquicia cargada" aunque sí la tuviera.
   */
  const categoriaId = vehiculoSeleccionado?.categoria_id
    ?? (categoriaManualId ? Number(categoriaManualId) : null);

  const { data: categoriasData } = useCategorias();

  /** De qué categoría sale la franquicia, para poder verlo sin adivinar. */
  const categoriaNombreElegida = useMemo(
    () => (categoriasData ?? []).find(c => c.id === categoriaId)?.nombre ?? null,
    [categoriasData, categoriaId],
  );


  /**
   * La flota agrupada por categoría, en el orden en que se muestran las
   * categorías. Los autos sin categoría van al final, juntos: son un problema
   * de carga —el aviso `vehiculo_sin_categoria` los reclama— y esconderlos
   * haría que desaparezcan del selector.
   */
  const vehiculosPorCategoria = useMemo(() => {
    const categorias = categoriasData ?? [];
    const grupos = categorias
      .map(c => ({
        nombre: c.nombre,
        vehiculos: vehiculosActivos.filter(v => v.categoria_id === c.id),
      }))
      .filter(g => g.vehiculos.length > 0);

    const huerfanos = vehiculosActivos.filter(
      v => !v.categoria_id || !categorias.some(c => c.id === v.categoria_id)
    );
    if (huerfanos.length) grupos.push({ nombre: 'Sin categoría', vehiculos: huerfanos });
    return grupos;
  }, [categoriasData, vehiculosActivos]);

  /**
   * El cupo real de cada categoría para las fechas del paso 2.
   *
   * **Sin esto el paso 3 vendía a ciegas.** Listaba la flota activa entera sin
   * mirar el rango elegido, así que se podía tomar un auto ya comprometido y
   * el conflicto aparecía como advertencia recién *después* de crear la
   * reserva — con el cliente enfrente y la reserva ya hecha.
   *
   * Lo calcula el backend, el mismo `DisponibilidadService` del que cuelga el
   * sitio público. Acá no se cuenta nada: tener dos cuentas de cupo es tener
   * dos verdades sobre cuántos autos hay.
   */
  const rangoElegido = fechaInicio && fechaFin && fechaFin > fechaInicio;
  const { data: disponibilidad, isLoading: cargandoCupo } = useDisponibilidadInterna(
    !isEdit && rangoElegido
      ? {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          hora_inicio: horaInicio + ':00',
          hora_fin: horaFin + ':00',
        }
      : null
  );
  const cupoPorCategoria = useMemo(() => {
    const m = new Map<number, CategoriaConCupo>();
    for (const c of disponibilidad?.categorias ?? []) m.set(c.categoria_id, c);
    return m;
  }, [disponibilidad]);

  /**
   * Los autos que están libres **en estas fechas**, no la flota entera.
   *
   * Es el mismo criterio de solapamiento que usa el panel de asignación, con
   * la preparación entre alquileres ya descontada. Editando no se consulta:
   * ahí el vehículo no se cambia desde esta pantalla.
   */
  const { data: libres } = useVehiculosLibres(
    !isEdit && rangoElegido
      ? {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          hora_inicio: horaInicio + ':00',
          hora_fin: horaFin + ':00',
          categoria_id: categoriaManualId ? Number(categoriaManualId) : null,
        }
      : null
  );

  /**
   * Ver la flota entera, incluidos los autos comprometidos.
   *
   * **La salida de emergencia, no el default.** Quien atiende a veces sabe
   * algo que el sistema no —una devolución adelantada, un auto que vuelve
   * antes—, y cerrarle la puerta lo manda a anotar en un papel. Lo que cambia
   * es de qué lado está el esfuerzo: elegir un auto ocupado ahora cuesta un
   * click extra y viene con el aviso puesto.
   */
  const [verTodaLaFlota, setVerTodaLaFlota] = useState(false);

  /**
   * Si el paso 3 tiene que volver a preguntar por el vehículo.
   *
   * **Entrar por la fila de un auto en el calendario ya es elegirlo.** Quien
   * clickeó la celda del AH762UL el 12 de marzo eligió ese auto y esa fecha: el
   * click *fue* la decisión. Volver a mostrarle la grilla de categorías y el
   * desplegable de patentes le pide que decida de nuevo algo que ya decidió, y
   * peor: deja lugar a elegir otro auto sin querer y descubrirlo en el resumen.
   *
   * Así que en ese caso el paso 3 confirma en vez de preguntar. El selector
   * completo sigue estando a un click —a veces se entra por la fila equivocada—
   * pero cuesta ese click en vez de ser lo primero que aparece.
   */
  const [cambiandoVehiculo, setCambiandoVehiculo] = useState(false);

  /** Los ids libres, para poder marcar los que no lo están. */
  const idsLibres = useMemo(
    () => new Set((libres?.vehiculos ?? []).map(v => v.id)),
    [libres],
  );

  /**
   * Las opciones del selector de auto, agrupadas por categoría.
   *
   * Con la vista normal salen sólo los libres —y el backend ya los devuelve
   * con la categoría pedida primero—; con la flota entera salen todos, y los
   * comprometidos van marcados.
   */
  const opcionesVehiculo = useMemo(() => {
    // Editando no hay consulta de libres (el auto no se cambia desde esta
    // pantalla, el select esta deshabilitado): se muestra la flota entera para
    // que el auto que la reserva ya tiene siga apareciendo.
    if (isEdit || verTodaLaFlota) {
      return vehiculosPorCategoria.map(g => ({
        nombre: g.nombre,
        vehiculos: g.vehiculos.map(v => ({
          id: v.id,
          etiqueta: `${v.patente} · ${v.marca} ${v.modelo}`,
          ocupado: !idsLibres.has(v.id),
        })),
      }));
    }
    const porCategoria = new Map<string, { id: number; etiqueta: string; ocupado: boolean }[]>();
    for (const v of libres?.vehiculos ?? []) {
      const nombre = v.categoria_nombre ?? 'Sin categoría';
      const lista = porCategoria.get(nombre) ?? [];
      lista.push({
        id: v.id,
        etiqueta: `${v.patente} · ${v.marca} ${v.modelo}`
          + (v.es_downgrade ? ' · categoría menor' : ''),
        ocupado: false,
      });
      porCategoria.set(nombre, lista);
    }
    return [...porCategoria.entries()].map(([nombre, vehiculos]) => ({ nombre, vehiculos }));
  }, [isEdit, verTodaLaFlota, vehiculosPorCategoria, libres, idsLibres]);

  /**
   * El auto elegido está comprometido en estas fechas.
   *
   * Se avisa **antes** de guardar y no después. Sigue pudiendo guardarse: el
   * backend revalida y devuelve el solape como advertencia, que es la regla de
   * siempre ("el sistema informa, la persona decide").
   */
  /**
   * Se abrió desde la fila de un auto en el calendario y ese auto sigue siendo
   * el elegido. Si la persona lo cambió a mano, esto se apaga solo y el paso 3
   * vuelve a ser el de siempre.
   */
  const vehiculoYaElegido =
    !isEdit
    && !cambiandoVehiculo
    && !!initialVehiculoId
    && vehiculoId === String(initialVehiculoId);

  const vehiculoOcupadoEnElRango = Boolean(
    !isEdit && vehiculoId && libres && !idsLibres.has(Number(vehiculoId))
  );

  /**
   * Elige una categoria y suelta el auto si ya no le corresponde.
   *
   * Dejar puesto un compacto despues de pasar a SUV seria reservar una cosa
   * diciendo otra: el precio, la franquicia y el cupo saldrian de categorias
   * distintas.
   */
  /**
   * Elige un auto y deja la categoría en la que le corresponde.
   *
   * **El auto manda.** `categoriaId` sale de `vehiculoSeleccionado`, que se
   * busca en la flota (`useVehiculos`); pero el desplegable del paso 3 se arma
   * con **otra lista**, la de libres del rango (`useVehiculosLibres`), que
   * además incluye downgrades de categorías más bajas. Si el auto elegido no
   * aparecía en la primera, `categoriaId` caía en `categoriaManualId` — la
   * categoría que se había mirado antes— y de ahí salían la franquicia, el
   * precio sugerido y las tarifas.
   *
   * Así se reportó: con el Fiat Argo puesto, que es Compacto, el paso 4 decía
   * franquicia **$3.000.000**, que es la base de Pick-up.
   *
   * Sincronizando acá las dos quedan de acuerdo siempre, sin depender de en
   * cuál de las dos listas esté el auto.
   */
  const elegirVehiculo = (id: string) => {
    setVehiculoId(id);
    if (!id) return;
    const elegido = vehiculosActivos.find(v => v.id.toString() === id)
      ?? (libres?.vehiculos ?? []).find(v => v.id.toString() === id);
    if (elegido?.categoria_id != null) setCategoriaManualId(String(elegido.categoria_id));
  };

  const elegirCategoria = (id: number) => {
    setCategoriaManualId(String(id));
    if (vehiculoSeleccionado && vehiculoSeleccionado.categoria_id !== id) {
      setVehiculoId('');
    }
  };

  /**
   * Toma la entrega por rotación que propone el backend.
   *
   * Sólo mueve la hora de retiro, y sólo cuando la unidad se libera **ese
   * mismo día**: si vuelve otro día lo que cambia es la fecha, y eso ya no es
   * "entregar más tarde" sino otra reserva — esa decisión no se automatiza.
   */
  const aplicarRotacion = (cupo: CategoriaConCupo) => {
    if (!cupo.rotacion) return;
    if (cupo.rotacion.fecha_entrega !== fechaInicio) {
      toast.error('Esa unidad se libera otro día. Cambiá la fecha de retiro a mano.');
      return;
    }
    setHoraInicio(cupo.rotacion.hora_entrega);
    setCategoriaManualId(String(cupo.categoria_id));
    setVehiculoId('');
    toast.success(`Retiro movido a las ${cupo.rotacion.hora_entrega}.`);
  };

  /**
   * El semaforo previo a la entrega, **calculado por el backend**.
   *
   * Es el mismo `domain/bloqueos.py` que el listado consume por
   * `/reservas/{id}/pre-checkout`, evaluado sobre los datos que hay cargados
   * en el formulario. Antes esta pantalla armaba su propia lista de faltantes
   * a mano: dos criterios que pueden divergir, y el que la persona cree es el
   * que tiene delante.
   *
   * Lo que sigue calculandose aca son las tres cosas que el backend no puede
   * saber porque son del formulario y no de la reserva: que no se eligio ni
   * auto ni categoria, que falta el precio, y que la categoria no tiene
   * franquicia cargada.
   */
  const { data: semaforoPrevio } = usePreCheckoutPrevio(
    {
      cliente_id: clienteId ? Number(clienteId) : null,
      conductor_id: conductorId ? Number(conductorId) : null,
      vehiculo_id: vehiculoId ? Number(vehiculoId) : null,
      garantia_tipo: garantiaTipo,
    },
    !isEdit && Boolean(clienteId),
  );

  /** La franquicia que le queda al cliente con el auto elegido y sin cobertura extra. */
  const franquiciaBase = useMemo(
    () => (categoriasData ?? []).find(c => c.id === categoriaId)?.franquicia_base ?? null,
    [categoriasData, categoriaId],
  );

  /**
   * La franquicia de la cobertura contratada, si eligió una.
   *
   * Manda sobre la base: es exactamente la precedencia que usa el contrato
   * (`ContratoService._bloque_coberturas`) — si hay cobertura con franquicia
   * definida, esa; si no, la base de la categoría del auto entregado.
   */
  const franquiciaCobertura = useMemo(() => {
    if (franquiciaBase == null) return null;
    // Las coberturas son escalones excluyentes —se elige una— así que manda el
    // descuento más grande de lo que haya seleccionado. Mismo criterio que
    // `domain/franquicia.py::franquicia_resultante`, y mismo piso: la
    // franquicia nunca es cero.
    const descuento = catalogoAdicionales
      .filter(a => a.grupo === 'cobertura' && adicionales[a.id] !== undefined
                   && a.franquicia_descuento != null)
      .reduce((mayor, a) => Math.max(mayor, Number(a.franquicia_descuento)), 0);
    return Math.max(franquiciaBase - descuento, 500_000);
  }, [catalogoAdicionales, adicionales, franquiciaBase]);

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

  /**
   * Lo mínimo que cada paso necesita para poder avanzar.
   *
   * **Sólo se pide lo que sin ello el paso siguiente no tiene sentido.** El
   * wizard no bloquea más que el formulario de antes: guiar no es poner
   * puertas. Todo lo que era una advertencia sigue siendo una advertencia y se
   * ve en el resumen del paso 6, donde todavía se puede guardar igual.
   */
  function faltaEnElPaso(n: number): string {
    // **Un cliente que todavía no existe no frena la reserva.** Con alguien
    // enfrente esperando, mandarlo a la pantalla de Clientes a cargar un alta
    // entera y volver a empezar es lo que hace que la reserva se anote en un
    // papel. Alcanza con el nombre: se crea al guardar y el DNI y el teléfono
    // quedan reclamados por la campana.
    //
    // Lo único que sigue siendo obligatorio es **saber a nombre de quién es**.
    if (n === 1 && !clienteId && nombreClientePendiente.length < 3) {
      return 'Poné al menos el nombre del cliente.';
    }
    if (n === 2) {
      if (!fechaInicio || !fechaFin) return 'Faltan las fechas.';
      if (fechaFin <= fechaInicio) return 'La devolución tiene que ser posterior al retiro.';
      if (!lugarEntrega) return 'Falta el lugar de retiro.';
      if (!lugarDevolucion) return 'Falta el lugar de devolución.';
    }
    // El paso 3 no exige auto: reservar sólo por categoría es válido. Lo único
    // que no se puede es no elegir ninguna de las dos cosas.
    if (n === 3 && !vehiculoId && !categoriaManualId) {
      return 'Elegí un auto, o al menos la categoría.';
    }
    if (n === 4 && (precioTotal === '' || Number(precioTotal) <= 0)) {
      return 'Falta el precio.';
    }
    if (n === 4 && hayDescuentoManual && !descuentoMotivo.trim()) {
      return 'El precio difiere del sugerido: escribí el motivo.';
    }
    if (n === 5 && !isEdit && !condicionPagoAncla) {
      return 'Elegí en qué momento se cobra.';
    }
    return '';
  }

  function siguientePaso() {
    const falta = faltaEnElPaso(paso);
    setErrorPaso(falta);
    if (falta) return;
    setPaso(p => Math.min(6, p + 1));
  }

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
  // La misma regla que aplica el backend (`_nacimiento_del_conductor`): manda
  // la del conductor designado si la tiene, y si no la del titular. Estimarlo
  // con otra fecha daría otro recargo y otra vez el falso "indique el motivo".
  const conductorElegido = conductoresCliente?.find(c => String(c.id) === conductorId);
  const clienteElegido = clientesData?.data?.find(c => String(c.id) === clienteId);
  const nacimientoDelConductor =
    conductorElegido?.fecha_nacimiento ?? clienteElegido?.fecha_nacimiento ?? null;

  // El precio de lista lo calcula **el mismo motor que usa el backend** al
  // grabar. Antes se estimaba acá como `tarifa.monto × días`, que estaba mal
  // por tres lados: `monto` es el precio del bloque completo (D-35), no el del
  // día, así que una tarifa semanal se multiplicaba por 11; no miraba las
  // reglas del calendario ni las promos.
  // Resultado: el aviso de "indique el motivo" aparecía cuando no
  // correspondía, y —peor— **no aparecía cuando sí**, y el backend rechazaba
  // la reserva con un 422 sin campo donde escribir el motivo.
  const { data: cotizacionLista } = useCalcularPrecio(
    !isEdit && (vehiculoId || categoriaManualId) && fechaInicio && fechaFin && fechaFin > fechaInicio
      ? {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          vehiculo_id: vehiculoId ? Number(vehiculoId) : null,
          // Cuando no se eligió auto, la reserva viaja con la categoría: es lo
          // que descuenta cupo mientras la unidad puntual está sin decidir.
          categoria_id: vehiculoId ? null : Number(categoriaManualId),
          canal: 'mostrador',
          adicionales: [],
          fecha_nacimiento: nacimientoDelConductor,
        }
      : null
  );
  const precioListaEstimado = cotizacionLista ? Number(cotizacionLista.total) : null;
  /**
   * El precio que el motor sugiere, y **por qué** ese precio.
   *
   * `cotizacionLista` ya traía el desglose día por día con la regla que
   * gobernó cada uno y el criterio con que ganó; el formulario usaba sólo el
   * total, y nada más que para avisar que el precio tipeado difería. Mostrar
   * de dónde sale el número es lo que convierte la sugerencia en algo que se
   * puede aceptar o rechazar con criterio.
   *
   * La explicación se arma sobre los días cotizados: si todos salen de la misma
   * regla se nombra esa; si son varias, se dice cuántas intervinieron, porque
   * listarlas todas en un renglón no lo lee nadie.
   */
  const precioSugerido = useMemo(() => {
    if (!cotizacionLista || duracionDias <= 0) return null;
    const total = Number(cotizacionLista.subtotal_vehiculo ?? cotizacionLista.total ?? 0);
    if (!total) return null;

    const dias = cotizacionLista.dias ?? [];
    const nombres = Array.from(new Set(dias.map(d => d.regla_nombre).filter(Boolean)));
    const deCalendario = dias.filter(d => d.origen === 'calendario');

    let explicacion: string;
    if (deCalendario.length === 0) {
      explicacion = nombres[0] ? `Sale de la ${nombres[0]!.toLowerCase()}.` : 'Sale de la tarifa por banda.';
    } else if (nombres.length === 1) {
      const d = deCalendario[0];
      explicacion = `Sale de la regla "${nombres[0]}"`
        + (d.motivo && d.candidatas > 1 ? `, que ganó por ${MOTIVO_CORTO[d.motivo] ?? d.motivo}` : '')
        + '.';
    } else {
      explicacion = `${nombres.length} reglas distintas cubren estos días. Mirá el desglose en el Simulador.`;
    }

    const conDescuento = Number(cotizacionLista.descuento_monto ?? 0) > 0
      ? ` Ya tiene aplicado el descuento por duración (−${Number(cotizacionLista.descuento_porcentaje)}%).`
      : '';

    return { total, porDia: total / duracionDias, explicacion: explicacion + conDescuento };
  }, [cotizacionLista, duracionDias]);

  /**
   * Lo que hay cargado detrás del plegado, en una línea.
   *
   * Sin esto, plegar esconde información y quien mira no sabe si hay algo
   * adentro. El resumen es lo que permite tenerlo cerrado sin perderlo de
   * vista.
   */
  const resumenPagoDetallado = useMemo(() => {
    const partes: string[] = [];
    if (conFactura) partes.push('con factura');
    if (formaPagoPrevista) partes.push(formaPagoPrevista.replace(/_/g, ' '));
    if (estadoPago === 'anticipo' && anticipoMonto) partes.push(`anticipo $${Number(anticipoMonto).toLocaleString('es-AR')}`);
    if (estadoPago === 'pagado') partes.push('ya pagado');
    return partes.join(' · ');
  }, [conFactura, formaPagoPrevista, estadoPago, anticipoMonto]);

  const hayDescuentoManual = precioListaEstimado !== null && precioTotal !== '' && Math.round(precioTotal) !== Math.round(precioListaEstimado);
  const requiereDatosEcheq = formaPagoPrevista === 'echeq' || (estadoPago !== 'pendiente' && anticipoMedioPago === 'echeq');

  /**
   * Falla el guardado y **te lleva al paso donde está el campo**.
   *
   * Cinco validaciones del guardado (garantía, ancla, anticipo) no tienen
   * puerta de paso porque dependen de combinaciones, así que saltan recién en
   * el resumen — con el control a dos pantallas de distancia y un mensaje que
   * no decía a dónde volver.
   */
  function errorEnPaso(mensaje: string, n: number) {
    setLocalError(mensaje);
    if (!enPasos) return;
    setPaso(n);
    // Si el campo está detrás del plegado del paso 5, abrirlo: mandar al paso
    // correcto y dejar el control escondido no resuelve nada.
    if (n === 5) setPagoDetalladoAbierto(true);
  }

  async function handleSubmit(e: React.FormEvent | React.MouseEvent) {
    e.preventDefault();

    // Enter dentro de un input dispara el submit del form. Estando a mitad del
    // wizard eso guardaría la reserva sin que nadie haya visto el resumen, así
    // que acá se convierte en "avanzar al paso siguiente", que es lo que la
    // persona quiso decir.
    if (enPasos && paso < 6) {
      siguientePaso();
      return;
    }

    setLocalError(null);
    setWarnings([]);

    // **El vehículo dejó de ser obligatorio.** Se puede reservar sólo por
    // categoría y asignar el auto después, igual que hace la web — es lo que
    // permite tomar una reserva cuando todavía no se sabe qué unidad va, y lo
    // que hace que una reserva de mostrador y una web sean la misma cosa.
    // Elegir el auto sigue siendo el camino normal, no la excepción.
    // **El cliente puede no existir todavía, y eso no frena nada.**
    //
    // Esta guarda pedía `clienteId` y mandaba de vuelta al paso 1 con
    // "Complete todos los campos requeridos (Cliente, Fechas)" — un mensaje que
    // ni siquiera decía cuál faltaba. Era la segunda puerta: el paso 1 ya
    // dejaba avanzar con sólo el nombre, se recorrían los seis pasos enteros y
    // recién al guardar aparecía este cartel. Peor que bloquear al principio.
    //
    // Alcanza con **saber a nombre de quién es**: si no hay cliente elegido
    // pero hay un nombre tipeado, el alta rápida se dispara sola unas líneas
    // más abajo. El DNI y el teléfono quedan reclamados por la campana y se
    // completan cuando la persona esté enfrente.
    if (!clienteId && nombreClientePendiente.length < 3) {
      errorEnPaso('Falta el cliente: elegí uno de la lista o escribí su nombre.', 1);
      return;
    }
    if (!fechaInicio || !fechaFin) {
      errorEnPaso('Faltan las fechas del alquiler.', 2);
      return;
    }
    if (!vehiculoId && !categoriaManualId) {
      errorEnPaso('Elegí un vehículo, o al menos la categoría que se reservó.', 3);
      return;
    }
    if (!lugarEntrega || !lugarDevolucion) {
      errorEnPaso('Complete el lugar de entrega y de devolución.', 2);
      return;
    }
    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      errorEnPaso('La fecha de fin debe ser posterior a la de inicio', 2);
      return;
    }
    if (!precioTotal) {
      errorEnPaso('La cotización es obligatoria. Ingrese el precio total o por día.', 4);
      return;
    }
    if (!isEdit && hayDescuentoManual && !descuentoMotivo.trim()) {
      errorEnPaso(`El precio cargado difiere del precio de lista ($${precioListaEstimado?.toLocaleString('es-AR')}) — indique el motivo de la diferencia.`, 4);
      return;
    }
    if (garantiaTipo !== 'no_aplica' && !garantiaMonto) {
      errorEnPaso('Ingrese el monto de garantía.', 5);
      return;
    }
    if (!isEdit && !condicionPagoAncla) {
      setLocalError(
        condicionPago === 'contado'
          ? 'Indique en qué momento se cobra: al entregar el auto, al devolverlo, u otra fecha.'
          : 'Indique a partir de cuándo se cuentan los días de la condición de pago (check-out, check-in, u otra fecha).'
      );
      return;
    }
    if (!isEdit && condicionPagoAncla === 'fecha_especifica' && !condicionPagoFechaAncla) {
      errorEnPaso('Ingrese la fecha a partir de la cual se cuenta el plazo de pago.', 5);
      return;
    }
    if (estadoPago === 'anticipo') {
      if (!anticipoMonto || !anticipoFecha || !anticipoMedioPago) {
        errorEnPaso('Si hubo un anticipo, complete el monto, fecha y medio de pago.', 5);
        return;
      }
      if (parseFloat(anticipoMonto as string) >= parseFloat(String(precioTotal))) {
        errorEnPaso('El anticipo debe ser menor al precio total. Si abonó el total, seleccione "Abonó el total".', 5);
        return;
      }
    }
    if (estadoPago === 'pagado') {
      if (!anticipoFecha || !anticipoMedioPago) {
        errorEnPaso('Si abonó el total, complete la fecha y medio de pago.', 5);
        return;
      }
    }

    try {
      // **El cliente que todavía no existe se crea acá, no antes.**
      //
      // El paso 1 deja avanzar con sólo el nombre, así que puede llegarse
      // hasta el final sin `clienteId`. Se crea recién al guardar y no al
      // salir del paso 1 a propósito: si la reserva se abandona en el paso 3,
      // no queda un cliente huérfano en la base por una reserva que nunca
      // existió.
      let idCliente = clienteId ? parseInt(clienteId) : 0;
      if (!isEdit && !idCliente && nombreClientePendiente.length >= 3) {
        try {
          const { data } = await api.post('/clientes', {
            nombre_completo: nombreClientePendiente,
            dni_cuit: 'A COMPLETAR',
            telefono: 'A COMPLETAR',
            tipo: 'particular',
            notas: 'Alta rápida desde una reserva. Faltan DNI/CUIT y teléfono.',
          });
          const creado = data?.data ?? data;
          idCliente = creado.id;
          toast.success(`Cliente "${creado.nombre_completo}" creado. Falta cargarle DNI y teléfono.`);
        } catch (err) {
          errorEnPaso(
            extractError(err) || 'No pudimos crear el cliente. Elegí uno existente o cargalo desde Clientes.',
            1,
          );
          return;
        }
      }

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
        // Los avisos se propagan: entre ellos viene el de D-48, que dice que
        // se anuló un contrato firmado porque se le cambió el auto. Tirarlos
        // acá era la razón por la que eso podía pasar sin que nadie lo viera.
        const { reserva: actualizada, warnings } = await updateReserva(reserva!.id, payload);
        onSuccess(actualizada, warnings);
      } else {
        const payload: ReservaCreate = {
          // **Sin auto, la reserva viaja con la categoría.** `parseInt('')` da
          // `NaN`, que `JSON.stringify` manda como `null`: el backend recibía
          // una reserva sin vehículo Y sin categoría, y la rechazaba por
          // invariante. O sea que el camino que el paso 3 ofrece —"sin asignar
          // todavía"— nunca había funcionado.
          vehiculo_id: vehiculoId ? parseInt(vehiculoId) : null,
          categoria_id: vehiculoId ? null : (categoriaManualId ? parseInt(categoriaManualId) : null),
          cliente_id: idCliente,
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
          garantia_tarjeta_ultimos4: garantiaTipo === 'tarjeta' ? garantiaTarjetaUltimos4 || null : null,
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
          // El ancla se manda siempre, también en contado: "en el momento" no
          // dice cuál momento, y entre la entrega y la devolución puede haber
          // semanas. Ver el selector más abajo.
          condicion_pago_ancla: condicionPagoAncla || null,
          condicion_pago_fecha_ancla: condicionPagoAncla === 'fecha_especifica' ? condicionPagoFechaAncla || null : null,
          tipo_factura: conFactura ? (tipoFactura || null) : null,
          factura_a_nombre_de: conFactura ? (facturaANombreDe.trim() || null) : null,
          echeq_banco: requiereDatosEcheq ? (echeqBanco.trim() || null) : null,
          echeq_numero_cheque: requiereDatosEcheq ? (echeqNumeroCheque.trim() || null) : null,
          echeq_fecha_cobro: requiereDatosEcheq ? (echeqFechaCobro || null) : null,
        };
        const { reserva: r, warnings: w } = await createReserva(payload);
        // La reserva existe: el borrador ya no es trabajo pendiente. Se limpia
        // acá y no en `onClose` porque cerrar sin guardar es justamente el caso
        // en el que el borrador tiene que sobrevivir.
        descartarBorrador();
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

  /**
   * Lo que llego precargado desde el calendario, en una linea.
   *
   * **El wizard abre en el paso 1 a proposito**: se entra desde una celda del
   * calendario, o sea con un auto y una fecha ya elegidos, pero lo que falta
   * es el cliente y sin cliente no hay reserva. Saltar al paso 3 dejaria el
   * dato imprescindible para el final.
   *
   * Lo que si estaba mal era que el auto y la fecha que la persona acababa de
   * clickear quedaran invisibles hasta el paso 3, como si el click no hubiera
   * hecho nada. Esto los muestra arriba, en todos los pasos.
   */
  const precargado = useMemo(() => {
    if (isEdit) return null;
    const partes: string[] = [];
    if (initialVehiculoId) {
      const v = vehiculosActivos.find(x => x.id === initialVehiculoId);
      if (v) partes.push(`${v.patente} · ${v.marca} ${v.modelo}`);
    }
    if (initialFechaInicio) partes.push(`retiro ${formatFecha(initialFechaInicio)}`);
    return partes.length ? partes.join(' · ') : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, initialVehiculoId, initialFechaInicio, vehiculosActivos]);

  /**
   * Lo que se guarda del formulario a medio cargar.
   *
   * **Sin los tres campos de la tarjeta**, a propósito: ver el comentario de
   * `useBorradorReserva`. Quien retoma un borrador vuelve a tipearlos, que es
   * el precio correcto por no dejar un número de tarjeta en el navegador de
   * una máquina compartida.
   */
  const borradorActual = useMemo(() => ({
    paso,
    clienteId, clientSearch, conductorId,
    vehiculoId, categoriaManualId,
    fechaInicio, horaInicio, fechaFin,
    lugarEntrega, lugarDevolucion, entregaEsOtro, devolucionEsOtro,
    lateCheckout, horaDevolucionAcordada, cargoLateCheckout,
    precioTotal, precioPorDia, descuentoMotivo, adicionales, conFactura,
    garantiaTipo, garantiaMonto,
    formaPagoPrevista, estadoPago, anticipoMonto, anticipoFecha, anticipoMedioPago,
    condicionPago, condicionPagoAncla, condicionPagoFechaAncla,
    tipoFactura, facturaANombreDe,
    echeqBanco, echeqNumeroCheque, echeqFechaCobro,
    notas,
  }), [
    paso, clienteId, clientSearch, conductorId, vehiculoId, categoriaManualId,
    fechaInicio, horaInicio, fechaFin, lugarEntrega, lugarDevolucion,
    entregaEsOtro, devolucionEsOtro, lateCheckout, horaDevolucionAcordada,
    cargoLateCheckout, precioTotal, precioPorDia, descuentoMotivo, adicionales,
    conFactura, garantiaTipo, garantiaMonto, formaPagoPrevista, estadoPago,
    anticipoMonto, anticipoFecha, anticipoMedioPago, condicionPago,
    condicionPagoAncla, condicionPagoFechaAncla, tipoFactura, facturaANombreDe,
    echeqBanco, echeqNumeroCheque, echeqFechaCobro, notas,
  ]);

  const { pendiente: borrador, marcarRetomado, descartar: descartarBorrador } =
    useBorradorReserva(borradorActual, { activo: !isEdit });

  /**
   * Vuelve a poner en pantalla lo que había quedado a medio cargar.
   *
   * Se aplica campo por campo y no con un `setState` masivo porque el
   * formulario son estados sueltos; escribirlo así deja a la vista **qué se
   * repone y qué no** — los tres campos de la tarjeta no están, y tienen que
   * seguir sin estar.
   */
  const retomarBorrador = () => {
    if (!borrador) return;
    const d = borrador.datos as typeof borradorActual;
    setClienteId(d.clienteId); setClientSearch(d.clientSearch); setConductorId(d.conductorId);
    setVehiculoId(d.vehiculoId); setCategoriaManualId(d.categoriaManualId);
    setFechaInicio(d.fechaInicio); setHoraInicio(d.horaInicio); setFechaFin(d.fechaFin);
    setLugarEntrega(d.lugarEntrega); setLugarDevolucion(d.lugarDevolucion);
    setEntregaEsOtro(d.entregaEsOtro); setDevolucionEsOtro(d.devolucionEsOtro);
    // La sincronización de lugares corre una sola vez al llegar la config y
    // pisaría los dos flags de arriba; acá se da por hecha.
    lugaresSincronizados.current = true;
    setLateCheckout(d.lateCheckout); setHoraDevolucionAcordada(d.horaDevolucionAcordada);
    setCargoLateCheckout(d.cargoLateCheckout);
    setPrecioTotal(d.precioTotal); setPrecioPorDia(d.precioPorDia);
    setDescuentoMotivo(d.descuentoMotivo); setAdicionales(d.adicionales);
    setConFactura(d.conFactura);
    setGarantiaTipo(d.garantiaTipo); setGarantiaMonto(d.garantiaMonto);
    setFormaPagoPrevista(d.formaPagoPrevista); setEstadoPago(d.estadoPago);
    setAnticipoMonto(d.anticipoMonto); setAnticipoFecha(d.anticipoFecha);
    setAnticipoMedioPago(d.anticipoMedioPago);
    setCondicionPago(d.condicionPago); setCondicionPagoAncla(d.condicionPagoAncla);
    setCondicionPagoFechaAncla(d.condicionPagoFechaAncla);
    setTipoFactura(d.tipoFactura); setFacturaANombreDe(d.facturaANombreDe);
    setEcheqBanco(d.echeqBanco); setEcheqNumeroCheque(d.echeqNumeroCheque);
    setEcheqFechaCobro(d.echeqFechaCobro);
    setNotas(d.notas);
    setPaso(d.paso);
    marcarRetomado();
    if (d.garantiaTipo === 'tarjeta') {
      toast.info('Los datos de la tarjeta hay que cargarlos de nuevo: no se guardan en el navegador.');
    }
  };

  const TIPO_TARIFA_LABEL: Record<string, string> = { diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {isEdit ? 'Editar Reserva' : 'Nueva Reserva'}
              </h2>
              {enPasos && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Paso {paso} de 6 · {PASOS_WIZARD[paso - 1].ayuda}
                </p>
              )}
              {/* Lo que vino del calendario. Sin esto, el click en la celda no
                  se ve reflejado en ningun lado hasta el paso 3. */}
              {precargado && (
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Calendar className="h-3 w-3" />
                  Desde el calendario: {precargado}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Los seis pasos, clickeables hacia atrás. Adelante no: saltear un
              paso deja campos sin lo mínimo y el error aparecería recién al
              final, que es justo lo que el wizard viene a evitar. */}
          {enPasos && (
            <div className="mt-3 flex items-center gap-1">
              {PASOS_WIZARD.map(p2 => {
                const hecho = p2.n < paso;
                const actual = p2.n === paso;
                return (
                  <button
                    key={p2.n}
                    type="button"
                    disabled={p2.n > paso}
                    onClick={() => { setErrorPaso(''); setPaso(p2.n); }}
                    className={`flex-1 group text-left ${p2.n > paso ? 'cursor-default' : 'cursor-pointer'}`}
                    title={p2.titulo}
                  >
                    <div className={`h-1 rounded-full transition-colors ${
                      actual ? 'bg-primary' : hecho ? 'bg-primary/40' : 'bg-slate-200'
                    }`} />
                    <span className={`mt-1 hidden sm:block text-[10px] font-medium truncate ${
                      actual ? 'text-primary' : hecho ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {p2.titulo}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <form id="reserva-form" onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* **El borrador, si quedó uno.** No se aplica solo: aplicar sin
              preguntar pisaría lo que la persona acaba de empezar a cargar, que
              es peor que perder el borrador. */}
          {borrador && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="min-w-0 flex-1 text-sm text-sky-900">
                Quedó una reserva a medio cargar {haceCuanto(borrador.guardadoEn)}.
              </p>
              <button
                type="button"
                onClick={retomarBorrador}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
              >
                Retomarla
              </button>
              <button
                type="button"
                onClick={descartarBorrador}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                Empezar de cero
              </button>
            </div>
          )}
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

          {/* PASO 3 - QUE */}
          {(!enPasos || paso === 3) && (
          <div className="space-y-5">
            {/* **La categoria, con el cupo ya calculado para estas fechas.**
                Va primero porque es como se vende: el sistema vende categorias
                (D-02) y el auto puntual es un detalle posterior. Antes esto era
                un desplegable de patentes que no miraba el rango elegido. */}
            {!isEdit && !vehiculoYaElegido && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-sm font-semibold text-slate-700">Categoría</label>
                  {rangoElegido && (
                    <span className="text-[11px] text-slate-500">
                      Cupo para {formatFecha(fechaInicio)} → {formatFecha(fechaFin)}
                    </span>
                  )}
                </div>

                {!rangoElegido ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Elegí las fechas en el paso anterior para ver qué hay libre.
                  </p>
                ) : cargandoCupo ? (
                  <p className="text-xs text-slate-500">Consultando disponibilidad…</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(categoriasData ?? []).map(c => {
                      const cupo = cupoPorCategoria.get(c.id);
                      const elegida = String(c.id) === categoriaManualId
                        || vehiculoSeleccionado?.categoria_id === c.id;
                      const hayCupo = cupo?.hay_cupo ?? false;
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => elegirCategoria(c.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              elegirCategoria(c.id);
                            }
                          }}
                          className={`cursor-pointer rounded-lg border p-2.5 text-left transition-colors ${
                            elegida
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                              : hayCupo
                                ? 'border-slate-300 bg-white hover:border-primary/50'
                                : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">{c.nombre}</span>
                            {/* El cupo, en el lenguaje del mostrador. "Ultima
                                unidad" no es un adorno: es lo que cambia la
                                conversacion con el cliente. */}
                            {cupo === undefined ? (
                              <span className="text-[11px] text-slate-400">-</span>
                            ) : !hayCupo ? (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                                Sin cupo
                              </span>
                            ) : cupo.ultima_unidad ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                                Última unidad
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                                {cupo.disponibles} libres
                              </span>
                            )}
                          </div>
                          {/* **La entrega por rotacion, aca mismo.** Sin cupo a
                              la hora pedida pero con una unidad que vuelve ese
                              dia, el "no" se convierte en "a partir de las
                              14:00" sin salir de la pantalla. */}
                          {cupo?.rotacion && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); aplicarRotacion(cupo); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault(); e.stopPropagation(); aplicarRotacion(cupo);
                                }
                              }}
                              className="mt-1.5 block cursor-pointer rounded bg-sky-50 px-2 py-1 text-[11px] leading-tight text-sky-800 hover:bg-sky-100"
                            >
                              Hay una que vuelve a las {cupo.rotacion.hora_devolucion_unidad}:
                              <strong> entregar a las {cupo.rotacion.hora_entrega}</strong>
                              {cupo.rotacion.fecha_entrega !== fechaInicio
                                && ` del ${formatFecha(cupo.rotacion.fecha_entrega)}`}
                            </span>
                          )}
                          {cupo && !hayCupo && !cupo.rotacion && (
                            <span className="mt-1.5 block text-[11px] text-slate-500">
                              {cupo.precio === null
                                ? 'Sin precio cargado: no se puede cotizar.'
                                : 'No hay ninguna unidad que se libere ese día.'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  Con la categoría alcanza para reservar: ocupa cupo igual y el auto se
                  asigna después, antes de entregar.
                </p>
              </div>
            )}

            {/* **Se entró por la fila de este auto: el paso 3 confirma, no
                pregunta.** El click en la celda del calendario ya fue la
                decisión; repetir la grilla y el desplegable es pedirla otra
                vez, y da lugar a cambiar de auto sin querer. */}
            {vehiculoYaElegido && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Vehículo</label>
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-bold text-slate-800">
                        {vehiculoSeleccionado?.patente}
                      </div>
                      <div className="text-xs text-slate-600">
                        {vehiculoSeleccionado?.marca} {vehiculoSeleccionado?.modelo}
                        {categoriaNombreElegida && ` · ${categoriaNombreElegida}`}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Viene elegido desde el calendario.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCambiandoVehiculo(true)}
                      className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                    >
                      Cambiar
                    </button>
                  </div>
                  {vehiculoOcupadoEnElRango && (
                    <p className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Este auto está comprometido en estas fechas. Se puede reservar igual —
                      el solape queda marcado y hay que resolverlo antes de entregar.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Se desmonta en vez de esconderse con `hidden`: un `<select>`
                invisible pero enfocable se alcanza con Tab y se puede cambiar
                el auto sin verlo. */}
            {!vehiculoYaElegido && (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-sm font-semibold text-slate-700">
                  Vehículo {!isEdit && <span className="font-normal text-slate-400">(opcional)</span>}
                </label>
                {!isEdit && rangoElegido && (
                  <button
                    type="button"
                    onClick={() => setVerTodaLaFlota(v => !v)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {verTodaLaFlota ? 'Ver sólo los libres' : 'Ver toda la flota'}
                  </button>
                )}
              </div>
              <select
                value={vehiculoId}
                onChange={e => elegirVehiculo(e.target.value)}
                disabled={isEdit}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Sin asignar todavía…</option>
                {/* Agrupado por categoria y no una lista plana de patentes.
                    El sistema vende por categoria -la web directamente reserva
                    una- y quien atiende piensa "un compacto", no "el AH762UL".
                    Es el mismo criterio que ya usa el panel de asignacion. */}
                {opcionesVehiculo.map(grupo => (
                  <optgroup key={grupo.nombre} label={grupo.nombre}>
                    {grupo.vehiculos.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.etiqueta}{v.ocupado ? ' — comprometido' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {!isEdit && rangoElegido && !verTodaLaFlota && (
                <p className="text-[11px] text-slate-500">
                  Sólo los que están libres en estas fechas, con el tiempo de preparación
                  entre alquileres ya descontado.
                </p>
              )}
              {vehiculoOcupadoEnElRango && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Este auto está comprometido en estas fechas. Se puede reservar igual —
                  el solape queda marcado y hay que resolverlo antes de entregar.
                </p>
              )}
            </div>
            )}
          </div>
          )}

          {/* ── PASO 1 · ¿QUIÉN? ────────────────────────────────────────── */}
          {(!enPasos || paso === 1) && (
          <div className="space-y-5">
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
                      /* **Alta rapida.** Antes, si el cliente no existia, el
                         formulario frenaba y habia que irse a Clientes, cargarlo
                         entero y volver a empezar la reserva. Con alguien
                         enfrente esperando, eso no pasa: se anota en un papel.
                         Ahora se crea con el nombre y listo; el DNI y el
                         telefono quedan marcados como pendientes y la campana
                         los reclama hasta que se completen. */
                      <div className="p-3">
                        <p className="mb-2 text-sm text-slate-500">
                          No hay ningun cliente con ese nombre.
                        </p>
                        <button
                          type="button"
                          disabled={creandoCliente || clientSearch.trim().length < 3}
                          onClick={crearClienteRapido}
                          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {creandoCliente
                            ? 'Creando...'
                            : `Crear "${clientSearch.trim()}" y seguir`}
                        </button>
                        <p className="mt-1.5 text-xs text-slate-400">
                          Se crea con el nombre. DNI y telefono quedan pendientes.
                        </p>
                      </div>
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
              {/* **Se puede seguir sin elegir un cliente de la lista.** Con
                  alguien enfrente esperando, mandarlo a la pantalla de Clientes
                  a cargar un alta entera y volver a empezar es lo que hace que
                  la reserva termine anotada en un papel. El cliente se crea al
                  guardar, con el nombre, y la campana reclama el resto. */}
              {/* **Reserva rápida a un cliente no registrado.** Se detecta sola:
                  si hay un nombre tipeado y ninguno elegido de la lista, es
                  esto. No hay un modo aparte que haya que activar — el operador
                  escribe el nombre y sigue, que es lo que hace con alguien
                  enfrente. */}
              {nombreClientePendiente.length >= 3 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
                  <p className="text-xs font-semibold text-primary">
                    Reserva rápida — el cliente todavía no está registrado
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Se da de alta a <strong className="text-foreground">"{nombreClientePendiente}"</strong> al
                    guardar, sólo con el nombre. El DNI y el teléfono quedan pendientes y el
                    sistema los va a reclamar — sin DNI no se puede emitir el contrato.
                  </p>
                </div>
              )}
              {!clienteId && nombreClientePendiente.length > 0 && nombreClientePendiente.length < 3 && (
                <p className="text-xs text-slate-500">
                  Escribí al menos tres letras del nombre.
                </p>
              )}
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
          </div>
          )}

          {/* ── PASO 2 · ¿CUÁNDO Y DÓNDE? ───────────────────────────────── */}
          {(!enPasos || paso === 2) && (
          <div className="space-y-5">
          {/* Fechas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Inicio *
              </label>
              <div className="flex gap-2">
                <input type="date" value={fechaInicio} min={FECHA_MIN} max={FECHA_MAX}
                  onChange={e => {
                    const nueva = e.target.value;
                    setFechaInicio(nueva);
                    // Mover el retiro más allá de la devolución dejaría una
                    // duración negativa y el precio en cero hasta que alguien
                    // toque el otro campo. La devolución acompaña.
                    if (nueva && fechaFin && fechaFin <= nueva) setFechaFin(sumarDias(nueva, 1));
                  }}
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
                <input type="date" value={fechaFin} min={fechaInicio || FECHA_MIN} max={FECHA_MAX}
                  onChange={e => setFechaFin(e.target.value)}
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
                {lugares.map(l => (
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
                {lugares.map(l => (
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

          </div>
          )}

          {/* ── PASO 4 · ¿CUÁNTO? ───────────────────────────────────────── */}
          {(!enPasos || paso === 4) && (
          <div className="space-y-5">
          {/* Cotización */}
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
              /* Decía "no tiene tarifas cargadas" y dos renglones más abajo
                 avisaba que el precio difería del **precio de lista**, con un
                 número concreto. Las dos cosas eran ciertas y juntas no se
                 entendían: lo que falta es tarifa propia o de categoría, pero
                 la tarifa general existe y es de donde sale ese precio. */
              <p className="text-xs text-slate-400 italic">
                Sin tarifa propia ni de categoría: se cotiza con la tarifa general.
              </p>
            )}
            {/* **El precio sugerido, con la regla que lo puso.** El backend ya
                devolvía todo esto —el total, de dónde salió el precio de cada
                día y con qué criterio ganó la regla— y el formulario sólo usaba
                el total, y encima nada más que para reprochar que el precio
                difería. Ver de dónde sale el número es la diferencia entre
                aceptar una sugerencia y adivinar. */}
            {precioSugerido && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-700">
                    Sugerido:{' '}
                    <strong className="tabular-nums text-primary">
                      ${precioSugerido.total.toLocaleString('es-AR')}
                    </strong>
                    <span className="text-xs text-slate-500">
                      {' '}· ${precioSugerido.porDia.toLocaleString('es-AR')}/día
                    </span>
                  </span>
                  {precioTotal !== Math.round(precioSugerido.total) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrecioTotal(Math.round(precioSugerido.total));
                        setPrecioPorDia(Math.round(precioSugerido.porDia));
                        lastEditedRef.current = 'total';
                      }}
                      className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primary/90"
                    >
                      Usar este precio
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{precioSugerido.explicacion}</p>
              </div>
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
                          {/* LA FRANQUICIA, que hasta ahora no aparecía en
                              ninguna parte del sistema interno — el sitio
                              público sí se la muestra al cliente al elegir
                              cobertura, así que quien atendía por mostrador
                              era el único que no sabía qué estaba vendiendo.
                              Y es lo que después imprime el contrato.

                              No confundir con la GARANTÍA de más abajo: la
                              garantía es plata que se retiene y se devuelve; la
                              franquicia es el techo de lo que paga el cliente
                              si choca. */}
                          {/* **Se muestra grande.** Es el numero mas caro de
                              la conversacion —lo que el cliente pone de su
                              bolsillo si choca— y estaba en el mismo gris de
                              11 px que el resto de las aclaraciones. Ademas se
                              dice **de que categoria sale**: es lo que permite
                              cazar de un vistazo que la franquicia no
                              corresponda al auto elegido. */}
                          {grupo === 'cobertura' && (
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                              {franquiciaCobertura != null ? (
                                <>
                                  <p className="text-[11px] font-medium text-slate-500">
                                    Franquicia a cargo del cliente
                                    {categoriaNombreElegida && <> · {categoriaNombreElegida}</>}
                                  </p>
                                  <p className="text-xl font-bold tabular-nums text-slate-800">
                                    ${franquiciaCobertura.toLocaleString('es-AR')}
                                  </p>
                                  {franquiciaBase != null && franquiciaCobertura < franquiciaBase && (
                                    <p className="text-xs font-medium text-emerald-700">
                                      baja desde ${franquiciaBase.toLocaleString('es-AR')}
                                    </p>
                                  )}
                                </>
                              ) : franquiciaBase != null ? (
                                <>
                                  <p className="text-[11px] font-medium text-slate-500">
                                    Franquicia sin cobertura extra
                                    {categoriaNombreElegida && <> · {categoriaNombreElegida}</>}
                                  </p>
                                  <p className="text-xl font-bold tabular-nums text-slate-800">
                                    ${franquiciaBase.toLocaleString('es-AR')}
                                  </p>
                                </>
                              ) : vehiculoId ? (
                                <p className="text-xs font-medium text-amber-700">
                                  Esta categoría no tiene franquicia cargada: el contrato va a salir sin declararla.
                                </p>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  Elegí el auto o la categoría para ver la franquicia.
                                </p>
                              )}
                            </div>
                          )}
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
                                  {/* Las coberturas por porcentaje tienen
                                      `precio` 0 y el chip no decía nada del
                                      costo: parecían gratis. */}
                                  {Number(a.porcentaje_sobre_alquiler ?? 0) > 0 && (
                                    <span className="ml-1 opacity-75">
                                      +{Number(a.porcentaje_sobre_alquiler)}%
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
          </div>
          </div>
          )}

          {/* ── PASO 5 · ¿CÓMO SE PAGA? ─────────────────────────────────── */}
          {(!enPasos || paso === 5) && (
          <div className="space-y-5">
            <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            {!isEdit && (
              <div className="space-y-1.5">
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
                      onClick={() => { setCondicionPago(o.value); }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        condicionPago === o.value ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {/* El ancla se pregunta SIEMPRE, también en contado. "En el
                    momento" no dice cuál momento: entre que el auto sale y
                    vuelve pueden pasar semanas, y la fecha de vencimiento del
                    asiento en cuenta corriente sale de acá. Antes contado
                    asumía la entrega sin decirlo. */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-medium text-slate-600">
                    {condicionPago === 'contado'
                      ? '¿En qué momento se cobra? *'
                      : '¿A partir de cuándo se cuentan los días? *'}
                  </label>
                    <div className="flex gap-2 flex-wrap items-center">
                      {[
                        { value: 'checkout', label: condicionPago === 'contado' ? 'Al entregar el auto' : 'Check-out (entrega)' },
                        { value: 'checkin', label: condicionPago === 'contado' ? 'Al devolverlo' : 'Check-in (devolución)' },
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
                  {condicionPago === 'contado' && condicionPagoAncla === 'checkin' && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      El saldo queda sin fecha de vencimiento hasta que el auto
                      vuelva: recién en el check-in se sabe qué día es.
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* **Lo que casi nunca se toca, plegado.** En la enorme mayoría de
                las reservas la respuesta es "contado, al entregar, sin
                anticipo", y todo esto —factura, forma de pago prevista,
                anticipo, echeq— quedaba desplegado ocupando media pantalla para
                no cambiar nada. Se abre cuando hace falta.

                Se abre solo si ya hay algo cargado: editando una reserva que sí
                tiene anticipo, esconderlo sería peor que mostrarlo de más. */}
            <button
              type="button"
              onClick={() => setPagoDetalladoAbierto(v => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <span>
                Factura, forma de pago y anticipo
                {!pagoDetalladoAbierto && resumenPagoDetallado && (
                  <span className="ml-1 font-normal text-slate-400">· {resumenPagoDetallado}</span>
                )}
              </span>
              <span className="text-slate-400">{pagoDetalladoAbierto ? 'Ocultar' : 'Cambiar'}</span>
            </button>

            {pagoDetalladoAbierto && (
            <div className="space-y-3">
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
                  {['efectivo', 'transferencia', 'tarjeta', 'wapa', 'cheque', 'echeq', 'cuenta_corriente'].map(m => (
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
            )}
          </div>

          {/* Garantía / Depósito — va en el mismo paso que el pago: las dos
              cosas son "cómo se cubre la plata de este alquiler".

              Oculto mientras `reservas.pide_garantia` esté apagado. El sistema
              sigue soportando garantías enteras —la caja, la devolución, la
              ejecución parcial, los últimos cuatro dígitos de la tarjeta—; lo
              único que se apaga es que el formulario las pida. */}
          {!isEdit && pideGarantia && (
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
                      {/* El sistema no guarda el número completo ni el código de
                          seguridad, y no es una omisión: guardar datos de tarjeta
                          en texto plano es exactamente lo que no hay que hacer, y
                          para reconocer la tarjeta en el mostrador alcanzan los
                          últimos cuatro. Ver migración 078. */}
                      <p className="text-[11px] text-slate-600 leading-snug">
                        Anotá sólo los <strong>últimos cuatro dígitos</strong>. El sistema no
                        guarda el número completo ni el código de seguridad.
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
                          <label className="text-xs text-slate-600">Últimos 4 dígitos</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={garantiaTarjetaUltimos4}
                            onChange={e => setGarantiaTarjetaUltimos4(e.target.value.replace(/\D/g, '').slice(-4))}
                            placeholder="1234"
                            maxLength={4}
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

          </div>
          )}

          {/* ── PASO 6 · RESUMEN ────────────────────────────────────────── */}
          {(!enPasos || paso === 6) && (
          <div className="space-y-5">
          {/* Sólo al crear. Editando, varias secciones están ocultas por
              `!isEdit`, así que el resumen avisaría de cosas que no se pueden
              arreglar desde esta pantalla. */}
          {enPasos && (
          <ResumenReserva
            vehiculo={vehiculoSeleccionado}
            categoriaNombre={
              vehiculoSeleccionado
                ? (categoriasData ?? []).find(c => c.id === vehiculoSeleccionado.categoria_id)?.nombre
                : (categoriasData ?? []).find(c => String(c.id) === categoriaManualId)?.nombre
            }
            clienteNombre={clientSearch}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            horaInicio={horaInicio}
            duracionDias={duracionDias}
            lugarEntrega={lugarEntrega}
            lugarDevolucion={lugarDevolucion}
            precioTotal={precioTotal === '' ? null : Number(precioTotal)}
            totalAdicionales={totalAdicionales}
            franquicia={franquiciaCobertura ?? franquiciaBase}
            condicionPago={condicionPago}
            semaforo={semaforoPrevio ?? null}
          />
          )}
          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Notas internas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Observaciones, acuerdos especiales..." />
          </div>

          </div>
          )}

          {/* Warnings de solape — fuera de los pasos: si hay un conflicto hay
              que verlo esté donde esté, no sólo al llegar al final. */}
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
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
              Cancelar
            </button>
            {enPasos && paso > 1 && (
              <button type="button" onClick={() => { setErrorPaso(''); setPaso(p => p - 1); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                ← Atrás
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* **El error del paso se muestra acá, al lado del botón**, y no
                arriba de todo: es donde está mirando la persona cuando aprieta
                Siguiente. */}
            {enPasos && errorPaso && (
              <span className="text-xs font-medium text-amber-700">{errorPaso}</span>
            )}
            {/* **Los dos botones van en posiciones distintas del JSX, con
                `key` propia, y el de guardar no es de submit.**

                Estaban los dos en la misma posición, uno u otro según el paso:

                    {paso < 6 ? <button type="button" onClick={siguientePaso}/>
                              : <button type="submit" form="reserva-form"/>}

                Un click es un evento discreto: React aplica el `setPaso(6)` de
                forma sincrónica, antes de devolverle el control al navegador. Y
                como los dos son `<button>` en la misma posición, no reemplaza
                el nodo del DOM — le muta `type="button"` por `type="submit"`.
                Recién entonces el navegador ejecuta la acción por defecto del
                click, sobre un botón que para ese momento ya es de submit: el
                form se mandaba solo al llegar al paso 6.

                El guard de `handleSubmit` no lo ataja, porque comprueba
                `paso < 6` y el paso ya era 6. Se veía como "el resumen se
                cierra apenas aparece" — en realidad `onSuccess` cerraba el
                modal porque la reserva se había creado entera sin que nadie la
                mirara, que es lo único para lo que existe el paso 6.

                Dos candados independientes, cualquiera de los dos alcanza:
                posiciones separadas con `key` distinta, así React descarta el
                nodo viejo en vez de mutarlo; y `type="button"`, así no hay
                ninguna acción por defecto que ejecutar. El `onSubmit` del form
                queda para el Enter, que sí tiene que seguir andando. */}
            {enPasos && paso < 6 && (
              <button key="siguiente" type="button" onClick={siguientePaso}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors shadow-sm">
                Siguiente →
              </button>
            )}
            {(!enPasos || paso === 6) && (
              <button key="guardar" type="button" onClick={handleSubmit} disabled={loading}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm">
                {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                {isEdit ? 'Guardar cambios' : 'Crear reserva'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Los seis pasos, en el orden en que uno piensa una reserva.
 *
 * No es el orden en que estaban los campos: el formulario arrancaba pidiendo
 * el vehículo, que es lo último que se sabe cuando alguien llama preguntando
 * por fechas.
 */
export const PASOS_WIZARD = [
  { n: 1, titulo: '¿Quién?', ayuda: 'El cliente, y quién va a manejar si no es el mismo.' },
  { n: 2, titulo: '¿Cuándo y dónde?', ayuda: 'Fechas, horarios y lugares de retiro y devolución.' },
  { n: 3, titulo: '¿Qué?', ayuda: 'El auto, o la categoría si todavía no se sabe cuál.' },
  { n: 4, titulo: '¿Cuánto?', ayuda: 'El precio y los adicionales.' },
  { n: 5, titulo: '¿Cómo se paga?', ayuda: 'Condición de pago, garantía y factura.' },
  { n: 6, titulo: 'Resumen', ayuda: 'Revisá antes de guardar.' },
] as const;

/**
 * Lo que se está por guardar, en una sola pantalla.
 *
 * **Existe para que los problemas se vean antes de confirmar y no después.**
 * Antes había que guardar la reserva, abrirla y recién ahí darse cuenta de que
 * faltaba la garantía o de que el precio no era el que se había acordado.
 */
function ResumenReserva({
  vehiculo, categoriaNombre, clienteNombre, fechaInicio, fechaFin, horaInicio,
  duracionDias, lugarEntrega, lugarDevolucion, precioTotal, totalAdicionales,
  franquicia, condicionPago, semaforo,
}: {
  vehiculo?: { patente: string; marca: string; modelo: string } | null;
  categoriaNombre?: string;
  clienteNombre: string;
  fechaInicio: string; fechaFin: string; horaInicio: string;
  duracionDias: number;
  lugarEntrega: string; lugarDevolucion: string;
  precioTotal: number | null; totalAdicionales: number;
  franquicia: number | null;
  condicionPago: string;
  /** El semaforo del backend. `null` mientras la consulta viaja. */
  semaforo: Semaforo | null;
}) {
  /**
   * Lo que falta **del formulario**, que es lo unico que el backend no puede
   * saber: no mira campos a medio cargar, mira una reserva. Todo lo demas
   * -garantia, licencia, deuda, VTV, poliza, auto fuera de servicio- sale del
   * semaforo y no se duplica aca.
   */
  const faltantes: string[] = [];
  if (!vehiculo && !categoriaNombre) faltantes.push('no se eligió ni auto ni categoría');
  else if (!vehiculo) faltantes.push('todavía no tiene auto asignado');
  if (precioTotal === null || precioTotal <= 0) faltantes.push('falta el precio');
  if (franquicia === null) faltantes.push('esta categoría no tiene franquicia cargada');

  const bloqueantes = (semaforo?.items ?? []).filter(i => i.severidad === 'bloqueante');
  const advertencias = (semaforo?.items ?? []).filter(i => i.severidad !== 'bloqueante');

  const Fila = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-500">{k}</span>
      <span className="text-right text-sm font-medium text-slate-800">{v}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 divide-y divide-slate-100">
        <Fila k="Cliente" v={clienteNombre || '—'} />
        <Fila
          k="Vehículo"
          v={vehiculo
            ? `${vehiculo.patente} · ${vehiculo.marca} ${vehiculo.modelo}`
            : (categoriaNombre ? `${categoriaNombre} — sin asignar` : '—')}
        />
        <Fila k="Período" v={`${fechaInicio} → ${fechaFin} · ${duracionDias} día${duracionDias !== 1 ? 's' : ''} · ${horaInicio}`} />
        <Fila k="Retiro" v={lugarEntrega || '—'} />
        <Fila k="Devolución" v={lugarDevolucion || '—'} />
        <Fila
          k="Precio del auto"
          v={precioTotal !== null ? `$${precioTotal.toLocaleString('es-AR')}` : '—'}
        />
        {totalAdicionales > 0 && (
          <Fila k="Adicionales" v={`$${totalAdicionales.toLocaleString('es-AR')}`} />
        )}
        {precioTotal !== null && (
          <Fila
            k="Total a facturar"
            v={<strong>${(precioTotal + totalAdicionales).toLocaleString('es-AR')}</strong>}
          />
        )}
        <Fila
          k="Franquicia del cliente"
          v={franquicia !== null ? `$${franquicia.toLocaleString('es-AR')}` : 'sin cargar'}
        />
        <Fila k="Condición de pago" v={condicionPago} />
      </div>

      {/* El semáforo, antes de guardar. Es la misma información que el listado
          muestra después, sólo que llega a tiempo para hacer algo al respecto.

          **Bloqueante y advertencia van separados, y con distinto color.** Una
          VTV vencida y "todavía no tiene auto asignado" no son el mismo
          problema: mezclarlos en una sola lista amarilla es cómo se aprende a
          ignorar la lista entera. Ninguno de los dos impide guardar — la
          reserva se puede crear igual y el bloqueo salta al entregar, que es
          la regla de siempre ("el sistema informa, la persona decide"). */}
      {bloqueantes.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <AlertTriangle className="h-4 w-4" /> Esto va a frenar la entrega:
          </p>
          <ul className="mt-1 list-disc pl-6 text-xs text-red-800">
            {bloqueantes.map(i => <li key={i.codigo}>{i.mensaje}</li>)}
          </ul>
        </div>
      )}

      {(faltantes.length > 0 || advertencias.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Se puede guardar igual, pero:
          </p>
          <ul className="mt-1 list-disc pl-6 text-xs text-amber-800">
            {faltantes.map(f => <li key={f}>{f}</li>)}
            {advertencias.map(i => <li key={i.codigo}>{i.mensaje}</li>)}
          </ul>
        </div>
      )}

    </div>
  );
}
