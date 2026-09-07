/**
 * Los lugares de retiro y devolución, en corto.
 *
 * **El problema es de espacio, no de estilo.** Reportado desde el mostrador:
 *
 * > *"Ya entendí qué está pasando con la del aeropuerto: el nombre es tan largo
 * > que no me deja ver el horario. Fijate que en esta sí se ve. Entonces
 * > quedaría abreviar Aeropuerto Comandante Espora por ACE o AERO."*
 *
 * En el calendario, una reserva de un día es una barra de 180 píxeles que tiene
 * que mostrar entrega, devolución, horarios y cliente. "Aeropuerto Comandante
 * Espora" son 28 caracteres y empuja el horario fuera del recuadro — o sea que
 * tapa justo el dato que se está yendo a buscar.
 *
 * **Por qué no es un mapa cerrado.** La lista de lugares sale de la clave
 * `web.lugares_retiro` de Configuración (D-56) y se edita sin deploy. Un
 * diccionario fijo dejaría sin abreviar al primer lugar que agreguen, y nadie
 * se va a acordar de volver a este archivo. Por eso hay una regla explícita
 * para el caso conocido y una general para lo que venga.
 *
 * Sólo para las pantallas donde el espacio manda. En el PDF, el contrato y los
 * formularios va el nombre completo: ahí no hay apuro y el nombre entero es lo
 * que el cliente reconoce.
 */

/** Cuántos caracteres entran cómodos en una barra del calendario. */
const LARGO_COMODO = 16;

export function abreviarLugar(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim();
  if (!limpio) return '';

  // El caso que motivó todo esto. Va por contenido y no por igualdad exacta:
  // si mañana lo escriben "Aeropuerto Cte. Espora" o le agregan la terminal,
  // se sigue abreviando igual.
  if (/aeropuerto/i.test(limpio)) return 'AERO';

  // Una dirección normal ("Paraguay 241", "Alsina 350") ya es corta y se
  // entiende: acortarla sería hacerla ilegible para ahorrar tres píxeles.
  if (limpio.length <= LARGO_COMODO) return limpio;

  // Cualquier otro nombre largo: la primera palabra entera, que es la que lo
  // identifica, más la inicial de las que siguen. "Terminal de Ómnibus
  // Bahía Blanca" queda "Terminal Ó.B.B." — se reconoce y entra.
  const [primera, ...resto] = limpio.split(/\s+/);
  if (!resto.length) return `${primera.slice(0, LARGO_COMODO - 1)}…`;
  const iniciales = resto
    .filter(p => p.length > 2)          // se saltean "de", "la", "del"
    .map(p => `${p[0].toUpperCase()}.`)
    .join('');
  return `${primera} ${iniciales}`.trim();
}
