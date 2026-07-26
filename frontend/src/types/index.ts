// ─── Enums (alineados con backend/app/domain/enums.py) ───────────────────────

export type EstadoVehiculo =
  | 'disponible'
  | 'alquilado'
  | 'reservado'
  | 'en_transicion'
  | 'fuera_de_servicio';

export type TipoVehiculo = 'auto' | 'camioneta';

export type EstadoReserva =
  | 'pendiente'
  | 'confirmada'
  | 'activa'
  | 'vencida'
  | 'finalizada'
  | 'cancelada';

export type EstadoEcheq =
  | 'en_cartera'
  | 'depositado'
  | 'endosado'
  | 'rechazado'
  | 'cobrado'
  | 'vencido'
  | 'pendiente';  // legacy

export type TipoTarifa = 'diaria' | 'semanal' | 'mensual';

export type TipoDocumento = 'poliza' | 'vtv' | 'clausulas' | 'otro';

export type TipoGasto =
  | 'service'
  | 'combustible'
  | 'cubiertas'
  | 'reparacion'
  | 'seguro'
  | 'patente'
  | 'vtv'
  | 'lavado'
  | 'otro';

export type MedioPagoGasto =
  | 'efectivo'
  | 'transferencia'
  | 'tarjeta'
  | 'cheque'
  | 'echeq';

export type MetodoPago = MedioPagoGasto | 'cuenta_corriente';

// ─── Pagos ───────────────────────────────────────────────────────────────────

export interface Pago {
  id: number;
  alquiler_id: number;
  monto: string;
  medio_pago: MetodoPago;
  con_factura: boolean;
  cobrado_por: number;
  fecha: string;
  notas: string | null;
  cliente_nombre: string | null;
  vehiculo_patente: string | null;
  reserva_id: number | null;
}

export interface PagoPendiente {
  tipo: 'reserva' | 'alquiler_checkout';
  id_origen: number;
  cliente: string;
  monto_total: number;
  monto_abonado: number;
  saldo_pendiente: number;
  fecha_creacion: string;
  notas: string | null;
}

export interface PagoCreate {
  alquiler_id: number;
  monto: number;
  medio_pago: MetodoPago;
  con_factura?: boolean;
  fecha: string;
  notas?: string | null;
}

// ─── Echeqs ──────────────────────────────────────────────────────────────────

export interface Echeq {
  id: number;
  tipo: 'emitido' | 'recibido';
  monto: string;
  fecha_emision: string;
  fecha_cobro: string;
  estado: EstadoEcheq;
  contraparte: string;
  banco: string;
  numero_cheque: string;
  alquiler_id: number | null;
  gasto_id: number | null;
  notas: string | null;
}

export interface EcheqCreate {
  tipo: 'emitido' | 'recibido';
  monto: number;
  fecha_emision: string;
  fecha_cobro: string;
  contraparte: string;
  banco: string;
  numero_cheque: string;
  alquiler_id?: number | null;
  gasto_id?: number | null;
  notas?: string | null;
}

export interface EcheqUpdate {
  estado?: EstadoEcheq;
  notas?: string | null;
  fecha_cobro?: string | null;
  motivo_rechazo?: string; // requerido si estado='rechazado' (422 si falta)
}

// ─── Cuentas Corrientes ───────────────────────────────────────────────────────

export type CondicionPago = 'contado' | 'cta_cte_15' | 'cta_cte_30' | 'cta_cte_60' | 'cta_cte_90';

export interface CuentaCorriente {
  id: number;
  cliente_id: number;
  // D-01: saldo positivo = el cliente debe. Negativo = saldo a favor.
  saldo: number;
  condicion_pago?: CondicionPago | null;
  limite_credito?: number | null;
  bloqueada?: boolean;
  observaciones?: string | null;
  cliente_nombre: string | null;
}

export interface MovimientoCC {
  id: number;
  tipo: 'debito' | 'credito';
  concepto: string;
  monto: number;
  fecha: string;
  condicion?: CondicionPago | null;
  fecha_vencimiento?: string | null;
  saldo_posterior?: number;
  alquiler_id: number | null;
  reserva_id?: number | null;
  pago_id?: number | null;
  echeq_id?: number | null;
  multa_id?: number | null;
  recibo_id?: number | null;
  anulado?: boolean;
  anulado_por_movimiento_id?: number | null;
  creado_por?: number | null;
  created_at?: string;
}

export interface MovimientoCCCreate {
  tipo: 'debito' | 'credito';
  concepto: string;
  monto: number;
  fecha: string;
  condicion?: CondicionPago | null;
  fecha_vencimiento?: string | null;
  alquiler_id?: number | null;
  reserva_id?: number | null;
}

// ─── Recibos ──────────────────────────────────────────────────────────────────

export type MedioPagoRecibo = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'echeq';
export type EstadoRecibo = 'emitido' | 'anulado';

export interface Recibo {
  id: number;
  numero: number;
  prefijo: string;
  cliente_id: number;
  cuenta_corriente_id: number;
  movimiento_cc_id: number;
  fecha: string;
  monto: string;
  medio_pago: MedioPagoRecibo;
  concepto: string;
  saldo_anterior: string;
  saldo_posterior: string;
  estado: EstadoRecibo;
  motivo_anulacion: string | null;
  anulado_por: number | null;
  anulado_en: string | null;
  archivo_key: string | null;
  creado_por: number;
  created_at: string;
  cliente?: { id: number; nombre_completo: string; dni_cuit: string } | null;
}

export interface ReciboCreate {
  cliente_id: number;
  fecha: string;
  monto: number;
  medio_pago: MedioPagoRecibo;
  concepto: string;
}

// ─── Caja ─────────────────────────────────────────────────────────────────────

export interface CajaData {
  fecha: string;
  total_ingresos: number;
  total_egresos: number;
  balance: number;
  por_medio_pago: Record<string, number>;
  cobros: Pago[];
  gastos: Gasto[];
}

// ─── Dashboard Detallado ─────────────────────────────────────────────────────

export interface DashboardDetalle {
  vehiculos_disponibles: number;
  vehiculos_alquilados: number;
  vehiculos_reservados: number;
  vehiculos_fuera_servicio: number;
  total_vehiculos_activos: number;
  ocupacion_porcentaje: number;
  flujo_del_dia: {
    tipo: 'nueva_reserva' | 'check_out' | 'devolucion' | 'pago' | 'gasto';
    hora: string;
    hora_real?: string | null;
    hora_programada?: string | null;
    descripcion: string;
    monto?: number;
    reserva_id?: number;
  }[];
}

// ─── Reportes ────────────────────────────────────────────────────────────────

export interface ReporteMes {
  mes: number;
  mes_label: string;
  ingresos: number;
  egresos: number;
  margen: number;
  por_medio_pago: Record<string, number>;
}

export interface ReporteIngresos {
  anio: number;
  meses: ReporteMes[];
}

export interface ReporteVehiculo {
  vehiculo_id: number;
  patente: string;
  marca: string;
  modelo: string;
  tipo: string;
  alquileres_count: number;
  dias_alquilados: number;
  ocupacion_porcentaje: number;
  ingresos: number;
  gastos: number;
  margen: number;
}

// ─── Usuario ─────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number;
  auth_sub: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'docs';
  activo: boolean;
  created_at: string;
}

// ─── Vehículo ────────────────────────────────────────────────────────────────

export interface CategoriaResumen {
  id: number;
  codigo: string;
  nombre: string;
}

export interface Vehiculo {
  id: number;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  tipo: TipoVehiculo;
  color: string;
  estado: EstadoVehiculo;
  km_actual: number;
  km_proximo_service: number;
  km_entre_services: number;
  categoria_id: number | null;
  categoria?: CategoriaResumen | null;
  activo: boolean;
  foto_url: string | null;
  created_at: string;
}

export interface VehiculoCreate {
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  tipo: TipoVehiculo;
  color: string;
  km_actual: number;
  km_entre_services: number;
  categoria_id?: number | null;
}

export interface VehiculoUpdate {
  marca?: string;
  modelo?: string;
  color?: string;
  estado?: EstadoVehiculo;
  km_actual?: number;
  km_entre_services?: number;
  km_proximo_service?: number;
  categoria_id?: number | null;
}

// ─── Categoría (D-08) ─────────────────────────────────────────────────────────

export interface Categoria {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
}

export interface CategoriaCreate {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  orden?: number;
}

export interface CategoriaUpdate {
  nombre?: string;
  descripcion?: string | null;
  orden?: number;
}

// ─── Tarifa ──────────────────────────────────────────────────────────────────

export interface Tarifa {
  id: number;
  vehiculo_id: number | null;
  categoria_id: number | null;
  tipo: TipoTarifa;
  monto: string;            // Numeric serializado como string desde Pydantic
  activo: boolean;
  vigencia_desde: string;   // ISO date
}

export interface TarifaCreate {
  tipo: TipoTarifa;
  monto: number;
  vigencia_desde?: string;
}

// ─── Documento ───────────────────────────────────────────────────────────────

export interface Documento {
  id: number;
  vehiculo_id: number;
  tipo: TipoDocumento;
  nombre: string;
  archivo_url: string | null;
  fecha_carga: string;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  cargado_por: number;
}

// ─── Gasto ───────────────────────────────────────────────────────────────────

export interface Gasto {
  id: number;
  vehiculo_id: number;
  tipo: TipoGasto;
  descripcion: string;
  monto: string;
  medio_pago: MedioPagoGasto;
  fecha: string;
  proveedor: string | null;
  km_al_momento: number | null;
  notas: string | null;
}

// ─── Historial ───────────────────────────────────────────────────────────────

export interface HistorialVehiculo {
  vehiculo_id: number;
  gastos: Gasto[];
  documentos: Documento[];
  tarifas: Tarifa[];
  alquileres: unknown[]; // F3
}

export interface ConductorAdicional {
  id: number;
  cliente_id: number;
  nombre_completo: string;
  dni?: string;
  licencia_numero?: string;
  licencia_vencimiento: string;
  activo: boolean;
}

export interface ConductorAdicionalCreate {
  nombre_completo: string;
  dni?: string;
  licencia_numero?: string;
  licencia_vencimiento: string;
}

export type CondicionIva = 'responsable_inscripto' | 'monotributo' | 'consumidor_final' | 'exento';

export interface ClienteContacto {
  id: number;
  cliente_id: number;
  nombre: string;
  puesto?: string | null;
  telefono?: string | null;
  email?: string | null;
  activo: boolean;
  created_at: string;
}

export interface ClienteContactoCreate {
  nombre: string;
  puesto?: string | null;
  telefono?: string | null;
  email?: string | null;
}

// Campos fiscales, compartidos por Cliente/ClienteCreate/ClienteUpdate.
export interface ClienteDatosFiscales {
  razon_social?: string | null;
  condicion_iva?: CondicionIva | null;
  domicilio?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  fecha_nacimiento?: string | null;
  licencia_pais?: string | null;
  licencia_desde?: string | null;
  condicion_pago_default?: CondicionPago | null;
}

export interface Cliente extends ClienteDatosFiscales {
  id: number;
  nombre_completo: string;
  dni_cuit: string;
  telefono: string;
  email?: string;
  licencia_numero?: string;
  licencia_vencimiento: string;
  licencia_categoria?: string;
  tipo: 'particular' | 'empresa';
  es_frecuente: boolean;
  notas?: string;
  activo: boolean;
  created_at: string;
  conductores_adicionales: ConductorAdicional[];
  contactos: ClienteContacto[];
}

export interface ClienteCreate extends ClienteDatosFiscales {
  nombre_completo: string;
  dni_cuit: string;
  telefono: string;
  email?: string | null;
  licencia_vencimiento: string;
  tipo: 'particular' | 'empresa';
  es_frecuente: boolean;
  notas?: string | null;
}

export interface ClienteUpdate extends ClienteDatosFiscales {
  nombre_completo?: string;
  telefono?: string;
  email?: string | null;
  licencia_vencimiento?: string;
  tipo?: 'particular' | 'empresa';
  es_frecuente?: boolean;
  notas?: string | null;
}

// ─── API Response ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  success: boolean;
  message: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  vehiculos_disponibles: number;
  vehiculos_alquilados: number;
  vehiculos_reservados: number;
  vehiculos_fuera_de_servicio: number;
  alquileres_activos: number;
  reservas_hoy: number;
  ingresos_mes: number;
  ocupacion_porcentaje: number;
}

// ─── Fase 3: Reservas ─────────────────────────────────────────────────────────

export type DecisionExcedente =
  | 'cobrar_completo'
  | 'cobrar_parcial'
  | 'un_dia_mas'
  | 'medio_dia_mas'
  | 'monto_manual'
  | 'no_cobrar';

export interface VehiculoResumen {
  id: number;
  patente: string;
  marca: string;
  modelo: string;
  estado: EstadoVehiculo;
  km_actual?: number;
}

export interface ClienteResumen {
  id: number;
  nombre_completo: string;
}

export interface SolapeWarning {
  tipo: string;
  reserva_id: number;
  cliente?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}

export interface Reserva {
  id: number;
  vehiculo_id: number;
  cliente_id: number;
  conductor_id: number | null;
  fecha_inicio: string;   // ISO date "YYYY-MM-DD"
  hora_inicio: string;    // "HH:MM:SS"
  fecha_fin: string;
  hora_fin: string;
  lugar_entrega: string;
  lugar_devolucion: string;
  notas: string | null;
  estado: EstadoReserva;
  usuario_id: number;
  created_at: string;
  // D1 late checkout
  hora_devolucion_acordada: string | null;
  late_checkout: boolean;
  cargo_late_checkout: string;
  // Precio y tarifa
  tarifa_aplicada_id: number | null;
  precio_total: string | null;
  precio_lista?: string | null;
  descuento_motivo?: string | null;
  descuento_autorizado_por?: number | null;
  con_factura?: boolean;
  // D2 solape
  bloqueada_por_solape: boolean;
  // Garantía
  garantia_tipo?: string | null;
  garantia_monto?: string | null;
  garantia_tarjeta_numero?: string | null;
  garantia_tarjeta_vencimiento?: string | null;
  garantia_tarjeta_titular?: string | null;
  // Pagos y anticipos
  forma_pago_prevista?: string | null;
  estado_pago?: string | null;
  anticipo_monto?: string | null;
  anticipo_fecha?: string | null;
  anticipo_medio_pago?: string | null;
  // Relaciones expandidas
  vehiculo?: VehiculoResumen;
  cliente?: ClienteResumen;
  conductor?: ConductorAdicional | null;
  alquiler_id?: number | null;
  alquiler_estado?: string | null;
}

export interface ReservaCreate {
  vehiculo_id: number;
  cliente_id: number;
  conductor_id?: number | null;
  fecha_inicio: string;
  hora_inicio: string;
  fecha_fin: string;
  hora_fin: string;
  lugar_entrega: string;
  lugar_devolucion: string;
  notas?: string | null;
  hora_devolucion_acordada?: string | null;
  late_checkout?: boolean;
  cargo_late_checkout?: number;
  precio_total?: number | null;
  garantia_tipo?: string | null;
  garantia_monto?: number | null;
  garantia_tarjeta_numero?: string | null;
  garantia_tarjeta_vencimiento?: string | null;
  garantia_tarjeta_titular?: string | null;
  forma_pago_prevista?: string | null;
  estado_pago?: string | null;
  anticipo_monto?: number | null;
  anticipo_fecha?: string | null;
  anticipo_medio_pago?: string | null;
  con_factura?: boolean;
  descuento_motivo?: string | null;
}

export interface ReservaUpdate {
  vehiculo_id?: number;
  conductor_id?: number | null;
  fecha_inicio?: string;
  hora_inicio?: string;
  fecha_fin?: string;
  hora_fin?: string;
  lugar_entrega?: string;
  lugar_devolucion?: string;
  notas?: string | null;
  precio_total?: number | null;
  forma_pago_prevista?: string | null;
  estado_pago?: string | null;
  anticipo_monto?: number | null;
  anticipo_fecha?: string | null;
  anticipo_medio_pago?: string | null;
}

export interface ReservaConWarnings {
  reserva: Reserva;
  warnings: SolapeWarning[];
}

// ─── Fase 3: Alquileres ───────────────────────────────────────────────────────

export interface Alquiler {
  id: number;
  reserva_id: number;
  // Checkout
  checkout_fecha: string;
  checkout_hora: string;
  checkout_km: number;
  checkout_combustible: number;
  checkout_descripcion: string | null;
  checkout_registrado_en_tiempo_real: boolean;
  // Checkin
  checkin_fecha: string | null;
  checkin_hora: string | null;
  checkin_km: number | null;
  checkin_combustible: number | null;
  checkin_descripcion: string | null;
  checkin_registrado_en_tiempo_real: boolean;
  // Excedente
  horas_excedidas: string;
  horas_cobradas: string | null;
  cargo_excedente: string;
  excedente_bonificado: boolean;
  decidido_por: number | null;
  motivo_bonificacion: string | null;
  // Contrato
  contrato_firmado: boolean;
  contrato_url: string | null;
}

export interface PagoInmediato {
  monto: number;
  medio_pago: string;
  fecha: string;
  notas?: string | null;
}

export interface CheckoutCreate {
  reserva_id: number;
  checkout_fecha: string;
  checkout_hora: string;
  checkout_km: number;
  checkout_combustible: number;
  checkout_descripcion?: string | null;
  registrado_en_tiempo_real?: boolean;
  checkout_estado_limpieza?: string;
  pago_inmediato?: PagoInmediato;
  cargo_checkout_tardio?: number;
  motivo_checkout_tardio?: string | null;
}

export interface CheckinCreate {
  checkin_fecha: string;
  checkin_hora: string;
  checkin_km: number;
  checkin_combustible: number;
  checkin_descripcion?: string | null;
  checkin_estado_limpieza?: string | null;
  decision_excedente: DecisionExcedente;
  horas_a_cobrar?: number | null;
  monto_manual?: number | null;
  motivo_bonificacion?: string | null;
  garantia_estado?: string | null;
  garantia_monto_devuelto?: number | null;
  registrado_en_tiempo_real?: boolean;
  pago_inmediato?: PagoInmediato;
}

export interface PreviewExcedente {
  horas_excedidas: number;
  minutos_excedidos_brutos: number;
  tarifa_diaria: string;
  tarifa_hora_excedente: string;
  cargo_sugerido: string;
  aplica_dia_completo: boolean;
  dias_completos_cobrados: number;
  dentro_de_gracia: boolean;
}

export interface ExtenderRequest {
  nueva_fecha_fin: string;
  nueva_hora_fin: string;
}

export interface ExtenderResponse {
  alquiler_id: number;
  fecha_fin_anterior: string;
  fecha_fin_nueva: string;
  duracion_dias_anterior: number;
  duracion_dias_nueva: number;
  precio_anterior: string | null;
  precio_nuevo: string | null;
  diferencia: string | null;
}

// ─── Fase 3: Ocupación (Calendario) ──────────────────────────────────────────

export interface VehiculoOcupacion {
  id: number;
  patente: string;
  marca: string;
  modelo: string;
  estado: EstadoVehiculo;
  activo: boolean;
}

export interface EventoOcupacion {
  id: number;
  vehiculo_id: number;
  tipo: 'reserva' | 'alquiler';
  estado: string;
  fecha_inicio: string;
  hora_inicio: string;
  fecha_fin: string;
  hora_fin: string;
  cliente_nombre: string;
  lugar_entrega?: string;
  lugar_devolucion?: string;
  precio_total?: number | null;
  notas?: string | null;
  tiene_alquiler?: boolean;
}

export interface OcupacionResponse {
  vehiculos: VehiculoOcupacion[];
  eventos: EventoOcupacion[];
}

// ─── Multas ──────────────────────────────────────────────────────────────────

export type EstadoMulta = 'pendiente' | 'imputada' | 'cobrada' | 'bonificada' | 'apelando';
// Estados alcanzables por PATCH libre — "cobrada"/"bonificada" sólo se llega
// vía POST /multas/{id}/resolver (genera el movimiento de cuenta corriente).
export type EstadoMultaEditable = 'pendiente' | 'imputada' | 'apelando';
export type DecisionMulta = 'cobrada' | 'bonificada';

export interface Multa {
  id: number;
  patente: string;
  vehiculo_id: number | null;
  cliente_id: number | null;
  alquiler_id: number | null;
  fecha_infraccion: string;
  hora_infraccion: string | null;
  monto: string;
  descripcion: string | null;
  estado: EstadoMulta;
  pdf_key: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  motivo_bonificacion: string | null;
  resuelto_por: number | null;
  resuelto_en: string | null;
  vehiculo?: { id: number; patente: string; marca: string; modelo: string } | null;
  cliente?: { id: number; nombre_completo: string; dni_cuit: string } | null;
}

export interface MultaCreate {
  patente: string;
  vehiculo_id?: number | null;
  cliente_id?: number | null;
  alquiler_id?: number | null;
  fecha_infraccion: string;
  hora_infraccion?: string | null;
  monto: number;
  descripcion?: string | null;
  notas?: string | null;
}

export interface MultaUpdate {
  estado?: EstadoMultaEditable;
  monto?: number;
  cliente_id?: number | null;
  alquiler_id?: number | null;
  descripcion?: string | null;
  notas?: string | null;
}

export interface ResolverMultaPayload {
  decision: DecisionMulta;
  motivo?: string; // requerido si decision === 'bonificada'
}

export interface BusquedaMultaResult {
  encontrado: boolean;
  patente: string;
  fecha_infraccion: string;
  hora_infraccion: string | null;
  alquiler_id: number | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  cliente_dni: string | null;
  contrato_numero: number | null;
  fecha_checkout: string | null;
  fecha_checkin: string | null;
}

// ─── Servicios / Mantenimiento ────────────────────────────────────────────────

export type TipoServicio =
  | 'service_general' | 'aceite' | 'neumaticos' | 'frenos'
  | 'filtros' | 'correa' | 'suspension' | 'otro';

export interface Servicio {
  id: number;
  vehiculo_id: number;
  tipo: TipoServicio;
  km_realizado: number;
  fecha: string;
  descripcion: string | null;
  costo: string | null;
  proximo_km: number | null;
  proxima_fecha: string | null;
  activo: boolean;
  created_at: string;
}

export interface ServicioCreate {
  tipo: TipoServicio;
  km_realizado: number;
  fecha: string;
  descripcion?: string | null;
  costo?: number | null;
  proximo_km?: number | null;
  proxima_fecha?: string | null;
}

export interface ServicioUpdate {
  tipo?: TipoServicio;
  km_realizado?: number;
  fecha?: string;
  descripcion?: string | null;
  costo?: number | null;
  proximo_km?: number | null;
  proxima_fecha?: string | null;
}

// ─── Notificaciones In-System ────────────────────────────────────────────────

export type TipoNotificacion =
  | 'checkout_pendiente'
  | 'checkin_pendiente'
  | 'garantia_sin_resolver'
  | 'doc_vehiculo_vencido'
  | 'doc_vehiculo_por_vencer'
  | 'doc_cliente_vencido'
  | 'doc_cliente_por_vencer'
  | 'service_vencido'
  | 'service_proximo'
  | 'multa_pendiente'
  | 'pago_pendiente';

export type UrgenciaNot = 'alta' | 'media' | 'baja';

export interface NotificacionItem {
  tipo: TipoNotificacion;
  titulo: string;
  descripcion: string;
  urgencia: UrgenciaNot;
  entidad_tipo: string;
  entidad_id: number;
  url_destino: string;
}

export interface NotificacionesResponse {
  items: NotificacionItem[];
  total: number;
  urgentes: number;
}

