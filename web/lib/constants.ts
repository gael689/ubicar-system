/**
 * Re-exporta desde `contacto.ts`, que es la fuente única (D-61). Este archivo
 * queda porque lo importan varios componentes; los datos ya no viven acá.
 */
import { CONTACTO, telefonoHref, emailHref, whatsappLink, whatsappLinkCABA } from "./contacto";

export { whatsappLink, whatsappLinkCABA };

export const WHATSAPP_GENERAL = whatsappLink(
  "Hola! Quiero consultar por el alquiler de un vehículo. ¿Me pueden asesorar?"
);

export const WHATSAPP_CABA = whatsappLinkCABA(
  "Hola! Quiero consultar por el alquiler de un vehículo en CABA ¿Me pueden asesorar?"
);

export const PHONE_FRANCO = telefonoHref;
export const PHONE_MARTIN = "tel:+5492923458779";
export const EMAIL = emailHref;
export const INSTAGRAM = CONTACTO.instagram;
