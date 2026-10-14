/**
 * Re-exporta desde `contacto.ts`, que es la fuente única (D-61). Este archivo
 * queda porque lo importan varios componentes; los datos ya no viven acá.
 */
import { CONTACTO, emailHref, whatsappLink, whatsappLinkCABA } from "./contacto";

export { whatsappLink, whatsappLinkCABA };

export const WHATSAPP_GENERAL = whatsappLink(
  "Hola! Quiero consultar por el alquiler de un vehículo. ¿Me pueden asesorar?"
);

export const WHATSAPP_CABA = whatsappLinkCABA(
  "Hola! Quiero consultar por el alquiler de un vehículo en CABA ¿Me pueden asesorar?"
);

// El número de Franco, el mismo que muestra su botón en Contacto (14/10). Antes
// el botón decía su número —con la característica mal escrita, 2923 en vez de
// 2932— y al tocarlo llamaba a la línea general.
export const PHONE_FRANCO = "tel:+5492932474791";
export const PHONE_MARTIN = "tel:+5492923458779";
export const EMAIL = emailHref;
export const INSTAGRAM = CONTACTO.instagram;
