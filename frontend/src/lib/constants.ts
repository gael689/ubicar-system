import type {
  EstadoVehiculo,
  TipoVehiculo,
  EstadoReserva,
  EstadoEcheq,
  TipoDocumento,
  TipoGasto,
  TipoTarifa,
} from '@/types';

// ─── Vehículos ───────────────────────────────────────────────────────────────

export const ESTADO_VEHICULO_LABEL: Record<EstadoVehiculo, string> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  reservado: 'Reservado',
  en_transicion: 'En transición',
  fuera_de_servicio: 'Fuera de servicio',
};

export const ESTADO_VEHICULO_COLOR: Record<EstadoVehiculo, string> = {
  disponible: 'bg-success/15 text-success border-success/30',
  alquilado: 'bg-primary/15 text-primary border-primary/30',
  reservado: 'bg-warning/15 text-warning border-warning/30',
  en_transicion: 'bg-amber-100 text-amber-700 border-amber-200',
  fuera_de_servicio: 'bg-danger/15 text-danger border-danger/30',
};

export const TIPO_VEHICULO_LABEL: Record<TipoVehiculo, string> = {
  auto: 'Auto',
  camioneta: 'Camioneta',
};

// ─── Reservas ────────────────────────────────────────────────────────────────

export const ESTADO_RESERVA_LABEL: Record<EstadoReserva, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  activa: 'Activa',
  vencida: 'Vencida',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export const ESTADO_RESERVA_COLOR: Record<EstadoReserva, string> = {
  pendiente: 'bg-warning/15 text-warning border-warning/30',
  confirmada: 'bg-primary/15 text-primary border-primary/30',
  activa: 'bg-success/15 text-success border-success/30',
  vencida: 'bg-danger/15 text-danger border-danger/30 animate-pulse',
  finalizada: 'bg-muted/40 text-muted-foreground border-border',
  cancelada: 'bg-danger/15 text-danger border-danger/30',
};

// ─── Echeqs ──────────────────────────────────────────────────────────────────

export const ESTADO_ECHEQ_LABEL: Record<EstadoEcheq, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  endosado: 'Endosado',
  rechazado: 'Rechazado',
  cobrado: 'Cobrado',
  vencido: 'Vencido',
};

export const ESTADO_ECHEQ_COLOR: Record<EstadoEcheq, string> = {
  en_cartera: 'bg-warning/15 text-warning border-warning/30',
  depositado: 'bg-primary/15 text-primary border-primary/30',
  endosado: 'bg-secondary/40 text-primary border-secondary',
  rechazado: 'bg-danger/15 text-danger border-danger/30',
  cobrado: 'bg-success/15 text-success border-success/30',
  vencido: 'bg-muted/40 text-muted-foreground border-border',
};

// ─── Documentos del vehículo ─────────────────────────────────────────────────

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  poliza: 'Póliza',
  vtv: 'VTV',
  clausulas: 'Cláusulas',
  otro: 'Otro',
};

// ─── Gastos ──────────────────────────────────────────────────────────────────

export const TIPO_GASTO_LABEL: Record<TipoGasto, string> = {
  service: 'Service',
  combustible: 'Combustible',
  cubiertas: 'Cubiertas',
  reparacion: 'Reparación',
  seguro: 'Seguro',
  patente: 'Patente',
  vtv: 'VTV',
  lavado: 'Lavado',
  otro: 'Otro',
};

// ─── Tarifas ─────────────────────────────────────────────────────────────────

export const TIPO_TARIFA_LABEL: Record<TipoTarifa, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
};

// ─── Métodos de pago ─────────────────────────────────────────────────────────

export const METODO_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  echeq: 'Echeq',
  cuenta_corriente: 'Cuenta Corriente',
};

// ─── Constantes de negocio ───────────────────────────────────────────────────

export const GRACE_PERIOD_MINUTES = 40;

// ─── Navegación ──────────────────────────────────────────────────────────────

// ─── Multas ──────────────────────────────────────────────────────────────────

export const ESTADO_MULTA_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  imputada: 'Imputada',
  cobrada: 'Cobrada',
  bonificada: 'Bonificada',
  apelando: 'Apelando',
};

export const ESTADO_MULTA_COLOR: Record<string, string> = {
  pendiente: 'bg-warning/15 text-warning border-warning/30',
  imputada: 'bg-primary/15 text-primary border-primary/30',
  cobrada: 'bg-success/15 text-success border-success/30',
  bonificada: 'bg-muted/40 text-muted-foreground border-border',
  apelando: 'bg-muted/40 text-muted-foreground border-border',
};

export const CONDICION_IVA_LABEL: Record<string, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributo',
  consumidor_final: 'Consumidor Final',
  exento: 'Exento',
};

export const CONDICION_PAGO_LABEL: Record<string, string> = {
  contado: 'Contado',
  cta_cte_15: 'Cta. Cte. 15 días',
  cta_cte_30: 'Cta. Cte. 30 días',
  cta_cte_60: 'Cta. Cte. 60 días',
  cta_cte_90: 'Cta. Cte. 90 días',
};

export const ESTADO_RECIBO_LABEL: Record<string, string> = {
  emitido: 'Emitido',
  anulado: 'Anulado',
};

export const ESTADO_RECIBO_COLOR: Record<string, string> = {
  emitido: 'bg-success/15 text-success border-success/30',
  anulado: 'bg-danger/15 text-danger border-danger/30',
};

export const MEDIO_PAGO_RECIBO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  echeq: 'E-cheq',
};

// ─── Navegación ──────────────────────────────────────────────────────────────

export const NAV_ITEMS = [
  { path: '/ocupacion', label: 'Ocupación', icon: 'LayoutDashboard' },
  { path: '/flota', label: 'Flota', icon: 'Car' },
  { path: '/reservas', label: 'Reservas', icon: 'ClipboardList' },
  { path: '/contratos', label: 'Contratos', icon: 'FileText' },
  { path: '/clientes', label: 'Clientes', icon: 'Users' },
  { path: '/multas', label: 'Multas', icon: 'AlertTriangle' },
  { path: '/cotizador', label: 'Cotizador', icon: 'Calculator' },
  { path: '/finanzas', label: 'Finanzas', icon: 'Wallet' },
  { path: '/reportes', label: 'Reportes', icon: 'BarChart2' },
] as const;

// Fase 3, ítem 36 (plan maestro §5.1): menú reagrupado de 9 items planos a
// 6 grupos. No mueve rutas ni páginas — sólo agrupa la navegación. Los
// grupos de un solo item se comportan como link directo; los de más de
// uno, como sección expandible.
export interface NavGroup {
  label: string;
  icon: string;
  items: { path: string; label: string; icon: string }[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Hoy', icon: 'LayoutDashboard', items: [
    { path: '/ocupacion', label: 'Ocupación', icon: 'LayoutDashboard' },
  ] },
  { label: 'Reservas', icon: 'ClipboardList', items: [
    { path: '/reservas', label: 'Reservas', icon: 'ClipboardList' },
    { path: '/contratos', label: 'Contratos', icon: 'FileText' },
  ] },
  { label: 'Flota', icon: 'Car', items: [
    { path: '/flota', label: 'Vehículos', icon: 'Car' },
    { path: '/multas', label: 'Multas', icon: 'AlertTriangle' },
  ] },
  { label: 'Clientes', icon: 'Users', items: [
    { path: '/clientes', label: 'Clientes', icon: 'Users' },
  ] },
  { label: 'Finanzas', icon: 'Wallet', items: [
    { path: '/finanzas', label: 'Finanzas', icon: 'Wallet' },
  ] },
  { label: 'Más', icon: 'MoreHorizontal', items: [
    { path: '/reportes', label: 'Reportes', icon: 'BarChart2' },
    { path: '/cotizador', label: 'Cotizador', icon: 'Calculator' },
    { path: '/configuracion', label: 'Configuración', icon: 'Settings' },
  ] },
];

// Rutas donde el sidebar arranca colapsado y se expande al pasar el mouse
// (plan maestro §5.1, punto 2): recupera ancho útil en las dos pantallas
// que más lo necesitan.
export const SIDEBAR_AUTOCOLLAPSE_PREFIXES = ['/reservas', '/ocupacion'];
