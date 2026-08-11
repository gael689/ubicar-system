import type { NextConfig } from "next";

/**
 * `next/image` sólo optimiza imágenes de hosts declarados acá: si falta uno,
 * tira "hostname is not configured under images" y la grilla de vehículos no
 * renderiza.
 *
 * Hay **dos** orígenes posibles para las fotos, y los dos tienen que estar:
 *
 * - `/static` del backend, que es de donde salían con storage local. Se sigue
 *   declarando porque en desarrollo se usa y porque es el respaldo.
 * - El **bucket**, desde que los archivos viven en R2. El backend devuelve la
 *   URL ya resuelta contra este dominio.
 *
 * Los dos se derivan de variables de entorno en vez de hardcodearse: el host
 * cambia entre desarrollo y producción, y escribirlo a mano significaría que
 * las fotos se rompen justo al publicar.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const { protocol, hostname, port } = new URL(API);

// El dominio público del bucket. Sin esta variable, las fotos guardadas en R2
// no se optimizan y la grilla queda vacía.
const STORAGE = process.env.NEXT_PUBLIC_STORAGE_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: protocol.replace(":", "") as "http" | "https",
        hostname,
        port: port || undefined,
        pathname: "/static/**",
      },
      ...(STORAGE
        ? [{
            protocol: "https" as const,
            hostname: new URL(STORAGE).hostname,
          }]
        : []),
      // La foto de fondo del Hero viene de Pexels.
      { protocol: "https", hostname: "images.pexels.com" },
    ],
    // Next 16 bloquea por seguridad optimizar imágenes servidas desde una IP
    // local. En desarrollo el backend es `localhost`, así que sin esto las
    // fotos de las categorías dan 400. **Sólo en desarrollo**: en producción
    // el backend tiene dominio propio y la restricción tiene que seguir activa.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
