/**
 * Tipos de la API pública del sistema (`/api/v1/public/*` y `/precios`).
 *
 * Espejan lo que devuelve el backend. **La web no inventa nada**: precio,
 * disponibilidad y adicionales salen de los mismos endpoints que usa el
 * mostrador. Si la web calculara su propio precio, tarde o temprano cobraría
 * distinto que el sistema interno.
 */

export interface ConfigPublica {
  anticipacion_minima_horas: number;
  /** D-52 (13/08): nuevo — cuán lejos en el futuro se puede reservar online.
   *  `0` o ausente = sin tope, aunque el backend siempre lo manda. */
  horizonte_maximo_dias?: number;
  duracion_maxima_dias: number;
  lugares_retiro: string[];
  hold_minutos: number;
  /**
   * ¿Hay credenciales de Mercado Pago cargadas?
   *
   * Con esto el paso 4 muestra el botón de pagar o el cierre por WhatsApp, en
   * vez de ofrecer un pago que va a fallar. Lo decide el backend, no una
   * variable de entorno del front: la que manda es la que tiene las
   * credenciales.
   */
  cobro_online: boolean;
  porcentajes_anticipo: number[];
  /** D-30: descuento por pagar el 100% por adelantado. 0 = sin descuento. */
  descuento_pago_total_pct: number;
  /**
   * La escalera por duración (D-43), ordenada de menos a más días.
   *
   * El backend ya la aplica sola al cotizar; esto está para **contarla antes**:
   * un cliente que se entera del 15% recién cuando cambia las fechas no llega
   * nunca a cambiarlas.
   */
  escalones_duracion: EscalonDuracion[];
  /**
   * La cuenta a la que el cliente transfiere, o `null` si no está habilitada.
   *
   * **Sale de `configuracion`, no del código de la web.** Un CBU pisado en el
   * front es un CBU que un día cambia y nadie corrige, y el síntoma es la
   * plata de un cliente yendo a una cuenta que ya no existe.
   */
  transferencia: DatosTransferencia | null;
}

export interface DatosTransferencia {
  titular: string;
  alias: string;
  cbu: string;
  cuenta: string;
  cuit: string;
  /** WhatsApp al que mandar el comprobante. Sin comprobante nadie concilia
   *  la transferencia y la reserva no se confirma. */
  whatsapp_comprobante: string;
}

export interface EscalonDuracion {
  nombre: string;
  dias_desde: number;
  /** `null` = sin tope, es el último escalón. */
  dias_hasta: number | null;
  porcentaje: number;
}

// ─── Firma del contrato por link (D-C6) ──────────────────────────────────────

export interface ClausulaContrato {
  numero: number;
  titulo: string;
  parrafos: { texto: string; subrayados: [number, number][] }[];
}

export interface AceptacionContrato {
  clave: string;
  titulo: string;
  texto: string;
}

/**
 * Lo que ve el cliente al abrir el link.
 *
 * `snapshot` es el anverso **congelado al emitir el contrato**, no las tablas
 * vivas: la firma tiene que valer sobre el texto exacto que se mostró.
 */
export interface ContratoParaFirmar {
  numero: string;
  snapshot: Record<string, any>;
  clausulado: { version: number; titulo: string; clausulas: ClausulaContrato[] };
  aceptaciones: AceptacionContrato[];
  firmado: boolean;
  firmado_at: string | null;
  firmado_por_nombre: string | null;
  expira: string | null;
  vencido: boolean;
}

/** Lo que devuelve `POST /public/reservas`: a dónde mandar al cliente. */
export interface CheckoutIniciado {
  reserva_id: number;
  pago_web_id: number;
  init_point: string;
  preference_id: string;
  monto_a_cobrar: number;
  total: number;
  descuento: number;
  saldo: number;
}

/**
 * Lo que devuelve `POST /public/reservas/transferencia`.
 *
 * **La reserva no queda confirmada.** Acá no hay webhook: nadie le avisa al
 * sistema que la plata llegó, así que alguien del equipo concilia el
 * comprobante contra el extracto y recién ahí la confirma. Por eso la
 * respuesta trae los datos de la cuenta y el WhatsApp al que mandar el
 * comprobante: el cliente tiene que salir sabiendo **qué hacer**.
 */
export interface ReservaPorTransferencia {
  reserva_id: number;
  numero: string;
  monto_a_transferir: number;
  total: number;
  saldo: number;
  porcentaje_anticipo: number;
  banco: DatosTransferencia;
}

export interface PrecioCategoria {
  total: number;
  precio_dia_promedio: number;
  dias: number;
  /** Precio de lista, para el "antes $X" cuando hay promo. */
  total_referencia: number | null;
  tiene_promocion: boolean;
  promociones: string[];
  /** El mismo alquiler pagando el 100% por adelantado. `null` si no hay
   *  descuento por duración aplicable. Ver `PrecioPagoTotal`. */
  pago_total: PrecioPagoTotal | null;
}

/**
 * El mismo alquiler cotizado pagando el 100% por adelantado (D-49).
 * `null` cuando no hay descuento por duración para esa duración.
 */
export interface PrecioPagoTotal {
  total: number;
  precio_dia_promedio: number;
  descuento_monto: number;
  descuento_porcentaje: number;
  descuento_nombre: string | null;
}

export interface CategoriaDisponible {
  categoria_id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  /** "Fiat Cronos, VW Virtus o similar" — nunca se promete un modelo puntual. */
  ejemplo_modelos: string | null;
  foto_key: string | null;
  /**
   * La URL ya resuelta por el backend, que es el único que sabe dónde están
   * guardados los archivos. **Es la que hay que usar.** Armarla en la web como
   * `<backend>/static/<foto_key>` sólo funciona con storage local: desde que
   * los archivos viven en un bucket, el dominio es otro y esa ruta da 404.
   */
  foto_url: string | null;
  pasajeros: number | null;
  valijas: number | null;
  transmision: string | null;
  aire_acondicionado: boolean;
  /**
   * Lo que le queda a cargo del cliente si no contrata ninguna cobertura
   * (D-51/D-59). `null` si la categoría no tiene franquicia base cargada.
   * Es el escenario de referencia contra el que se comparan las coberturas
   * del paso 2 — hoy es el más caro, no el más barato como antes.
   */
  franquicia_base: number | null;
  disponibles: number;
  hay_cupo: boolean;
  ultima_unidad: boolean;
  /**
   * Entrega más tarde ese mismo día, sobre la unidad que vuelve.
   *
   * Sólo viene cuando **no queda ninguna unidad libre** y una se devuelve ese
   * mismo día. Con cupo es siempre `null`: ahí se alquila normal, a la hora
   * que el cliente pidió. Ver `proponer_entrega_por_rotacion` en el backend.
   */
  rotacion: EntregaPorRotacion | null;
  /** Null si la categoría no tiene precio configurado: no se puede vender. */
  precio: PrecioCategoria | null;
}

export interface EntregaPorRotacion {
  fecha_entrega: string;
  /** "12:00" — la hora a la que se puede retirar. */
  hora_entrega: string;
  /** "10:00" — cuándo vuelve la unidad. Es la explicación del horario: sin
   *  ella, un retiro corrido se lee como un error del sitio. */
  hora_devolucion_unidad: string;
  margen_horas: number;
}

/** Lo que devuelve `GET /public/disponibilidad`: el rango + las categorías. */
export interface RespuestaDisponibilidad {
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  categorias: CategoriaDisponible[];
}

export interface Adicional {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  /** `cobertura` se elige UNA sola; `extra`, las que se quieran. */
  grupo: "cobertura" | "extra";
  precio: number;
  /**
   * Las coberturas no tienen precio propio: cuestan un porcentaje del
   * alquiler, y su `precio` es 0. El backend lo devuelve desde siempre y este
   * tipo no lo declaraba, así que la web no tenía cómo mostrar el precio real
   * — y como `precio === 0`, la tarjeta decía **"Incluido"** sobre algo que
   * cuesta 30% más.
   */
  porcentaje_sobre_alquiler: number | null;
  unidad_cobro: "por_dia" | "unico";
  incluido: boolean;
  /** Sólo coberturas: lo que queda a cargo del cliente ante un siniestro. */
  franquicia: number | null;
  max_cantidad: number | null;
}

export interface Hold {
  token: string;
  categoria_id: number;
  fecha_inicio: string;
  hora_inicio: string;
  fecha_fin: string;
  hora_fin: string;
  expira_en: string;
  segundos_restantes: number;
  vigente: boolean;
  estado: "vigente" | "consumido" | "liberado";
}

export interface AdicionalCotizado {
  id: number;
  nombre: string;
  precio_unitario: number;
  unidad_cobro: string;
  cantidad: number;
  subtotal: number;
  grupo: string;
}

export interface Cotizacion {
  duracion_dias: number;
  subtotal: number;
  descuento_porcentaje: number;
  descuento_monto: number;
  descuento_nombre: string | null;
  subtotal_vehiculo: number;
  adicionales: AdicionalCotizado[];
  total_adicionales: number;
  recargo_edad: { id: number; nombre: string; edad: number; monto: number } | null;
  /** El total del escenario pedido: con descuento por duración si se mandó
   *  `porcentaje_anticipo: 100`, y de lista en cualquier otro caso. */
  total: number;
  precio_dia_promedio: number;
  total_referencia: number | null;
  tiene_promocion: boolean;
  promociones: string[];
  /**
   * Lo que sale el alquiler señando parcial — el precio de lista, sin el
   * descuento por duración. Es la base de los montos del 30% y el 50%, y el
   * número que va tachado cuando el cliente elige pagar todo.
   */
  total_lista: number;
  /** El mismo alquiler pagando el 100% (D-49). `null` si no hay descuento por
   *  duración para esta duración. Misma forma que `precio.pago_total`. */
  pago_total: CotizacionPagoTotal | null;
  /**
   * Los tres botones del paso 4, ya resueltos por el backend.
   *
   * **Los montos no se estiman en el navegador.** Salen de `calcular_anticipo`,
   * la misma función que después decide cuánto se le cobra de verdad al
   * cliente: el botón muestra el monto exacto que va a la pasarela.
   */
  anticipos: OpcionAnticipo[];
}

export interface CotizacionPagoTotal {
  total: number;
  descuento_monto: number;
  descuento_porcentaje: number;
  descuento_nombre: string | null;
}

export interface OpcionAnticipo {
  porcentaje: number;
  /** Lo que termina saliendo el alquiler completo con esta opción. */
  total: number;
  /** Lo que se paga ahora. */
  monto_a_cobrar: number;
  /** Lo que queda para el mostrador, al retirar el vehículo. */
  saldo: number;
  /** D-30: descuento extra por pagar todo hoy, arriba del de duración. */
  descuento_pago_total: number;
  /** Cuánta plata se ahorra respecto de señar parcial. 0 en el 30% y el 50%. */
  ahorro: number;
}

/** Lo que el usuario va armando a lo largo de los 4 pasos. */
export interface BorradorReserva {
  lugarRetiro: string;
  lugarDevolucion: string;
  fechaInicio: string;
  horaInicio: string;
  fechaFin: string;
  horaFin: string;
  categoria: CategoriaDisponible | null;
  /** id del adicional → cantidad */
  adicionales: Record<number, number>;
  holdToken: string | null;
  cliente: DatosCliente;
}

export type CondicionIva =
  | "consumidor_final"
  | "responsable_inscripto"
  | "monotributo"
  | "exento";

export interface DatosCliente {
  nombre: string;
  apellido: string;
  /** DNI si es consumidor final; CUIT en cualquier otra condición. Va a la
   *  misma columna `dni_cuit` del cliente, que admite las dos cosas. */
  dni: string;
  email: string;
  telefono: string;
  /** Obligatoria: sin ella no se puede cotizar el recargo por edad (D-38). */
  fechaNacimiento: string;
  /** Para el comprobante. El sistema todavía no factura: el dato se guarda
   *  para quien emite la factura y para la facturación electrónica futura. */
  condicionIva: CondicionIva;
  /** Sólo cuando la condición no es consumidor final. */
  razonSocial: string;
  aceptaTerminos: boolean;
}

/**
 * Por qué la web no pudo cerrar la venta sola y derivó a un agente (D-61).
 *
 * Son los tres casos del panel de derivación. Ojo: **no coinciden uno a uno**
 * con `MotivoDerivacion` del cartel, que distingue `anticipacion`,
 * `horizonte` y `duracion` — los tres colapsan acá en `fuera_de_ventana`,
 * porque para el mostrador son la misma conversación: la fecha no la cierra
 * la web.
 */
export type MotivoSolicitud = "fuera_de_ventana" | "sin_cupo" | "otro_lugar";
