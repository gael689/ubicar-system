import Link from "next/link";
import Image from "next/image";
import { Mail, MapPin } from "lucide-react";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";
import { CONTACTO } from "@/lib/contacto";
import { WHATSAPP_GENERAL } from "@/lib/constants";
import { LANDINGS } from "@/lib/landings";
import { MAQUINAS } from "@/lib/maquinas";

const logo = "/img/logo.png";

/**
 * El pie del sitio, en columnas: la marca con su contacto, y tres listas —lo
 * que se alquila, la maquinaria y el resto del sitio—. Antes los enlaces a las
 * páginas de servicio iban todos en una fila, apretados; en columnas se leen de
 * un vistazo y se ordenan solos en el teléfono.
 *
 * Las listas salen de `lib/landings.ts` y `lib/maquinas.ts`: agregar una página
 * ahí la suma acá.
 */

const COLUMNA_SITIO = [
  { nombre: "Empresas", href: "/empresas" },
  { nombre: "Preguntas frecuentes", href: "/preguntas-frecuentes" },
  { nombre: "Vehículos", href: "/#vehiculos" },
  { nombre: "Ubicación", href: "/#ubicacion" },
  { nombre: "Contacto", href: "/#contacto" },
];

const enlace =
  "text-sm text-[#1B3F6B]/80 transition-colors hover:text-[#407EC9] hover:underline underline-offset-4";

function Columna({ titulo, items }: { titulo: string; items: { nombre: string; href: string }[] }) {
  return (
    <nav aria-label={titulo}>
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[#1B3F6B]">{titulo}</h2>
      <ul className="space-y-2.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={enlace}>{i.nombre}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const Footer = () => {
  return (
    <footer style={{ background: "rgb(223, 232, 255)" }}>
      <div className="container px-4 py-12 md:py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-x-10">
          {/* Marca y contacto */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="inline-block">
              <Image
                src={logo}
                alt="Ubicar Rent"
                width={1358}
                height={649}
                style={{ height: 60, width: "auto", display: "block" }}
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#1B3F6B]/75">
              Alquiler de autos, camionetas 4x4 y maquinaria pesada en Bahía Blanca y la zona.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-[#1B3F6B]">
              <li>
                <a href={WHATSAPP_GENERAL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 hover:text-[#407EC9]">
                  <IconoWhatsApp size={16} />
                  {CONTACTO.whatsappDisplay}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACTO.email}`} className="inline-flex items-center gap-2.5 hover:text-[#407EC9]">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {CONTACTO.email}
                </a>
              </li>
              <li className="inline-flex items-center gap-2.5">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Paraguay 241, Bahía Blanca
              </li>
            </ul>
          </div>

          <Columna
            titulo="Alquilar"
            items={LANDINGS.filter((l) => l.slug !== "empresas").map((l) => ({
              nombre: l.nombre,
              href: `/${l.slug}`,
            }))}
          />

          <Columna
            titulo="Maquinaria"
            items={[
              ...MAQUINAS.map((m) => ({ nombre: m.nombreCorto, href: `/maquinaria/${m.slug}` })),
              { nombre: "Ver todos los equipos", href: "/maquinaria" },
            ]}
          />

          <Columna titulo="Ubicar Rent" items={COLUMNA_SITIO} />
        </div>
      </div>

      {/* Fila inferior: copyright, legales y crédito */}
      <div className="border-t border-[#407EC9]/25">
        <div className="container flex flex-col gap-2 px-4 py-4 text-[0.8rem] text-black/45 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} Ubicar Rent · Bahía Blanca, Argentina
            {" · "}
            <Link href="/terminos" className="underline underline-offset-2 hover:text-[#407EC9]">Términos</Link>
            {" · "}
            {/* La política de privacidad es obligación legal (Ley 25.326) y tiene
                que ser alcanzable desde cualquier página del sitio. */}
            <Link href="/privacidad" className="underline underline-offset-2 hover:text-[#407EC9]">Privacidad</Link>
          </span>
          <a
            href="https://gaelgonzalez.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#407EC9]"
          >
            Desarrollado por <strong style={{ color: "rgba(0,0,0,0.7)" }}>Gael González</strong>
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
