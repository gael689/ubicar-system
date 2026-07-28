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

export interface DatosCliente {
  nombre: string;
  apellido: string;
  dni: string;
  email: string;
  telefono: string;
  /** Obligatoria: sin ella no se puede cotizar el recargo por edad (D-38). */
  fechaNacimiento: string;
  aceptaTerminos: boolean;
}
