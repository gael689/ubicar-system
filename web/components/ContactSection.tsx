"use client";

import { useEffect, useRef } from "react";
import { PHONE_FRANCO, PHONE_MARTIN, WHATSAPP_GENERAL, WHATSAPP_CABA } from "@/lib/constants";
import { trackLeadEvent } from "@/lib/meta-pixel";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";

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

export default function ContactSection() {
  const ref = useReveal<HTMLElement>();

  return (
    <>
      <style>{`
        #contacto * { box-sizing: border-box; }

        .ct-item {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        [data-in="1"] .ct-item { opacity: 1; transform: none; }
        .ct-d0 { transition-delay: 0.00s; }
        .ct-d1 { transition-delay: 0.08s; }
        .ct-d2 { transition-delay: 0.16s; }
        .ct-d3 { transition-delay: 0.24s; }
        .ct-d4 { transition-delay: 0.32s; }
        .ct-d5 { transition-delay: 0.40s; }

        .ct-h2 {
          font-size: clamp(2.25rem, 5vw, 3.5rem);
          font-weight: 800;
          color: #0F1C2E;
          letter-spacing: -0.03em;
          line-height: 1.08;
          margin: 0 0 2rem;
        }

        /* Email pill */
        .ct-email-pill {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 15px 28px;
          background: #5B9BD5;
          color: #fff;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 50px;
          text-decoration: none;
          letter-spacing: -0.01em;
          transition: background 0.18s ease, transform 0.18s ease;
          margin-bottom: 3.5rem;
        }
        .ct-email-pill:hover { background: #4A8BC5; transform: translateY(-1px); }
        .ct-email-pill:active { transform: none; }

        .ct-pill-icon {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* Addresses */
        .ct-addresses {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem 3rem;
          margin-bottom: 2.75rem;
        }
        @media (max-width: 560px) {
          .ct-addresses { grid-template-columns: 1fr; gap: 1.5rem; }
        }

        .ct-addr-city {
          font-size: 0.75rem;
          font-weight: 700;
          color: #0F1C2E;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0 0 6px;
        }

        .ct-addr-line {
          font-size: 1rem;
          color: rgba(15,28,46,0.65);
          line-height: 1.5;
          font-weight: 500;
          margin: 0;
        }

        .ct-addr-note {
          font-size: 0.78rem;
          color: rgba(15,28,46,0.38);
          margin-top: 4px;
          font-style: italic;
        }

        /* Divider */
        .ct-divider {
          width: 100%;
          height: 1px;
          background: rgba(15,28,46,0.10);
          margin: 0 0 2.25rem;
        }

        /* Contact buttons grid */
        .ct-contacts {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .ct-contact-btn {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          border-radius: 14px;
          text-decoration: none;
          transition: background 0.18s ease, transform 0.15s ease;
          border: 1.5px solid transparent;
        }

        /* Call button style */
        .ct-btn-call {
          background: rgba(15,28,46,0.05);
          border-color: rgba(15,28,46,0.08);
        }
        .ct-btn-call:hover {
          background: rgba(15,28,46,0.09);
          transform: translateX(3px);
        }

        /* WhatsApp button style */
        .ct-btn-wa {
          background: rgba(37,211,102,0.08);
          border-color: rgba(37,211,102,0.18);
        }
        .ct-btn-wa:hover {
          background: rgba(37,211,102,0.14);
          transform: translateX(3px);
        }

        .ct-btn-icon {
          width: 42px;
          height: 42px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .ct-btn-icon-call { background: rgba(15,28,46,0.08); color: #1B2A4A; }
        .ct-btn-icon-wa   { background: rgba(37,211,102,0.15); color: #128C3E; }

        .ct-btn-body { flex: 1; }

        .ct-btn-label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(15,28,46,0.4);
          margin: 0 0 2px;
        }

        .ct-btn-number {
          font-size: 1.1rem;
          font-weight: 700;
          color: #0F1C2E;
          letter-spacing: -0.02em;
          margin: 0;
          line-height: 1.2;
        }

        .ct-btn-hint {
          font-size: 0.73rem;
          color: rgba(15,28,46,0.38);
          margin: 2px 0 0;
        }

        .ct-btn-action {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: 20px;
          flex-shrink: 0;
        }

        .ct-btn-action-call {
          background: rgba(15,28,46,0.08);
          color: #1B2A4A;
        }

        .ct-btn-action-wa {
          background: rgba(37,211,102,0.18);
          color: #128C3E;
        }

        /* Layout */
        .ct-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5rem;
          align-items: start;
        }
        @media (max-width: 860px) {
          .ct-layout { grid-template-columns: 1fr; gap: 3rem; }
        }
      `}</style>

      <section
        id="contacto"
        ref={ref}
        style={{ background: '#fffff', padding: "5.5rem 0 6rem" }}
      >
        <div className="container">
          <div className="ct-layout">

            {/* Left */}
            <div>
              <h2 className="ct-h2 ct-item ct-d0">
                Ponete en contacto con nosotros
              </h2>

              <div className="ct-item ct-d1">
                <a href="mailto:ubicar.rent@gmail.com" className="ct-email-pill">
                  <span className="ct-pill-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </span>
                  ubicar.rent@gmail.com
                </a>
              </div>

              <div className="ct-addresses ct-item ct-d2">
                <div>
                  <p className="ct-addr-city">Bahía Blanca</p>
                  <p className="ct-addr-line">Paraguay 241 3A</p>
                </div>
                <div>
                  <p className="ct-addr-city">CABA</p>
                  <p className="ct-addr-line">Juan Francisco Seguí 3607 2F</p>
                  <p className="ct-addr-note">Sin atención al público</p>
                </div>
              </div>
            </div>

            {/* Right — contact buttons */}
            <div>
              <div className="ct-divider ct-item ct-d2" style={{ marginTop: "0.5rem" }} />

              <div className="ct-contacts">
                {/* Franco */}
                <a
                  href={PHONE_FRANCO}
                  onClick={() => trackLeadEvent("telefono:franco")}
                  className="ct-contact-btn ct-btn-call ct-item ct-d2"
                >
                  <span className="ct-btn-icon ct-btn-icon-call">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <div className="ct-btn-body">
                    <p className="ct-btn-label">Franco</p>
                    <p className="ct-btn-number">+54 9 2923 47-4791</p>
                    <p className="ct-btn-hint">Llamadas y Whatsapp</p>
                  </div>
                  <span className="ct-btn-action ct-btn-action-call">Llamar</span>
                </a>

                {/* WhatsApp */}
                <a
                  href={WHATSAPP_GENERAL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackLeadEvent("contacto:whatsapp-bahia")}
                  className="ct-contact-btn ct-btn-wa ct-item ct-d4"
                >
                  <span className="ct-btn-icon ct-btn-icon-wa">
                    <IconoWhatsApp size={20} />
                  </span>
                  <div className="ct-btn-body">
                    <p className="ct-btn-label">WhatsApp - Ubicar Bahía Blanca</p>
                    <p className="ct-btn-number">+54 9 2914 18-0554</p>
                    <p className="ct-btn-hint">Respondemos rápido</p>
                  </div>
                  <span className="ct-btn-action ct-btn-action-wa">Escribir</span>
                </a>

                {/* WhatsApp */}
                <a
                  href={WHATSAPP_CABA}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackLeadEvent("contacto:whatsapp-caba")}
                  className="ct-contact-btn ct-btn-wa ct-item ct-d4"
                >
                  <span className="ct-btn-icon ct-btn-icon-wa">
                    <IconoWhatsApp size={20} />
                  </span>
                  <div className="ct-btn-body">
                    <p className="ct-btn-label">WhatsApp - Ubicar CABA</p>
                    <p className="ct-btn-number">+54 9 11 2516-4791</p>
                    <p className="ct-btn-hint">Respondemos rápido</p>
                  </div>
                  <span className="ct-btn-action ct-btn-action-wa">Escribir</span>
                </a>

              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}