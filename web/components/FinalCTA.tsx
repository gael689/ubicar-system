"use client";

import { useEffect, useRef } from "react";
import { WHATSAPP_GENERAL } from "@/lib/constants";
import { trackLeadEvent } from "@/lib/meta-pixel";

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.dataset.in = "1"; obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function FinalCTA() {
  const ref = useReveal<HTMLElement>();

  return (
    <>
      <style>{`
        #final-cta * { box-sizing: border-box; }

        .fc-item {
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        [data-in="1"] .fc-item { opacity: 1; transform: none; }
        .fc-d1 { transition-delay: 0.00s; }
        .fc-d2 { transition-delay: 0.12s; }
        .fc-d3 { transition-delay: 0.22s; }

        .fc-h2 {
          font-size: clamp(2.4rem, 5.5vw, 3.5rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.03em;
          line-height: 1.08;
          margin: 0 0 1.1rem;
        }

        .fc-sub {
          font-size: 1.1rem;
          color: #6A8299;
          line-height: 1.6;
          margin: 0 0 2.25rem;
        }

        .fc-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 15px 34px;
          background: #5B9BD5;
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          text-decoration: none;
          letter-spacing: -0.01em;
          transition: background 0.18s ease, transform 0.18s ease;
        }
        .fc-btn:hover { background: #4A8BC5; transform: translateY(-2px); }
        .fc-btn:active { transform: none; }

        .fc-btn-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .fc-note {
          margin-top: 1rem;
          font-size: 0.8rem;
          color: #B0C4D4;
        }
      `}</style>

      <section
        id="final-cta"
        ref={ref}
        style={{
          background: "#FFFFFF",
          padding: "8rem 0",
          textAlign: "center",
        }}
      >
        <div className="container" style={{ maxWidth: 640 }}>

          <h2 className="fc-h2 fc-item fc-d1">
            ¿Listo para coordinar tu alquiler?
          </h2>

          <p className="fc-sub fc-item fc-d2">
            Escribinos y coordinamos todo en minutos.
          </p>

          <div className="fc-item fc-d3">
            <a
              href={WHATSAPP_GENERAL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackLeadEvent()}
              className="fc-btn"
            >
              Contactar ahora
              <span className="fc-btn-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </a>
            <p className="fc-note">Respondemos por WhatsApp</p>
          </div>

        </div>
      </section>
    </>
  );
}