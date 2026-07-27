"use client";

import { useEffect, useRef } from "react";
const perro1 = "/img/perro1.jpeg";
const perro2 = "/img/perro2.jpeg";

const ACCESSORIES = [
  { name: "Pet Cover", description: "Protección de tapizados" },
  { name: "Cadenas para nieve", description: "Para rutas de montaña" },
  { name: "Silla para bebés", description: "Homologada y segura" },
  { name: "Kit de primeros auxilios", description: "Siempre a bordo" },
];

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.dataset.in = "1"; obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function AccessoriesSection() {
  const sectionRef = useReveal<HTMLElement>();

  return (
    <>
      <style>{`
        #accesorios * { box-sizing: border-box; }

        .ac-item {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        [data-in="1"] .ac-item { opacity: 1; transform: none; }
        .ac-d0 { transition-delay: 0.00s; }
        .ac-d1 { transition-delay: 0.08s; }
        .ac-d2 { transition-delay: 0.16s; }
        .ac-d3 { transition-delay: 0.24s; }
        .ac-d4 { transition-delay: 0.32s; }
        .ac-d5 { transition-delay: 0.40s; }

        .ac-header {
          display: flex;
          align-items: center;
          gap: 1.1rem;
          margin-bottom: 2.5rem;
        }

        .ac-arrow-wrap {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(27, 71, 155, 0.13);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .ac-title {
          font-size: clamp(2.75rem, 7vw, 5rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
        }

        .ac-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        @media (max-width: 640px) {
          .ac-grid { grid-template-columns: 1fr; }
          .ac-cell { border-right: none !important; border-bottom: 1px solid rgba(27,71,155,0.14) !important; padding: 1.5rem 0 !important; }
          .ac-cell:last-child { border-bottom: none !important; }
        }

        .ac-cell {
          padding: 1.75rem 0;
          border-bottom: 1px solid rgba(27, 71, 155, 0.14);
        }
        .ac-cell:nth-child(odd) {
          padding-right: 4rem;
          border-right: 1px solid rgba(27, 71, 155, 0.14);
        }
        .ac-cell:nth-child(even) {
          padding-left: 4rem;
        }
        .ac-cell:nth-last-child(-n+2) {
          border-bottom: none;
        }

        .ac-name {
          font-size: clamp(2.25rem, 4.5vw, 3.75rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.03em;
          line-height: 1.05;
          margin: 0 0 8px;
        }

        .ac-desc {
          font-size: 0.82rem;
          font-weight: 600;
          color: #5B76A8;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          margin: 0;
        }

        .ac-note {
          margin-top: 1.75rem;
          font-size: 1rem;
          font-weight: 500;
          color: #5B76A8;
        }

        /* Pet friendly strip */
        .ac-pet {
          display: flex;
          align-items: center;
          gap: 2.25rem;
          margin-top: 3rem;
          padding-top: 2.5rem;
          border-top: 1px solid rgba(27, 71, 155, 0.12);
        }

        .ac-pet-images {
          display: flex;
          gap: 1rem;
          flex-shrink: 0;
        }

        .ac-pet-img {
          width: 180px;
          height: 180px;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid rgba(27, 71, 155, 0.25);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          box-shadow: 0 6px 28px rgba(27, 71, 155, 0.16);
        }

        .ac-pet-img:hover { transform: scale(1.05); box-shadow: 0 10px 36px rgba(27, 71, 155, 0.24); }

        .ac-pet-img:last-child { margin-left: -40px; }

        .ac-pet-label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .ac-pet-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #3B5EA6;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin: 0;
        }

        .ac-pet-sub {
          font-size: 1.2rem;
          font-weight: 400;
          color: #5B76A8;
          margin: 0;
          line-height: 1.55;
        }

        @media (max-width: 640px) {
          .ac-pet {
            flex-direction: column;
            align-items: flex-start;
            gap: 1.5rem;
          }
          .ac-pet-images {
            order: 2;
          }
          .ac-pet-label {
            order: 1;
          }
          .ac-pet-img {
            width: 140px;
            height: 140px;
          }
          .ac-pet-img:last-child { margin-left: -28px; }
        }
      `}</style>

      <section
        id="accesorios"
        ref={sectionRef}
        style={{ background: "rgb(223, 232, 255)", padding: "4rem 0" }}
      >
        <div className="container">

          <div className="ac-header ac-item ac-d0">
            <div className="ac-arrow-wrap">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#1B479B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
            <h2 className="ac-title">Accesorios Ubicar</h2>
          </div>

          <div className="ac-grid">
            {ACCESSORIES.map(({ name, description }, i) => (
              <div key={name} className={`ac-cell ac-item ac-d${i + 1}`}>
                <p className="ac-name">{name}</p>
                <p className="ac-desc">{description}</p>
              </div>
            ))}
          </div>

          <p className="ac-note ac-item ac-d5">
            Consultá disponibilidad al momento de reservar.
          </p>

          <div className="ac-pet ac-item ac-d5">
            <div className="ac-pet-images">
              <img src={perro1} alt="Mascota en vehículo Ubicar" className="ac-pet-img" />
              <img src={perro2} alt="Mascota en vehículo Ubicar" className="ac-pet-img" />
            </div>
            <div className="ac-pet-label">
              <p className="ac-pet-title">🐾 Pet Friendly</p>
              <p className="ac-pet-sub">También somos amigos de tus mascotas — viajá con ellas.</p>
            </div>
          </div>

        </div>
      </section>
    </>
  );
}