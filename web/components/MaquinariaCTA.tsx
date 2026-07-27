"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const MACHINES = [
  { name: "Pala Cargadora", detail: "924 HZ" },
  { name: "Retroexcavadora", detail: "Caterpillar 416D" },
  { name: "Ford Cargo", detail: "Vatea volcadora · Cummins 6BT" },
  { name: "Minicargadora", detail: "New Holland L318" },
  { name: "Tanque de agua", detail: "Para obras y construcción" },
];

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

export default function MaquinariaCTA() {
  const { ref: sectionRef, visible } = useReveal<HTMLElement>();

  return (
    <>
      <style>{`
        #maquinaria-cta * { box-sizing: border-box; }

        .mq-fade {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        .mq-fade.in { opacity: 1; transform: none; }

        .mq-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          color: rgba(27,42,74,0.55);
          margin-bottom: 0.9rem;
          justify-content: center;
        }
        .mq-label-line {
          display: block;
          width: 22px;
          height: 1.5px;
          background: rgba(27,42,74,0.35);
          border-radius: 2px;
        }

        .mq-h2 {
          font-size: clamp(2rem, 4vw, 2.9rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.03em;
          line-height: 1.08;
          margin: 0 0 0.85rem;
        }

        .mq-sub {
          font-size: 1rem;
          color: rgba(15,28,46,0.55);
          line-height: 1.7;
          margin: 0 auto 3rem;
          max-width: 520px;
        }

        /* ── Machine items ── */
        .mq-machines {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          margin: 0 auto 2.5rem;
          max-width: 600px;
        }

        .mq-machine {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          padding: 1.1rem 1.5rem;
          border-radius: 12px;
          opacity: 0;
          transform: translateX(-14px);
          transition:
            opacity 0.5s ease,
            transform 0.5s ease,
            background 0.2s ease;
        }

        .mq-machine.in {
          opacity: 1;
          transform: translateX(0);
        }

        .mq-machine:hover {
          background: rgba(15,28,46,0.04);
        }

        .mq-machine-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .mq-machine-num {
          font-size: 0.7rem;
          font-weight: 700;
          color: #5B9BD5;
          letter-spacing: 0.05em;
          width: 20px;
          flex-shrink: 0;
          opacity: 0.7;
        }

        .mq-machine-name {
          font-size: clamp(1.1rem, 2.5vw, 1.45rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.025em;
          line-height: 1.1;
        }

        .mq-machine-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .mq-machine-detail {
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(15,28,46,0.35);
          letter-spacing: 0.03em;
          text-align: right;
          white-space: nowrap;
        }

        .mq-machine-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #5B9BD5;
          opacity: 0;
          flex-shrink: 0;
          transition: opacity 0.3s ease;
        }

        .mq-machine.in .mq-machine-dot {
          opacity: 0.5;
        }

        /* Separator */
        .mq-sep {
          width: calc(100% - 3rem);
          height: 1px;
          background: rgba(15,28,46,0.07);
          margin: 0 auto;
        }

        /* CTA */
        .mq-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 30px;
          background: #0F1C2E;
          color: #fff;
          font-size: 0.92rem;
          font-weight: 700;
          border: none;
          border-radius: 11px;
          cursor: pointer;
          text-decoration: none;
          letter-spacing: -0.01em;
          transition: background 0.18s ease, transform 0.18s ease;
        }
        .mq-btn:hover { background: #1B2A4A; transform: translateY(-1px); }
        .mq-btn:active { transform: none; }

        .mq-btn-arrow {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(255,255,255,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
      `}</style>

      <section
        id="maquinaria-cta"
        ref={sectionRef}
        style={{ background: "rgb(223, 232, 255)", padding: "4rem 0 4.5rem", textAlign: "center" }}
      >
        <div className="container">

          <div className={`mq-fade${visible ? " in" : ""}`} style={{ transitionDelay: "0s" }}>
            <div className="mq-label">
              <span className="mq-label-line" />
              Maquinaria pesada
            </div>
          </div>

          <h2 className={`mq-h2 mq-fade${visible ? " in" : ""}`} style={{ transitionDelay: "0.08s" }}>
            Equipamiento para tu obra, listo para trabajar
          </h2>

          <p className={`mq-sub mq-fade${visible ? " in" : ""}`} style={{ transitionDelay: "0.16s" }}>
            Alquilamos maquinaria profesional para construcción, movimiento de
            suelo y trabajos especiales en Bahía Blanca y zona.
          </p>

          {/* Machines — staggered reveal */}
          <div className="mq-machines">
            {MACHINES.map(({ name, detail }, i) => (
              <div key={name} style={{ width: "100%" }}>
                <div
                  className={`mq-machine${visible ? " in" : ""}`}
                  style={{ transitionDelay: visible ? `${0.28 + i * 0.12}s` : "0s" }}
                >
                  <div className="mq-machine-left">
                    <span className="mq-machine-num">0{i + 1}</span>
                    <span className="mq-machine-name">{name}</span>
                  </div>
                  <div className="mq-machine-right">
                    <span className="mq-machine-detail">{detail}</span>
                    <span className="mq-machine-dot" />
                  </div>
                </div>
                {i < MACHINES.length - 1 && <div className="mq-sep" />}
              </div>
            ))}
          </div>

          <div className={`mq-fade${visible ? " in" : ""}`} style={{ transitionDelay: "0.9s" }}>
            <Link href="/maquinaria" className="mq-btn">
              Ver maquinaria disponible
              <span className="mq-btn-arrow">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </Link>
          </div>

        </div>
      </section>
    </>
  );
}