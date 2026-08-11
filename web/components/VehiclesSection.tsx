"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { intencionDeReserva } from "@/lib/analitica";

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
        .vh-sub {
          margin: 0.75rem auto 0;
          max-width: 34rem;
          text-align: center;
          font-size: 1rem;
          color: rgba(15, 28, 46, 0.6);
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
          <p className="vh-sub vh-reveal vh-d0">
            Elegí fechas y mirá el precio final de cada categoría al instante.
          </p>

          <div className="vh-grid">
            {VEHICLES.map((v, i) => (
              <div key={v.title} className={`vh-item vh-reveal vh-d${i + 1}`}>
                <img src={v.image} alt={v.alt} loading="lazy" />
                <div className="vh-overlay">
                  <p className="vh-item-title">{v.title}</p>
                  <p className="vh-item-desc">{v.description}</p>
                  {/* Manda al flujo de reserva, no a WhatsApp: si toda la
                      pagina dice "reserva online" y despues cada auto abre un
                      chat, el mensaje se cae solo.

                      Y justamente por eso NO se mide como lead: es una
                      navegacion interna. Marcarla como `Lead` hacia que cada
                      curioso contara como contacto. */}
                  {/* Va al buscador de la portada, **no a `/reservar`**. Desde
                      D-44 la edad del responsable es obligatoria para cotizar,
                      y `/reservar` sin ese dato rebota a la home: el botón era
                      un callejón sin salida que devolvía al visitante al
                      principio sin explicarle por qué. */}
                  <Link
                    href="/#reservar"
                    onClick={() => intencionDeReserva(`vehiculos:${v.title}`)}
                    className="vh-pill"
                  >
                    Ver disponibilidad y precio
                  </Link>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>
    </>
  );
}