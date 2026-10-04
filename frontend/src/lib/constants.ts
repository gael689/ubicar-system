import type {
  EstadoVehiculo,
  TipoVehiculo,
  EstadoReserva,
  MotivoSolicitud,
  EstadoEcheq,
  TipoTarifa,
  TipoDanio,
  SeveridadDanio,
  EstadoDanio,
  NaturalezaMovimiento,
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

/**
 * Los colores de estado, por nivel de urgencia.
 *
 * **La mayoría de lo que estaba en naranja era informativo.** "Auto reservado",
 * "reserva pendiente", "echeq en cartera", "daño imputado" — ninguno es un
 * problema: el color sólo clasifica. Pintarlos con el color de advertencia
 * hacía que el panel gritara todo el tiempo, y un panel que grita siempre
 * enseña a no mirarlo.
 *
 * La escala está en `tailwind.config.ts`:
 *
 *   inactivo  gris   no arrancó, fuera de juego
 *   info      azul   dato, estado normal, algo en curso
 *   success   verde  cerrado, cobrado, al día
 *   warning   ámbar  hay un reloj corriendo
 *   danger    rojo   frena la operación o ya falló
 */
export const ESTADO_VEHICULO_COLOR: Record<EstadoVehiculo, string> = {
  disponible: 'bg-success/15 text-success border-success/30',
  alquilado: 'bg-primary/15 text-primary border-primary/30',
  reservado: 'bg-info/15 text-info border-info/30',
  en_transicion: 'bg-info/10 text-info border-info/25',
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
  pendiente: 'bg-info/15 text-info border-info/30',
  confirmada: 'bg-info/15 text-info border-info/30',
  activa: 'bg-success/15 text-success border-success/30',
  vencida: 'bg-danger/15 text-danger border-danger/30 animate-pulse',
  finalizada: 'bg-success/15 text-success border-success/30',
  cancelada: 'bg-danger/15 text-danger border-danger/30',
  // Sólidos: son estados que requieren que alguien haga algo, no información
  // pasiva. `pendiente_pago` sí es pasivo — espera al cliente, no a nosotros.
  pendiente_pago: 'bg-inactivo/15 text-inactivo border-inactivo/30',
  sin_disponibilidad: 'bg-info text-white border-info',
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
  en_cartera: 'bg-info/15 text-info border-info/30',
  depositado: 'bg-info/15 text-info border-info/30',
  endosado: 'bg-info/10 text-info border-info/25',
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
  detectado: 'bg-inactivo/15 text-inactivo border-inactivo/30',
  valorizado: 'bg-info/15 text-info border-info/30',
  imputado: 'bg-success/15 text-success border-success/30',
  reparado: 'bg-success/15 text-success border-success/30',
  bonificado: 'bg-info/10 text-info border-info/25',
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
  { path: '/reportes', label: 'Reportes', icon: 'BarChart2' },
] as const;

// Menú lateral (04/10/2026). Cuatro secciones con nombre y **todos los ítems a
// la vista**: antes había grupos plegables, cinco colores distintos y siete
// ítems en gris, y no se entendía qué era importante. Ahora el orden es el
// mismo que el del trabajo del día — operar, cobrar, vender, configurar — y el
// color es uno solo: el azul de Ubicar marca dónde estás parado.
export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Otras rutas que también cuentan como "estar acá" (pestañas de la misma sección). */
  matches?: string[];
}

export interface NavSection {
  titulo: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  { titulo: 'Operación', items: [
    { path: '/ocupacion', label: 'Hoy', icon: 'LayoutDashboard' },
    { path: '/reservas', label: 'Reservas', icon: 'ClipboardList' },
    { path: '/contratos', label: 'Contratos', icon: 'FileText' },
    // Vehículos, Categorías y Multas son pestañas de la misma página.
    { path: '/flota', label: 'Flota', icon: 'Car', matches: ['/multas'] },
    { path: '/clientes', label: 'Clientes', icon: 'Users' },
  ] },
  { titulo: 'Plata', items: [
    { path: '/finanzas', label: 'Finanzas', icon: 'Wallet' },
    { path: '/reportes', label: 'Reportes', icon: 'BarChart2' },
  ] },
  { titulo: 'Ventas', items: [
    { path: '/cotizador', label: 'Cotizador', icon: 'Calculator' },
    // El Simulador se abre desde el botón de la página de Precios.
    { path: '/prospectos', label: 'Prospectos', icon: 'Building2' },
    { path: '/precios', label: 'Precios', icon: 'CalendarRange', matches: ['/precios/simulador'] },
    { path: '/adicionales', label: 'Adicionales', icon: 'Package' },
    { path: '/fechas-especiales', label: 'Fechas especiales', icon: 'CalendarDays' },
    { path: '/canal-web', label: 'Cómo vende el sitio', icon: 'Globe' },
    { path: '/reservas-web', label: 'Bandeja de la web', icon: 'Inbox' },
  ] },
  { titulo: 'Sistema', items: [
    { path: '/notificaciones', label: 'Notificaciones', icon: 'Bell' },
    { path: '/configuracion', label: 'Configuración', icon: 'Settings' },
    { path: '/auditoria', label: 'Auditoría', icon: 'ShieldCheck' },
  ] },
];


// ─── Naturaleza de un movimiento de cuenta corriente ──────────────────────────
//
// Lo que hace que la ficha del cliente pueda mostrar un **echeq en cartera**
// distinto de un pago, y un **anticipo** distinto de los dos. Antes de la
// migración 079 todo eso vivía en el texto libre del concepto y la pantalla no
// tenía forma de distinguirlos.
//
// Las etiquetas están escritas para el mostrador, no para un contador: "Seña"
// y no "anticipo de naturaleza crédito".

export const NATURALEZA_LABEL: Record<NaturalezaMovimiento, string> = {
  alquiler: 'Alquiler',
  extension: 'Extensión',
  excedente: 'Excedente',
  cargo_cierre: 'Cargos de cierre',
  multa: 'Multa',
  danio: 'Daño',
  anticipo: 'Seña',
  pago: 'Cobro',
  echeq_en_cartera: 'Echeq en cartera',
  sena_retenida: 'Seña retenida',
  reembolso: 'Reembolso',
  bonificacion: 'Bonificación',
  anulacion: 'Anulación',
  manual: 'Manual',
};

export const NATURALEZA_COLOR: Record<NaturalezaMovimiento, string> = {
  alquiler: 'bg-inactivo/15 text-inactivo',
  extension: 'bg-inactivo/15 text-inactivo',
  excedente: 'bg-info/15 text-info',
  cargo_cierre: 'bg-info/15 text-info',
  multa: 'bg-danger/15 text-danger',
  danio: 'bg-danger/15 text-danger',
  // La seña se ve distinta del cobro a propósito: no es plata que baje una
  // deuda, es plata que todavía se debe entregar en forma de auto.
  anticipo: 'bg-info/15 text-info',
  pago: 'bg-success/15 text-success',
  // Un cheque en cartera no es plata: puede rebotar. Se ve distinto de un cobro.
  echeq_en_cartera: 'bg-info/10 text-info',
  sena_retenida: 'bg-info/15 text-info',
  reembolso: 'bg-info/15 text-info',
  bonificacion: 'bg-success/10 text-success',
  anulacion: 'bg-inactivo/15 text-inactivo line-through',
  manual: 'bg-inactivo/15 text-inactivo',
};


/**
 * El color de cada medio de pago.
 *
 * **Estaba escrito tres veces** —`CobrosPage`, `CajaPage` y `PagosTab`— con los
 * mismos valores y ninguna fuente común: el día que uno cambiara, los otros dos
 * quedaban distintos para el mismo dato.
 *
 * El color acá **clasifica, no advierte**: un cheque no es más urgente que una
 * transferencia. Por eso van todos en la familia informativa, separados por
 * intensidad, salvo `cuenta_corriente` — que es gris porque no es plata que
 * entró (ver `caja_service.es_plata_que_entro` en el backend).
 */
export const MEDIO_PAGO_COLOR: Record<string, string> = {
  efectivo: 'bg-success/15 text-success',
  transferencia: 'bg-info/15 text-info',
  tarjeta: 'bg-info/15 text-info',
  mercado_pago: 'bg-info/15 text-info',
  wapa: 'bg-info/15 text-info',
  cheque: 'bg-info/10 text-info',
  echeq: 'bg-info/10 text-info',
  cuenta_corriente: 'bg-inactivo/15 text-inactivo',
};
