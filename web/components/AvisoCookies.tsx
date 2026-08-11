"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
 * **Las dos categorías se eligen por separado.** El modelo de datos siempre
 * distinguió analíticas de publicidad, pero el aviso sólo ofrecía todo o nada:
 * quien quería que midamos el uso del sitio pero no que Meta arme audiencias
 * con él no tenía forma de decirlo, y terminaba rechazando las dos. Ahora
 * "Elegir" abre las dos casillas.
 *
 * Se monta después del primer render para no romper la hidratación: el
 * servidor no sabe qué decidió el visitante.
 */
export function AvisoCookies() {
  const [visible, setVisible] = useState(false);
  const [detalle, setDetalle] = useState(false);
  const [analiticas, setAnaliticas] = useState(true);
  const [publicidad, setPublicidad] = useState(true);

  useEffect(() => {
    setVisible(leerConsentimiento() === null);

    // La política de privacidad puede revocar y volver a preguntar.
    const alCambiar = (e: Event) => {
      const revocado = (e as CustomEvent).detail === null;
      setVisible(revocado);
      if (revocado) setDetalle(false);
    };
    window.addEventListener(EVENTO, alCambiar);
    return () => window.removeEventListener(EVENTO, alCambiar);
  }, []);

  if (!visible) return null;

  const decidir = (opciones: typeof TODO_ACEPTADO) => {
    guardarConsentimiento(opciones);
    setVisible(false);
    setDetalle(false);
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
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Usamos cookies propias para que el sitio funcione, y de terceros
              para medir el uso y nuestras campañas. Podés aceptarlas todas,
              quedarte sólo con las necesarias o elegir una por una.{" "}
              <Link
                href="/privacidad"
                className="font-medium text-primary underline underline-offset-2"
              >
                Ver la política de privacidad
              </Link>
              .
            </p>

            {detalle && (
              <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3">
                {/* Las necesarias se listan aunque no se puedan desactivar:
                    decir qué se usa siempre es parte de informar. */}
                <div className="flex items-start gap-2.5 opacity-60">
                  <Checkbox checked disabled className="mt-0.5" id="ck-necesarias" />
                  <label htmlFor="ck-necesarias" className="text-xs leading-snug">
                    <span className="font-medium text-foreground">Necesarias</span>
                    <span className="block text-muted-foreground">
                      Mantienen tu reserva mientras completás los pasos. Sin
                      ellas el sitio no funciona, así que no se pueden desactivar.
                    </span>
                  </label>
                </div>

                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="ck-analiticas"
                    checked={analiticas}
                    onCheckedChange={(v) => setAnaliticas(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="ck-analiticas" className="cursor-pointer text-xs leading-snug">
                    <span className="font-medium text-foreground">Analíticas</span>
                    <span className="block text-muted-foreground">
                      Google Analytics. Nos dicen qué páginas se visitan y en qué
                      paso se traba la reserva, para poder mejorarla.
                    </span>
                  </label>
                </div>

                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="ck-publicidad"
                    checked={publicidad}
                    onCheckedChange={(v) => setPublicidad(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="ck-publicidad" className="cursor-pointer text-xs leading-snug">
                    <span className="font-medium text-foreground">Publicidad</span>
                    <span className="block text-muted-foreground">
                      Píxel de Meta. Mide qué anuncios traen reservas y permite
                      mostrarte avisos nuestros en Facebook e Instagram.
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Las opciones tienen el mismo tamaño a propósito. */}
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button
            variant="outline"
            className="flex-1 lg:flex-none"
            onClick={() => decidir(SOLO_NECESARIAS)}
          >
            Sólo necesarias
          </Button>

          {detalle ? (
            <Button
              variant="outline"
              className="flex-1 lg:flex-none"
              onClick={() => decidir({ analiticas, publicidad })}
            >
              Guardar mi elección
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1 lg:flex-none"
              onClick={() => setDetalle(true)}
            >
              Elegir
            </Button>
          )}

          <Button className="flex-1 lg:flex-none" onClick={() => decidir(TODO_ACEPTADO)}>
            Aceptar todas
          </Button>
        </div>
      </div>
    </div>
  );
}
