import type { Metadata } from "next";
import MaquinariaContent from "@/components/MaquinariaContent";

const SITE = "https://ubicar-rent.com.ar";

export const metadata: Metadata = {
  title: "Alquiler de Maquinaria Pesada en Bahía Blanca | Ubicar Rent",
  description:
    "Alquiler de maquinaria pesada en Bahía Blanca: retroexcavadoras Caterpillar, palas cargadoras, " +
    "camiones volcadores Ford Cargo, minicargadoras New Holland y tanques de agua. " +
    "Consultá disponibilidad por WhatsApp.",
  keywords: [
    "alquiler maquinaria bahia blanca", "retroexcavadora bahia blanca",
    "pala cargadora bahia blanca", "camion volcador bahia blanca",
    "minicargadora bahia blanca", "alquiler retroexcavadora caterpillar",
    "equipo de obra bahia blanca",
  ],
  alternates: { canonical: "/maquinaria" },
};

/**
 * JSON-LD propio de esta página: la ficha de cada máquina como `Product`.
 * Se traslada tal cual venía del `<Helmet>` de la versión Vite — las imágenes
 * ahora apuntan a `/img/maquinas/*`, que es donde quedaron en `public/`.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${SITE}/maquinaria#webpage`,
      url: `${SITE}/maquinaria`,
      name: "Alquiler de Maquinaria Pesada en Bahía Blanca",
      description:
        "Alquiler de retroexcavadoras, palas cargadoras, camiones volcadores, minicargadoras y tanques de agua en Bahía Blanca.",
      inLanguage: "es-AR",
      isPartOf: { "@id": `${SITE}/#website` },
      about: { "@id": `${SITE}/#business` },
    },
    {
      "@type": "ItemList",
      name: "Maquinaria pesada disponible para alquiler en Bahía Blanca",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: {
            "@type": "Product",
            name: "Pala Cargadora 924 HZ",
            image: `${SITE}/img/maquinas/palaCargadora.png`,
            description:
              "Alquiler de pala cargadora en Bahía Blanca. Motor Cat C6.6 Acert, cuchara 2,1 m³, fuerza de arranque 9.900 kg. Ideal para movimiento de tierra y carga de camiones en obras.",
            brand: { "@type": "Brand", name: "Caterpillar" },
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "ARS",
              seller: { "@id": `${SITE}/#business` },
            },
          },
        },
        {
          "@type": "ListItem",
          position: 2,
          item: {
            "@type": "Product",
            name: "Retroexcavadora Caterpillar 416D",
            image: `${SITE}/img/maquinas/retroExcavadora.png`,
            description:
              "Alquiler de retroexcavadora Caterpillar en Bahía Blanca. Motor diésel 74-80 HP, tracción 4x4, profundidad de excavación hasta 5.510 mm. Compatible con martillos hidráulicos.",
            brand: { "@type": "Brand", name: "Caterpillar" },
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "ARS",
              seller: { "@id": `${SITE}/#business` },
            },
          },
        },
        {
          "@type": "ListItem",
          position: 3,
          item: {
            "@type": "Product",
            name: "Ford Cargo 1722 Volcador",
            image: `${SITE}/img/maquinas/fordCargo.png`,
            description:
              "Alquiler de camión volcador en Bahía Blanca. Motor Cummins 6BT 5.9L 220 CV, carga útil 17 toneladas, tolva 7-8 m³. Ideal para áridos y materiales de construcción.",
            brand: { "@type": "Brand", name: "Ford" },
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "ARS",
              seller: { "@id": `${SITE}/#business` },
            },
          },
        },
        {
          "@type": "ListItem",
          position: 4,
          item: {
            "@type": "Product",
            name: "Minicargadora New Holland L318",
            image: `${SITE}/img/maquinas/miniCargadora.png`,
            description:
              "Alquiler de minicargadora en Bahía Blanca. Motor 60 HP, capacidad operativa 818 kg, altura de descarga 3.048 mm. Sistema Super Boom para espacios reducidos.",
            brand: { "@type": "Brand", name: "New Holland" },
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "ARS",
              seller: { "@id": `${SITE}/#business` },
            },
          },
        },
        {
          "@type": "ListItem",
          position: 5,
          item: {
            "@type": "Product",
            name: "Tanque de agua para obra",
            image: `${SITE}/img/tanque-agua.jpg`,
            description:
              "Alquiler de tanque de agua en Bahía Blanca. Provisión continua de agua para obras, compactación de suelo y riego. Disponible para proyectos de construcción.",
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "ARS",
              seller: { "@id": `${SITE}/#business` },
            },
          },
        },
      ],
    },
  ],
};

export default function MaquinariaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <MaquinariaContent />
    </>
  );
}
