const WHATSAPP_BASE = "https://wa.me/5492914180554";
const WHATSAPP_CABA_BASE = "https://wa.me/5491125164791";
export const whatsappLink = (message: string) =>
  `${WHATSAPP_BASE}?text=${encodeURIComponent(message)}`;

export const whatsappLinkCABA = (message: string) =>
  `${WHATSAPP_CABA_BASE}?text=${encodeURIComponent(message)}`;

export const WHATSAPP_GENERAL = whatsappLink(
  "Hola! Quiero consultar por el alquiler de un vehículo. ¿Me pueden asesorar?"
);

export const WHATSAPP_CABA = whatsappLinkCABA(
  "Hola! Quiero consultar por el alquiler de un vehículo en CABA ¿Me pueden asesorar?"
);

export const PHONE_FRANCO = "tel:+5492923474791";
export const PHONE_MARTIN = "tel:+5492923458779";
export const EMAIL = "mailto:ubicar.rent@gmail.com";
export const INSTAGRAM = "https://www.instagram.com/ubicar_rent/";
