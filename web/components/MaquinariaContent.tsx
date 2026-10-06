"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import { Fragment, useEffect, useRef } from "react";
import { whatsappLink, WHATSAPP_GENERAL } from "@/lib/constants";
import { trackLeadEvent } from "@/lib/meta-pixel";
import Link from "next/link";
import Image from "next/image";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";
import { MAQUINAS } from "@/lib/maquinas";


// ─── Scroll to top on mount ────────────────────────────────────────────────────
function useScrollTop() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
}

// ─── Scroll reveal ─────────────────────────────────────────────────────────────
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.dataset.in = "1"; obs.disconnect(); } },
      { threshold: 0.07 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─── Spec chips ───────────────────────────────────────────────────────────────
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 14px", background: "rgba(15,28,46,0.05)", borderRadius: 10, border: "1px solid rgba(15,28,46,0.08)" }}>
      <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(15,28,46,0.38)", margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0F1C2E", margin: 0, letterSpacing: "-0.01em" }}>{value}</p>
    </div>
  );
}

function SpecDark({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.06)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
      <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(240,245,255,0.35)", margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#F0F5FF", margin: 0, letterSpacing: "-0.01em" }}>{value}</p>
    </div>
  );
}

// ─── WA button ────────────────────────────────────────────────────────────────
function WABtn({ msg, dark = false }: { msg: string; dark?: boolean }) {
  const bg = dark ? "#5B9BD5" : "#0F1C2E";
  const bgHover = dark ? "#4A8BC5" : "#1B2A4A";
  return (
    <a
      href={whatsappLink(msg)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackLeadEvent("maquinaria:whatsapp-equipo")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 9,
        padding: "13px 24px", fontSize: "0.9rem", fontWeight: 700,
        borderRadius: 11, textDecoration: "none", letterSpacing: "-0.01em",
        background: bg, color: "#fff",
        transition: "background 0.18s, transform 0.18s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = bgHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = bg; }}
    >
      <IconoWhatsApp size={16} />
      Consultar disponibilidad
    </a>
  );
}

// ─── Image placeholder ────────────────────────────────────────────────────────
function ImgPlaceholder({ dark }: { dark?: boolean }) {
  return (
    <div style={{
      width: "100%", borderRadius: 18, aspectRatio: "4/3",
      background: dark ? "rgba(255,255,255,0.04)" : "rgba(15,28,46,0.06)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
        stroke={dark ? "rgba(255,255,255,0.15)" : "rgba(15,28,46,0.18)"}
        strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <p style={{ fontSize: "0.72rem", color: dark ? "rgba(255,255,255,0.2)" : "rgba(15,28,46,0.28)", margin: 0 }}>
        Imagen próximamente
      </p>
    </div>
  );
}

// ─── Machine section ──────────────────────────────────────────────────────────
// imgLeft: en desktop la imagen va a la izquierda, el texto a la derecha.
// En mobile SIEMPRE: imagen arriba, texto abajo.
interface MachineProps {
  bg: string;
  dark?: boolean;
  imgLeft?: boolean;
  category: string;
  title: string;
  description: string;
  specs: { label: string; value: string }[];
  waMsg: string;
  image?: string;
  imageAlt?: string;
  /** La página propia del equipo. */
  href?: string;
}

function MachineSection({ bg, dark, imgLeft, category, title, description, specs, waMsg, image, imageAlt, href }: MachineProps) {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} style={{ background: bg, padding: "5rem 0" }}>
      <div className="container">
        {/* En mobile: siempre columna (imagen arriba, texto abajo).
            En desktop: respeta imgLeft para alternar. */}
        <div className="mq-grid">
          {/* IMAGEN */}
          <div className={imgLeft ? "mq-img-col mq-first" : "mq-img-col mq-last"}>
            <div className="mq-reveal mq-d1">
              {image ? (
                <div style={{ borderRadius: 18, overflow: "hidden", aspectRatio: "4/3" }}>
                  <Image
                    src={image}
                    alt={imageAlt ?? ""}
                    width={800}
                    height={600}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    style={{
                      width: "100%", height: "100%", objectFit: "cover", display: "block",
                      filter: dark ? "brightness(0.88)" : "none"
                    }}
                  />
                </div>
              ) : (
                <ImgPlaceholder dark={dark} />
              )}
            </div>
          </div>

          {/* TEXTO */}
          <div className={imgLeft ? "mq-text-col mq-last" : "mq-text-col mq-first"}>
            <div className="mq-reveal mq-d2">
              <p style={{
                fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.09em",
                textTransform: "uppercase", margin: "0 0 0.7rem",
                color: dark ? "rgba(240,245,255,0.35)" : "rgba(15,28,46,0.38)",
              }}>{category}</p>

              <h2 style={{
                fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800,
                letterSpacing: "-0.03em", lineHeight: 1.08, margin: "0 0 0.9rem",
                color: dark ? "#F0F5FA" : "#0F1C2E",
              }}>{title}</h2>

              <p style={{
                fontSize: "0.97rem", lineHeight: 1.75, margin: "0 0 1.4rem",
                color: dark ? "rgba(240,245,255,0.55)" : "rgba(15,28,46,0.6)",
              }}>{description}</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1.4rem" }}>
                {specs.map(s => dark
                  ? <SpecDark key={s.label} label={s.label} value={s.value} />
                  : <Spec key={s.label} label={s.label} value={s.value} />
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
                <WABtn msg={waMsg} dark={dark} />
                {href && (
                  <Link href={href} style={{
                    fontSize: "0.9rem", fontWeight: 700, textDecoration: "none",
                    color: dark ? "#A8CAFE" : "#1B3F6B",
                  }}>
                    Ver ficha completa →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


export default function MaquinariaContent() {
  useScrollTop();

  return (
    <>
      <style>{`
        /* ── Reveal ── */
        .mq-reveal {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        [data-in="1"] .mq-reveal { opacity: 1; transform: none; }
        .mq-d1 { transition-delay: 0.04s; }
        .mq-d2 { transition-delay: 0.14s; }

        /* ── Grid: desktop 2 cols, mobile 1 col ── */
        .mq-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
        }

        /* Desktop order */
        .mq-first { order: 1; }
        .mq-last  { order: 2; }

        /* Mobile: imagen siempre arriba (order 1), texto abajo (order 2) */
        @media (max-width: 860px) {
          .mq-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
          .mq-img-col  { order: 1; }
          .mq-text-col { order: 2; }
        }

        /* ── Separators ── */
        .mq-sep      { width: 100%; height: 1px; background: rgba(15,28,46,0.07); }
        .mq-sep-dark { width: 100%; height: 1px; background: rgba(255,255,255,0.05); }

        /* ── Hero ── */
        @keyframes mq-fadeup {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: none; }
        }
        .mq-hero-anim { animation: mq-fadeup 0.65s ease forwards; }

        .mq-hero-label {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 0.75rem; font-weight: 600;
          letter-spacing: 0.10em; text-transform: uppercase;
          color: #A8CAFE; margin-bottom: 1rem;
        }
        .mq-hero-line { display: block; width: 22px; height: 1.5px; background: #5B9BD5; border-radius: 2px; }

        /* ── Bottom CTA ── */
        .mq-back-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 13px 24px; font-size: 0.9rem; font-weight: 700;
          border-radius: 11px; border: 1.5px solid rgba(15,28,46,0.18);
          color: #0F1C2E; text-decoration: none;
          transition: border-color 0.18s, background 0.18s;
          letter-spacing: -0.01em;
        }
        .mq-back-btn:hover { border-color: #5B9BD5; background: rgba(91,155,213,0.05); }

        .mq-wa-main {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 13px 24px; background: #0F1C2E; color: #fff;
          font-size: 0.9rem; font-weight: 700; border-radius: 11px;
          text-decoration: none; letter-spacing: -0.01em;
          transition: background 0.18s;
        }
        .mq-wa-main:hover { background: #1B2A4A; }
      `}</style>

      <Header />
      <main>

        {/* ── HERO ── */}
        <section style={{ position: "relative", padding: "7rem 0 5rem", overflow: "hidden", background: "#0A0A0A" }}>
          {/* Fondo borroso — menos blur para que no tape el logo */}
          <div style={{
            position: "absolute", inset: "-10px", zIndex: 0,
            backgroundImage: `url("https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=80")`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "blur(4px) brightness(1)",
          }} />
          {/* Capa de color de marca encima */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: "linear-gradient(160deg, rgba(27,63,107,0.88) 0%, rgba(176, 190, 207, 0.62) 55%, rgba(27,63,107,0.85) 100%)",
          }} />
          {/* Contenido */}
          <div className="container" style={{ position: "relative", zIndex: 2, maxWidth: 640 }}>
            <div className="mq-hero-anim" style={{ opacity: 0 }}>
              <span className="mq-hero-label">
                <span className="mq-hero-line" />
                Maquinaria pesada
              </span>
              <h1 style={{
                fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", fontWeight: 800,
                color: "#F0F5FA", letterSpacing: "-0.035em", lineHeight: 1.06,
                margin: "0 0 1rem",
              }}>
                Equipos para obra en Bahía Blanca y la zona
              </h1>
              <p style={{
                fontSize: "1.05rem", color: "rgba(240,245,250,0.6)",
                lineHeight: 1.7, margin: 0,
              }}>
                5 equipos disponibles. Consultá disponibilidad por WhatsApp.
              </p>
            </div>
          </div>
        </section>

        {/* Los cinco equipos salen de `lib/maquinas.ts`, que también alimenta
            la página de cada uno, el sitemap y el `llms.txt`. */}
        {MAQUINAS.map((m, i) => (
          <Fragment key={m.slug}>
            {i > 0 && i < 4 && <div className="mq-sep" />}
            <MachineSection
              bg={i % 2 === 0 ? "rgb(223, 232, 255)" : "#FFFFFF"}
              imgLeft={i % 2 === 1}
              category={m.categoria}
              title={m.nombre}
              description={m.descripcion}
              specs={m.specs}
              waMsg={m.waMsg}
              image={m.imagen}
              imageAlt={m.imagenAlt}
              href={`/maquinaria/${m.slug}`}
            />
          </Fragment>
        ))}

        {/* ── BOTTOM CTA ── */}
        <section style={{ background: "#FFFFFF", padding: "5rem 0", textAlign: "center" }}>
          <div className="container" style={{ maxWidth: 580 }}>
            <h2 style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 800,
              color: "#0F1C2E", letterSpacing: "-0.03em", lineHeight: 1.1,
              margin: "0 0 0.85rem",
            }}>
              ¿También necesitás un vehículo?
            </h2>
            <p style={{ fontSize: "1rem", color: "rgba(15,28,46,0.55)", margin: "0 0 2rem" }}>
              Contamos con una flota de autos y camionetas disponibles para alquiler.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <a href={WHATSAPP_GENERAL} target="_blank" rel="noopener noreferrer" onClick={() => trackLeadEvent("maquinaria:whatsapp-flota")} className="mq-wa-main">
                <IconoWhatsApp size={16} />
                Consultar por WhatsApp
              </a>
              <Link href="/#vehiculos" className="mq-back-btn">
                Ver vehículos disponibles
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
      <FloatingWhatsApp />
    </>
  );
}