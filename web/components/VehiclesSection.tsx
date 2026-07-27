"use client";

import { useEffect, useRef } from "react";
import { whatsappLink } from "@/lib/constants";
import { trackLeadEvent } from "@/lib/meta-pixel";

const compactoImg = "/img/compacto.png";
const sedanImg = "/img/sedan-intermedio.png";
const sedanSuperiorImg = "/img/sedan-superior.png";
const pickupImg = "/img/pickup.png";

const VEHICLES = [
  {
    title: "Compacto 5 puertas",
    description: "Ideal para recorridos urbanos y viajes cortos. Económico, ágil y fácil de estacionar.",
    image: compactoImg,
    alt: "Vehículo compacto 5 puertas para alquiler en Bahía Blanca",
    wa: "Hola! Me interesa alquilar un vehículo compacto. ¿Disponibilidad y precio?",
  },
  {
    title: "Sedán intermedio",
    description: "Confort y espacio para viajes de trabajo o rutas largas. Baúl amplio y bajo consumo.",
    image: sedanImg,
    alt: "Sedán intermedio para alquiler en Bahía Blanca",
    wa: "Hola! Me interesa alquilar un sedán intermedio. ¿Disponibilidad y precio?",
  },
  {
    title: "Sedán superior",
    description: "Para quienes buscan una experiencia premium. Equipamiento completo y máximo confort.",
    image: sedanSuperiorImg,
    alt: "Sedán superior premium para alquiler corporativo",
    wa: "Hola! Me interesa alquilar un sedán superior. ¿Disponibilidad y precio?",
  },
  {
    title: "Pick up 4×4",
    description: "Potencia y tracción para trabajo en campo, obra o caminos rurales. Lista para exigencias.",
    image: pickupImg,
    alt: "Pick up 4x4 para alquiler de trabajo en Bahía Blanca",
    wa: "Hola! Necesito una pick up 4x4 para trabajo. ¿Me pasan info?",
  },
];

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.dataset.in = "1"; obs.disconnect(); } },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function VehiclesSection() {
  const ref = useReveal<HTMLElement>();

  return (
    <>
      <style>{`
        #vehiculos * { box-sizing: border-box; }

        .vh-reveal {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        [data-in="1"] .vh-reveal { opacity: 1; transform: none; }
        .vh-d0 { transition-delay: 0.00s; }
        .vh-d1 { transition-delay: 0.08s; }
        .vh-d2 { transition-delay: 0.16s; }
        .vh-d3 { transition-delay: 0.24s; }
        .vh-d4 { transition-delay: 0.32s; }

        .vh-h2 {
          font-size: clamp(2rem, 4.5vw, 3rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.03em;
          line-height: 1.08;
          margin: 0;
          text-align: center;
        }

        .vh-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2px;
          margin-top: 3rem;
          border-radius: 20px;
          overflow: hidden;
        }
        @media (max-width: 640px) {
          .vh-grid { grid-template-columns: 1fr; }
        }

        .vh-item {
          position: relative;
          overflow: hidden;
          background: #0F1C2E;
          display: flex;
          flex-direction: column;
        }

        .vh-item img {
          width: 100%;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          display: block;
          transition: transform 0.6s ease;
          filter: brightness(0.82);
        }
        .vh-item:hover img {
          transform: scale(1.04);
          filter: brightness(0.65);
        }

        /* Gradient bottom overlay */
        .vh-item::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 65%;
          background: linear-gradient(to top, rgba(8,14,26,0.92) 0%, rgba(8,14,26,0.4) 60%, transparent 100%);
          pointer-events: none;
        }

        .vh-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 1.6rem 1.75rem;
          z-index: 2;
        }

        .vh-item-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #F0F5FF;
          letter-spacing: -0.025em;
          line-height: 1.15;
          margin: 0 0 5px;
        }

        /* Descripción — siempre visible en desktop */
        .vh-item-desc {
          font-size: 0.8rem;
          color: rgba(240,245,255,0.7);
          line-height: 1.55;
          margin: 0 0 14px;
          transition: opacity 0.25s ease, max-height 0.3s ease;
        }

        /* Mobile: descripción oculta por defecto, visible solo en hover/focus */
        @media (max-width: 640px) {
          .vh-item-desc {
            opacity: 0;
            max-height: 0;
            overflow: hidden;
            margin-bottom: 0;
          }
          .vh-item:hover .vh-item-desc,
          .vh-item:focus-within .vh-item-desc {
            opacity: 1;
            max-height: 80px;
            margin-bottom: 14px;
          }
        }

        .vh-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          background: #5B9BD5;
          color: #fff;
          font-size: 0.78rem;
          font-weight: 700;
          border-radius: 50px;
          text-decoration: none;
          letter-spacing: -0.005em;
          width: fit-content;
          transition: background 0.18s ease, transform 0.18s ease;
        }
        .vh-pill:hover {
          background: #4A8BC5;
          transform: translateY(-1px);
        }
      `}</style>

      <section
        id="vehiculos"
        ref={ref}
        style={{ background: "#F8FAFD", padding: "6rem 0" }}
      >
        <div className="container">

          <h2 className="vh-h2 vh-reveal vh-d0">Nuestros vehículos</h2>

          <div className="vh-grid">
            {VEHICLES.map((v, i) => (
              <div key={v.title} className={`vh-item vh-reveal vh-d${i + 1}`}>
                <img src={v.image} alt={v.alt} loading="lazy" />
                <div className="vh-overlay">
                  <p className="vh-item-title">{v.title}</p>
                  <p className="vh-item-desc">{v.description}</p>
                  <a
                    href={whatsappLink(v.wa)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackLeadEvent()}
                    className="vh-pill"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.85L0 24l6.302-1.506A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 0 1-5.002-1.368l-.36-.214-3.733.892.923-3.632-.235-.374A9.787 9.787 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
                    </svg>
                    Consultar disponibilidad
                  </a>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>
    </>
  );
}