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
