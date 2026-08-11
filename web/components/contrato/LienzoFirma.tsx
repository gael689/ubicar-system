"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

interface Props {
  onCambiar: (dataUrl: string | null) => void;
}

/**
 * El recuadro donde el cliente firma con el dedo.
 *
 * Tres cosas que en un teléfono no son opcionales:
 *
 * - **Pointer events, no mouse events.** Cubren dedo, lápiz y mouse con el
 *   mismo código. Con `mousedown` el trazo no aparece en ningún celular.
 * - **`touch-action: none`.** Sin eso, arrastrar el dedo hace scroll de la
 *   página en vez de dibujar, y el recuadro parece roto.
 * - **El canvas se dimensiona en píxeles reales** (`devicePixelRatio`). Un
 *   canvas de 600×200 estirado por CSS sale pixelado, y una firma pixelada en
 *   un contrato se ve como una imagen mal pegada.
 */
export function LienzoFirma({ onCambiar }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const escala = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * escala;
    canvas.height = height * escala;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const limpiar = () => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
    onCambiar(null);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
          onPointerDown={(e) => {
            dibujando.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d");
            const { x, y } = punto(e);
            ctx?.beginPath();
            ctx?.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!dibujando.current) return;
            const ctx = e.currentTarget.getContext("2d");
            const { x, y } = punto(e);
            ctx?.lineTo(x, y);
            ctx?.stroke();
            if (!tieneTrazo) setTieneTrazo(true);
          }}
          onPointerUp={(e) => {
            dibujando.current = false;
            if (tieneTrazo) onCambiar(e.currentTarget.toDataURL("image/png"));
          }}
          onPointerLeave={(e) => {
            // Sin esto, salir del recuadro con el dedo apoyado deja el trazo a
            // medio guardar: se levanta el pointer pero nunca se avisa arriba.
            if (!dibujando.current) return;
            dibujando.current = false;
            if (tieneTrazo) onCambiar(e.currentTarget.toDataURL("image/png"));
          }}
        />
        {!tieneTrazo && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Firmá acá con el dedo
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={limpiar}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Eraser className="h-3.5 w-3.5" /> Borrar y firmar de nuevo
      </button>
    </div>
  );
}
