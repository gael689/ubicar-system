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

export interface PrecioCategoria {
  total: number;
  precio_dia_promedio: number;
  dias: number;
  /** Precio de lista, para el "antes $X" cuando hay promo. */
  total_referencia: number | null;
  tiene_promocion: boolean;
  promociones: string[];
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
  disponibles: number;
  hay_cupo: boolean;
  ultima_unidad: boolean;
  /** Null si la categoría no tiene precio configurado: no se puede vender. */
  precio: PrecioCategoria | null;
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
  total: number;
  precio_dia_promedio: number;
  total_referencia: number | null;
  tiene_promocion: boolean;
  promociones: string[];
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
