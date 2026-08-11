import type { MetadataRoute } from "next";

const SITE = "https://ubicar-rent.com.ar";

/**
 * Sitemap generado en el build.
 *
 * Antes era un `public/sitemap.xml` escrito a mano, con dos problemas: le
 * faltaban las rutas nuevas y el `lastmod` quedó congelado en abril. Un
 * sitemap que miente sobre cuándo cambió una página le enseña a Google a
 * ignorarlo.
 *
 * `/reservar` y `/reservar/listo` quedan afuera a propósito: son
 * transaccionales, no aportan nada en buscadores y sus URLs llevan fechas
 * concretas que envejecen mal.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const hoy = new Date();

  return [
    { url: `${SITE}/`, lastModified: hoy, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/maquinaria`, lastModified: hoy, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/preguntas-frecuentes`, lastModified: hoy, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/terminos`, lastModified: hoy, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/privacidad`, lastModified: hoy, changeFrequency: "yearly", priority: 0.3 },
  ];
}
