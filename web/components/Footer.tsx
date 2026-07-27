"use client";

import Link from "next/link";
const logo = "/img/logo.png";

const NAV_ITEMS = [
  { label: "Vehículos", href: "#vehiculos" },
  { label: "Empresas", href: "#empresas" },
  { label: "Maquinaria", href: "/maquinaria", route: true },
  { label: "Ubicación", href: "#ubicacion" },
  { label: "Contacto", href: "#contacto" },
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
              <img
                src={logo}
                alt="Ubicar Rent"
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

        {/* ── Fila inferior: copyright · crédito ── */}
        <div style={{ background: "rgb(223, 232, 255)" }}>
          <div
            className="container footer-sub"
            style={{ borderTop: "1px solid rgba(64,126,201,0.25)" }}
          >
            <span style={{ color: "rgba(0,0,0,0.45)", fontSize: "0.8rem" }}>
              © {new Date().getFullYear()} Ubicar Rent · Bahía Blanca, Argentina
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