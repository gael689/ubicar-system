import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { Analitica } from "@/components/Analitica";
import { AvisoCookies } from "@/components/AvisoCookies";
import "./globals.css";

// Se auto-hostea: elimina el request bloqueante a fonts.googleapis.com que
// tenía la versión Vite y evita el salto de layout al cargar la tipografía.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const SITE = "https://ubicar-rent.com.ar";

// Los IDs salen del entorno, con los actuales como valor por defecto para que
// nada se rompa si la variable falta. Estaban escritos duro acá: no es un
// secreto —van en el HTML igual— pero sí impedía apuntar a una propiedad de
// prueba sin editar el código, que es justamente lo que hace falta para probar
// el embudo sin ensuciar los números reales.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "26876823408666329";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-25783YNP7G";

const TITULO = "Alquiler de Autos en Bahía Blanca | Ubicar Rent";
const DESCRIPCION =
  "Alquiler de autos, camionetas 4x4 y maquinaria pesada en Bahía Blanca y la zona. " +
  "Reservá online con precio final. Atención a empresas y particulares. ¡Consultá disponibilidad!";
const DESCRIPCION_SOCIAL =
  "Alquiler de autos, camionetas 4x4 y maquinaria pesada en Bahía Blanca y la zona. Reservá online.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITULO,
  description: DESCRIPCION,
  keywords: [
    "alquiler de autos bahia blanca", "alquiler de autos en bahia blanca",
    "rent a car bahia blanca", "alquiler de vehiculos bahia blanca",
    "alquiler camioneta bahia blanca", "alquiler 4x4 bahia blanca",
    "alquiler maquinaria bahia blanca", "retroexcavadora bahia blanca",
    "pala cargadora bahia blanca", "ubicar rent",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    title: TITULO,
    description: DESCRIPCION_SOCIAL,
    images: ["/og-image.jpeg"],
    locale: "es_AR",
    siteName: "Ubicar Rent",
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION_SOCIAL,
    images: ["/og-image.jpeg"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  other: {
    "facebook-domain-verification": "h1xnldir1icchdwxhy2d0q0ll4ma3l",
    "geo.region": "AR-B",
    "geo.placename": "Bahía Blanca, Buenos Aires, Argentina",
    "geo.position": "-38.7196;-62.2724",
    ICBM: "-38.7196, -62.2724",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

/**
 * Datos estructurados. Se mantienen tal cual estaban en el `index.html` de la
 * versión Vite — son los que hacen que Google muestre la ficha de negocio y el
 * bloque de preguntas frecuentes, así que tocarlos tiene costo real en SEO.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      // `AutoRental` en vez de `LocalBusiness` a secas: es el tipo especifico
      // de schema.org para una rentadora, y es el que los buscadores y los
      // motores generativos usan para responder "donde alquilo un auto en X".
      "@type": ["AutoRental", "LocalBusiness"],
      "@id": `${SITE}/#business`,
      name: "Ubicar Rent",
      description:
        "Empresa de alquiler de autos, camionetas 4x4 y maquinaria pesada en Bahía Blanca y el sur de la Provincia de Buenos Aires. Reserva online con precio final y kilometraje libre, para particulares y empresas.",
      url: `${SITE}/`,
      logo: `${SITE}/og-image.jpeg`,
      image: `${SITE}/og-image.jpeg`,
      telephone: ["+5492914180554", "+5491125164791"],
      email: "ubicar.rent@gmail.com",
      priceRange: "$$",
      currenciesAccepted: "ARS",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Paraguay 241",
        addressLocality: "Bahía Blanca",
        addressRegion: "Buenos Aires",
        postalCode: "8000",
        addressCountry: "AR",
      },
      geo: { "@type": "GeoCoordinates", latitude: -38.7196, longitude: -62.2724 },
      // La zona de servicio es Bahía Blanca y el sur de la provincia. CABA
      // estaba declarada acá y no corresponde: no se retira ni se entrega un
      // vehículo allá, y declararla le parte a Google la señal local con
      // Bahía, que es la búsqueda que interesa. El contacto de CABA sigue en
      // la sección de Contacto, que es otra cosa.
      areaServed: [
        { "@type": "City", name: "Bahía Blanca" },
        { "@type": "AdministrativeArea", name: "Sur de la Provincia de Buenos Aires" },
      ],
      sameAs: ["https://www.instagram.com/ubicar_rent/"],
      // Los puntos de retiro, para las busquedas por cercania.
      location: [
        {
          "@type": "Place",
          name: "Ubicar Rent — Paraguay 241",
          address: { "@type": "PostalAddress", streetAddress: "Paraguay 241", addressLocality: "Bahía Blanca", addressRegion: "Buenos Aires", addressCountry: "AR" },
        },
        {
          "@type": "Place",
          name: "Ubicar Rent — Alsina 350",
          address: { "@type": "PostalAddress", streetAddress: "Alsina 350", addressLocality: "Bahía Blanca", addressRegion: "Buenos Aires", addressCountry: "AR" },
        },
        {
          "@type": "Place",
          name: "Ubicar Rent — Aeropuerto Comandante Espora",
          address: { "@type": "PostalAddress", streetAddress: "Aeropuerto Comandante Espora", addressLocality: "Bahía Blanca", addressRegion: "Buenos Aires", addressCountry: "AR" },
        },
      ],
      // Habilita el boton "Reservar" en los resultados enriquecidos.
      potentialAction: {
        "@type": "ReserveAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE}/reservar`,
          actionPlatform: [
            "http://schema.org/DesktopWebPlatform",
            "http://schema.org/MobileWebPlatform",
          ],
        },
        result: { "@type": "Reservation", name: "Reserva de vehículo" },
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Servicios de alquiler de vehículos y maquinaria",
        itemListElement: [
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Alquiler de autos sin chofer en Bahía Blanca",
              description:
                "Alquiler de automóviles sin conductor en Bahía Blanca para particulares y empresas.",
            },
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Alquiler de camionetas 4x4 en Bahía Blanca",
              description:
                "Alquiler de camionetas doble cabina con tracción 4x4 en Bahía Blanca. Ideales para campo, minería y uso corporativo.",
            },
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Alquiler de maquinaria pesada en Bahía Blanca",
              description:
                "Alquiler de retroexcavadoras Caterpillar, palas cargadoras, camiones volcadores y minicargadoras en Bahía Blanca.",
            },
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Alquiler de vehículos para empresas en Bahía Blanca",
              description:
                "Soluciones corporativas de movilidad: flota empresarial, vehículos de reemplazo y alquileres a largo plazo en Bahía Blanca y la zona.",
            },
          },
        ],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: `${SITE}/`,
      name: "Ubicar Rent",
      description: "Alquiler de autos y maquinaria en Bahía Blanca",
      inLanguage: "es-AR",
      publisher: { "@id": `${SITE}/#business` },
    },
    // **El `FAQPage` vivía acá y se emitía en TODAS las páginas** — incluidas
    // `/reservar`, `/terminos` y `/privacidad`, que no tienen una sola
    // pregunta visible. Y en `/preguntas-frecuentes` chocaba con el `FAQPage`
    // de la propia página: dos entidades del mismo tipo en un documento.
    //
    // Google trata el structured data que no refleja el contenido visible como
    // una señal falsa, y ante dos que se contradicen lo habitual es ignorar
    // los dos. O sea que este bloque no sumaba: restaba.
    //
    // El `FAQPage` del sitio es uno solo y vive donde están las preguntas:
    // `app/preguntas-frecuentes/page.tsx`, armado del mismo `lib/faq.ts` que
    // se renderiza. El bloque de preguntas de la portada (`FaqSection`) NO
    // emite JSON-LD a propósito, por esta misma razón.
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={dmSans.variable}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />

        {children}

        {/* El pixel de Meta y Analytics viven en `Analitica`, que sólo los
            carga si el visitante aceptó las cookies. El `<noscript>` del pixel
            se quitó junto con ellos: disparaba una petición a Meta sin ninguna
            posibilidad de pedir consentimiento. */}
        <Analitica metaPixelId={META_PIXEL_ID} gaId={GA_ID} />
        <AvisoCookies />
      </body>
    </html>
  );
}
