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
