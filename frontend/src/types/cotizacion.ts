export type CategoriaVehiculo = 'compacto' | 'sedan' | 'sedan_sup' | 'suv' | 'camioneta' | 'furgon';
export type ModalidadItem = 'mensual' | 'dias' | 'libre';
export type ModoCotizacion = 'categoria' | 'unidad';

export const UNIDADES_CAMIONETA = ['Ram Dakota 4x4', 'Fiat Titano Freedom 4x4', 'Toyota Hilux DX 4x4'] as const;
export const UNIDADES_VEHICULO = ['Volkswagen Virtus', 'Fiat Argo', 'Fiat Cronos'] as const;
// Utilitarios: cotizan como furgón, no como pick-up. Son otro precio y otro
// uso (carga, no pasajeros), así que meterlos en el grupo de camionetas
// habría hecho que salieran con la categoría equivocada en el PDF.
export const UNIDADES_UTILITARIO = ['Utilitario Partner'] as const;
export type UnidadNombre =
  | typeof UNIDADES_CAMIONETA[number]
  | typeof UNIDADES_VEHICULO[number]
  | typeof UNIDADES_UTILITARIO[number];

export interface ItemCotizacion {
  id: string;
  categoria: CategoriaVehiculo;
  unidad?: UnidadNombre; // presente solo en modo "cotizar por unidad"
  modalidad: ModalidadItem;
  dias: number;          // 30 para mensual, n real para dias, 0 para libre
  precio_total: number;  // inversión total de este ítem
  fecha_desde?: string;  // opcional
  fecha_hasta?: string;  // opcional
}

export interface CotizacionData {
  numero: string;
  fecha: string;
  validez_hasta: string;
  agente: string;
  empresa: string;
  contacto: string;
  email: string;
  notas: string;
  items: ItemCotizacion[];
  /**
   * Si el PDF cierra con la suma de todos los ítems.
   *
   * **No siempre corresponde.** Una cotización con varios vehículos puede ser
   * un presupuesto de una flota —y ahí el total es el dato— o un abanico de
   * opciones para que el cliente elija una sola, y ahí sumarlas informa un
   * número que nadie va a pagar.
   */
  mostrar_total: boolean;
}
