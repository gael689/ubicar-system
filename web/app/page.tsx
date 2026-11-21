import Header from "@/components/Header";
import Hero from "@/components/Hero";
import BeneficiosStrip from "@/components/BeneficiosStrip";
import VehiclesSection from "@/components/VehiclesSection";
import FaqSection from "@/components/FaqSection";
import AccessoriesSection from "@/components/AccessoriesSection";
import EmpresasSection from "@/components/EmpresasSection";
import LocationSection from "@/components/LocationSection";
import MaquinariaCTA from "@/components/MaquinariaCTA";
import InstagramStrip from "@/components/InstagramStrip";
import FinalCTA from "@/components/FinalCTA";
import ContactSection from "@/components/ContactSection";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import Footer from "@/components/Footer";
import CtaFijoMobile from "@/components/CtaFijoMobile";

// El SEO de la home vive en `app/layout.tsx` — lo hereda tal cual.

/**
 * El orden de la portada sigue un criterio: **objeción, respuesta, objeción,
 * respuesta.**
 *
 * Antes los accesorios iban terceros. Hablan de extras y de viajar con
 * mascotas: son el detalle de alguien que **ya decidió**, puestos antes de que
 * el visitante sepa cuánto sale, si le van a alquilar y si la empresa es
 * confiable. Ahora van después de las dudas resueltas.
 *
 * Y el scroll dejó de terminar en "llamanos". `InstagramStrip` era la última
 * sección antes del contacto, o sea que el sitio mandaba al visitante **afuera**
 * justo en el punto de mayor intención; y `ContactSection` cerraba con
 * teléfonos y direcciones cuando toda la propuesta es reservar online sin
 * llamar a nadie. El último movimiento ahora es volver al buscador, con el
 * canal humano al lado como alternativa.
 *
 * La prueba social hoy es la insignia de reseñas de Google del hero y del
 * cierre (`PruebaSocial`, datos en `lib/resenas.ts`). Sigue faltando un bloque
 * con reseñas **textuales** entre los vehículos y las preguntas — depende de
 * que Franco y Martín decidan cuáles se publican.
 */
export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <BeneficiosStrip />
        <VehiclesSection />
        <FaqSection />
        <EmpresasSection />
        <LocationSection />
        <AccessoriesSection />
        <MaquinariaCTA />
        <InstagramStrip />
        <FinalCTA />
        <ContactSection />
      </main>
      <Footer />
      <CtaFijoMobile />
      <FloatingWhatsApp />
    </>
  );
}
