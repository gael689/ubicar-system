import { useEffect, useRef, useState } from 'react';

interface Props {
  /** El PNG en data-URL cada vez que cambia el trazo; `null` al borrar. */
  onCambiar: (dataUrl: string | null) => void;
  etiqueta?: string;
}

/**
 * El recuadro donde se firma con el dedo o el mouse.
 *
 * Es el mismo criterio que el de la web (`web/components/contrato/LienzoFirma`):
 * pointer events (dedo, lápiz y mouse con un solo código), `touch-action: none`
 * (sin eso, arrastrar el dedo hace scroll en vez de dibujar) y el canvas en
 * píxeles reales, para que la firma no salga pixelada en el PDF.
 *
 * Existe como componente porque con el pagaré **un mismo diálogo puede
 * necesitar varias firmas**: la del titular y la de cada co-deudor.
 */
export function LienzoFirma({ onCambiar, etiqueta = 'Firma' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  // Ref además del estado: el `pointerup` puede llegar antes de que React
  // re-renderice con el `setTieneTrazo` del último `pointermove`.
  const hayTrazo = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (width && height) {
      canvas.width = width * escala;
      canvas.height = height * escala;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const limpiar = () => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hayTrazo.current = false;
    setTieneTrazo(false);
    onCambiar(null);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{etiqueta}</label>
      <canvas
        ref={ref}
        aria-label={etiqueta}
        className="h-40 w-full touch-none rounded-lg border border-dashed border-border bg-white"
        onPointerDown={e => {
          dibujando.current = true;
          const ctx = e.currentTarget.getContext('2d');
          const { x, y } = punto(e);
          ctx?.beginPath();
          ctx?.moveTo(x, y);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={e => {
          if (!dibujando.current) return;
          const ctx = e.currentTarget.getContext('2d');
          const { x, y } = punto(e);
          ctx?.lineTo(x, y);
          ctx?.stroke();
          if (!hayTrazo.current) { hayTrazo.current = true; setTieneTrazo(true); }
        }}
        onPointerUp={e => {
          if (!dibujando.current) return;
          dibujando.current = false;
          if (hayTrazo.current) onCambiar(e.currentTarget.toDataURL('image/png'));
        }}
        onPointerLeave={e => {
          if (!dibujando.current) return;
          dibujando.current = false;
          if (hayTrazo.current) onCambiar(e.currentTarget.toDataURL('image/png'));
        }}
      />
      {tieneTrazo && (
        <button type="button" onClick={limpiar} className="text-xs text-primary hover:underline">
          Borrar y volver a firmar
        </button>
      )}
    </div>
  );
}
