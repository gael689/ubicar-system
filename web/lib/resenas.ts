/**
 * Las reseñas de Google de Ubicar, en un solo lugar.
 *
 * De acá leen la insignia del hero, la del cierre de la portada, el enlace del
 * pie y el `aggregateRating` del JSON-LD (`app/layout.tsx`). **Se actualiza a
 * mano**: abrir la ficha de Ubicar Rent en Google Maps, copiar el puntaje y la
 * cantidad, y anotar la fecha.
 *
 * ## `cantidad: null` = no se muestra ningún número
 *
 * Mientras la cantidad esté en `null`, la insignia dice "5 estrellas en Google
 * · Ver reseñas" **sin número**, y el JSON-LD no emite `aggregateRating`. Es a
 * propósito: un número de reseñas que no coincide con el de la ficha es lo
 * primero que ve quien toca la insignia, y pasa de prueba social a motivo de
 * desconfianza. Mejor sin número que con uno aproximado.
 *
 * ## La URL
 *
 * Hoy es una búsqueda de Google Maps por nombre, que cae en la ficha. Cuando
 * esté a mano, conviene reemplazarla por el enlace directo a las reseñas: en
 * Google Maps, la ficha → "Compartir" → copiar el enlace (`maps.app.goo.gl/…`).
 */
export const RESENAS_GOOGLE: {
  /** De 1 a 5, con un decimal como lo muestra Google (5 o 4.9). */
  puntaje: number;
  /** Cantidad de reseñas de la ficha. `null` = no verificada, no se muestra. */
  cantidad: number | null;
  url: string;
  /** Cuándo se copió el dato de la ficha (AAAA-MM-DD). */
  actualizado: string | null;
} = {
  puntaje: 5,
  cantidad: null, // ← cargar acá el número real de la ficha de Google
  url: "https://www.google.com/maps/search/?api=1&query=Ubicar+Rent+Bah%C3%ADa+Blanca",
  actualizado: null,
};

/** "5" o "4,9": con coma decimal, y sin el ",0" cuando es entero. */
export const puntajeTexto = (conDecimal = false) =>
  RESENAS_GOOGLE.puntaje.toLocaleString("es-AR", {
    minimumFractionDigits: conDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  });

/** El texto completo, para `aria-label` y para donde no hay estrellas. */
export const resenasTextoAccesible = () =>
  RESENAS_GOOGLE.cantidad
    ? `${puntajeTexto(true)} de 5 estrellas, ${RESENAS_GOOGLE.cantidad} reseñas en Google. Ver las reseñas`
    : `${puntajeTexto()} estrellas en Google. Ver las reseñas`;
