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
  | 'cancelada'
  // Reservas web (migración 047). Ninguno ocupa calendario.
  | 'pendiente_pago'        // hold tomado, esperando el pago
  | 'sin_disponibilidad'    // D-04: solicitud sin cupo, sin cobrar
  | 'revision_sin_cupo';    // decisión #4: pagó y el cupo se fue

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
  // Nullable desde la migración 043: un pago puede ser a cuenta, sin alquiler.
  alquiler_id: number | null;
  cliente_id: number | null;
  monto: string;
  medio_pago: MetodoPago;
  con_factura: boolean;
  cobrado_por: number;
  fecha: string;
  notas: string | null;
  cliente_nombre: string | null;
  vehiculo_patente: string | null;
  reserva_id: number | null;
  // El recibo emitido de este cobro, si lo hay.
  recibo_id: number | null;
  recibo_numero: string | null;
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
  alquiler_id?: number | null;
  cliente_id?: number | null;
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
  fecha_cobro: string | null;
  fecha_acreditacion: string | null;
  estado: EstadoEcheq;
  contraparte: string;
  banco: string | null;
  numero_cheque: string | null;
  cliente_id: number | null;
  cliente_nombre?: string | null;
  proveedor_nombre: string | null;
  motivo_rechazo: string | null;
  reserva_id: number | null;
  alquiler_id: number | null;
  gasto_id: number | null;
  cuenta_corriente_id: number | null;
  movimiento_cc_id: number | null;
  notas: string | null;
  activo: boolean;
  creado_por: number | null;
  created_at: string;
  /** false si falta banco, número o fecha de cobro — "pendiente de completar" */
  datos_completos: boolean;
}

export interface EcheqCreate {
  tipo: 'emitido' | 'recibido';
  monto: number;
  fecha_emision: string;
  fecha_cobro: string;
  contraparte: string;
  banco: string;
  numero_cheque: string;
  cliente_id?: number | null;
  proveedor_nombre?: string | null;
  reserva_id?: number | null;
  alquiler_id?: number | null;
  gasto_id?: number | null;
  notas?: string | null;
}

export interface EcheqUpdate {
  estado?: EstadoEcheq;
  notas?: string | null;
  banco?: string | null;
  numero_cheque?: string | null;
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
  vencimiento_editado_motivo?: string | null;
  vencimiento_editado_por?: number | null;
  vencimiento_editado_en?: string | null;
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
  // El pago que documenta. El recibo no mueve plata: el crédito lo generó él.
  pago_id: number | null;
  movimiento_cc_id: number | null;
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
  alquiler_id?: number | null;
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
  vtv_vencimiento: string | null;
  poliza_vencimiento: string | null;
  compania_seguro: string | null;
  nro_poliza: string | null;
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
  vtv_vencimiento?: string | null;
  poliza_vencimiento?: string | null;
  compania_seguro?: string | null;
  nro_poliza?: string | null;
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
  vtv_vencimiento?: string | null;
  poliza_vencimiento?: string | null;
  compania_seguro?: string | null;
  nro_poliza?: string | null;
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

// ─── Matriz de bloqueos (Fase 3, ítem 39) ────────────────────────────────────

export interface BloqueoItem {
  codigo: string;
  mensaje: string;
  severidad: 'bloqueante' | 'advertencia';
}

export interface Semaforo {
  semaforo: 'rojo' | 'amarillo' | 'verde';
  items: BloqueoItem[];
}

export interface Reserva {
  id: number;
  // Nullable desde la migración 042: la web reserva una CATEGORÍA y el auto
  // puntual se asigna al entregar.
  vehiculo_id: number | null;
  categoria_id: number | null;
  categoria?: { id: number; nombre: string } | null;
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
  // Reservas web (migración 047)
  origen?: 'mostrador' | 'web';
  web_resuelta_por?: number | null;
  web_resuelta_en?: string | null;
  web_motivo_rechazo?: string | null;
  web_contacto_nombre?: string | null;
  web_contacto_email?: string | null;
  web_contacto_telefono?: string | null;
  // D1 late checkout
  hora_devolucion_acordada: string | null;
  late_checkout: boolean;
  cargo_late_checkout: string;
  // Precio y tarifa
  tarifa_aplicada_id: number | null;
  precio_total: string | null;
  /** Coberturas y extras contratados. NO están dentro de `precio_total`. */
  adicionales?: ReservaAdicional[];
  total_adicionales?: string;
  precio_lista?: string | null;
  descuento_motivo?: string | null;
  descuento_autorizado_por?: number | null;
  con_factura?: boolean;
  motivo_cancelacion?: string | null;
  condicion_pago?: string;
  condicion_pago_ancla?: 'checkout' | 'checkin' | 'fecha_especifica' | null;
  condicion_pago_fecha_ancla?: string | null;
  tipo_factura?: 'A' | 'B' | 'C' | null;
  factura_a_nombre_de?: string | null;
  echeq_banco?: string | null;
  echeq_numero_cheque?: string | null;
  echeq_fecha_cobro?: string | null;
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
  /** D-34: el auto salió sin contrato firmado y sigue sin firmarse. */
  entregado_sin_contrato?: boolean;
}

export interface ReservaCreate {
  vehiculo_id: number;
  cliente_id: number;
  adicionales?: AdicionalSolicitado[];
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
  condicion_pago?: string;
  condicion_pago_ancla?: 'checkout' | 'checkin' | 'fecha_especifica' | null;
  condicion_pago_fecha_ancla?: string | null;
  tipo_factura?: 'A' | 'B' | 'C' | null;
  factura_a_nombre_de?: string | null;
  echeq_banco?: string | null;
  echeq_numero_cheque?: string | null;
  echeq_fecha_cobro?: string | null;
}

export interface ReservaUpdate {
  vehiculo_id?: number;
  /** Omitir = no tocar los adicionales; lista vacía = sacarlos todos. */
  adicionales?: AdicionalSolicitado[];
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
  cargo_checkout_tardio?: string;
  motivo_checkout_tardio?: string | null;
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
  cargo_combustible?: string;
  cargo_limpieza?: string;
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
  // D-34: si el auto sale sin contrato firmado no se bloquea, pero el motivo
  // es obligatorio y queda constancia visible.
  motivo_sin_contrato?: string | null;
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
  cargo_combustible?: number;
  cargo_limpieza?: number;
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
  precio_total?: number | null;
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
  tipo: 'reserva' | 'alquiler' | 'bloqueo';
  /** Para un bloqueo, acá viene el motivo (mantenimiento, siniestro, …). */
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

// ─── Fechas especiales ───────────────────────────────────────────────────────

export type TipoFechaEspecial = 'feriado' | 'fin_semana_largo' | 'comercial' | 'temporada' | 'otro';
export type ColorFechaEspecial = 'rojo' | 'ambar' | 'verde' | 'azul' | 'violeta';

export interface FechaEspecial {
  id: number;
  nombre: string;
  fecha_desde: string;
  fecha_hasta: string;
  tipo: TipoFechaEspecial;
  color: ColorFechaEspecial;
  notas: string | null;
  activo: boolean;
  creado_por: number | null;
  created_at: string;
}

export interface FechaEspecialCreate {
  nombre: string;
  fecha_desde: string;
  fecha_hasta: string;
  tipo?: TipoFechaEspecial;
  color?: ColorFechaEspecial;
  notas?: string | null;
}

export interface FechaEspecialUpdate {
  nombre?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  tipo?: TipoFechaEspecial;
  color?: ColorFechaEspecial;
  notas?: string | null;
  activo?: boolean;
}

// ─── Daños (parte de daños) ──────────────────────────────────────────────────

export type MomentoDanio = 'checkout' | 'checkin' | 'preexistente';
export type TipoDanio =
  | 'rayon' | 'abolladura' | 'rotura' | 'faltante'
  | 'cristal' | 'tapizado' | 'mecanico' | 'otro';
export type SeveridadDanio = 'leve' | 'moderado' | 'grave';
export type ResponsableDanio = 'sin_definir' | 'cliente' | 'desgaste' | 'terceros';
export type EstadoDanio = 'detectado' | 'valorizado' | 'imputado' | 'reparado' | 'bonificado';

export interface FotoDanio {
  id: number;
  danio_id: number;
  archivo_key: string;
  descripcion: string | null;
  /** URL servida por el backend (relativa a la API, pasar por resolveAssetUrl) */
  url: string | null;
  created_at: string;
}

export interface Danio {
  id: number;
  vehiculo_id: number;
  alquiler_id: number | null;
  cliente_id: number | null;
  momento: MomentoDanio;
  zona: string;
  tipo: TipoDanio;
  severidad: SeveridadDanio;
  descripcion: string | null;
  fecha_deteccion: string;
  costo_estimado: string | null;
  monto_imputado: string | null;
  responsable: ResponsableDanio;
  estado: EstadoDanio;
  movimiento_cc_id: number | null;
  motivo_bonificacion: string | null;
  activo: boolean;
  registrado_por: number | null;
  created_at: string;
  fotos: FotoDanio[];
  vehiculo_patente: string | null;
  cliente_nombre: string | null;
}

export interface DanioCreate {
  vehiculo_id: number;
  alquiler_id?: number | null;
  cliente_id?: number | null;
  momento?: MomentoDanio;
  zona: string;
  tipo?: TipoDanio;
  severidad?: SeveridadDanio;
  descripcion?: string | null;
  fecha_deteccion?: string | null;
  costo_estimado?: number | null;
  responsable?: ResponsableDanio;
}

export interface DanioUpdate {
  zona?: string;
  tipo?: TipoDanio;
  severidad?: SeveridadDanio;
  descripcion?: string | null;
  costo_estimado?: number | null;
  responsable?: ResponsableDanio;
  estado?: 'detectado' | 'valorizado' | 'reparado';
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
  // D-28: cuándo hay que pagarla. Null si llegó sin fecha clara.
  fecha_vencimiento: string | null;
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
  fecha_vencimiento?: string | null;
  monto: number;
  descripcion?: string | null;
  notas?: string | null;
}

export interface MultaUpdate {
  estado?: EstadoMultaEditable;
  monto?: number;
  fecha_vencimiento?: string | null;
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

// ─── Notificaciones (Fase 2 — motor de reglas persistido) ────────────────────
// Ver docs/CATALOGO_NOTIFICACIONES.md para el detalle de cada tipo.

export type UrgenciaNot = 'critica' | 'alta' | 'media' | 'baja';
export type EstadoNotificacion = 'pendiente' | 'enviada' | 'leida' | 'pospuesta' | 'descartada' | 'resuelta';

export interface NotificacionItem {
  id: number;
  tipo: string;
  titulo: string;
  descripcion: string;
  urgencia: UrgenciaNot;
  entidad_tipo: string;
  entidad_id: number;
  url_destino: string;
  fecha_objetivo: string | null;
  programada_para: string;
  estado: EstadoNotificacion;
  posponer_hasta: string | null;
  leida_at: string | null;
  resuelta_at: string | null;
  created_at: string;
}

export interface NotificacionesResponse {
  items: NotificacionItem[];
  total: number;
  criticas: number;
  urgentes: number;
}

export interface PreferenciaNotificacion {
  id: number;
  usuario_id: number;
  tipo_regla: string;
  canales: string[];
  anticipacion_dias: number | null;
  activo: boolean;
}

// ─── Configuración (Fase 3, ítem 40) ─────────────────────────────────────────

export interface ConfiguracionItem {
  id: number;
  clave: string;
  valor: string;
  tipo: 'int' | 'decimal' | 'bool' | 'string';
  categoria: string;
  descripcion: string;
  updated_at: string;
}


// ─── Motor de precios por calendario (Fase 5, ítem 57) ───────────────────────

export type CanalTarifa = 'ambos' | 'web' | 'mostrador';
export type Canal = 'web' | 'mostrador';
export type OrigenPrecio = 'calendario' | 'banda';

export interface TarifaCalendario {
  id: number;
  nombre: string;
  precio_dia: string;
  categoria_id: number | null;
  vehiculo_id: number | null;
  fecha_especial_id: number | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  dias_semana: number[] | null;
  prioridad: number;
  min_dias: number | null;
  max_dias: number | null;
  canal: CanalTarifa;
  es_promocional: boolean;
  precio_referencia: string | null;
  etiqueta_promo: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  categoria_nombre: string | null;
  vehiculo_patente: string | null;
  fecha_especial_nombre: string | null;
  /** Rango efectivo: el propio, o el heredado de la fecha especial. */
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
}

export interface TarifaCalendarioCreate {
  nombre: string;
  precio_dia: string;
  categoria_id?: number | null;
  vehiculo_id?: number | null;
  fecha_especial_id?: number | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  dias_semana?: number[] | null;
  prioridad?: number;
  min_dias?: number | null;
  max_dias?: number | null;
  canal?: CanalTarifa;
  es_promocional?: boolean;
  precio_referencia?: string | null;
  etiqueta_promo?: string | null;
  notas?: string | null;
}

export type TarifaCalendarioUpdate = Partial<TarifaCalendarioCreate> & { activo?: boolean };

export interface DescuentoDuracion {
  id: number;
  nombre: string;
  dias_desde: number;
  dias_hasta: number | null;
  porcentaje: string;
  categoria_id: number | null;
  categoria_nombre: string | null;
  activo: boolean;
  created_at: string;
}

export interface DescuentoDuracionCreate {
  nombre: string;
  dias_desde: number;
  dias_hasta?: number | null;
  porcentaje: string;
  categoria_id?: number | null;
}

export type DescuentoDuracionUpdate = Partial<DescuentoDuracionCreate> & { activo?: boolean };

export interface DiaCotizado {
  fecha: string;
  precio: string;
  origen: OrigenPrecio;
  regla_id: number | null;
  regla_nombre: string | null;
  es_promocional: boolean;
  precio_referencia: string | null;
  etiqueta_promo: string | null;
}

export interface Cotizacion {
  dias: DiaCotizado[];
  duracion_dias: number;
  subtotal: string;
  descuento_porcentaje: string;
  descuento_monto: string;
  descuento_nombre: string | null;
  /** Alquiler del vehículo ya con el descuento, antes de los adicionales. */
  subtotal_vehiculo: string;
  adicionales: AdicionalCotizado[];
  total_adicionales: string;
  total: string;
  precio_dia_promedio: string;
  total_referencia: string | null;
  tiene_promocion: boolean;
  promociones: string[];
  categoria_id: number | null;
  vehiculo_id: number | null;
}

export interface CalcularPrecioRequest {
  fecha_inicio: string;
  fecha_fin: string;
  categoria_id?: number | null;
  vehiculo_id?: number | null;
  canal?: Canal;
  adicionales?: AdicionalSolicitado[];
}

export interface DiaCalendarioPrecio {
  fecha: string;
  precio: string | null;
  origen: OrigenPrecio | 'sin_precio';
  regla_id: number | null;
  regla_nombre: string | null;
  es_promocional: boolean;
  etiqueta_promo: string | null;
}

export interface FilaCalendarioPrecio {
  categoria_id: number;
  categoria_nombre: string;
  dias: DiaCalendarioPrecio[];
}

export interface CalendarioPrecios {
  desde: string;
  hasta: string;
  canal: Canal;
  filas: FilaCalendarioPrecio[];
}

// ─── Adicionales (Fase 5, ítem 56) ───────────────────────────────────────────

export type GrupoAdicional = 'cobertura' | 'extra';
export type UnidadCobro = 'por_dia' | 'unico';

export interface Adicional {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  grupo: GrupoAdicional;
  precio: string;
  unidad_cobro: UnidadCobro;
  /** Cobertura que ya viene con el alquiler (se ofrece preseleccionada). */
  incluido: boolean;
  /** Sólo coberturas: monto a cargo del cliente ante un siniestro. */
  franquicia: string | null;
  max_cantidad: number | null;
  visible_web: boolean;
  orden: number;
  activo: boolean;
  created_at: string;
}

export interface AdicionalCreate {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  grupo?: GrupoAdicional;
  precio: string;
  unidad_cobro?: UnidadCobro;
  incluido?: boolean;
  franquicia?: string | null;
  max_cantidad?: number | null;
  visible_web?: boolean;
  orden?: number;
}

export type AdicionalUpdate = Partial<Omit<AdicionalCreate, 'codigo'>> & { activo?: boolean };

export interface AdicionalSolicitado {
  adicional_id: number;
  cantidad: number;
}

export interface AdicionalCotizado {
  id: number;
  nombre: string;
  grupo: GrupoAdicional;
  precio_unitario: string;
  unidad_cobro: UnidadCobro;
  cantidad: number;
  subtotal: string;
}

/** Una línea de adicional contratada en una reserva, con su precio congelado. */
export interface ReservaAdicional {
  id: number;
  adicional_id: number;
  nombre: string | null;
  grupo: GrupoAdicional | null;
  cantidad: number;
  precio_unitario: string;
  unidad_cobro: UnidadCobro;
  subtotal: string;
}

// ─── Bloqueos de vehículo (Fase 5, ítem 59) ──────────────────────────────────

export type MotivoBloqueo = 'mantenimiento' | 'siniestro' | 'uso_interno' | 'venta' | 'otro';

export interface BloqueoVehiculo {
  id: number;
  vehiculo_id: number;
  fecha_desde: string;
  fecha_hasta: string;
  motivo: MotivoBloqueo;
  notas: string | null;
  activo: boolean;
  creado_por: number | null;
  created_at: string;
  /** Días que dura, contando ambos extremos. */
  dias: number;
  vehiculo_patente: string | null;
  /** Sólo al crear: reservas que quedaron pisadas y hay que reasignar. */
  reservas_en_conflicto?: ReservaEnConflicto[];
}

export interface ReservaEnConflicto {
  id: number;
  estado: string;
  cliente: string;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface BloqueoVehiculoCreate {
  vehiculo_id: number;
  fecha_desde: string;
  fecha_hasta: string;
  motivo?: MotivoBloqueo;
  notas?: string | null;
}

export type BloqueoVehiculoUpdate = Partial<Omit<BloqueoVehiculoCreate, 'vehiculo_id'>> & {
  activo?: boolean;
};


// ─── Contratos (Fase 4, ítems 50-51) ─────────────────────────────────────────

export interface ContratoPlantilla {
  id: number;
  version: number;
  titulo: string;
  clausulas: ClausulaContrato[];
  vigente_desde: string;
  activa: boolean;
  created_at: string;
}

export interface ClausulaContrato {
  numero: number;
  titulo: string;
  parrafos: { texto: string; subrayados?: number[][] }[];
}

export interface Contrato {
  id: number;
  numero: number | null;
  prefijo: string;
  numero_formateado: string;
  alquiler_id: number;
  plantilla_id: number | null;
  // El anverso congelado al emitir. Reimprimir usa esto, nunca las tablas
  // vivas: el contrato tiene que salir igual dentro de dos años.
  snapshot: ContratoSnapshot | null;
  firmado: boolean;
  firmado_at: string | null;
  firmado_por_nombre: string | null;
  firmado_por_dni: string | null;
  atendido_por: number | null;
  anulado: boolean;
  motivo_anulacion: string | null;
  fecha_generacion: string;
}

export interface ContratoSnapshot {
  empresa: Record<string, string>;
  reserva_id: number;
  alquiler_id: number;
  cliente: Record<string, string | number | null>;
  conductor_adicional: Record<string, string | number | null>;
  vehiculo: Record<string, string | number | null>;
  servicio: Record<string, string | number | null>;
  cargos: {
    lineas: { concepto: string; cantidad: number; valor_unitario: number; total: number }[];
    descuento: number;
    valor_estimado: number;
    incluye_kilometraje: boolean;
    discrimina_iva: boolean;
  };
  coberturas: {
    contratadas: { nombre: string; franquicia: number | null }[];
    rechazadas: string[];
    franquicia: number;
  };
  aceptacion: string;
  atendido_por?: string;
}

export interface ContratoPreparado {
  snapshot: ContratoSnapshot;
  // D-C1 sigue abierto: se puede emitir igual, pero el PDF lo advierte.
  falta_datos_fiscales: boolean;
}


// ─── Recargos por edad (D-38) ────────────────────────────────────────────────

export interface RecargoEdad {
  id: number;
  nombre: string;
  descripcion: string | null;
  edad_desde: number;
  /** null = "de esta edad en adelante". */
  edad_hasta: number | null;
  /** Se carga monto O porcentaje, nunca los dos. */
  monto: string | null;
  porcentaje: string | null;
  unidad_cobro: UnidadCobro;
  /** null = aplica a todas las categorías. */
  categoria_id: number | null;
  activo: boolean;
  created_at: string;
}

export interface RecargoEdadCreate {
  nombre: string;
  descripcion?: string | null;
  edad_desde: number;
  edad_hasta?: number | null;
  monto?: number | null;
  porcentaje?: number | null;
  unidad_cobro: UnidadCobro;
  categoria_id?: number | null;
}

export type RecargoEdadUpdate = Partial<RecargoEdadCreate> & { activo?: boolean };
