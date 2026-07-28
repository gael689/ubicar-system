/**
 * Detalle de fondo del Hero.
 *
 * **El motivo no es decorativo: es la marca.** "Ubicar" es ubicar, así que el
 * fondo es una grilla de mapa con anillos concéntricos saliendo de un pin —
 * el gesto de localizar algo. Es lo que hace que el fondo signifique algo en
 * vez de ser una textura cualquiera.
 *
 * Va en SVG inline y no como imagen: pesa unos pocos kilobytes, escala a
 * cualquier pantalla sin pixelarse y no agrega un request más al primer
 * pintado, que es justo donde se juega la percepción de velocidad.
 */
export function HeroFondo() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1440 900"
      fill="none"
    >
      <defs>
        {/* Grilla fina de mapa */}
        <pattern id="grilla" width="56" height="56" patternUnits="userSpaceOnUse">
          <path
            d="M56 0H0V56"
            fill="none"
            stroke="white"
            strokeOpacity="0.07"
            strokeWidth="1"
          />
        </pattern>

        {/* Halo que concentra la atención en la tarjeta de reserva (derecha) */}
        <radialGradient id="halo" cx="72%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#7FB3E8" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#7FB3E8" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="trazo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1440" height="900" fill="url(#grilla)" />
      <rect width="1440" height="900" fill="url(#halo)" />

      {/* Anillos concéntricos: el gesto de "ubicar" un punto en el mapa */}
      <g transform="translate(215 620)">
        {[40, 88, 140, 200].map((r, i) => (
          <circle
            key={r}
            r={r}
            fill="none"
            stroke="white"
            strokeOpacity={0.16 - i * 0.032}
            strokeWidth="1.25"
          />
        ))}
        <circle r="5" fill="#7FB3E8" fillOpacity="0.85" />
      </g>

      {/* Trazos diagonales largos: la ruta */}
      <path
        d="M-100 760 C 320 640, 640 700, 1000 520 S 1420 300, 1600 250"
        stroke="url(#trazo)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M-100 830 C 360 720, 700 780, 1060 600 S 1460 380, 1600 330"
        stroke="url(#trazo)"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
