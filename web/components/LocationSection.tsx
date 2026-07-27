"use client";

import { useEffect, useRef, useState } from "react";
import ScrollReveal from "@/components/ScrollReveal";

// ─── Paleta de marca ──────────────────────────────────────────────────────────
// 70% #FFFFFF · 20% #407EC9 · 10% #8BB8E8  |  Pin oscuro: #1B3F6B

const C = {
  white: "#FFFFFF",
  primary: "#407EC9",
  light: "#8BB8E8",
  dark: "#1B3F6B",
  mid: "#2D5FA8",
  bg: "#F5F9FE",
  border: "#D3E8F8",
  text: "#1B2D45",
  muted: "#6285A8",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveryPoint {
  id: string;
  label: string;
  sublabel?: string;
  lat: number;
  lng: number;
  icon: "car" | "plane" | "city";
  zoom: number;
  description: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const DELIVERY_POINTS: DeliveryPoint[] = [
  {
    id: "paraguay",
    label: "Paraguay 241",
    sublabel: "Punto de entrega · Centro",
    lat: -38.7099,
    lng: -62.2705,
    icon: "car",
    zoom: 15,
    description: "Punto principal de entrega y devolución en el centro de Bahía Blanca.",
  },
  {
    id: "alsina",
    label: "Alsina 350",
    sublabel: "Punto de entrega · Centro",
    lat: -38.7154,
    lng: -62.2612,
    icon: "car",
    zoom: 15,
    description: "Segundo punto de entrega y devolución, fácil acceso y estacionamiento.",
  },
  {
    id: "aeropuerto",
    label: "Aeropuerto Espora",
    sublabel: "Terminal de vuelos",
    lat: -38.7162,
    lng: -62.165,
    icon: "plane",
    zoom: 14,
    description: "Pick-up y drop-off en el Aeropuerto Comandante Espora.",
  },
  {
    id: "caba",
    label: "Capital Federal",
    sublabel: "Juan Francisco Seguí 3607",
    lat: -34.578688,
    lng: -58.409437,
    icon: "city",
    zoom: 17,
    description: "Presencia en Buenos Aires para más destinos del país.",
  },
];

// Polígono de zona de cobertura — cubre todas las localidades listadas
// incluye Tres Arroyos (-38.376, -60.275) y Pigüé (-37.6, -62.4)
const COVERAGE_ZONE: [number, number][] = [
  [-37.45, -62.55], // norte-noroeste (sobre Pigüé)
  [-37.45, -61.8], // norte
  [-37.55, -61.0], // noreste
  [-37.9, -60.1], // este (envuelve Tres Arroyos por el norte)
  [-38.2, -59.9], // este profundo
  [-38.5, -60.0], // sureste (Tres Arroyos queda adentro)
  [-38.85, -60.5], // sureste medio
  [-39.2, -61.0], // sur
  [-39.4, -61.6], // sur-suroeste
  [-39.5, -62.3], // suroeste
  [-39.4, -63.1], // oeste-sur
  [-39.1, -63.7], // oeste
  [-38.7, -63.95], // oeste-noroeste
  [-38.2, -63.8], // noroeste
  [-37.85, -63.3], // noroeste medio
  [-37.6, -63.0], // norte-oeste (cerca Médanos/oeste)
  [-37.45, -62.55], // cierre
];

// Pueblos con etiqueta permanente en modo "ver zona"
const NEARBY_TOWNS = [
  { name: "Punta Alta", lat: -38.875, lng: -62.073 },
  { name: "Monte Hermoso", lat: -38.987, lng: -61.297 },
  { name: "Cnel. Rosales", lat: -38.895, lng: -62.01 },
  { name: "Médanos", lat: -38.833, lng: -62.7 },
  { name: "Cnel. Dorrego", lat: -38.717, lng: -61.283 },
  { name: "Pigüé", lat: -37.6, lng: -62.4 },
  { name: "Tornquist", lat: -38.1, lng: -62.22 },
  { name: "Tres Arroyos", lat: -38.376, lng: -60.275 },
  { name: "Ing. White", lat: -38.782, lng: -62.265 },
  { name: "Gral. Cerri", lat: -38.735, lng: -62.408 },
];

// Lista completa para leyenda del panel de zona
const COVERAGE_LIST = [
  "Punta Alta", "Monte Hermoso", "Coronel Rosales",
  "Médanos", "Coronel Dorrego", "Pigüé",
  "Tornquist", "Tres Arroyos", "Ingeniero White",
  "Gral. Cerri", "Villarino", "Bahía Blanca y zona",
];

// Centro y zoom para mostrar toda la zona de cobertura expandida
const ZONE_CENTER: [number, number] = [-38.5, -61.9];
const ZONE_ZOOM = 8;

// ─── Pin idéntico al de Google Maps ──────────────────────────────────────────
// Forma exacta: teardrop con cabeza circular, punta hacia abajo, punto blanco pequeño central
function makeGooglePin(active: boolean): string {
  const fill = active ? C.dark : C.light;
  const w = active ? 34 : 27;
  const h = active ? 48 : 38;

  // Viewbox canónico 27x38.
  const vw = 27;
  const vh = 38;
  const cx = 13.5;  // Centro horizontal
  const cy = 12.5;  // Bajamos el centro (antes 11) para que no corte arriba
  const r = 10.5;   // Radio exterior reducido (antes 14) para que no corte a los lados

  // Path ajustado para mantenerse siempre dentro de los límites 0-27 y 0-38
  const d = [
    `M ${cx} ${vh}`,                                                // Punta inferior
    `C ${cx - 2} ${vh - 5}, ${cx - r} ${cy + r + 2}, ${cx - r} ${cy}`,  // Curva lado izquierdo
    `A ${r} ${r} 0 1 1 ${cx + r} ${cy}`,                            // Arco superior (cabeza)
    `C ${cx + r} ${cy + r + 2}, ${cx + 2} ${vh - 5}, ${cx} ${vh}`,      // Curva lado derecho
    "Z",
  ].join(" ");

  // Ajustamos el radio del punto blanco proporcionalmente
  const innerR = 3.8;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">
  <defs>
    <filter id="gps${active ? 1 : 0}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${active ? 2.5 : 1.5}" stdDeviation="${active ? 2.5 : 1.5}"
        flood-color="#000" flood-opacity="${active ? 0.38 : 0.22}"/>
    </filter>
  </defs>
  <path d="${d}" fill="${fill}" filter="url(#gps${active ? 1 : 0})"/>
  <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="white" opacity="0.95"/>
</svg>`;
}

function svgUrl(s: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}

// ─── Sidebar icons ────────────────────────────────────────────────────────────

const IconCar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h11l4 4v4a2 2 0 0 1-2 2h-1" />
    <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
  </svg>
);
const IconPlane = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-1-5.5.5L10 6 1.8 4.2a.5.5 0 0 0-.5.8L7 11l-4 4-1-1-1 3 3-1-1-1 4-4 5.2 5.7a.5.5 0 0 0 .8-.5z" />
  </svg>
);
const IconCity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="22" x2="21" y2="22" />
    <line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" />
    <line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" />
    <polygon points="12 2 20 7 4 7" />
  </svg>
);
const IconMapPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PointIcon = ({ type }: { type: string }) => {
  if (type === "plane") return <IconPlane />;
  if (type === "city") return <IconCity />;
  return <IconCar />;
};

// ─── Componente principal ─────────────────────────────────────────────────────

const LocationSection = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const mapObjRef = useRef<any>(null);
  const townLayersRef = useRef<any[]>([]);
  const coverageRef = useRef<any>(null);

  const [active, setActive] = useState("paraguay");
  const [mapReady, setMapReady] = useState(false);
  const [zoneMode, setZoneMode] = useState(false); // true = vista zona expandida

  // ── Cargar Leaflet ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!document.getElementById("leaflet-css")) {
      const link = Object.assign(document.createElement("link"), {
        id: "leaflet-css", rel: "stylesheet",
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      });
      document.head.appendChild(link);
    }

    const boot = (L: any) => {
      if (!mapRef.current || mapObjRef.current) return;
      leafletRef.current = L;

      const map = L.map(mapRef.current, {
        center: [-38.72, -62.27], zoom: 11,
        zoomControl: false, attributionControl: false,
      });
      mapObjRef.current = map;

      // Tile CartoDB Positron – limpio, respira bien con paleta blanca
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19,
      }).addTo(map);

      L.control.attribution({ prefix: false })
        .addAttribution('© <a href="https://carto.com" target="_blank">CARTO</a>')
        .addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Zona de cobertura (oculta por defecto, visible en zoneMode)
      const poly = L.polygon(COVERAGE_ZONE, {
        color: C.primary, weight: 2.5, dashArray: "8 5",
        fillColor: C.light, fillOpacity: 0.18,
      });
      coverageRef.current = poly;

      // Pueblos con tooltip permanente (ocultos por defecto, visibles en zoneMode)
      NEARBY_TOWNS.forEach(t => {
        const dot = L.circleMarker([t.lat, t.lng], {
          radius: 5.5, color: C.dark, weight: 1.5,
          fillColor: C.light, fillOpacity: 0.9,
        });
        dot.bindTooltip(t.name, {
          permanent: true, direction: "top",
          className: "ubicar-town", offset: [0, -9],
        });
        townLayersRef.current.push(dot);
      });

      // Marcadores principales – pin estilo Google Maps
      DELIVERY_POINTS.forEach(pt => {
        const isA = pt.id === "paraguay";
        const pin = makeGooglePin(isA);
        const w = isA ? 34 : 27;
        const h = isA ? 48 : 38;
        const marker = L.marker([pt.lat, pt.lng], {
          icon: L.icon({ iconUrl: svgUrl(pin), iconSize: [w, h], iconAnchor: [w / 2, h] }),
          title: pt.label,
        }).addTo(map).on("click", () => handleSelect(pt.id));
        markersRef.current.push({ id: pt.id, marker, pt });
      });

      setMapReady(true);
    };

    if ((window as any).L) { boot((window as any).L); return; }
    const script = Object.assign(document.createElement("script"), {
      src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
      onload: () => boot((window as any).L),
    });
    document.head.appendChild(script);

    return () => { mapObjRef.current?.remove(); mapObjRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Seleccionar punto ─────────────────────────────────────────────────────
  function handleSelect(id: string) {
    const L = leafletRef.current;
    if (!L || !mapObjRef.current) return;

    // Si estaba en zoneMode, salir de él primero
    if (zoneMode) exitZoneMode(false);

    setActive(id);
    const found = markersRef.current.find(m => m.id === id);
    if (!found) return;

    mapObjRef.current.flyTo([found.pt.lat, found.pt.lng], found.pt.zoom, {
      animate: true, duration: 1.1,
    });

    markersRef.current.forEach(({ id: mid, marker, pt }) => {
      const now = mid === id;
      const pin = makeGooglePin(now);
      const w = now ? 34 : 27;
      const h = now ? 48 : 38;
      marker.setIcon(L.icon({ iconUrl: svgUrl(pin), iconSize: [w, h], iconAnchor: [w / 2, h] }));
      marker.setZIndexOffset(now ? 1000 : 0);
    });
  }

  useEffect(() => { if (mapReady) handleSelect(active); }, [mapReady]); // eslint-disable-line

  // ── Entrar en modo zona ───────────────────────────────────────────────────
  function enterZoneMode() {
    const map = mapObjRef.current;
    if (!map || !coverageRef.current) return;

    // Mostrar polígono y pueblos
    coverageRef.current.addTo(map);
    townLayersRef.current.forEach(l => l.addTo(map));

    // Todos los marcadores al estado inactivo
    const L = leafletRef.current;
    markersRef.current.forEach(({ marker, pt }) => {
      const pin = makeGooglePin(false);
      marker.setIcon(L.icon({ iconUrl: svgUrl(pin), iconSize: [27, 38], iconAnchor: [13.5, 38] }));
      marker.setZIndexOffset(0);
    });

    // Volar a la vista de zona completa
    map.flyTo(ZONE_CENTER, ZONE_ZOOM, { animate: true, duration: 1.2 });
    setZoneMode(true);
  }

  // ── Salir de modo zona ────────────────────────────────────────────────────
  function exitZoneMode(restoreView = true) {
    const map = mapObjRef.current;
    if (!map) return;

    // Ocultar polígono y pueblos
    if (coverageRef.current) map.removeLayer(coverageRef.current);
    townLayersRef.current.forEach(l => map.removeLayer(l));

    setZoneMode(false);

    if (restoreView) {
      // Volver al punto activo
      const found = markersRef.current.find(m => m.id === active);
      if (found) {
        const L = leafletRef.current;
        markersRef.current.forEach(({ id: mid, marker, pt }) => {
          const now = mid === active;
          const pin = makeGooglePin(now);
          const w = now ? 34 : 27; const h = now ? 48 : 38;
          marker.setIcon(L.icon({ iconUrl: svgUrl(pin), iconSize: [w, h], iconAnchor: [w / 2, h] }));
          marker.setZIndexOffset(now ? 1000 : 0);
        });
        map.flyTo([found.pt.lat, found.pt.lng], found.pt.zoom, { animate: true, duration: 1.1 });
      }
    }
  }

  const activePoint = DELIVERY_POINTS.find(p => p.id === active)!;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <section id="ubicacion" className="py-24 md:py-32 bg-white overflow-hidden">
      <style>{`
        .ubicar-town {
          background: ${C.dark} !important; border: none !important;
          color: #fff !important; font-size: 10px !important;
          font-weight: 700 !important; letter-spacing: 0.04em !important;
          padding: 2px 8px !important; border-radius: 4px !important;
          box-shadow: 0 2px 6px rgba(27,63,107,0.4) !important;
          white-space: nowrap !important;
        }
        .ubicar-town::before { display: none !important; }
        .leaflet-control-zoom a {
          background: ${C.dark} !important; color: #fff !important;
          border: none !important; font-size: 17px !important; line-height: 28px !important;
        }
        .leaflet-control-zoom a:hover { background: ${C.primary} !important; }
        .leaflet-control-attribution {
          font-size: 9px !important; background: rgba(255,255,255,0.8) !important;
        }
      `}</style>

      <div className="container">

        {/* Encabezado */}
        <ScrollReveal>
          <div className="text-center mb-3">
            <span className="inline-block text-[12px] font-bold tracking-[0.2em] uppercase mb-4"
              style={{ color: C.primary }}>
              Puntos de entrega
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-[3rem] font-bold"
              style={{ color: C.text }}>
              Dónde encontrarnos
            </h2>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <p className="text-center text-base max-w-xl mx-auto mt-3 mb-12"
            style={{ color: C.muted }}>
            Seleccioná un punto de entrega para verlo en el mapa, o consultá nuestra zona de cobertura en toda la región.
          </p>
        </ScrollReveal>

        {/* ── Card principal ──────────────────────────────────────────────── */}
        <ScrollReveal delay={120}>
          <div className="grid grid-cols-1 lg:grid-cols-[296px_1fr] rounded-2xl overflow-hidden shadow-2xl"
            style={{ border: `1.5px solid ${C.border}`, minHeight: 560 }}>

            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <aside className="flex flex-col bg-white"
              style={{ borderRight: `1.5px solid ${C.border}` }}>

              {/* Header */}
              <div className="px-5 py-4 flex items-center gap-2"
                style={{ borderBottom: `1px solid ${C.border}` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="10" r="3" fill={C.primary} />
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s-7.75-7-7-13c0-3.87 3.13-7 7-7z"
                    fill="none" stroke={C.dark} strokeWidth="2" />
                  <path d="M12 2C15.87 2 19 5.13 19 9c0 5.25-7 13-7 13"
                    fill="none" stroke={C.dark} strokeWidth="2" />
                </svg>
                <span className="text-sm font-bold tracking-wide" style={{ color: C.text }}>
                  Puntos de entrega
                </span>
              </div>

              {/* Lista de puntos */}
              <ul className="py-1">
                {DELIVERY_POINTS.map(pt => {
                  const isA = pt.id === active && !zoneMode;
                  return (
                    <li key={pt.id}>
                      <button
                        onClick={() => handleSelect(pt.id)}
                        className="w-full text-left px-5 py-3.5 flex items-center gap-3 transition-all duration-200"
                        style={{
                          background: isA ? `${C.primary}12` : "transparent",
                          borderLeft: `3px solid ${isA ? C.primary : "transparent"}`,
                        }}
                      >
                        <span style={{ color: isA ? C.primary : C.muted }} className="shrink-0 transition-colors duration-200">
                          <PointIcon type={pt.icon} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight truncate transition-colors duration-200"
                            style={{ color: isA ? C.dark : C.text }}>
                            {pt.label}
                          </p>
                          {pt.sublabel && (
                            <p className="text-[11px] mt-0.5 transition-colors duration-200"
                              style={{ color: isA ? C.primary : C.muted }}>
                              {pt.sublabel}
                            </p>
                          )}
                        </div>
                        {isA && (
                          <span style={{ color: C.primary }}>
                            <IconChevronRight />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Separador */}
              <div style={{ borderTop: `1px solid ${C.border}` }} />

              {/* ── Bloque zona de entrega ──────────────────────────────────── */}
              <div className="px-5 py-4 flex-1 flex flex-col justify-between">

                {/* Botón principal "Ver zonas de entrega" */}
                {!zoneMode ? (
                  <button
                    onClick={enterZoneMode}
                    className="w-full flex items-center justify-center gap-2.5 rounded-xl px-2 py-3 font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                    style={{ background: C.primary, boxShadow: `0 4px 14px ${C.primary}55` }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                      stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    <span className="text-[12px]">Zonas de entregas fuera de Bahía Blanca</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                ) : (
                  /* Panel expandido de zona */
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                          style={{ background: `${C.primary}18` }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke={C.primary} strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: C.dark }}>
                          Zona de entrega
                        </span>
                      </div>
                      <button
                        onClick={() => exitZoneMode(true)}
                        className="flex items-center gap-1 text-[10px] font-medium rounded-lg px-2 py-1 transition-all duration-200"
                        style={{ background: `${C.border}88`, color: C.muted }}
                      >
                        <IconX /> Cerrar
                      </button>
                    </div>

                    <p className="text-[11.5px] leading-relaxed" style={{ color: C.muted }}>
                      Entregamos en Bahía Blanca y más de{" "}
                      <span style={{ color: C.dark, fontWeight: 600 }}>10 localidades</span>{" "}
                      de la región. El mapa muestra el área completa de cobertura.
                    </p>
                  </div>
                )}
              </div>

              {/* Info del punto activo (solo cuando NO estamos en zoneMode) */}
              {!zoneMode && (
                <div className="mx-4 mb-4 px-4 py-3 rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${C.primary}12, ${C.light}20)`,
                    border: `1px solid ${C.primary}25`,
                  }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: C.primary }}>
                    {activePoint.sublabel ?? activePoint.label}
                  </p>
                  <p className="text-[11px] leading-relaxed" style={{ color: C.muted }}>
                    {activePoint.description}
                  </p>
                </div>
              )}
            </aside>

            {/* ── Mapa ───────────────────────────────────────────────────────── */}
            <div className="relative" style={{ background: C.bg }}>
              <div ref={mapRef} className="w-full h-full" style={{ minHeight: 560 }} />

              {/* Banner "modo zona" flotante sobre el mapa */}
              {mapReady && zoneMode && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400]">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-white text-xs font-semibold"
                    style={{ background: C.dark, border: `1px solid ${C.primary}` }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke={C.light} strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    Zona de cobertura Bahía Blanca y alrededores
                  </div>
                </div>
              )}

              {/* Leyenda flotante */}
              {mapReady && (
                <div className="absolute top-3 right-3 z-[400] pointer-events-none">
                  <div className="px-3 py-2.5 rounded-xl shadow-md flex flex-col gap-2"
                    style={{
                      background: "rgba(255,255,255,0.93)",
                      backdropFilter: "blur(8px)",
                      border: `1px solid ${C.border}`,
                    }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: C.muted }}>Referencia</p>

                    {zoneMode && (
                      <div className="flex items-center gap-2">
                        <svg width="22" height="6" viewBox="0 0 22 6">
                          <line x1="0" y1="3" x2="22" y2="3" stroke={C.primary}
                            strokeWidth="2" strokeDasharray="6 4" />
                        </svg>
                        <span className="text-[10px]" style={{ color: C.text }}>Zona de entrega</span>
                      </div>
                    )}
                    {zoneMode && (
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: C.light, border: `1.5px solid ${C.dark}`, display: "inline-block" }} />
                        <span className="text-[10px]" style={{ color: C.text }}>Localidades</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {/* Mini pin estilo Google */}
                      <svg width="11" height="16" viewBox="0 0 27 38">
                        <path d="M13.5 38 C11 33, 2.5 24, 2.5 13.5 A11 11 0 1 1 24.5 13.5 C24.5 24, 16 33, 13.5 38Z"
                          fill={C.primary} />
                        <circle cx="13.5" cy="13.5" r="4.5" fill="white" opacity="0.95" />
                      </svg>
                      <span className="text-[10px]" style={{ color: C.text }}>Punto de entrega</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Watermark */}
              <div className="absolute bottom-3 left-3 z-[400] pointer-events-none">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-sm"
                  style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(6px)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="10" r="3" fill={C.primary} />
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                      fill="none" stroke={C.dark} strokeWidth="2" />
                  </svg>
                  <span className="text-[10px] font-extrabold" style={{ color: C.dark }}>
                    ubi<span style={{ color: C.primary }}>car</span>
                  </span>
                  <span className="text-[10px]" style={{ color: C.muted }}>rent</span>
                </div>
              </div>

              {/* Loading */}
              {!mapReady && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center"
                  style={{ background: C.bg }}>
                  <div className="flex flex-col items-center gap-3">
                    <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke={C.border} strokeWidth="3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke={C.primary}
                        strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    <p className="text-xs font-medium" style={{ color: C.primary }}>Cargando mapa…</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollReveal>

        {/* Footer */}
        <ScrollReveal delay={200}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm"
            style={{ color: C.muted }}>
            <div className="flex items-center gap-2">
              <svg width="10" height="14" viewBox="0 0 27 38">
                <path d="M13.5 38 C11 33, 2.5 24, 2.5 13.5 A11 11 0 1 1 24.5 13.5 C24.5 24, 16 33, 13.5 38Z"
                  fill={C.primary} />
                <circle cx="13.5" cy="13.5" r="4.5" fill="white" opacity="0.95" />
              </svg>
              <span>4 puntos de entrega, consultá puntos diferentes</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="6" viewBox="0 0 20 6">
                <line x1="0" y1="3" x2="20" y2="3" stroke={C.primary}
                  strokeWidth="2" strokeDasharray="6 4" />
              </svg>
              <span>Cobertura extendida +80 km a la redonda</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default LocationSection;