"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EVENTO, SOLO_NECESARIAS, TODO_ACEPTADO,
  guardarConsentimiento, leerConsentimiento,
} from "@/lib/consentimiento";

/**
 * Aviso de cookies.
 *
 * **Rechazar tiene el mismo peso visual que aceptar.** Un banner donde
 * "Aceptar" es un botón grande y "Rechazar" un link gris es un patrón oscuro:
 * técnicamente da la opción, en la práctica la esconde.
 *
 * No bloquea la pantalla ni se pone en el medio: va abajo, se puede seguir
 * navegando, y sólo aparece hasta que el visitante decide. La decisión se
 * puede cambiar después desde la política de privacidad.
 *
 * Se monta después del primer render para no romper la hidratación: el
 * servidor no sabe qué decidió el visitante.
 */
export function AvisoCookies() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(leerConsentimiento() === null);

    // La política de privacidad puede revocar y volver a preguntar.
    const alCambiar = (e: Event) => {
      setVisible((e as CustomEvent).detail === null);
    };
    window.addEventListener(EVENTO, alCambiar);
    return () => window.removeEventListener(EVENTO, alCambiar);
  }, []);

  if (!visible) return null;

  const decidir = (opciones: typeof TODO_ACEPTADO) => {
    guardarConsentimiento(opciones);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Preferencias de cookies"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-white/98 p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur md:p-5"
    >
      <div className="container flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <Cookie className="mt-0.5 hidden h-5 w-5 shrink-0 text-primary sm:block" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Usamos cookies propias para que el sitio funcione, y de terceros
            para medir el uso y nuestras campañas. Podés aceptarlas todas o
            quedarte sólo con las necesarias.{" "}
            <Link
              href="/privacidad"
              className="font-medium text-primary underline underline-offset-2"
            >
              Ver la política de privacidad
            </Link>
            .
          </p>
        </div>

        {/* Las dos opciones tienen el mismo tamaño a propósito. */}
        <div className="flex shrink-0 gap-3">
          <Button
            variant="outline"
            className="flex-1 lg:flex-none"
            onClick={() => decidir(SOLO_NECESARIAS)}
          >
            Sólo necesarias
          </Button>
          <Button className="flex-1 lg:flex-none" onClick={() => decidir(TODO_ACEPTADO)}>
            Aceptar todas
          </Button>
        </div>
      </div>
    </div>
  );
}
