/**
 * Diseño 1 — "Línea Ejecutiva"
 * Todo blanco. Logo top-left sin contenedor. Líneas azules como único elemento de color.
 * Estilo firma contable / legal.
 */
import type { CotizacionData } from '@/types/cotizacion';
import {
  C, CATEGORIA_LABEL, MODALIDAD_LABEL, UNIDAD_LABEL,
  APERTURA_P1, APERTURA_P2, BENEFICIOS, DIFERENCIALES, CONDICIONES,
  fmtDate, fmtPesos, calcTotal, calcDias,
} from './cotizacionUtils';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

interface Props { data: CotizacionData }

export function CotizacionPreview1({ data }: Props) {
  const tot  = calcTotal(data);
  const ds   = calcDias(data.fecha_desde, data.fecha_hasta);
  const prec = parseFloat(data.precio) || 0;
  const vehiculo = data.marca && data.modelo
    ? `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`
    : '—';

  return (
    <div id="cotizacion-preview" style={{ width: 794, fontFamily: FONT, backgroundColor: C.white, color: C.text, lineHeight: 1.5 }}>

      {/* ── BORDE SUPERIOR AZUL ───────────────────────────────────────── */}
      <div style={{ height: 5, backgroundColor: C.primary }} />

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div style={{ padding: '22px 44px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: C.white }}>
        <img src="/logo.png" alt="Ubicar Rent" style={{ height: 54, width: 'auto', display: 'block' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.primary, letterSpacing: 0.5 }}>PROPUESTA COMERCIAL</div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 4, display: 'flex', gap: 18, justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 600, color: C.textMid }}>N° {data.numero || 'COT-000'}</span>
            <span>Bahía Blanca, {fmtDate(data.fecha)}</span>
            <span>Válida hasta el {fmtDate(data.validez_hasta)}</span>
          </div>
        </div>
      </div>

      {/* ── LÍNEA DIVISORA ───────────────────────────────────────────── */}
      <div style={{ height: 2, backgroundColor: C.primary, margin: '0 44px' }} />

      {/* ── CLIENTE ──────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 5 }}>Preparado para</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>{data.empresa || 'Nombre de la empresa'}</div>
          <div style={{ fontSize: 13, color: C.textLight, marginTop: 3, display: 'flex', gap: 14 }}>
            {data.contacto && <span>Attn: <strong style={{ color: C.textMid }}>{data.contacto}</strong></span>}
            {data.email    && <span>{data.email}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: C.textLight, fontSize: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.primary }}>
            {prec ? `$ ${fmtPesos(prec)} / ${UNIDAD_LABEL[data.modalidad]}` : '—'}
          </div>
          <div style={{ marginTop: 2 }}>{MODALIDAD_LABEL[data.modalidad]}</div>
        </div>
      </div>

      {/* ── LÍNEA ──────────────────────────────────────────────────────── */}
      <div style={{ height: 1, backgroundColor: C.border, margin: '0 44px' }} />

      {/* ── APERTURA ─────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 44px', display: 'flex', gap: 16 }}>
        <div style={{ width: 4, flexShrink: 0, borderRadius: 3, backgroundColor: C.secondary, alignSelf: 'stretch' }} />
        <div>
          <p style={{ margin: '0 0 7px', fontSize: 13, lineHeight: 1.7, color: C.textMid, fontWeight: 500 }}>{APERTURA_P1}</p>
          <p style={{ margin: 0,          fontSize: 13, lineHeight: 1.7, color: C.textMid, fontWeight: 500 }}>{APERTURA_P2}</p>
        </div>
      </div>

      {/* ── LÍNEA ──────────────────────────────────────────────────────── */}
      <div style={{ height: 1, backgroundColor: C.border, margin: '0 44px' }} />

      {/* ── VEHÍCULO + INVERSIÓN ─────────────────────────────────────── */}
      <div style={{ padding: '16px 44px', display: 'flex', gap: 28 }}>
        {/* Vehículo */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
            Vehículo propuesto
          </div>
          <div style={{ fontSize: 12, color: C.textLight, fontWeight: 600, marginBottom: 3 }}>{CATEGORIA_LABEL[data.categoria]}</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>{vehiculo}</div>
        </div>

        {/* Separador vertical */}
        <div style={{ width: 1, backgroundColor: C.border }} />

        {/* Inversión */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
            Resumen de inversión
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <div>
              <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>Tarifa</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{prec ? `$ ${fmtPesos(prec)}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>Período</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textMid }}>{ds > 0 ? `${ds} días` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>Total estimado</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.primary }}>{tot ? `$ ${fmtPesos(tot)}` : '—'}</div>
            </div>
          </div>
          {data.fecha_desde && data.fecha_hasta && (
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>
              {fmtDate(data.fecha_desde)} — {fmtDate(data.fecha_hasta)}
            </div>
          )}
        </div>
      </div>

      {/* ── QUÉ INCLUYE ──────────────────────────────────────────────── */}
      <div style={{ padding: '14px 44px', backgroundColor: C.surface }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
          Qué incluye su cotización
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 32px' }}>
          {BENEFICIOS.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: C.success, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>✓</span>
              <span style={{ fontWeight: 600, color: C.textMid }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── POR QUÉ UBICAR ────────────────────────────────────────────── */}
      <div style={{ padding: '14px 44px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
          Por qué elegir Ubicar Rent
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
          {DIFERENCIALES.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: C.primary, minWidth: 22, lineHeight: 1.6 }}>{d.num}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{d.titulo}</div>
                <div style={{ fontSize: 11, color: C.textLight, lineHeight: 1.4 }}>{d.texto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CONDICIONES ───────────────────────────────────────────────── */}
      <div style={{ padding: '12px 44px', backgroundColor: C.surface }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
          Condiciones
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 32px' }}>
          {CONDICIONES.map((c, i) => (
            <div key={i} style={{ fontSize: 12 }}>
              <span style={{ fontWeight: 800, color: C.textMid }}>{c.label}: </span>
              <span style={{ color: C.textLight, fontWeight: 500 }}>{c.value}</span>
            </div>
          ))}
        </div>
        {data.notas && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>
            <strong style={{ color: C.textMid }}>Notas: </strong>{data.notas}
          </div>
        )}
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <div style={{ padding: '18px 44px', backgroundColor: '#0d1b2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: C.white, fontSize: 15, fontWeight: 900, marginBottom: 4 }}>¿Listo para avanzar?</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginBottom: 8 }}>Reserve hoy y garantice la disponibilidad para la fecha indicada.</div>
          <div style={{ color: C.secondary, fontSize: 13, fontWeight: 800, letterSpacing: 0.3 }}>ubicar-rent.com.ar</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 2 }}>+54 9 291 4180554 / +54 9 11 25164791</div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 10 }}>ubicar.rent@gmail.com</div>
          <div style={{ color: C.white, fontSize: 13, fontWeight: 800 }}>{data.agente || 'Martín González'}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Agente de alquiler — Ubicar Rent</div>
        </div>
      </div>
    </div>
  );
}
