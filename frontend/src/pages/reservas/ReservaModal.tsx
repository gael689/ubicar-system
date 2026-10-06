import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, AlertTriangle, Calendar, MapPin, Clock, CreditCard, Sparkles, DollarSign, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReservas, descargarPdfReserva } from '@/hooks/useReservas';
import { useVehiculos } from '@/hooks/useVehiculos';
import { useClientes, useConductores } from '@/hooks/useClientes';
import { AvisoConductoresOcupados, SelectorConductores } from '@/components/clientes/SelectorConductores';
import { useAdicionales } from '@/hooks/useAdicionales';
import { useCalcularPrecio } from '@/hooks/usePrecios';
import { useAvisosDeSolape } from '@/hooks/useAvisosDeSolape';
import { AvisoSolape, textoAvisoSolape } from '@/components/reservas/AvisoSolape';
import { useConfiguracion } from '@/hooks/useConfiguracion';
import { useCategorias } from '@/hooks/useCategorias';
import { useDisponibilidadInterna, useVehiculosLibres } from '@/hooks/useDisponibilidad';
import { useBorradorReserva, haceCuanto } from '@/hooks/useBorradorReserva';
import { usePreCheckoutPrevio } from '@/hooks/useSemaforo';
import api from '@/lib/api';
import { codigoDeError, extractError, fechaLocal, formatDate, formatDocumento, formatMiles, hoyLocal, irAlError, redondear2 } from '@/lib/utils';
import { avisoDiaExtra, diasFacturables } from '@/lib/dias';
import { InputMoneda } from '@/components/shared/InputMoneda';
import { CamposUber, UBER_VACIO, type DatosUber } from '@/components/reservas/CamposUber';
import { totalUber } from '@/lib/uber';
import { ESTADO_PAGO_LABEL, resumenPago } from '@/lib/pagoReserva';
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
// Hoy **en hora local**: `toISOString()` es UTC y después de las 21:00 ya dice
// mañana. Ver `hoyLocal`.
function today() { return hoyLocal(); }
function formatFecha(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

/** Suma días a una fecha ISO. Al mediodía y leída en hora local: sin corrimientos de zona. */
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

/** Las condiciones de pago, como se leen en pantalla y en el resumen. */
const CONDICIONES_PAGO = [
  { value: 'contado', label: 'Contado' },
  { value: 'cta_cte_15', label: '15 días' },
  { value: 'cta_cte_30', label: '30 días' },
  { value: 'cta_cte_60', label: '60 días' },
  { value: 'cta_cte_90', label: '90 días' },
];

/**
 * Por debajo de un peso no es un descuento: es redondeo. Misma tolerancia que
 * el backend (`reserva_service.TOLERANCIA_DESCUENTO`); si no coinciden, la
 * pantalla deja pasar un precio que el servidor rechaza, o al revés.
 */
const TOLERANCIA_DESCUENTO = 1;

// Un `<input type="date">` vacío obliga a tipear el año entero, y el año casi
// siempre es el corriente. Arrancando con una fecha real, el campo ya viene con
// el año puesto y sólo se corrige el día y el mes. `min`/`max` no lo bloquean:
// acotan el calendario a la ventana en la que se opera, y llegan hasta el fin
// del año que viene para que una reserva de la próxima temporada entre igual.
const ANIO_ACTUAL = new Date().getFullYear();
// **Arranca el año pasado, no el corriente.** Del mostrador: *"¿me deja hacer
// ahora una reserva pasada? Porque quiero que Martín le haga firmar un contrato
// a un loco, pero es de hace 2 meses hasta hoy el contrato."* Pasa: el alquiler
// existió, el papel se firma después. El backend nunca lo impidió —ni `create`,
// ni `update`, ni el check-out, ni el semáforo miran si la fecha ya pasó—, así
// que el único que lo bloqueaba era este `min` del calendario del navegador.
const FECHA_MIN = `${ANIO_ACTUAL - 1}-01-01`;
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
  // Hasta tres conductores (plan 27/09, A3); el primero es el principal. Antes
  // era un solo `conductorId` que arrancaba vacío y el selector sólo aparecía
  // si el cliente ya tenía conductores cargados: una empresa nueva no tenía
  // dónde elegir al chofer, y el contrato salía sin él.
  const [conductorIds, setConductorIds] = useState<number[]>(
    reserva?.conductor_ids?.length
      ? reserva.conductor_ids
      : (reserva?.conductor_id ? [reserva.conductor_id] : [])
  );
  // Si el cliente lo acaba de elegir la persona en esta pantalla. Sólo en ese
  // caso se preselecciona su único conductor: al editar, o al retomar un
  // borrador que decía "maneja el titular", la lista vacía es una decisión y
  // preseleccionar sumaba un conductor sin que nadie lo pidiera.
  const [clienteElegidoAhora, setClienteElegidoAhora] = useState(false);
  const { data: conductoresCliente } = useConductores(clienteId ? Number(clienteId) : 0);
  const [fechaInicio, setFechaInicio]         = useState(reserva?.fecha_inicio ?? initialFechaInicio ?? today());
  const [horaInicio, setHoraInicio]           = useState(reserva ? formatTime(reserva.hora_inicio) : '10:00');
  // La devolución arranca al día siguiente del retiro: es el alquiler más corto
  // posible y deja el campo con año y mes ya cargados.
  const [fechaFin, setFechaFin]               = useState(
    reserva?.fecha_fin ?? sumarDias(initialFechaInicio ?? today(), 1)
  );
  // La hora de devolución **se puede cargar libre**. Antes estaba bloqueada a la
  // del retiro (D-18: se devuelve a la hora en que se entregó) y eso impedía
  // cargar un alquiler de mostrador como "retira 07:30, devuelve 18:40 el mismo
  // día". Mientras nadie la toque acompaña a la del retiro, como siempre;
  // `null` significa "todavía no la tocaron".
  const [horaFinPropia, setHoraFinPropia]  = useState<string | null>(
    reserva && formatTime(reserva.hora_fin) !== formatTime(reserva.hora_inicio)
      ? formatTime(reserva.hora_fin)
      : null
  );
  const horaFin = horaFinPropia ?? horaInicio;
  // La devolución tiene que caer **después** del retiro, contando la hora: el
  // mismo día vale mientras la hora sea posterior. Comparar sólo fechas era lo
  // que rechazaba un alquiler de 07:30 a 18:40 del mismo día.
  const devolucionPosterior =
    !!fechaInicio && !!fechaFin && `${fechaFin}T${horaFin}` > `${fechaInicio}T${horaInicio}`;
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
  // **Ya no hay estado "Otro"** (plan 27/09, txt 4). El campo de texto está
  // siempre a la vista y los botones de los lugares habituales lo completan.
  // Con el "Otro" había que acertar primero el botón para que apareciera el
  // campo, y una dirección vieja que no estaba en la lista se veía como si no
  // hubiera lugar cargado.
  const [notas, setNotas]                     = useState(reserva?.notas ?? '');
  const [observaciones, setObservaciones]     = useState(reserva?.observaciones ?? '');
  // **El late check-in dejó de ser un tilde con un cargo escrito a mano** (A1).
  // Devolver una hora o más después del horario de retiro ya se cotiza como un
  // día más (`lib/dias.ts`, `tarifas.dias_facturables`), así que la devolución
  // acordada es directamente `fecha_fin`/`hora_fin`. Las reservas viejas que
  // tenían un acuerdo cargado lo conservan: acá sólo se muestra, no se pisa.
  const lateHeredado = Boolean(reserva?.late_checkout);

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
    setClienteElegidoAhora(true);
    setConductorIds([]);
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

  // Los días que se cobran: el mismo día es **un** día, no cero; y devolver
  // una hora o más después del horario de retiro suma uno (A1). La regla es la
  // del backend (`tarifas.dias_facturables`), espejada en `lib/dias.ts`.
  const duracionDias = diasFacturables(fechaInicio, horaInicio, fechaFin, horaFin);
  const avisoDiaDeMas = avisoDiaExtra(fechaInicio, horaInicio, fechaFin, horaFin);

  // Precio
  const initialPrecioTotal  = reserva?.precio_total ? parseFloat(reserva.precio_total as string) : 0;
  // Redondeado: la división casi nunca da exacta y ese float crudo terminaba
  // escrito en el campo como `33333.333333333336`.
  const initialPrecioPorDia = duracionDias > 0 && initialPrecioTotal
    ? redondear2(initialPrecioTotal / duracionDias) : 0;

  const [precioTotal, setPrecioTotal]   = useState<number | ''>(initialPrecioTotal || '');
  const [precioPorDia, setPrecioPorDia] = useState<number | ''>(initialPrecioPorDia || '');
  // Contrato de Uber: sólo al crear. Su total sale del valor de la semana.
  const [uber, setUber] = useState<DatosUber>(UBER_VACIO);
  const esUber = !reserva && uber.tipo === 'uber';
  // En Uber el precio sale del valor de la semana: sigue a lo que se carga.
  useEffect(() => {
    if (!esUber || uber.valorSemana === '' || duracionDias <= 0) return;
    const total = totalUber(Number(uber.valorSemana), duracionDias);
    setPrecioTotal(total);
    setPrecioPorDia(redondear2(total / duracionDias));
  }, [esUber, uber.valorSemana, duracionDias]);
  const [conFactura, setConFactura] = useState(reserva?.con_factura ?? false);
  // Cuánto del total va con factura. Vacío = todo (lo de siempre); el resto es caja.
  const [montoFacturado, setMontoFacturado] = useState<number | ''>('');

  // Adicionales contratados: { adicional_id → cantidad }. No entran en
  // `precio_total` (ese es el precio del auto) — se suman al facturar.
  const [adicionales, setAdicionales] = useState<Record<number, number>>(() =>
    Object.fromEntries((reserva?.adicionales ?? []).map(a => [a.adicional_id, a.cantidad]))
  );
  const { data: catalogoAdicionales = [] } = useAdicionales();
  /**
   * Las coberturas **incluidas** en el precio (la Exención por Daños, LDW).
   *
   * No se ofrecen como opción (plan 27/09, txt 5): aparecían como un botón más
   * al lado de Top Cover y Super Top Cover, y elegirla no cambiaba nada salvo
   * que el contrato la imprimía dos veces. Se muestran como texto: vienen.
   */
  const coberturasIncluidas = useMemo(
    () => catalogoAdicionales.filter(a => a.grupo === 'cobertura' && a.incluido),
    [catalogoAdicionales],
  );
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
  // Lo que las opciones fijas no alcanzan a decir: "50% al retirar y el resto a
  // 15 días", "paga la empresa contra factura". Sale en el PDF (migración 097).
  const [condicionPagoTexto, setCondicionPagoTexto] = useState(reserva?.condicion_pago_texto ?? '');
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
  // "Factura, forma de pago y anticipo" estaba plegado y ahora va siempre
  // abierto (plan 27/09, txt 11): plegado, nadie se enteraba de que ahí se
  // marcaba que el cliente ya había pagado, y la reserva quedaba "pendiente".
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
    // **Los de Uber no entran al selector.** No se alquilan, así que ofrecerlos
    // sólo sirve para elegir uno por error — y hasta ahora se podía: aparecían
    // dentro de su categoría real, mezclados con los que sí se venden, cada vez
    // que se apretaba "Ver toda la flota". La consulta de libres ya los
    // excluía, pero esa lista no.
    //
    // El backend igual lo rechaza (`ReservaService._validar_que_se_alquila`);
    // esto es para que no haya que llegar al rechazo.
    // Los autos que hoy están en Uber también se ofrecen: los autos rotan y el
    // contrato decide el destino (04/10/2026).
    const seAlquilan = vehiculosActivos;
    const grupos = categorias
      .map(c => ({
        nombre: c.nombre,
        vehiculos: seAlquilan.filter(v => v.categoria_id === c.id),
      }))
      .filter(g => g.vehiculos.length > 0);

    const huerfanos = seAlquilan.filter(
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
  const rangoElegido = devolucionPosterior;

  // Con qué se pisaría esta reserva, antes de guardar: avisa y deja seguir.
  const { data: avisosDeSolape } = useAvisosDeSolape(
    vehiculoId && rangoElegido
      ? {
          vehiculo_id: Number(vehiculoId),
          fecha_inicio: fechaInicio, hora_inicio: `${horaInicio}:00`,
          fecha_fin: fechaFin, hora_fin: `${horaFin}:00`,
          ...(reserva ? { excluir_reserva_id: reserva.id } : {}),
        }
      : null,
  );

  /** Se guardó igual, pero si quedó pisada se dice con qué (la lista de abajo
   *  se cierra con el modal y el aviso tiene que sobrevivir). */
  function avisarSolapes(avisos: SolapeWarning[]) {
    const solape = avisos.find(w => w.tipo.startsWith('solape_con_'));
    if (solape) toast.warning(textoAvisoSolape(solape));
  }
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
  type OpcionVehiculo = { id: number; etiqueta: string; ocupado: boolean; categoriaId: number | null };
  const opcionesVehiculo = useMemo(() => {
    let grupos: { nombre: string; vehiculos: OpcionVehiculo[] }[];
    // Editando no hay consulta de libres (el auto no se cambia desde esta
    // pantalla, el select esta deshabilitado): se muestra la flota entera para
    // que el auto que la reserva ya tiene siga apareciendo.
    if (isEdit || verTodaLaFlota) {
      grupos = vehiculosPorCategoria.map(g => ({
        nombre: g.nombre,
        vehiculos: g.vehiculos.map(v => ({
          id: v.id,
          etiqueta: `${v.patente} · ${v.marca} ${v.modelo}`,
          ocupado: !isEdit && !idsLibres.has(v.id),
          categoriaId: v.categoria_id ?? null,
        })),
      }));
    } else {
      const porCategoria = new Map<string, OpcionVehiculo[]>();
      for (const v of libres?.vehiculos ?? []) {
        const nombre = v.categoria_nombre ?? 'Sin categoría';
        const lista = porCategoria.get(nombre) ?? [];
        lista.push({
          id: v.id,
          etiqueta: `${v.patente} · ${v.marca} ${v.modelo}`
            + (v.es_downgrade ? ' · categoría menor' : '')
            + (v.vuelve_a ? ` · vuelve ${v.vuelve_a}` : ''),
          ocupado: false,
          categoriaId: v.categoria_id,
        });
        porCategoria.set(nombre, lista);
      }
      grupos = [...porCategoria.entries()].map(([nombre, vehiculos]) => ({ nombre, vehiculos }));
    }
    // **Con una categoría elegida, sólo sus unidades** (plan 27/09, txt 13).
    // El selector listaba la flota entera de todas las categorías y era fácil
    // asignar un auto de otra por error. El resto sigue a un click, detrás de
    // "Ver toda la flota".
    if (!isEdit && !verTodaLaFlota && categoriaId != null) {
      grupos = grupos
        .map(g => ({ ...g, vehiculos: g.vehiculos.filter(v => v.categoriaId === categoriaId) }))
        .filter(g => g.vehiculos.length > 0);
    }
    return grupos;
  }, [isEdit, verTodaLaFlota, vehiculosPorCategoria, libres, idsLibres, categoriaId]);

  /**
   * Las unidades de la categoría elegida, libres o no, para asignar el auto
   * desde el resumen (paso 6). Las comprometidas van marcadas: asignarlas se
   * puede, igual que en el paso 3, y el solape queda como advertencia.
   */
  const unidadesDeLaCategoria = useMemo(() => {
    if (categoriaId == null) return [];
    return vehiculosActivos
      .filter(v => v.categoria_id === categoriaId)
      .map(v => ({
        id: v.id,
        etiqueta: `${v.patente} · ${v.marca} ${v.modelo}`,
        ocupado: Boolean(libres) && !idsLibres.has(v.id),
      }));
  }, [vehiculosActivos, categoriaId, libres, idsLibres]);

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
      conductor_id: conductorIds[0] ?? null,
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
        setPrecioTotal(redondear2(precioPorDia * duracionDias));
      } else if (lastEditedRef.current === 'total' && precioTotal !== '') {
        // Redondeado: `100000 / 3` es `33333.333333333336` en punto flotante, y
        // ese número se escribía tal cual en el campo.
        setPrecioPorDia(redondear2(precioTotal / duracionDias));
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
  function faltaEnElPaso(n: number): { mensaje: string; campo: string } | null {
    // **Un cliente que todavía no existe no frena la reserva.** Con alguien
    // enfrente esperando, mandarlo a la pantalla de Clientes a cargar un alta
    // entera y volver a empezar es lo que hace que la reserva se anote en un
    // papel. Alcanza con el nombre: se crea al guardar y el DNI y el teléfono
    // quedan reclamados por la campana.
    //
    // Lo único que sigue siendo obligatorio es **saber a nombre de quién es**.
    if (n === 1 && !clienteId && nombreClientePendiente.length < 3) {
      return { mensaje: 'Poné al menos el nombre del cliente.', campo: 'cliente' };
    }
    if (n === 2) {
      if (!fechaInicio || !fechaFin) return { mensaje: 'Faltan las fechas.', campo: 'fechas' };
      if (!devolucionPosterior) {
        return {
          mensaje: fechaFin === fechaInicio
            ? 'Si se devuelve el mismo día, la hora de devolución tiene que ser posterior a la de retiro.'
            : 'La devolución tiene que ser posterior al retiro.',
          campo: 'fecha_fin',
        };
      }
      if (!lugarEntrega.trim()) return { mensaje: 'Falta el lugar de retiro.', campo: 'lugar_entrega' };
      if (!lugarDevolucion.trim()) return { mensaje: 'Falta el lugar de devolución.', campo: 'lugar_devolucion' };
    }
    // El paso 3 no exige auto: reservar sólo por categoría es válido. Lo único
    // que no se puede es no elegir ninguna de las dos cosas.
    if (n === 3 && !vehiculoId && !categoriaManualId) {
      return { mensaje: 'Elegí un auto, o al menos la categoría.', campo: 'vehiculo' };
    }
    if (n === 4 && (precioTotal === '' || Number(precioTotal) <= 0)) {
      return { mensaje: 'Falta el precio.', campo: 'precio' };
    }
    if (n === 4 && esDescuento && !descuentoMotivo.trim()) {
      return { mensaje: 'El precio es menor al de lista: indicá el motivo.', campo: 'descuento_motivo' };
    }
    if (n === 5 && !isEdit && !condicionPagoAncla) {
      return { mensaje: 'Elegí en qué momento se cobra.', campo: 'condicion_pago_ancla' };
    }
    return null;
  }

  function siguientePaso() {
    const falta = faltaEnElPaso(paso);
    setErrorPaso(falta?.mensaje ?? '');
    if (falta) {
      // Que el botón lleve al campo: el mensaje solo, al lado de "Siguiente",
      // obligaba a buscar qué faltó.
      irAlError(falta.campo);
      return;
    }
    setPaso(p => Math.min(6, p + 1));
  }

  // Los dos campos se derivan uno del otro, y **las dos derivaciones redondean
  // a dos decimales**. Sin eso, tipear un total que no divide exacto por los
  // días llenaba el campo de al lado con `33333.333333333336`.
  const handlePrecioPorDiaChange = (val: number | '') => {
    lastEditedRef.current = 'dia';
    if (val === '') { setPrecioPorDia(''); setPrecioTotal(''); return; }
    setPrecioPorDia(val);
    if (duracionDias > 0) setPrecioTotal(redondear2(val * duracionDias));
  };

  const handlePrecioTotalChange = (val: number | '') => {
    lastEditedRef.current = 'total';
    if (val === '') { setPrecioTotal(''); setPrecioPorDia(''); return; }
    setPrecioTotal(val);
    if (duracionDias > 0) setPrecioPorDia(redondear2(val / duracionDias));
  };

  const aplicarTarifa = (tarifa: Tarifa) => {
    const montoDia = parseFloat(tarifa.monto);
    lastEditedRef.current = 'dia';
    setPrecioPorDia(montoDia);
    if (duracionDias > 0) setPrecioTotal(redondear2(montoDia * duracionDias));
  };

  const tipoRecomendado = duracionDias > 0
    ? (duracionDias < 7 ? 'diaria' : duracionDias < 30 ? 'semanal' : 'mensual')
    : null;
  const tarifasDisponibles = (tarifasData ?? []).filter(t => t.activo);
  // La misma regla que aplica el backend (`_nacimiento_del_conductor`): manda
  // la del conductor designado si la tiene, y si no la del titular. Estimarlo
  // con otra fecha daría otro recargo y otra vez el falso "indique el motivo".
  const conductorElegido = conductoresCliente?.find(c => c.id === conductorIds[0]);
  const clienteElegido = clientesData?.data?.find(c => String(c.id) === clienteId);
  const esEmpresaElegida = clienteElegido?.tipo === 'empresa';
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
    !isEdit && (vehiculoId || categoriaManualId) && devolucionPosterior
      ? {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          // Con los horarios: devolver una hora o más después del retiro es
          // un día más, y el precio de lista tiene que traerlo (A1).
          hora_inicio: horaInicio + ':00',
          hora_fin: horaFin + ':00',
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

    return {
      total,
      porDia: redondear2(total / duracionDias),
      explicacion: explicacion + conDescuento,
    };
  }, [cotizacionLista, duracionDias]);

  /**
   * La diferencia contra el precio de lista, partida en dos.
   *
   * **Cobrar de menos hay que explicarlo; cobrar de más, no.** Del mostrador:
   * *"el cartel no me deja continuar si no le aclaro por la diferencia del
   * precio sugerido. Está bueno cuando es un monto menor, pero en casos como
   * estos que Martín le cobró más para hacer unos pesos no debería preguntar
   * demasiado — más plata mejor."*
   *
   * `precio_lista` existe para auditar el **descuento** (ítem 22): plata que
   * sale de la empresa. Un recargo no es eso, y frenar la carga de una reserva
   * con el cliente enfrente para que alguien escriba "le cobré más" es una
   * puerta sin nada del otro lado. La diferencia se sigue guardando igual.
   */
  //
  // **Se compara igual que el backend: una diferencia de menos de un peso no
  // cuenta** (`TOLERANCIA_DESCUENTO`). Antes se comparaban los dos números
  // redondeados, que no es lo mismo: $39.999,50 contra $40.000 redondeaba
  // igual acá y el servidor lo rechazaba igual pidiendo un motivo que la
  // pantalla nunca había pedido.
  const diferenciaCruda = !esUber && precioListaEstimado !== null && precioTotal !== ''
    ? Number(precioTotal) - precioListaEstimado
    : 0;
  const hayDiferenciaDePrecio = Math.abs(diferenciaCruda) >= TOLERANCIA_DESCUENTO;
  const esDescuento = hayDiferenciaDePrecio && diferenciaCruda < 0;
  const esRecargo = hayDiferenciaDePrecio && !esDescuento;
  const diferenciaPrecio = hayDiferenciaDePrecio ? redondear2(Math.abs(diferenciaCruda)) : 0;
  const requiereDatosEcheq = formaPagoPrevista === 'echeq' || (estadoPago !== 'pendiente' && anticipoMedioPago === 'echeq');

  /**
   * **Lo que se cobra en total**: el auto más los adicionales (y el cargo de
   * un late check-in viejo, si la reserva lo tenía). Es lo que significa
   * "Abonó el total" (plan 27/09, txt 14): antes se mandaba sólo el precio del
   * auto, y una reserva con seguro quedaba pagada y con el seguro pendiente.
   */
  const cargoLateHeredado = lateHeredado ? Number(reserva?.cargo_late_checkout ?? 0) : 0;
  // Lo que ya se cobró, para mostrarlo (sólo lectura) al editar. Con el auto
  // entregado no sale de la reserva: `resumenPago` lo manda a la cuenta corriente.
  const pagoActual = reserva ? resumenPago(reserva) : null;
  const totalACobrar = redondear2((Number(precioTotal) || 0) + totalAdicionales + cargoLateHeredado);

  /**
   * Falla el guardado y **te lleva al paso donde está el campo**.
   *
   * Cinco validaciones del guardado (garantía, ancla, anticipo) no tienen
   * puerta de paso porque dependen de combinaciones, así que saltan recién en
   * el resumen — con el control a dos pantallas de distancia y un mensaje que
   * no decía a dónde volver.
   */
  function errorEnPaso(mensaje: string, n: number, campo?: string) {
    setLocalError(mensaje);
    if (enPasos) setPaso(n);
    // Después del cambio de paso, al campo (o al cartel del error si el campo
    // no está a la vista). `irAlError` espera al render.
    irAlError(campo);
  }

  /**
   * Un rechazo del backend, llevado al paso y al campo que lo resuelven.
   *
   * El servidor valida lo mismo que la pantalla y alguna cosa más (el
   * solapamiento, el precio de lista con los datos de ese instante). Antes
   * todo eso terminaba en un cartel rojo al pie del resumen, con el campo a
   * dos pasos de distancia.
   */
  function errorDelServidor(err: unknown) {
    const mensaje = extractError(err, 'No se pudo guardar la reserva.');
    const destino: Record<string, [number, string]> = {
      descuento_sin_motivo: [4, 'descuento_motivo'],
      solapamiento: [3, 'vehiculo'],
      vehiculo_no_se_alquila: [3, 'vehiculo'],
      fechas_invalidas: [2, 'fecha_fin'],
      ancla_requerida: [5, 'condicion_pago_ancla'],
      fecha_ancla_requerida: [5, 'condicion_pago_ancla'],
    };
    const codigo = codigoDeError(err);
    const ir = codigo ? destino[codigo] : undefined;
    if (ir) {
      errorEnPaso(mensaje, ir[0], ir[1]);
    } else {
      setLocalError(mensaje);
      irAlError();
    }
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
      errorEnPaso('Falta el cliente: elegí uno de la lista o escribí su nombre.', 1, 'cliente');
      return;
    }
    if (!fechaInicio || !fechaFin) {
      errorEnPaso('Faltan las fechas del alquiler.', 2, 'fechas');
      return;
    }
    if (!vehiculoId && !categoriaManualId) {
      errorEnPaso('Elegí un vehículo, o al menos la categoría que se reservó.', 3, 'vehiculo');
      return;
    }
    if (!lugarEntrega.trim() || !lugarDevolucion.trim()) {
      errorEnPaso(
        'Falta el lugar de retiro o de devolución.', 2,
        lugarEntrega.trim() ? 'lugar_devolucion' : 'lugar_entrega',
      );
      return;
    }
    if (!devolucionPosterior) {
      errorEnPaso('La devolución tiene que ser posterior al retiro (si es el mismo día, con una hora más tarde).', 2, 'fecha_fin');
      return;
    }
    if (!precioTotal) {
      errorEnPaso('Falta el precio: cargá el total o el precio por día.', 4, 'precio');
      return;
    }
    if (!isEdit && esDescuento && !descuentoMotivo.trim()) {
      errorEnPaso('El precio es menor al de lista: indicá el motivo.', 4, 'descuento_motivo');
      return;
    }
    if (garantiaTipo !== 'no_aplica' && !garantiaMonto) {
      errorEnPaso('Falta el monto de la garantía.', 5, 'garantia_monto');
      return;
    }
    if (!isEdit && !condicionPagoAncla) {
      errorEnPaso(
        condicionPago === 'contado'
          ? 'Elegí en qué momento se cobra: al entregar el auto, al devolverlo, u otra fecha.'
          : 'Elegí desde cuándo se cuentan los días del plazo de pago.',
        5, 'condicion_pago_ancla',
      );
      return;
    }
    if (condicionPagoAncla === 'fecha_especifica' && !condicionPagoFechaAncla) {
      errorEnPaso('Falta la fecha desde la que se cuenta el plazo de pago.', 5, 'condicion_pago_fecha_ancla');
      return;
    }
    // Al editar el pago no se toca (ver el payload): no se valida lo que no viaja.
    if (!isEdit && estadoPago === 'anticipo') {
      if (!anticipoMonto) {
        errorEnPaso('Falta el monto del anticipo.', 5, 'anticipo_monto');
        return;
      }
      if (!anticipoFecha || !anticipoMedioPago) {
        errorEnPaso('Falta la fecha o el medio de pago del anticipo.', 5, anticipoFecha ? 'anticipo_medio_pago' : 'anticipo_fecha');
        return;
      }
      // Contra el total a cobrar —auto más adicionales—, no contra el precio
      // del auto solo: con un seguro contratado, un anticipo igual al precio
      // del auto es un anticipo, no el pago total.
      if (parseFloat(anticipoMonto as string) >= totalACobrar) {
        errorEnPaso('El anticipo cubre el total: marcá "Abonó el total".', 5, 'anticipo_monto');
        return;
      }
    }
    if (!isEdit && estadoPago === 'pagado') {
      if (!anticipoFecha || !anticipoMedioPago) {
        errorEnPaso('Falta la fecha o el medio del pago.', 5, anticipoFecha ? 'anticipo_medio_pago' : 'anticipo_fecha');
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
          // La lista entera: vacía saca a todos (maneja el titular).
          conductor_ids: conductorIds,
          fecha_inicio: fechaInicio,
          hora_inicio: horaInicio + ':00',
          fecha_fin: fechaFin,
          hora_fin: horaFin + ':00',
          lugar_entrega: lugarEntrega,
          lugar_devolucion: lugarDevolucion,
          notas: notas || null,
          observaciones: observaciones || null,
          precio_total: precioTotal || null,
          // Sin `late_checkout` ni cargo: desde A1 el horario de devolución se
          // cobra solo. Una reserva vieja con un acuerdo cargado lo conserva
          // porque no se manda nada que lo pise.
          // Sólo se mandan si se pueden cambiar: después del check-out el
          // backend los rechaza, y mandarlos igual rompería la edición.
          ...(adicionalesBloqueados ? {} : {
            adicionales: Object.entries(adicionales).map(([id, cantidad]) => ({
              adicional_id: Number(id), cantidad,
            })),
          }),
          forma_pago_prevista: formaPagoPrevista || null,
          // **Sin `estado_pago` ni anticipo al editar.** Marcar "abonó" en el
          // formulario no es cobrar: no deja `Pago` ni recibo, y el backend
          // terminaba inventando un anticipo. Los cobros van por la caja
          // (`registrar-cobro`); acá el estado del pago se muestra y nada más.
          condicion_pago: condicionPago,
          ...(condicionPagoAncla ? {
            condicion_pago_ancla: condicionPagoAncla,
            condicion_pago_fecha_ancla: condicionPagoAncla === 'fecha_especifica' ? condicionPagoFechaAncla || null : null,
          } : {}),
          // `''` borra la aclaración: el backend distingue vacío de "no tocar".
          condicion_pago_texto: condicionPagoTexto.trim(),
        };
        // Los avisos se propagan: entre ellos viene el de D-48, que dice que
        // se anuló un contrato firmado porque se le cambió el auto. Tirarlos
        // acá era la razón por la que eso podía pasar sin que nadie lo viera.
        const { reserva: actualizada, warnings } = await updateReserva(reserva!.id, payload);
        avisarSolapes(warnings);
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
          conductor_ids: conductorIds,
          fecha_inicio: fechaInicio,
          hora_inicio: horaInicio + ':00',
          fecha_fin: fechaFin,
          hora_fin: horaFin + ':00',
          lugar_entrega: lugarEntrega,
          lugar_devolucion: lugarDevolucion,
          notas: notas || null,
          observaciones: observaciones || null,
          // El late check-in ya no se carga a mano (A1): la devolución pactada
          // es `fecha_fin`/`hora_fin`, y el rato de más ya está en el precio.
          late_checkout: false,
          cargo_late_checkout: 0,
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
          anticipo_monto: estadoPago === 'anticipo' ? parseFloat(anticipoMonto as string) : (estadoPago === 'pagado' ? totalACobrar : null),
          anticipo_fecha: estadoPago !== 'pendiente' ? anticipoFecha : null,
          anticipo_medio_pago: estadoPago !== 'pendiente' ? anticipoMedioPago : null,
          con_factura: conFactura,
          ...(conFactura && montoFacturado !== '' ? { monto_facturado: Number(montoFacturado) } : {}),
          descuento_motivo: hayDiferenciaDePrecio ? (descuentoMotivo.trim() || null) : null,
          condicion_pago: condicionPago,
          // El ancla se manda siempre, también en contado: "en el momento" no
          // dice cuál momento, y entre la entrega y la devolución puede haber
          // semanas. Ver el selector más abajo.
          condicion_pago_ancla: condicionPagoAncla || null,
          condicion_pago_fecha_ancla: condicionPagoAncla === 'fecha_especifica' ? condicionPagoFechaAncla || null : null,
          condicion_pago_texto: (esUber ? uber.condicion.trim() : condicionPagoTexto.trim()) || null,
          ...(esUber ? {
            tipo: 'uber' as const,
            uber_valor_semana: Number(uber.valorSemana),
            uber_km_semana: uber.kmSemana === '' ? null : Number(uber.kmSemana),
            uber_precio_km_extra: uber.precioKmExtra === '' ? null : Number(uber.precioKmExtra),
            fechas_pago: uber.fechasPago.filter(Boolean),
          } : {}),
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
        avisarSolapes(w);
        // El PDF de confirmación se descarga solo para mandárselo al cliente.
        // Si la descarga falla no se pierde nada: el backend ya lo archivó en
        // el perfil del cliente y se puede volver a bajar desde el listado.
        descargarPdfReserva(r.id).catch(() => {});
        onSuccess(r, w);
      }
    } catch (err: unknown) {
      errorDelServidor(err);
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
   *
   * **Se arma con lo elegido ahora, no con lo que vino del calendario**
   * (plan 27/09, txt 12). Antes salía de `initialVehiculoId` y nunca se
   * actualizaba: se cambiaba el auto en el paso 3 y el encabezado seguía
   * nombrando el primero, o sea que el resumen decía una cosa y el
   * encabezado otra.
   */
  const precargado = useMemo(() => {
    if (isEdit) return null;
    const partes: string[] = [];
    if (vehiculoSeleccionado) {
      partes.push(`${vehiculoSeleccionado.patente} · ${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.modelo}`);
    } else if (categoriaNombreElegida) {
      partes.push(`${categoriaNombreElegida} — sin asignar`);
    }
    if (fechaInicio && (initialFechaInicio || partes.length)) partes.push(`retiro ${formatFecha(fechaInicio)}`);
    return partes.length ? partes.join(' · ') : null;
  }, [isEdit, vehiculoSeleccionado, categoriaNombreElegida, fechaInicio, initialFechaInicio]);

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
    clienteId, clientSearch, conductorIds,
    vehiculoId, categoriaManualId,
    fechaInicio, horaInicio, fechaFin, horaFinPropia,
    lugarEntrega, lugarDevolucion,
    precioTotal, precioPorDia, descuentoMotivo, adicionales, conFactura,
    garantiaTipo, garantiaMonto,
    formaPagoPrevista, estadoPago, anticipoMonto, anticipoFecha, anticipoMedioPago,
    condicionPago, condicionPagoAncla, condicionPagoFechaAncla, condicionPagoTexto,
    tipoFactura, facturaANombreDe,
    echeqBanco, echeqNumeroCheque, echeqFechaCobro,
    notas, observaciones,
  }), [
    paso, clienteId, clientSearch, conductorIds, vehiculoId, categoriaManualId,
    fechaInicio, horaInicio, fechaFin, horaFinPropia, lugarEntrega, lugarDevolucion,
    precioTotal, precioPorDia, descuentoMotivo, adicionales,
    conFactura, garantiaTipo, garantiaMonto, formaPagoPrevista, estadoPago,
    anticipoMonto, anticipoFecha, anticipoMedioPago, condicionPago,
    condicionPagoAncla, condicionPagoFechaAncla, condicionPagoTexto, tipoFactura, facturaANombreDe,
    echeqBanco, echeqNumeroCheque, echeqFechaCobro, notas, observaciones,
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
    setClienteId(d.clienteId); setClientSearch(d.clientSearch);
    setClienteElegidoAhora(false);
    // Un borrador anterior a los conductores múltiples trae `conductorId`.
    const viejo = (d as { conductorId?: string }).conductorId;
    setConductorIds(Array.isArray(d.conductorIds) ? d.conductorIds : (viejo ? [Number(viejo)] : []));
    setVehiculoId(d.vehiculoId); setCategoriaManualId(d.categoriaManualId);
    setFechaInicio(d.fechaInicio); setHoraInicio(d.horaInicio); setFechaFin(d.fechaFin);
    setHoraFinPropia(d.horaFinPropia ?? null);
    setLugarEntrega(d.lugarEntrega); setLugarDevolucion(d.lugarDevolucion);
    // Un borrador guardado antes de A1 puede traer el late check-in manual y
    // los flags de "Otro": se ignoran. El horario ya se cobra solo y el lugar
    // está en su campo de texto.
    setPrecioTotal(d.precioTotal); setPrecioPorDia(d.precioPorDia);
    setDescuentoMotivo(d.descuentoMotivo); setAdicionales(d.adicionales);
    setConFactura(d.conFactura);
    setGarantiaTipo(d.garantiaTipo); setGarantiaMonto(d.garantiaMonto);
    setFormaPagoPrevista(d.formaPagoPrevista); setEstadoPago(d.estadoPago);
    setAnticipoMonto(d.anticipoMonto); setAnticipoFecha(d.anticipoFecha);
    setAnticipoMedioPago(d.anticipoMedioPago);
    setCondicionPago(d.condicionPago); setCondicionPagoAncla(d.condicionPagoAncla);
    setCondicionPagoFechaAncla(d.condicionPagoFechaAncla);
    setCondicionPagoTexto(d.condicionPagoTexto ?? '');
    setTipoFactura(d.tipoFactura); setFacturaANombreDe(d.facturaANombreDe);
    setEcheqBanco(d.echeqBanco); setEcheqNumeroCheque(d.echeqNumeroCheque);
    setEcheqFechaCobro(d.echeqFechaCobro);
    setNotas(d.notas);
    setObservaciones(d.observaciones);
    setPaso(d.paso);
    marcarRetomado();
    if (d.garantiaTipo === 'tarjeta') {
      toast.info('Los datos de la tarjeta hay que cargarlos de nuevo: no se guardan en el navegador.');
    }
  };

  const TIPO_TARIFA_LABEL: Record<string, string> = { diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      {/* Más grande a propósito (era max-w-2xl, 672px; ahora ~1150px, un 70% más): la
            lista de clientes se abre adentro del formulario y con el modal chico
            se cortaba y sólo se veía uno. El alto mínimo le da lugar para
            mostrar varios sin scrollear. */}
      <div className="w-full max-w-6xl min-h-[75vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
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
              {/* Lo elegido hasta ahora (auto o categoría, y el retiro). Sin
                  esto, el click en la celda del calendario no se ve reflejado
                  en ningún lado hasta el paso 3. */}
              {precargado && (
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Calendar className="h-3 w-3" />
                  {precargado}
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
                    {verTodaLaFlota
                      ? (categoriaNombreElegida ? `Ver sólo ${categoriaNombreElegida} libres` : 'Ver sólo los libres')
                      : 'Ver toda la flota'}
                  </button>
                )}
              </div>
              <select
                data-campo="vehiculo"
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
                  {categoriaNombreElegida
                    ? `Sólo los ${categoriaNombreElegida} libres en estas fechas`
                    : 'Sólo los que están libres en estas fechas'}
                  , con el tiempo de preparación entre alquileres ya descontado.
                </p>
              )}
              {/* Libre, pero vuelve justo antes: la preparación es un aviso, no un bloqueo. */}
              {(() => {
                const ajustado = libres?.vehiculos.find(v => String(v.id) === vehiculoId && v.vuelve_a);
                if (!ajustado || isEdit) return null;
                const m = ajustado.minutos_para_prepararlo ?? 0;
                return (
                  <p data-aviso="vuelve-justo" className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Vuelve a las {ajustado.vuelve_a}: quedan {Math.floor(m / 60) > 0 ? `${Math.floor(m / 60)} h ` : ''}{m % 60} min para prepararlo.
                  </p>
                );
              })()}
              {/* Lo que se pisa, con quién y cuándo. El "vuelve a las…" ya se dice
                  arriba, así que acá se saca para no repetirlo. */}
              {!isEdit && avisosDeSolape && <AvisoSolape avisos={{ ...avisosDeSolape, vuelve_a: null }} />}
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
                  data-campo="cliente"
                  type="text"
                  placeholder="Buscar por nombre, DNI o CUIT..."
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setClienteId(''); setClientDropdownOpen(true); }}
                  onFocus={() => setClientDropdownOpen(true)}
                  disabled={isEdit}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-slate-100"
                />
                {clientDropdownOpen && !isEdit && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10">
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
                            {c.dni_cuit && <div className="text-xs text-slate-500">DNI/CUIT: {formatDocumento(c.dni_cuit)}</div>}
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

          {/* Conductores: de 1 a 3, o ninguno (maneja el titular). Se ve
              siempre que haya un cliente elegido —también si todavía no tiene
              conductores— porque "+ Nuevo conductor" los carga en el momento. */}
          {clienteId && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {esEmpresaElegida ? 'Quién maneja' : 'Conductores'}
              </label>
              <SelectorConductores
                clienteId={Number(clienteId)}
                seleccionados={conductorIds}
                onChange={setConductorIds}
                esEmpresa={esEmpresaElegida}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                excluirReservaId={reserva?.id ?? null}
                preseleccionarUnico={!isEdit && clienteElegidoAhora}
              />
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
              <div className="flex gap-2" data-campo="fechas">
                <input type="date" value={fechaInicio} min={FECHA_MIN} max={FECHA_MAX}
                  onChange={e => {
                    const nueva = e.target.value;
                    setFechaInicio(nueva);
                    // Mover el retiro más allá de la devolución dejaría una
                    // duración negativa y el precio en cero hasta que alguien
                    // toque el otro campo. La devolución acompaña.
                    if (nueva && fechaFin && fechaFin < nueva) setFechaFin(nueva);
                  }}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
                <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                  className="w-24 px-2 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Fin *
                {duracionDias > 0 && <span className="text-primary font-normal">({duracionDias} día{duracionDias !== 1 ? 's' : ''})</span>}
              </label>
              <div className="flex gap-2" data-campo="fecha_fin">
                <input type="date" value={fechaFin} min={fechaInicio || FECHA_MIN} max={FECHA_MAX}
                  onChange={e => setFechaFin(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
                <input type="time" value={horaFin} onChange={e => setHoraFinPropia(e.target.value || null)}
                  className="w-24 px-2 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {fechaInicio && fechaFin && !devolucionPosterior && (
                <p className="text-[11px] leading-snug text-amber-700">
                  La devolución tiene que ser después del retiro. Si es el mismo día, poné una hora más tarde.
                </p>
              )}
              {/* Informativo, no un error: el día extra es la regla (A1). Se
                  dice acá, donde se elige la hora, para que no sorprenda en el
                  precio del paso 4. */}
              {devolucionPosterior && avisoDiaDeMas && (
                <p className="text-xs leading-snug text-sky-800 bg-sky-50 border border-sky-200 rounded-md px-2 py-1">
                  {avisoDiaDeMas}
                </p>
              )}
            </div>
          </div>
          {/* Con las fechas ya elegidas, el aviso de conductor ocupado se
              repite acá: en el paso 1 se calculó con las fechas por defecto. */}
          {enPasos && (
            <AvisoConductoresOcupados
              ids={conductorIds} fechaInicio={fechaInicio} fechaFin={fechaFin}
            />
          )}
          {lateHeredado && (
            <p className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Esta reserva tiene una devolución acordada cargada a mano
              {reserva?.fecha_devolucion_acordada && ` para el ${formatFecha(reserva.fecha_devolucion_acordada)}`}
              {reserva?.hora_devolucion_acordada && ` a las ${formatTime(reserva.hora_devolucion_acordada)}`}
              {cargoLateHeredado > 0 && `, con un cargo de $${formatMiles(cargoLateHeredado)}`}.
              Se conserva como estaba; las reservas nuevas ya cobran el horario solas.
            </p>
          )}

          {/* Reserva retroactiva: se avisa, no se bloquea.

              El alquiler ya pasó y el papel se firma después — es un caso real
              y el sistema lo soporta entero. Pero cargar una fecha vieja sin
              querer también existe, así que se dice en voz alta. */}
          {fechaInicio && fechaInicio < today() && (
            <p className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Estás cargando una reserva <strong>que ya empezó</strong> ({formatFecha(fechaInicio)}).
              Se puede guardar igual: sirve para documentar un alquiler que ya ocurrió.
            </p>
          )}

          {/* Acá estaba el tilde "Devuelve en otro horario (late check-in)" con
              su fecha, su hora y un cargo escrito a mano. Se sacó (plan 27/09,
              A1): el horario de devolución se carga arriba, junto al de
              retiro, y si se pasa una hora o más se cobra un día más solo. El
              cargo manual era un número que alguien tenía que acordarse de
              poner, y cuando no se acordaba, el rato de más se regalaba. */}

          {/* Lugares. **El campo de texto está siempre a la vista** (plan
              27/09, txt 4): los botones de los lugares habituales lo
              completan, y cualquier otra dirección se escribe directo. Antes
              había que apretar "Otro" para que apareciera el campo. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {([
              { campo: 'lugar_entrega', titulo: 'Lugar de entrega *', valor: lugarEntrega, set: setLugarEntrega },
              { campo: 'lugar_devolucion', titulo: 'Lugar de devolución *', valor: lugarDevolucion, set: setLugarDevolucion },
            ] as const).map(l => (
              <div key={l.campo} className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" /> {l.titulo}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {lugares.map(lugar => (
                    <button key={lugar} type="button"
                      onClick={() => l.set(lugar)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        l.valor === lugar
                          ? 'bg-primary/15 border-primary/35 text-primary'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10 hover:border-primary/25'
                      }`}
                    >
                      {lugar}
                    </button>
                  ))}
                </div>
                <input type="text" value={l.valor} onChange={e => l.set(e.target.value)}
                  data-campo={l.campo}
                  placeholder="O escribí otra dirección"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" required />
              </div>
            ))}
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
                      ${formatMiles(precioSugerido.total)}
                    </strong>
                    <span className="text-xs text-slate-500">
                      {' '}· ${formatMiles(precioSugerido.porDia)}/día
                    </span>
                  </span>
                  {precioTotal !== Math.round(precioSugerido.total) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrecioTotal(Math.round(precioSugerido.total));
                        setPrecioPorDia(redondear2(Math.round(precioSugerido.total) / duracionDias));
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

            {/* Alquiler común o Uber. Sólo al crear: el tipo no se cambia después. */}
            {!reserva && (
              <CamposUber value={uber} onChange={setUber} fechaInicio={fechaInicio} dias={duracionDias} />
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* `InputMoneda` y no `type="number"`: es lo que permite el
                  punto de los miles (*"200.000, así"*) y lo que evita que el
                  precio por día derivado se pinte como `33333.333333333336`.
                  Ver el comentario del componente. */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Precio x Día *</label>
                <InputMoneda
                  value={precioPorDia}
                  onChange={handlePrecioPorDiaChange}
                  disabled={esUber}
                  placeholder="35.000"
                  className={`w-full px-3 py-2 rounded-lg border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    localError?.includes('cotización') && precioTotal === '' ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
                  }`}
                />
              </div>
              <div className="space-y-1.5" data-campo="precio">
                <label className="text-xs font-medium text-slate-600">Precio Total *</label>
                <InputMoneda
                  value={precioTotal}
                  onChange={handlePrecioTotalChange}
                  disabled={esUber}
                  placeholder="140.000"
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
                      // Las incluidas no son una opción: vienen (ver
                      // `coberturasIncluidas`, más abajo como texto).
                      const delGrupo = catalogoAdicionales.filter(a => a.grupo === grupo && !a.incluido);
                      if (delGrupo.length === 0) return null;
                      return (
                        <div key={grupo} className="space-y-1">
                          <p className="text-[11px] font-medium text-slate-500">
                            {grupo === 'cobertura' ? 'Cobertura adicional (opcional, elegí una)' : 'Extras'}
                          </p>
                          {grupo === 'cobertura' && coberturasIncluidas.length > 0 && (
                            <p className="text-xs text-slate-600">
                              Incluye: <strong>{coberturasIncluidas.map(a => a.nombre).join(', ')}</strong>
                            </p>
                          )}
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
                              {/* **La franquicia no se explicaba en ninguna
                                  pantalla.** Es el número más grande del
                                  resumen y el que el cliente pregunta siempre;
                                  quien atiende tiene que poder contestarlo sin
                                  buscarlo en el contrato. */}
                              <p className="mb-1.5 text-[11px] leading-snug text-slate-500">
                                Lo máximo que paga el cliente de su bolsillo si
                                rompe el auto. No es un cargo: no se cobra ahora
                                y no se suma al alquiler.
                              </p>
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
            {/* **Cobrar de más avisa; cobrar de menos pregunta.**

                Antes era un solo cartel ámbar con un campo obligatorio para
                cualquier diferencia, en los dos sentidos. Del mostrador: *"el
                cartel no me deja continuar si no le aclaro por la diferencia
                del precio sugerido. Está bueno cuando es un monto menor, pero
                en casos como estos que Martín le cobró más para hacer unos
                pesos no debería preguntar demasiado — más plata mejor."*

                Tienen razón: `precio_lista` existe para auditar el descuento
                (ítem 22), que es plata que sale de la empresa. Un recargo se
                informa y se sigue. La diferencia queda registrada igual en los
                dos casos. */}
            {!isEdit && esRecargo && (
              <p className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-slate-700">
                Estás cobrando <strong>${formatMiles(diferenciaPrecio)} más</strong> que el
                precio de lista (${formatMiles(precioListaEstimado)}). Se guarda así —
                queda registrado quién lo autorizó.
              </p>
            )}
            {!isEdit && esDescuento && (
              <div className="space-y-1.5">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ Estás cobrando <strong>${formatMiles(diferenciaPrecio)} menos</strong> que el
                  precio de lista (${formatMiles(precioListaEstimado)}). Indicá el motivo — queda auditado.
                </p>
                <textarea
                  data-campo="descuento_motivo"
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
          {/* **Letra más grande y todo a la vista** (plan 27/09, txt 11). Era el
              paso con la letra más chica del wizard (11-12 px) y la parte de
              factura y anticipo venía plegada: ahí se marca que el cliente ya
              pagó, y plegada nadie la abría. */}
          {(!enPasos || paso === 5) && (
          <div className="space-y-5">
            <div className="space-y-4 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Condición de pago *</label>
                <div className="flex gap-2 flex-wrap">
                  {CONDICIONES_PAGO.map(o => (
                    <button
                      key={o.value} type="button"
                      onClick={() => { setCondicionPago(o.value); }}
                      className={`px-3.5 py-2 rounded-lg border text-sm font-medium transition-all ${
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
                <div className="space-y-2 pt-1" data-campo="condicion_pago_ancla">
                  <label className="text-sm font-medium text-slate-600">
                    {condicionPago === 'contado'
                      ? `¿En qué momento se cobra?${isEdit ? '' : ' *'}`
                      : `¿A partir de cuándo se cuentan los días?${isEdit ? '' : ' *'}`}
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
                        className={`px-3.5 py-2 rounded-lg border text-sm font-medium transition-all ${
                          condicionPagoAncla === o.value ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                    {condicionPagoAncla === 'fecha_especifica' && (
                      <input
                        type="date"
                        data-campo="condicion_pago_fecha_ancla"
                        value={condicionPagoFechaAncla}
                        onChange={e => setCondicionPagoFechaAncla(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    )}
                  </div>
                  {condicionPago === 'contado' && condicionPagoAncla === 'checkin' && (
                    <p className="text-xs text-slate-500 leading-snug">
                      El saldo queda sin fecha de vencimiento hasta que el auto
                      vuelva: recién en el check-in se sabe qué día es.
                    </p>
                  )}
                </div>
                {/* Texto libre (migración 097): lo que se pacta de verdad no
                    siempre entra en los botones. Sale en el PDF de la reserva. */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-sm font-medium text-slate-600">
                    Aclaración de la condición de pago <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <textarea
                    data-campo="condicion_pago_texto"
                    value={condicionPagoTexto}
                    onChange={e => setCondicionPagoTexto(e.target.value)}
                    rows={2}
                    placeholder="Ej: 50% al retirar y el resto a 15 días. Sale en el PDF de la reserva."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-3 border-t border-slate-200">
                <p className="text-sm font-semibold text-slate-700">
                  {isEdit ? 'Factura, forma de pago y cobros' : 'Factura, forma de pago y anticipo'}
                </p>
                {/* Al editar, la factura no se guarda (la edición de la reserva
                    no la recibe): mostrar los campos editables hacía creer que
                    el cambio quedaba. Se muestra lo que quedó y nada más. */}
                {isEdit ? (
                  <p className="text-sm text-slate-600" data-testid="factura-solo-lectura">
                    {conFactura
                      ? `Con factura${tipoFactura ? ` ${tipoFactura}` : ''}${facturaANombreDe ? ` a nombre de ${facturaANombreDe}` : ''}.`
                      : 'Sin factura.'}{' '}
                    <span className="text-slate-500">La factura se define al crear la reserva y no se cambia desde acá.</span>
                  </p>
                ) : (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={conFactura} onChange={e => setConFactura(e.target.checked)} className="accent-primary w-4 h-4" />
                  Con factura
                </label>
                )}
                {!isEdit && conFactura && (
                  <div className="space-y-1.5 pl-1" data-campo="monto_facturado">
                    <label className="text-sm font-medium text-slate-600">¿Cuánto se factura?</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-44">
                        <InputMoneda value={montoFacturado} onChange={setMontoFacturado}
                          placeholder="Todo el total"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <button type="button" onClick={() => setMontoFacturado('')}
                        className="text-xs text-primary underline">Todo</button>
                      <span className="text-xs text-slate-500">
                        {montoFacturado === '' ? 'Se factura el total.' : `El resto (${formatMiles(Math.max(0, totalACobrar - Number(montoFacturado)))}) va sin factura.`}
                      </span>
                    </div>
                  </div>
                )}
                {!isEdit && conFactura && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-600">Tipo de factura</label>
                      <div className="flex gap-2">
                        {(['A', 'B', 'C'] as const).map(t => (
                          <button
                            key={t} type="button"
                            onClick={() => setTipoFactura(t === tipoFactura ? '' : t)}
                            className={`px-3.5 py-2 rounded-lg border text-sm font-medium transition-all ${
                              tipoFactura === t ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-600">A nombre de</label>
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

                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="text-sm font-medium text-slate-600">Forma de pago esperada (opcional)</label>
                  <div className="flex gap-2 flex-wrap">
                    {['efectivo', 'transferencia', 'tarjeta', 'wapa', 'cheque', 'echeq', 'otro', 'cuenta_corriente'].map(m => (
                      <button
                        key={m} type="button"
                        onClick={() => setFormaPagoPrevista(m === formaPagoPrevista ? '' : m)}
                        className={`px-3.5 py-2 rounded-lg border text-sm font-medium transition-all ${
                          formaPagoPrevista === m ? 'bg-primary/15 border-primary/35 text-primary' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {m.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </button>
                    ))}
                  </div>
                </div>

                {isEdit ? (
                  <div className="space-y-1 pt-2 border-t border-slate-200" data-testid="pago-solo-lectura">
                    <label className="text-sm font-medium text-slate-600">Estado del pago</label>
                    <p className="text-sm text-slate-700">
                      {pagoActual == null || pagoActual.fuente === 'cuenta_corriente'
                        ? 'El auto ya se entregó: lo cobrado y el saldo están en la cuenta corriente del cliente.'
                        : pagoActual.pagado
                          ? 'Pagada'
                          : (pagoActual.cobrado ?? 0) > 0
                            ? `Cobrado $${formatMiles(pagoActual.cobrado ?? 0)} · saldo $${formatMiles(pagoActual.saldo ?? 0)}`
                            : ESTADO_PAGO_LABEL.pendiente}
                    </p>
                    <p className="text-xs text-slate-500">
                      Para registrar un cobro usá "Cobrar" en la Caja o la cuenta corriente del cliente:
                      así queda el pago con su recibo. Desde acá no se cambia.
                    </p>
                  </div>
                ) : (<>
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="text-sm font-medium text-slate-600">¿El cliente ya abonó algo?</label>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="radio" checked={estadoPago === 'pendiente'} onChange={() => setEstadoPago('pendiente')} className="accent-primary w-4 h-4" />
                      No, está pendiente
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="radio" checked={estadoPago === 'anticipo'} onChange={() => setEstadoPago('anticipo')} className="accent-primary w-4 h-4" />
                      Abonó un anticipo
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="radio" checked={estadoPago === 'pagado'} onChange={() => setEstadoPago('pagado')} className="accent-primary w-4 h-4" />
                      Abonó el total
                    </label>
                  </div>
                </div>

                {estadoPago !== 'pendiente' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    {estadoPago === 'anticipo' && (
                      <div className="space-y-1.5" data-campo="anticipo_monto">
                        <label className="text-sm font-medium text-slate-600">Monto anticipo *</label>
                        <InputMoneda
                          value={anticipoMonto === '' || anticipoMonto == null ? '' : Number(anticipoMonto)}
                          onChange={v => setAnticipoMonto(v === '' ? '' : String(v))}
                          placeholder="50.000"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                    )}
                    {estadoPago === 'pagado' && (
                      <div className="space-y-1.5">
                        {/* El total a cobrar: auto + adicionales (plan 27/09,
                            txt 14). Antes mostraba y mandaba sólo el precio
                            del auto, y el seguro quedaba pendiente. */}
                        <label className="text-sm font-medium text-slate-600">Monto total</label>
                        <input type="text" value={`$${formatMiles(totalACobrar)}`} disabled
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 text-sm" />
                        {totalAdicionales > 0 && (
                          <p className="text-xs text-slate-500">
                            Auto ${formatMiles(Number(precioTotal) || 0)} + adicionales ${formatMiles(totalAdicionales)}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-600">Fecha de pago *</label>
                      <input type="date" data-campo="anticipo_fecha" value={anticipoFecha} onChange={e => setAnticipoFecha(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-600">Medio de pago *</label>
                      <select data-campo="anticipo_medio_pago" value={anticipoMedioPago} onChange={e => setAnticipoMedioPago(e.target.value)}
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
                </>)}

                {!isEdit && requiereDatosEcheq && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="text-sm font-medium text-slate-600">Datos del echeq (opcional)</label>
                    <p className="text-xs text-slate-500">
                      Podés completarlo ahora o dejarlo pendiente — se puede cargar después desde el cliente.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-600">Banco</label>
                        <input type="text" value={echeqBanco} onChange={e => setEcheqBanco(e.target.value)}
                          placeholder="Ej: Banco Nación"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-600">Número de cheque</label>
                        <input type="text" value={echeqNumeroCheque} onChange={e => setEcheqNumeroCheque(e.target.value)}
                          placeholder="Ej: 00012345"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-600">Fecha de cobro</label>
                        <input type="date" value={echeqFechaCobro} onChange={e => setEcheqFechaCobro(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
                    className={`px-3.5 py-2 rounded-lg border text-sm font-medium transition-all ${
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
                  <div className="space-y-1.5" data-campo="garantia_monto">
                    <label className="text-sm font-medium text-slate-600">Monto retenido *</label>
                    <InputMoneda
                      value={garantiaMonto === '' || garantiaMonto == null ? '' : Number(garantiaMonto)}
                      onChange={v => setGarantiaMonto(v === '' ? '' : String(v))}
                      placeholder="50.000"
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
                      <p className="text-xs text-slate-600 leading-snug">
                        Anotá sólo los <strong>últimos cuatro dígitos</strong>. El sistema no
                        guarda el número completo ni el código de seguridad.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1">
                          <label className="text-sm text-slate-600">Titular</label>
                          <input
                            type="text"
                            value={garantiaTarjetaTitular}
                            onChange={e => setGarantiaTarjetaTitular(e.target.value)}
                            placeholder="Nombre como en la tarjeta"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm text-slate-600">Últimos 4 dígitos</label>
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
                          <label className="text-sm text-slate-600">Vencimiento</label>
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
            horaFin={horaFin}
            avisoDiaDeMas={avisoDiaDeMas}
            precioTotal={precioTotal === '' ? null : Number(precioTotal)}
            totalAdicionales={totalAdicionales}
            franquicia={franquiciaCobertura ?? franquiciaBase}
            condicionPago={CONDICIONES_PAGO.find(c => c.value === condicionPago)?.label ?? condicionPago}
            condicionPagoTexto={condicionPagoTexto.trim()}
            semaforo={semaforoPrevio ?? null}
            vehiculoId={vehiculoId}
            unidades={unidadesDeLaCategoria}
            onElegirVehiculo={elegirVehiculo}
          />
          )}
          {/* Dos campos, y no uno.

              **El de una sola casilla era peligroso.** Se llamaba "Notas
              internas" y se imprimía en el PDF de confirmación —que además va
              adjunto al mail que recibe el cliente— bajo el título
              "OBSERVACIONES". Textual: *"este cartel dice Notas internas… pero
              le llega al cliente en la confirmación de reserva. Peligroso.
              Porque por ahí en la nota interna pongo 'al brasilero no se le
              entiende, que lo atienda Franco'."*

              Ahora son dos campos con dos destinos, y cada uno lo dice. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Notas internas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                placeholder="Para el equipo: acuerdos, avisos, quién lo atendió..." />
              <p className="text-[11px] leading-snug text-slate-500">
                Sólo las ve el equipo. <strong>No salen</strong> en el PDF ni en
                ningún mail al cliente.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Observaciones para el cliente</label>
              <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                placeholder="Ej: retirar por Paraguay 241, tocar el timbre del fondo" />
              <p className="text-[11px] leading-snug text-slate-500">
                Salen impresas en el PDF de confirmación y en el mail que recibe.
              </p>
            </div>
          </div>

          </div>
          )}

          {/* Warnings de solape — fuera de los pasos: si hay un conflicto hay
              que verlo esté donde esté, no sólo al llegar al final. */}
          {warnings.some(w => w.tipo.startsWith('solape_con_')) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
              <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Esta reserva se pisa con:
              </p>
              <ul className="list-disc pl-5">
                {warnings.filter(w => w.tipo.startsWith('solape_con_')).map((w, i) => (
                  <li key={i} className="text-sm text-amber-700">{textoAvisoSolape(w)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Error */}
          {(error || localError) && (
            <div data-error-banner className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              {/* El error del hook viene crudo ("[codigo] mensaje"); el local ya
                  pasó por `extractError`. */}
              <span>{localError || (error ?? '').replace(/^\[[a-z0-9_]+\]\s*/, '')}</span>
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
  vehiculo, categoriaNombre, clienteNombre, fechaInicio, fechaFin, horaInicio, horaFin,
  avisoDiaDeMas, duracionDias, lugarEntrega, lugarDevolucion, precioTotal, totalAdicionales,
  franquicia, condicionPago, condicionPagoTexto, semaforo, vehiculoId, unidades, onElegirVehiculo,
}: {
  vehiculo?: { patente: string; marca: string; modelo: string } | null;
  categoriaNombre?: string;
  clienteNombre: string;
  fechaInicio: string; fechaFin: string; horaInicio: string; horaFin: string;
  avisoDiaDeMas: string | null;
  duracionDias: number;
  lugarEntrega: string; lugarDevolucion: string;
  precioTotal: number | null; totalAdicionales: number;
  franquicia: number | null;
  condicionPago: string;
  condicionPagoTexto: string;
  /** El semaforo del backend. `null` mientras la consulta viaja. */
  semaforo: Semaforo | null;
  vehiculoId: string;
  /** Las unidades de la categoría elegida, para asignar el auto desde acá. */
  unidades: { id: number; etiqueta: string; ocupado: boolean }[];
  onElegirVehiculo: (id: string) => void;
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
        {/* **El auto se puede asignar acá mismo** (plan 27/09, txt 12), con
            las unidades de la categoría elegida. Antes, llegar al resumen con
            la reserva "sin asignar" obligaba a volver al paso 3 para elegirlo. */}
        <div className="flex items-center justify-between gap-4 py-1.5">
          <span className="text-xs text-slate-500">Vehículo</span>
          {unidades.length > 0 ? (
            <select
              value={vehiculoId}
              onChange={e => onElegirVehiculo(e.target.value)}
              className="max-w-[60%] rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">{categoriaNombre ? `${categoriaNombre} — sin asignar` : 'Sin asignar'}</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>
                  {u.etiqueta}{u.ocupado ? ' — comprometido' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-right text-sm font-medium text-slate-800">
              {vehiculo
                ? `${vehiculo.patente} · ${vehiculo.marca} ${vehiculo.modelo}`
                : (categoriaNombre ? `${categoriaNombre} — sin asignar` : '—')}
            </span>
          )}
        </div>
        <Fila k="Período" v={`${formatDate(fechaInicio)} ${horaInicio} → ${formatDate(fechaFin)} ${horaFin} · ${duracionDias} día${duracionDias !== 1 ? 's' : ''}`} />
        {avisoDiaDeMas && <Fila k="" v={<span className="text-xs font-normal text-sky-800">{avisoDiaDeMas}</span>} />}
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
        {condicionPagoTexto && (
          <Fila k="" v={<span className="text-xs font-normal text-slate-600 whitespace-pre-line">{condicionPagoTexto}</span>} />
        )}
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
