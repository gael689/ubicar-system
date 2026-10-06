"use client";

import Link from "next/link";
import Image from "next/image";
import { LANDINGS } from "@/lib/landings";
import { MAQUINAS } from "@/lib/maquinas";
const logo = "/img/logo.png";

const NAV_ITEMS = [
  { label: "Vehículos", href: "/#vehiculos" },
  { label: "Empresas", href: "/empresas", route: true },
  { label: "Maquinaria", href: "/maquinaria", route: true },
  { label: "Preguntas frecuentes", href: "/preguntas-frecuentes", route: true },
  { label: "Ubicación", href: "/#ubicacion" },
  { label: "Contacto", href: "/#contacto" },
];

const linkStyle: React.CSSProperties = {
  color: "#1B3F6B",
  textDecoration: "none",
  fontSize: "0.875rem",
  fontWeight: 600,
  letterSpacing: "0.01em",
  transition: "color 0.18s",
};

const Footer = () => {
  return (
    <>
      <style>{`
        /* ── Fila principal ── */
        .footer-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 68px;
        }
        .footer-nav {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        /* ── Fila inferior ── */
        .footer-sub {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.75rem;
          padding-bottom: 0.75rem;
        }

        /* ── Mobile ── */
        @media (max-width: 640px) {
          .footer-main {
            flex-direction: column;
            justify-content: center;
            height: auto;
            padding-top: 1.5rem;
            padding-bottom: 1.25rem;
            gap: 1.25rem;
          }
          .footer-nav {
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.75rem 1.25rem;
          }
          .footer-sub {
            flex-direction: column;
            align-items: center;
            gap: 0.35rem;
            text-align: center;
          }
        }
      `}</style>

      <footer>
        {/* ── Fila principal: logo · nav ── */}
        <div style={{ background: "rgb(223, 232, 255)", borderTop: "1px solid rgba(64,126,201,0.18)" }}>
          <div className="container footer-main">

            <Link
              href="/"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <Image
                src={logo}
                alt="Ubicar Rent"
                width={1358} height={649}
                style={{ height: 60, width: "auto", display: "block" }}
              />
            </Link>

            <nav className="footer-nav">
              {NAV_ITEMS.map((item) =>
                item.route ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={linkStyle}
                    onMouseEnter={e => (e.currentTarget.style.color = "#407EC9")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#1B3F6B")}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={item.href}
                    style={linkStyle}
                    onMouseEnter={e => (e.currentTarget.style.color = "#407EC9")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#1B3F6B")}
                  >
                    {item.label}
                  </a>
                )
              )}
            </nav>
          </div>
        </div>

        {/* ── Qué se alquila: las páginas de servicio y de cada equipo. Son los
            enlaces internos que les dan peso en el buscador y que llevan a quien
            ya sabe qué busca directo a la página que lo responde. ── */}
        <div style={{ background: "rgb(223, 232, 255)" }}>
          <nav
            aria-label="Qué alquilamos"
            className="container"
            style={{
              borderTop: "1px solid rgba(64,126,201,0.25)",
              padding: "0.9rem 0",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem 1.4rem",
            }}
          >
            <span style={{ color: "rgba(0,0,0,0.45)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Alquilamos
            </span>
            {LANDINGS.filter((l) => l.slug !== "empresas").map((l) => (
              <Link key={l.slug} href={`/${l.slug}`} style={{ ...linkStyle, fontSize: "0.8rem" }}>
                {l.nombre}
              </Link>
            ))}
            {MAQUINAS.map((m) => (
              <Link key={m.slug} href={`/maquinaria/${m.slug}`} style={{ ...linkStyle, fontSize: "0.8rem" }}>
                {m.nombreCorto}
              </Link>
            ))}
          </nav>
        </div>

        {/* ── Fila inferior: copyright · crédito ── */}
        <div style={{ background: "rgb(223, 232, 255)" }}>
          <div
            className="container footer-sub"
            style={{ borderTop: "1px solid rgba(64,126,201,0.25)" }}
          >
            <span style={{ color: "rgba(0,0,0,0.45)", fontSize: "0.8rem" }}>
              © {new Date().getFullYear()} Ubicar Rent · Bahía Blanca, Argentina
              {" · "}
              {/* La politica de privacidad es obligacion legal (Ley 25.326) y
                  tiene que ser alcanzable desde cualquier pagina del sitio. */}
              <a
                href="/preguntas-frecuentes"
                style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}
              >
                Preguntas frecuentes
              </a>
              {" · "}
              <a
                href="/terminos"
                style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}
              >
                Términos
              </a>
              {" · "}
              <a
                href="/privacidad"
                style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}
              >
                Privacidad
              </a>
            </span>

            <a
              href="https://gaelgonzalez.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "rgba(0,0,0,0.45)",
                fontSize: "0.8rem",
                textDecoration: "none",
                transition: "color 0.18s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#407EC9")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(27,63,107,0.45)")}
            >
              Desarrollado por{" "}
              <span style={{ color: "#4b607a", fontWeight: "bold" }}>Gael González</span>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Footer;