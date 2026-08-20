import type {
  EstadoVehiculo,
  TipoVehiculo,
  EstadoReserva,
  MotivoSolicitud,
  EstadoEcheq,
  TipoDocumento,
  TipoGasto,
  TipoTarifa,
  TipoDanio,
  SeveridadDanio,
  EstadoDanio,
  ResponsableDanio,
  TipoFechaEspecial,
  ColorFechaEspecial,
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
  pendiente_pago: 'Esperando pago',
  sin_disponibilidad: 'Sin disponibilidad',
  revision_sin_cupo: 'Pagó sin cupo',
};

export const ESTADO_RESERVA_COLOR: Record<EstadoReserva, string> = {
  pendiente: 'bg-warning/15 text-warning border-warning/30',
  confirmada: 'bg-primary/15 text-primary border-primary/30',
  activa: 'bg-success/15 text-success border-success/30',
  vencida: 'bg-danger/15 text-danger border-danger/30 animate-pulse',
  finalizada: 'bg-muted/40 text-muted-foreground border-border',
  cancelada: 'bg-danger/15 text-danger border-danger/30',
  // Sólidos: son estados que requieren que alguien haga algo, no información
  // pasiva. `pendiente_pago` sí es pasivo — espera al cliente, no a nosotros.
  pendiente_pago: 'bg-muted/40 text-muted-foreground border-border',
  sin_disponibilidad: 'bg-warning text-white border-warning',
  revision_sin_cupo: 'bg-danger text-white border-danger animate-pulse',
};

// ─── Solicitudes de contacto (D-61) ──────────────────────────────────────────
// Por qué esa persona terminó pidiendo una llamada en vez de reservar sola.
// Es lo primero que el mostrador necesita saber antes de marcar el número:
// no se atiende igual "quiere para pasado mañana" que "quiere que se lo
// llevemos al campo".

export const MOTIVO_SOLICITUD_LABEL: Record<MotivoSolicitud, string> = {
  fuera_de_ventana: 'Fecha muy cerca',
  sin_cupo: 'Categoría sin cupo',
  otro_lugar: 'Lugar a coordinar',
};

export const MOTIVO_SOLICITUD_COLOR: Record<MotivoSolicitud, string> = {
  fuera_de_ventana: 'bg-warning text-white',
  sin_cupo: 'bg-primary text-white',
  otro_lugar: 'bg-success text-white',
};

// ─── Echeqs ──────────────────────────────────────────────────────────────────

export const ESTADO_ECHEQ_LABEL: Record<EstadoEcheq, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  endosado: 'Endosado',
  rechazado: 'Rechazado',
  cobrado: 'Cobrado',
  vencido: 'Vencido',
  pendiente: 'Pendiente',  // legacy — no se usa en registros nuevos
};

export const ESTADO_ECHEQ_COLOR: Record<EstadoEcheq, string> = {
  en_cartera: 'bg-warning/15 text-warning border-warning/30',
  depositado: 'bg-primary/15 text-primary border-primary/30',
  endosado: 'bg-secondary/40 text-primary border-secondary',
  rechazado: 'bg-danger/15 text-danger border-danger/30',
  cobrado: 'bg-success/15 text-success border-success/30',
  vencido: 'bg-muted/40 text-muted-foreground border-border',
  pendiente: 'bg-muted/40 text-muted-foreground border-border',
};

// ─── Fechas especiales ───────────────────────────────────────────────────────

export const TIPO_FECHA_ESPECIAL_LABEL: Record<TipoFechaEspecial, string> = {
  feriado: 'Feriado',
  fin_semana_largo: 'Fin de semana largo',
  comercial: 'Fecha comercial',
  temporada: 'Temporada',
  otro: 'Otro',
};

/**
 * Clases completas por color — nunca interpolar (`bg-${color}-500` no
 * sobrevive al purge de Tailwind). `chip` es para el badge en el header del
 * calendario; `celda` tiñe suavemente la columna del día.
 */
export const COLOR_FECHA_ESPECIAL: Record<ColorFechaEspecial, { chip: string; celda: string; punto: string }> = {
  rojo:    { chip: 'bg-red-600 text-white',     celda: 'bg-red-50',     punto: 'bg-red-600' },
  ambar:   { chip: 'bg-amber-500 text-white',   celda: 'bg-amber-50',   punto: 'bg-amber-500' },
  verde:   { chip: 'bg-emerald-600 text-white', celda: 'bg-emerald-50', punto: 'bg-emerald-600' },
  azul:    { chip: 'bg-sky-600 text-white',     celda: 'bg-sky-50',     punto: 'bg-sky-600' },
  violeta: { chip: 'bg-violet-600 text-white',  celda: 'bg-violet-50',  punto: 'bg-violet-600' },
};

// ─── Daños (parte de daños) ──────────────────────────────────────────────────

export const TIPO_DANIO_LABEL: Record<TipoDanio, string> = {
  rayon: 'Rayón',
  abolladura: 'Abolladura',
  rotura: 'Rotura',
  faltante: 'Faltante',
  cristal: 'Cristal',
  tapizado: 'Tapizado',
  mecanico: 'Mecánico',
  otro: 'Otro',
};

export const SEVERIDAD_DANIO_LABEL: Record<SeveridadDanio, string> = {
  leve: 'Leve',
  moderado: 'Moderado',
  grave: 'Grave',
};

// Sólidos: la severidad es justamente lo que hay que ver de un vistazo.
export const SEVERIDAD_DANIO_COLOR: Record<SeveridadDanio, string> = {
  leve: 'bg-slate-500 text-white',
  moderado: 'bg-warning text-white',
  grave: 'bg-danger text-white',
};

export const ESTADO_DANIO_LABEL: Record<EstadoDanio, string> = {
  detectado: 'Detectado',
  valorizado: 'Valorizado',
  imputado: 'Imputado',
  reparado: 'Reparado',
  bonificado: 'Bonificado',
};

export const ESTADO_DANIO_COLOR: Record<EstadoDanio, string> = {
  detectado: 'bg-muted text-muted-foreground border-border',
  valorizado: 'bg-primary/15 text-primary border-primary/30',
  imputado: 'bg-warning/15 text-warning border-warning/30',
  reparado: 'bg-success/15 text-success border-success/30',
  bonificado: 'bg-secondary/40 text-primary border-secondary',
};

export const RESPONSABLE_DANIO_LABEL: Record<ResponsableDanio, string> = {
  sin_definir: 'Sin definir',
  cliente: 'Cliente',
  desgaste: 'Desgaste de uso',
  terceros: 'Terceros',
};

/** Zonas sugeridas. Es un `datalist`, no un enum: se puede escribir cualquier otra. */
export const ZONAS_DANIO = [
  'Paragolpes delantero', 'Paragolpes trasero',
  'Capot', 'Techo', 'Baúl',
  'Puerta delantera izq.', 'Puerta delantera der.',
  'Puerta trasera izq.', 'Puerta trasera der.',
  'Guardabarros izq.', 'Guardabarros der.',
  'Espejo izq.', 'Espejo der.',
  'Parabrisas', 'Luneta trasera',
  'Llanta / cubierta', 'Óptica delantera', 'Óptica trasera',
  'Interior / tapizado', 'Tablero',
];

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
  mercado_pago: 'Mercado Pago',
  wapa: 'Wapa',
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

// Colores sólidos — a diferencia del resto de los badges informativos del
// sistema, el estado de una multa es una decisión que hay que notar de un
// vistazo (quién debe, a quién se le perdonó), no un dato pasivo.
export const ESTADO_MULTA_COLOR: Record<string, string> = {
  pendiente: 'bg-warning text-white border-warning',
  imputada: 'bg-primary text-white border-primary',
  cobrada: 'bg-success text-white border-success',
  bonificada: 'bg-slate-500 text-white border-slate-500',
  apelando: 'bg-violet-600 text-white border-violet-600',
};

// Versión "sin rellenar" del mismo color — para botones de acción que no
// son el estado actual: cada uno mantiene su color característico (nunca
// gris genérico), sólo que sin el relleno sólido que sí lleva el activo.
export const ESTADO_MULTA_COLOR_OUTLINE: Record<string, string> = {
  pendiente: 'bg-white text-warning border-warning hover:bg-warning hover:text-white',
  imputada: 'bg-white text-primary border-primary hover:bg-primary hover:text-white',
  cobrada: 'bg-white text-success border-success hover:bg-success hover:text-white',
  bonificada: 'bg-white text-slate-500 border-slate-500 hover:bg-slate-500 hover:text-white',
  apelando: 'bg-white text-violet-600 border-violet-600 hover:bg-violet-600 hover:text-white',
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
  // Los cinco primeros son la barra inferior de celular (`Sidebar.tsx`).
  // En el celular se usa el sistema parado en el mostrador: Contratos salio
  // porque es una accion que arranca desde una reserva, no un destino.
  { path: '/ocupacion', label: 'Hoy', icon: 'LayoutDashboard' },
  { path: '/reservas', label: 'Reservas', icon: 'ClipboardList' },
  { path: '/flota', label: 'Flota', icon: 'Car' },
  { path: '/clientes', label: 'Clientes', icon: 'Users' },
  { path: '/finanzas', label: 'Finanzas', icon: 'Wallet' },
  { path: '/contratos', label: 'Contratos', icon: 'FileText' },
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
  // Se destaca con un color de texto distinto en vez de esconderlo bajo un
  // desplegable — reemplaza al viejo grupo "Más" (3 puntitos), que agrupaba
  // secciones secundarias detrás de un click extra.
  principal?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Hoy', icon: 'LayoutDashboard', principal: true, items: [
    { path: '/ocupacion', label: 'Ocupación', icon: 'LayoutDashboard' },
  ] },
  { label: 'Reservas', icon: 'ClipboardList', principal: true, items: [
    // "Reservas web" salio del menu: es el mismo listado con el filtro de
    // canal en "Web". Tener una entrada aparte era lo que hacia que una reserva
    // web confirmada desapareciera de la vista al salir de esa bandeja. La ruta
    // sigue existiendo porque hay links a ella.
    { path: '/reservas', label: 'Reservas', icon: 'ClipboardList' },
    { path: '/contratos', label: 'Contratos', icon: 'FileText' },
  ] },
  { label: 'Flota', icon: 'Car', principal: true, items: [
    { path: '/flota', label: 'Vehículos', icon: 'Car' },
    // **Entra al menú.** Era la única pantalla con contenido propio que no
    // figuraba en ningún lado: se llegaba sólo por un botón dentro de Flota.
    // Y es donde se cargan los precios base y las franquicias — o sea, a donde
    // apuntan dos de los avisos del sistema ("falta el precio real", "falta la
    // franquicia"), que mandaban a una pantalla invisible.
    { path: '/flota/categorias', label: 'Categorías y precios base', icon: 'Package' },
    { path: '/multas', label: 'Multas', icon: 'AlertTriangle' },
  ] },
  { label: 'Clientes', icon: 'Users', principal: true, items: [
    { path: '/clientes', label: 'Clientes', icon: 'Users' },
  ] },
  { label: 'Finanzas', icon: 'Wallet', principal: true, items: [
    { path: '/finanzas', label: 'Finanzas', icon: 'Wallet' },
  ] },
  { label: 'Reportes', icon: 'BarChart2', items: [
    { path: '/reportes', label: 'Reportes', icon: 'BarChart2' },
  ] },
  { label: 'Notificaciones', icon: 'Bell', items: [
    { path: '/notificaciones', label: 'Notificaciones', icon: 'Bell' },
  ] },
  { label: 'Cotizador', icon: 'Calculator', items: [
    { path: '/cotizador', label: 'Cotizador', icon: 'Calculator' },
  ] },
  { label: 'Precios', icon: 'CalendarRange', items: [
    // Dos entradas, no una con interruptor: cargar un precio pensando en la
    // web y cambiarle el precio al mostrador es el error que esto evita.
    // Una sola entrada. Eran dos —una por canal— y eso hacía que las reglas de
    // web y de mostrador no se pudieran ver juntas nunca: cargabas una promo en
    // una pantalla, te olvidabas de la otra, y nada lo señalaba.
    { path: '/precios', label: 'Calendario de precios', icon: 'CalendarRange' },
    // El simulador estaba escondido abajo de todo dentro de la pantalla de
    // precios, así que casi nadie sabía que existía — y es lo único que
    // contesta "¿mi promo le está ganando a la tarifa del auto?" sin tener que
    // crear una reserva de prueba.
    { path: '/precios/simulador', label: 'Simulador', icon: 'Calculator' },
    { path: '/adicionales', label: 'Adicionales', icon: 'Package' },
  ] },
  { label: 'Fechas especiales', icon: 'CalendarDays', items: [
    { path: '/fechas-especiales', label: 'Fechas especiales', icon: 'CalendarDays' },
  ] },
  { label: 'Canal web', icon: 'Globe', items: [
    { path: '/canal-web', label: 'Cómo vende el sitio', icon: 'Globe' },
    { path: '/reservas-web', label: 'Bandeja de la web', icon: 'ClipboardList' },
  ] },
  { label: 'Configuración', icon: 'Settings', items: [
    { path: '/configuracion', label: 'Configuración', icon: 'Settings' },
    { path: '/auditoria', label: 'Auditoría', icon: 'ShieldCheck' },
  ] },
];

// Un color de acento por sección núcleo (grupos `principal`) — antes todo el
// menú usaba el mismo azul para todo, sin distinguir secciones. Los grupos
// secundarios (Reportes/Notificaciones/Cotizador/Configuración) se quedan
// neutros a propósito, no son "secciones" del negocio. Clases completas
// (nunca interpolación de string) para que Tailwind no las purgue.
export interface NavGroupColor {
  /** Fondo + texto cuando el grupo/ítem está activo */
  active: string;
  /** Color de texto cuando es `principal` pero no está activo — el ícono
   * hereda el mismo color vía `currentColor`, no necesita clase propia. */
  text: string;
}

export const NAV_GROUP_COLOR: Record<string, NavGroupColor> = {
  Hoy:       { active: 'bg-primary/10 text-primary',        text: 'text-foreground' },
  Reservas:  { active: 'bg-indigo-500/10 text-indigo-600',  text: 'text-indigo-700' },
  Flota:     { active: 'bg-teal-500/10 text-teal-600',      text: 'text-teal-700' },
  Clientes:  { active: 'bg-rose-500/10 text-rose-600',      text: 'text-rose-700' },
  Finanzas:  { active: 'bg-emerald-500/10 text-emerald-600', text: 'text-emerald-700' },
};
