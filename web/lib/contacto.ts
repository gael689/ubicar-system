/**
 * Los datos de contacto de Ubicar, en un solo lugar (D-61).
 *
 * Antes estaban repartidos en seis archivos, con el número de WhatsApp escrito
 * a mano en cuatro de ellos —incluida una copia hardcodeada adentro del propio
 * `CartelDerivacion`, el componente cuyo trabajo es justamente derivar—. Es la
 * misma enfermedad que D-56 tuvo que curar con los lugares de retiro y D-52 con
 * los plazos: cuando el mismo dato vive en varios lados, uno queda viejo y
 * nadie se entera hasta que un cliente escribe a un número que no atiende.
 *
 * Cada canal viene en dos formas a propósito: `*Numero` es lo que va adentro
 * del link (sin espacios ni signos, como lo quiere `wa.me` y `tel:`), y
 * `*Display` es lo que lee la persona. Separarlos evita el error clásico de
 * usar el legible dentro del href y romper el link en el teléfono.
 */
export const CONTACTO = {
  whatsappNumero: "5492914180554",
  whatsappDisplay: "+54 9 291 418-0554",
  // Las llamadas van al mismo número que el WhatsApp (14/08). Antes apuntaba
  // a un teléfono distinto, así que quien no usaba WhatsApp terminaba en otra
  // línea que no es la que atiende las reservas.
  telefonoNumero: "+5492914180554",
  telefonoDisplay: "+54 9 291 418-0554",
  email: "ubicar.rent@gmail.com",
  instagram: "https://www.instagram.com/ubicar_rent/",
} as const;

/** El WhatsApp de CABA es otro número y otro destinatario — no es un canal
 *  alternativo al principal, así que no se mezcla con el de arriba. */
export const CONTACTO_CABA = {
  whatsappNumero: "5491125164791",
} as const;

export const whatsappLink = (mensaje: string) =>
  `https://wa.me/${CONTACTO.whatsappNumero}?text=${encodeURIComponent(mensaje)}`;

export const whatsappLinkCABA = (mensaje: string) =>
  `https://wa.me/${CONTACTO_CABA.whatsappNumero}?text=${encodeURIComponent(mensaje)}`;

export const telefonoHref = `tel:${CONTACTO.telefonoNumero}`;
export const emailHref = `mailto:${CONTACTO.email}`;
