import type { NextConfig } from "next";

/**
 * Las fotos de las categorías las sirve el backend desde `/static`, así que
 * `next/image` necesita tener declarado ese host — si no, tira
 * "hostname is not configured under images" y la grilla de vehículos no
 * renderiza.
 *
 * Se deriva de `NEXT_PUBLIC_API_URL` en vez de hardcodearse: el host cambia
 * entre desarrollo (localhost) y producción, y escribirlo a mano significaría
 * que las fotos se rompen justo al publicar.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const { protocol, hostname, port } = new URL(API);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: protocol.replace(":", "") as "http" | "https",
        hostname,
        port: port || undefined,
        pathname: "/static/**",
      },
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
