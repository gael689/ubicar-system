/**
 * El dominio canónico del sitio, en un solo lugar.
 *
 * **Es `www`** (decisión del 06/10/2026): el apex redirige con 308 a este host,
 * así que canónicas, sitemap, Open Graph y los `@id` del JSON-LD tienen que
 * declarar el de destino y no el que redirige. Si no, Google ve una señal
 * cruzada hacia una URL que contesta 308.
 *
 * Estaba escrito a mano en `layout.tsx`, `maquinaria/page.tsx` y `sitemap.ts`.
 */
export const SITE = "https://www.ubicar-rent.com.ar";

/**
 * La imagen que se ve al compartir un link (WhatsApp, Facebook, LinkedIn).
 *
 * 1200×630, la proporción que esperan todas. La anterior (`og-image.jpeg`) era
 * una captura de 1600×442 del sitio viejo —se recortaba y todavía decía
 * "Capital Federal"—. **Nombre nuevo a propósito**: las redes cachean la imagen
 * por URL, y con el mismo nombre seguirían mostrando la vieja (14/10).
 */
export const OG_IMAGEN = {
  url: "/og-ubicar.jpg",
  width: 1200,
  height: 630,
  alt: "Ubicar Rent — alquiler de autos y camionetas en Bahía Blanca",
};
