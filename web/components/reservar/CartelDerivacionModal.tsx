"use client";

import { X } from "lucide-react";
import { CartelDerivacion } from "./CartelDerivacion";
import type { ComponentProps } from "react";

/**
 * `CartelDerivacion` en un overlay — para los casos que hoy se disparan
 * desde un botón puntual (una tarjeta "sin cupo", "otro lugar" en el
 * buscador) y no reemplazan toda la pantalla. El caso de la ventana de
 * fechas (anticipación/horizonte/duración) usa el cartel **inline**, sin
 * este wrapper, porque ahí sí ocupa el lugar donde iba el error crudo.
 */
export function CartelDerivacionModal({
  onCerrar, ...props
}: ComponentProps<typeof CartelDerivacion> & { onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute -top-3 -right-3 rounded-full bg-white p-1.5 text-muted-foreground shadow-md transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
        <CartelDerivacion {...props} />
      </div>
    </div>
  );
}
