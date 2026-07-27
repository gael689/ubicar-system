"use client";

import { useEffect, useRef } from "react";
import { whatsappLink } from "@/lib/constants";

const IconFleet = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="2" />
    <path d="M16 8h4l3 5v3h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

const IconCost = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconChat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconShield = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const PILLARS = [
  {
    Icon: IconFleet,
    title: "Flota a medida",
    text: "Sumá vehículos según lo que necesitás.",
  },
  {
    Icon: IconCost,
    title: "Costos predecibles",
    text: "Mantenimiento general, seguros y patente incluidos.",
  },
  {
    Icon: IconChat,
    title: "Trato directo",
    text: "Por Whatsapp, via telefonica, o en persona. Sin intermediarios ni demoras.",
  },
  {
    Icon: IconShield,
    title: "Vehículos garantizados",
    text: "Revisados, con documentación al día y cobertura de seguro según contrato.",
  },
];

function useReveal() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { el.dataset.revealed = "true"; obs.disconnect(); }
      },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function EmpresasSection() {
  const sectionRef = useReveal();

  return (
    <>
      <style>{`
        .em-reveal {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        [data-revealed="true"] .em-reveal { opacity: 1; transform: none; }
        .em-d1 { transition-delay: 0.05s; }
        .em-d2 { transition-delay: 0.14s; }
        .em-d3 { transition-delay: 0.23s; }
        .em-d4 { transition-delay: 0.32s; }
        .em-d5 { transition-delay: 0.42s; }

        .em-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          color: #7AAFD4;
          margin-bottom: 1.25rem;
        }
        .em-label-line {
          display: block;
          width: 24px;
          height: 1.5px;
          background: #5B9BD5;
          border-radius: 2px;
        }

        .em-h2 {
          font-size: clamp(2.1rem, 4vw, 3rem);
          font-weight: 700;
          color: #F0F5FA;
          line-height: 1.12;
          letter-spacing: -0.02em;
          margin: 0 0 1.25rem;
        }

        .em-body {
          font-size: 1rem;
          line-height: 1.75;
          color: #8BA4BC;
          margin: 0;
        }

        .em-divider {
          width: 100%;
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin: 2rem 0;
        }

        .em-cta {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 14px 28px;
          background: #5B9BD5;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.18s ease, transform 0.18s ease;
          letter-spacing: -0.005em;
        }
        .em-cta:hover { background: #4A8BC5; transform: translateY(-1px); }
        .em-cta:active { transform: none; }

        .em-pillars {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: rgba(255,255,255,0.06);
          border-radius: 16px;
          overflow: hidden;
        }
        @media (max-width: 520px) {
          .em-pillars { grid-template-columns: 1fr; }
          .em-pillar:first-child      { border-radius: 16px 16px 0 0 !important; }
          .em-pillar:nth-child(2)     { border-radius: 0 !important; }
          .em-pillar:nth-last-child(2){ border-radius: 0 !important; }
          .em-pillar:last-child       { border-radius: 0 0 16px 16px !important; }
        }

        .em-pillar {
          background: #0A0A0A;
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          transition: background 0.18s ease;
        }
        .em-pillar:hover { background: #111; }
        .em-pillar:first-child       { border-radius: 16px 0 0 0; }
        .em-pillar:nth-child(2)      { border-radius: 0 16px 0 0; }
        .em-pillar:nth-last-child(2) { border-radius: 0 0 0 16px; }
        .em-pillar:last-child        { border-radius: 0 0 16px 0; }

        .em-icon-wrap {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(91,155,213,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #5B9BD5;
          flex-shrink: 0;
          margin-bottom: 0.1rem;
        }

        .em-pillar-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #D8E8F5;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }

        .em-pillar-text {
          font-size: 0.85rem;
          color: #6A8FAD;
          line-height: 1.65;
        }

        .em-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5rem;
          align-items: center;
        }
        @media (max-width: 860px) {
          .em-grid { grid-template-columns: 1fr; gap: 2rem; }
        }
      `}</style>

      <section
        id="empresas"
        ref={sectionRef as React.RefObject<HTMLElement>}
        style={{ background: "#0A0A0A", padding: "6rem 0" }}
      >
        <div className="container">
          <div className="em-grid">

            {/* ── Columna izquierda ── */}
            <div>
              <div className="em-reveal em-d1">
                <span className="em-label">
                  <span className="em-label-line" />
                  Para empresas
                </span>
              </div>

              <h2 className="em-h2 em-reveal em-d2">
                Movilidad corporativa
              </h2>

              <p className="em-body em-reveal em-d3">
                Alquilar es más eficiente que comprar. Sin inmovilizar capital,
                sin preocuparte por el mantenimiento y con vehículos siempre
                listos para trabajar.
              </p>

              <div className="em-divider em-reveal em-d4" />

              <div className="em-reveal em-d4">
                <a
                  href={whatsappLink(
                    "Hola, quiero consultar por alquiler de flota para empresa. ¿Me pueden asesorar?"
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="em-cta"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.85L0 24l6.302-1.506A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 0 1-5.002-1.368l-.36-.214-3.733.892.923-3.632-.235-.374A9.787 9.787 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
                  </svg>
                  Consultar para empresas
                </a>
              </div>
            </div>

            {/* ── Columna derecha: pillars ── */}
            <div className="em-reveal em-d5">
              <div className="em-pillars">
                {PILLARS.map(({ Icon, title, text }) => (
                  <div key={title} className="em-pillar">
                    <div className="em-icon-wrap">
                      <Icon />
                    </div>
                    <p className="em-pillar-title">{title}</p>
                    <p className="em-pillar-text">{text}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}