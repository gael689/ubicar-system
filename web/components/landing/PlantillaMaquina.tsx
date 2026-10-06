import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import HeroSub from "@/components/landing/HeroSub";
import { BotonWhatsApp } from "@/components/landing/BotonWhatsApp";
import { Icono } from "@/components/landing/Iconos";
import { Cierre, Enlaces, type Enlace } from "@/components/landing/Bloques";
import { MAQUINAS, type Maquina } from "@/lib/maquinas";
import { SITE } from "@/lib/sitio";

/**
 * La página de un equipo de maquinaria: el mismo fondo del hero de la portada,
 * la foto del equipo, la ficha técnica en tarjetas y para qué se usa. La
 * maquinaria no se reserva online: la salida es WhatsApp, así que no hay
 * buscador. Todo sale de `lib/maquinas.ts`.
 *
 * El JSON-LD es un `BreadcrumbList` y un `Product` sin precio (no hay uno
 * público que afirmar).
 */
export default function PlantillaMaquina({ maquina }: { maquina: Maquina }) {
  const url = `${SITE}/maquinaria/${maquina.slug}`;

  const enlaces: Enlace[] = [
    ...MAQUINAS.filter((m) => m.slug !== maquina.slug).map((m) => ({
      href: `/maquinaria/${m.slug}`,
      nombre: m.nombreCorto,
      imagen: m.imagen,
    })),
    { href: "/alquiler-camionetas-4x4-bahia-blanca", nombre: "Camionetas 4x4", icono: "camion" as const },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Maquinaria", item: `${SITE}/maquinaria` },
          { "@type": "ListItem", position: 3, name: maquina.nombreCorto, item: url },
        ],
      },
      {
        "@type": "Product",
        "@id": `${url}#producto`,
        name: maquina.nombre,
        description: maquina.descripcion,
        image: `${SITE}${maquina.imagen}`,
        url,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main>
        <HeroSub
          migas={[{ nombre: "Maquinaria", href: "/maquinaria" }, { nombre: maquina.nombreCorto }]}
          gancho={maquina.categoria}
          h1={`Alquiler de ${maquina.nombreCorto.toLowerCase()} en Bahía Blanca`}
          bajada={`La ${maquina.nombre}, disponible en Bahía Blanca y la zona.`}
          acciones={<BotonWhatsApp mensaje={maquina.waMsg} origen={`maquinaria-${maquina.slug}`} claro />}
          derecha={
            <div className="overflow-hidden rounded-2xl bg-[#0F1C2E] shadow-2xl ring-1 ring-white/10" style={{ aspectRatio: "4/3" }}>
              <Image
                src={maquina.imagen}
                alt={maquina.imagenAlt}
                width={800}
                height={600}
                priority
                sizes="(max-width: 1024px) 100vw, 470px"
                className="h-full w-full object-cover"
              />
            </div>
          }
        />

        {/* La ficha técnica, montada sobre el borde del hero. */}
        <section className="relative z-20 -mt-16 pb-4 lg:-mt-20">
          <div className="container px-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {maquina.specs.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-border/60 border-l-4 border-l-[#407EC9] bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,28,46,0.25)]"
                >
                  <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </dt>
                  <dd className="mt-1.5 text-lg font-bold text-[#0F1C2E]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="container px-4">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[#1B3F6B] md:text-4xl">Para qué se usa</h2>
              <p className="mt-3 text-muted-foreground">{maquina.descripcion}</p>
            </div>
            <ul className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {maquina.usos.map((u) => (
                <li
                  key={u}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white p-4 shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#407EC9]/12 text-[#407EC9]">
                    <Icono nombre="check" className="h-4 w-4" />
                  </span>
                  <span className="font-semibold text-[#1B3F6B]">{u}</span>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-xl text-center text-sm text-muted-foreground">
              La maquinaria no se reserva online: consultá disponibilidad y precio por WhatsApp.
            </p>
          </div>
        </section>

        <Enlaces enlaces={enlaces} titulo="Otros equipos" />
        <Cierre
          titulo="¿La necesitás para tu obra?"
          detalle="Escribinos y coordinamos la disponibilidad."
          mensaje={maquina.waMsg}
          origen={`maquinaria-${maquina.slug}`}
          reservar={false}
        />
      </main>

      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
