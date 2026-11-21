"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
const logo = "/img/logo.png";
import { intencionDeReserva } from "@/lib/analitica";

// ─── Nav links ────────────────────────────────────────────────────────────────

const useNavItems = () => {
  const pathname = usePathname();
  const isHome = pathname === "/";
  return [
    { label: "Vehículos", href: isHome ? "#vehiculos" : "/#vehiculos" },
    // Las preguntas frecuentes son el mejor contenido del sitio y hasta ahora
    // estaban enlazadas **sólo desde el footer**. En la portada apunta al
    // bloque; desde cualquier otra página, a la página completa.
    { label: "Preguntas", href: isHome ? "#preguntas" : "/preguntas-frecuentes" },
    { label: "Empresas", href: isHome ? "#empresas" : "/empresas" },
    { label: "Maquinaria", href: "/maquinaria" },
    { label: "Ubicación", href: isHome ? "#ubicacion" : "/#ubicacion" },
    { label: "Contacto", href: isHome ? "#contacto" : "/#contacto" },
  ];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = "#407EC9";
const DARK = "#1B3F6B";
const WHITE = "#FFFFFF";
const MUTED_NAV = "rgba(255,255,255,0.75)"; // nav links sobre hero transparente

// ─── Component ────────────────────────────────────────────────────────────────

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const navItems = useNavItems();

  // Scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  /**
   * "Reservar": al buscador de esta página si lo tiene (la portada y las
   * páginas de servicio), y si no al de la portada. Nunca a `/reservar` a
   * secas, que sin fechas ni edad rebota.
   */
  const irAReservar = (origen: string) => {
    intencionDeReserva(origen);
    setMobileOpen(false);
    const buscador = document.getElementById("reservar");
    if (buscador) buscador.scrollIntoView({ behavior: "smooth" });
    else router.push("/#reservar");
  };

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    if (href.startsWith("/#")) {
      router.push(href);
    } else if (href.startsWith("#")) {
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-50 transition-[background,box-shadow,border-color] duration-300"
        style={{
          background: scrolled
            ? "rgba(255,255,255,0.97)"
            : "transparent",
          borderBottom: scrolled
            ? "1px solid rgba(27,63,107,0.10)"
            : "1px solid transparent",
          boxShadow: scrolled
            ? "0 1px 20px rgba(27,63,107,0.07)"
            : "none",
          backdropFilter: scrolled ? "blur(12px)" : "none",
        }}
      >
        <div
          className="container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 92,
          }}
        >
          {/* Logo */}
          <Link
            href="/"
            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <Image
              src={logo}
              alt="Ubicar Rent"
              width={1358} height={649}
              // Sin `sizes` pedía el logo a 1920/3840 px para mostrarlo a 163.
              // Y `eager` en vez de precargarlo: la precarga es para la foto
              // del hero, que es el LCP, y el logo le competía.
              sizes="165px"
              loading="eager"
              style={{
                height: 78,
                width: "auto",
                display: "block",
                // Sobre el Hero (fondo azul oscuro) el logo original no se lee.
                // Al scrollear, la barra se vuelve clara y vuelve a su color.
                filter: scrolled ? "none" : "brightness(0) invert(1)",
                transition: "filter 0.25s ease",
              }}
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8 xl:gap-10">
            {navItems.map((item, i) => {
              const isRoute = item.href.startsWith("/") && !item.href.startsWith("/#");
              const textColor = scrolled ? DARK : WHITE;

              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.07, duration: 0.35 }}
                >
                  {isRoute ? (
                    <Link
                      href={item.href}
                      className="relative text-sm font-semibold tracking-wide transition-colors duration-200 group"
                      style={{ color: textColor }}
                    >
                      {item.label}
                      <span
                        className="absolute -bottom-1 left-0 h-[2px] w-0 rounded-full transition-all duration-200 group-hover:w-full"
                        style={{ background: PRIMARY }}
                      />
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleNavClick(item.href)}
                      className="relative text-sm font-semibold tracking-wide transition-colors duration-200 group"
                      style={{ color: textColor }}
                    >
                      {item.label}
                      <span
                        className="absolute -bottom-1 left-0 h-[2px] w-0 rounded-full transition-all duration-200 group-hover:w-full"
                        style={{ background: PRIMARY }}
                      />
                    </button>
                  )}
                </motion.div>
              );
            })}
            {/* El único botón relleno de la barra: desde cualquier punto de
                cualquier página, reservar queda a un clic. Desde `lg`, que es
                donde entra sin apretar el menú. */}
            <button
              onClick={() => irAReservar("header")}
              className="hidden rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7FB3E8] lg:inline-flex"
              style={{ background: PRIMARY }}
            >
              Reservar
            </button>
          </nav>

          {/* Mobile burger */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-200"
            style={{
              color: scrolled ? DARK : WHITE,
              border: scrolled ? `1px solid rgba(27,63,107,0.14)` : "1px solid rgba(255,255,255,0.25)",
              background: "transparent",
            }}
          >
            <Menu size={20} />
          </button>
        </div>
      </motion.header>

      {/* ── Mobile menu ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />

            {/* Sidebar */}
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 240, damping: 30 }}
              className="fixed top-0 right-0 z-[70] h-full w-[82%] max-w-xs flex flex-col md:hidden"
              style={{
                background: WHITE,
                borderLeft: "1px solid rgba(27,63,107,0.09)",
                boxShadow: "-8px 0 40px rgba(27,63,107,0.12)",
              }}
            >
              {/* Sidebar header */}
              <div
                className="flex items-center justify-between px-6 py-5"
                style={{ borderBottom: "1px solid rgba(27,63,107,0.08)" }}
              >
                <Image src={logo} alt="Ubicar Rent" width={1358} height={649} sizes="72px" style={{ height: 34, width: "auto" }} />
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cerrar menú"
                  className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors duration-200"
                  style={{
                    color: DARK,
                    background: "rgba(27,63,107,0.06)",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 px-4 py-4 flex flex-col gap-0.5 overflow-y-auto">
                {navItems.map((item, i) => {
                  const isRoute = item.href.startsWith("/") && !item.href.startsWith("/#");
                  const sharedClass = "w-full text-left px-4 py-3.5 rounded-xl text-[15px] font-semibold transition-colors duration-150";

                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.04 + i * 0.05, duration: 0.28 }}
                    >
                      {isRoute ? (
                        <Link
                          href={item.href}
                          className={sharedClass}
                          style={{ color: DARK, display: "block" }}
                          onClick={() => setMobileOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleNavClick(item.href)}
                          className={sharedClass}
                          style={{ color: DARK }}
                        >
                          {item.label}
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </nav>

              {/* El menú terminaba en "Contacto": ahora cierra con la acción. */}
              <div className="px-6 pb-6 pt-3" style={{ borderTop: "1px solid rgba(27,63,107,0.08)" }}>
                <button
                  onClick={() => irAReservar("menu-mobile")}
                  className="h-[52px] w-full rounded-xl text-[15px] font-bold text-white"
                  style={{ background: PRIMARY }}
                >
                  Ver disponibilidad y precio
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;