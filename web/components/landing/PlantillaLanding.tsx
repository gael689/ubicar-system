import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import BuscadorReserva from "@/components/BuscadorReserva";
import HeroSub from "@/components/landing/HeroSub";
import { BotonWhatsApp } from "@/components/landing/BotonWhatsApp";
import { Categorias, Cierre, Enlaces, Escalera, Pasos, Preguntas, Puntos, type Enlace } from "@/components/landing/Bloques";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";
import { TODAS_LAS_PREGUNTAS, type Pregunta } from "@/lib/faq";
import { landingPorSlug, type Landing } from "@/lib/landings";
import { SITE } from "@/lib/sitio";

/**
 * La página de un servicio: el mismo fondo que el hero de la portada, un gancho
 * propio y, abajo, bloques visuales (puntos con ícono, categorías con foto,
 * pasos, preguntas) en vez de párrafos. Poco texto: el detalle largo vive en
 * las preguntas frecuentes.
 *
 * A la derecha del título va el buscador de reserva —cada página es una puerta
 * a `/reservar`— o, si el servicio no se reserva online (Uber, empresas), una
 * tarjeta que lleva a WhatsApp.
 *
 * **Las preguntas no llevan `FAQPage`**: ese marcado ya vive en
 * `/preguntas-frecuentes`, y repetir las mismas preguntas en varias páginas es
 * lo que se sacó del layout raíz. Acá se ven, sin marcado.
 *
 * El JSON-LD es un `BreadcrumbList` y un `Service` que apunta al negocio por su
 * `@id`, sin repetir el `AutoRental` del layout.
 */
export default function PlantillaLanding({ landing }: { landing: Landing }) {
  const preguntas: Pregunta[] = [
    ...(landing.preguntasPropias ?? []),
    ...landing.preguntasIds.map((id) => {
      const p = TODAS_LAS_PREGUNTAS.find((x) => x.id === id);
      // Un id mal escrito rompe el build en vez de dejar la pregunta afuera.
      if (!p) throw new Error(`"${landing.slug}" pide la pregunta "${id}", que no existe en lib/faq.ts.`);
      return p;
    }),
  ];

  const enlaces: Enlace[] = [
    ...landing.hermanas
      .map((s) => landingPorSlug(s))
      .filter((l): l is Landing => !!l)
      .map((l) => ({ href: `/${l.slug}`, nombre: l.nombre, icono: l.icono })),
    { href: "/maquinaria", nombre: "Maquinaria pesada", imagen: "/img/maquinas/retroExcavadora.png" },
  ];

  const url = `${SITE}/${landing.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: landing.nombre, item: url },
        ],
      },
      {
        "@type": "Service",
        "@id": `${url}#servicio`,
        name: landing.servicio.nombre,
        description: landing.servicio.descripcion,
        url,
        provider: { "@id": `${SITE}/#business` },
        areaServed: { "@type": "City", name: "Bahía Blanca" },
      },
    ],
  };

  const reservaOnline = landing.reserva === "buscador";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main>
        <HeroSub
          migas={[{ nombre: landing.nombre }]}
          gancho={landing.gancho}
          h1={landing.h1}
          bajada={landing.bajada}
          acciones={
            reservaOnline
              ? <BotonWhatsApp mensaje={landing.whatsapp} origen={landing.slug} claro />
              : undefined
          }
          derecha={
            reservaOnline ? (
              <BuscadorReserva lugarInicial={landing.lugarInicial} />
            ) : (
              <div className="rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5 md:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#1EA855]">
                  <IconoWhatsApp size={26} />
                </span>
                <h2 className="mt-4 text-xl font-bold text-[#1B3F6B] md:text-2xl">
                  {landing.tarjetaWhatsapp?.titulo}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{landing.tarjetaWhatsapp?.detalle}</p>
                <div className="mt-6">
                  <BotonWhatsApp mensaje={landing.whatsapp} origen={landing.slug} ancho />
                </div>
              </div>
            )
          }
        />

        <Puntos puntos={landing.puntos} />
        {landing.categorias && (
          <Categorias
            categorias={landing.categorias}
            conBoton={reservaOnline}
            // "Reservás una categoría" es del flujo online: una página que se
            // coordina por WhatsApp no lo promete.
            titulo={reservaOnline ? undefined : "Qué podemos ofrecerte"}
            sub={reservaOnline ? undefined : "Algunos de los vehículos que alquilamos a empresas."}
          />
        )}
        {landing.pasos && <Pasos pasos={landing.pasos} />}
        {landing.conEscalera && <Escalera />}
        <Preguntas preguntas={preguntas} />
        <Enlaces enlaces={enlaces} />
        <Cierre
          detalle={
            reservaOnline
              ? "Reservá online con el precio final, o escribinos y lo coordinamos."
              : "Escribinos y lo coordinamos."
          }
          mensaje={landing.whatsapp}
          origen={landing.slug}
          reservar={reservaOnline}
        />
      </main>

      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
