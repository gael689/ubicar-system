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
const META_PIXEL_ID = "26876823408666329";
const GA_ID = "G-25783YNP7G";

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
    {
      "@type": "FAQPage",
      "@id": `${SITE}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "¿Alquilan autos en Bahía Blanca?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sí, Ubicar Rent ofrece alquiler de autos sin chofer en Bahía Blanca. Contamos con una flota de automóviles, camionetas y 4x4 disponibles. Podés reservar por WhatsApp al +54 9 291 418-0554.",
          },
        },
        {
          "@type": "Question",
          name: "¿Dónde queda Ubicar Rent en Bahía Blanca?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ubicar Rent está en Paraguay 241, Bahía Blanca, Buenos Aires, Argentina. También entregamos en Alsina 350 y en el Aeropuerto Comandante Espora.",
          },
        },
        {
          "@type": "Question",
          name: "¿Tienen camionetas 4x4 para alquilar?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sí, disponemos de camionetas doble cabina con tracción 4x4 para alquiler en Bahía Blanca. Ideales para trabajo en campo, minería y empresas. Consultá disponibilidad al +54 9 291 418-0554.",
          },
        },
        {
          "@type": "Question",
          name: "¿Alquilan maquinaria pesada en Bahía Blanca?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sí, contamos con retroexcavadoras Caterpillar 416D, palas cargadoras 924 HZ, minicargadoras New Holland L318, camiones volcadores Ford Cargo 1722 y tanques de agua para obra en Bahía Blanca.",
          },
        },
        {
          "@type": "Question",
          name: "¿Cómo reservo un auto o maquinaria?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Podés reservar online desde nuestra web en cuatro pasos, o por WhatsApp al +54 9 291 418-0554. También podés escribirnos a ubicar.rent@gmail.com.",
          },
        },
        {
          "@type": "Question",
          name: "¿Hacen alquileres para empresas?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sí, Ubicar Rent ofrece soluciones corporativas de movilidad: gestión de flota, vehículos de reemplazo y alquileres a largo plazo en Bahía Blanca y la zona. Contactanos al +54 9 291 418-0554.",
          },
        },
      ],
    },
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
