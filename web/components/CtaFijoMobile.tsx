"use client";

import { useEffect, useState } from "react";
import { intencionDeReserva } from "@/lib/analitica";
import { cn } from "@/lib/utils";

/**
 * El botón de reservar que acompaña en el teléfono.
 *
 * La portada es larga —vehículos, preguntas, empresas, ubicación— y en el
 * teléfono el buscador queda arriba de todo: quien se convence a mitad de
 * página tenía que subir a mano o llegar hasta el cierre. Esta barra aparece
 * **sólo cuando el buscador ya no se ve** y lleva de vuelta a él.
 *
 * - No aparece frente al cierre de la portada, que ya tiene ese botón.
 * - Sólo en pantallas chicas: en la computadora el botón vive en el `Header`.
 * - Deja libre la esquina del WhatsApp flotante (por eso el `right-[96px]`).
 * - Va por debajo del aviso de cookies (`z-[60]`) y del menú: nunca los tapa.
 * - Mientras está oculta no recibe foco ni la lee un lector de pantalla.
 */
export default function CtaFijoMobile() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const buscador = document.getElementById("reservar");
    if (!buscador) return;
    // También se esconde frente al cierre de la portada, que ya trae el mismo
    // botón: dos iguales en una pantalla se leen como un error.
    const cierre = document.getElementById("final-cta");
    const aLaVista = new Set<Element>();
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) aLaVista.add(e.target);
        else aLaVista.delete(e.target);
      }
      setVisible(aLaVista.size === 0);
    });
    obs.observe(buscador);
    if (cierre) obs.observe(cierre);
    return () => obs.disconnect();
  }, []);

  return (
    <a
      href="#reservar"
      onClick={() => intencionDeReserva("cta-fijo-mobile")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed bottom-6 left-4 right-[96px] z-40 flex h-[52px] items-center justify-center rounded-full bg-primary px-4 text-center text-[15px] font-bold text-primary-foreground shadow-[0_6px_24px_rgba(27,63,107,0.35)] transition-all duration-300 lg:hidden",
        "outline-none focus-visible:ring-2 focus-visible:ring-[#1B3F6B] focus-visible:ring-offset-2",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      Ver disponibilidad y precio
    </a>
  );
}
