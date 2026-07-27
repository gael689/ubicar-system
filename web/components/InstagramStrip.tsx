"use client";

import { useEffect, useRef } from "react";
import { INSTAGRAM } from "@/lib/constants";

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.dataset.in = "1"; obs.disconnect(); } },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function InstagramStrip() {
  const ref = useReveal<HTMLAnchorElement>();

  return (
    <>
      <style>{`
        #ig-strip * { box-sizing: border-box; }

        .ig-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          padding: 4rem 0;
          text-decoration: none;
          opacity: 0;
          transition:
            opacity 0.55s ease,
            background 0.22s ease;
        }
        [data-in="1"].ig-link { opacity: 1; }

        .ig-link:hover { background: #111; }

        .ig-text {
          font-size: clamp(2.5rem, 6vw, 4.5rem);
          font-weight: 800;
          color: #F0F5FF;
          letter-spacing: -0.03em;
          line-height: 1;
        }

        .ig-icon-wrap {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          border: 2px solid rgba(240,245,255,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #F0F5FF;
          transition: border-color 0.22s, background 0.22s;
        }
        .ig-link:hover .ig-icon-wrap {
          border-color: rgba(240,245,255,0.6);
          background: rgba(240,245,255,0.07);
        }
        @media (max-width: 480px) {
          .ig-icon-wrap { width: 48px; height: 48px; }
          .ig-icon-wrap svg { width: 26px; height: 26px; }
        } 
          
      `}</style>

      <section
        id="ig-strip"
        style={{ background: "#0A0A0A", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="container">
          <a
            ref={ref}
            href={INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="ig-link"
            aria-label="Seguinos en Instagram"
          >
            <span className="ig-text">Seguinos en Instagram</span>
            <span className="ig-icon-wrap">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </span>
          </a>
        </div>
      </section>
    </>
  );
}