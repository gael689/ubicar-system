import Header from "@/components/Header";
import Hero from "@/components/Hero";
import VehiclesSection from "@/components/VehiclesSection";
import AccessoriesSection from "@/components/AccessoriesSection";
import EmpresasSection from "@/components/EmpresasSection";
import LocationSection from "@/components/LocationSection";
import MaquinariaCTA from "@/components/MaquinariaCTA";
import InstagramStrip from "@/components/InstagramStrip";
import ContactSection from "@/components/ContactSection";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import Footer from "@/components/Footer";

// El SEO de la home vive en `app/layout.tsx` — lo hereda tal cual.
export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <VehiclesSection />
        <AccessoriesSection />
        <EmpresasSection />
        <LocationSection />
        <MaquinariaCTA />
        <InstagramStrip />
        <ContactSection />
      </main>
      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
