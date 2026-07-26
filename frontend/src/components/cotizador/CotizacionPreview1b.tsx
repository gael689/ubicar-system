/**
 * Diseño 1b — "Línea Ejecutiva: Columna Azul"
 * Mismo espíritu limpio que Design 1 pero con una franja azul vertical
 * en el margen izquierdo que recorre todo el documento, sección del
 * cliente con fondo, pricing más prominente y footer oscuro premium.
 */
import type { CotizacionData } from '@/types/cotizacion';
import {
  C, CATEGORIA_LABEL, MODALIDAD_LABEL, UNIDAD_LABEL,
  APERTURA_P1, APERTURA_P2, BENEFICIOS, DIFERENCIALES, CONDICIONES,
  fmtDate, fmtPesos, calcTotal, calcDias,
} from './cotizacionUtils';

const FONT  = "'Segoe UI', system-ui, -apple-system, sans-serif";
const NAVY  = '#0d1b2e';
const STRIP = 6; // ancho de la franja lateral azul

interface Props { data: CotizacionData }

export function CotizacionPreview1b({ data }: Props) {
  const tot  = calcTotal(data);
  const ds   = calcDias(data.fecha_desde, data.fecha_hasta);
  const prec = parseFloat(data.precio) || 0;
  const vehiculo = data.marca && data.modelo
    ? `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`
    : '—';

  // Padding izquierdo siempre incluye la franja
  const PL = 44;

  return (
    <div
      id="cotizacion-preview"
      style={{
        width: 794,
        fontFamily: FONT,
        backgroundColor: C.white,
        color: C.text,
        lineHeight: 1.5,
        display: 'flex',
      }}
    >
      {/* ── FRANJA LATERAL AZUL ──────────────────────────────────────── */}
      <div style={{ width: STRIP, backgroundColor: C.primary, flexShrink: 0 }} />

      {/* ── CONTENIDO ────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }}>

        {/* HEADER */}
        <div style={{ padding: `20px ${PL}px 16px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <img src="/logo.png" alt="Ubicar Rent" style={{ height: 52, width: 'auto', display: 'block', marginBottom: 3 }} />
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 2 }}>
              Movilidad Corporativa
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.primary, letterSpacing: 0.3 }}>PROPUESTA COMERCIAL</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMid }}>N° {data.numero || 'COT-000'}</span>
              <span style={{ fontSize: 11, color: C.textLight }}>{fmtDate(data.fecha)}</span>
              <span style={{ fontSize: 11, color: C.textLight }}>Válida hasta: {fmtDate(data.validez_hasta)}</span>
            </div>
          </div>
        </div>

        {/* LÍNEA DOBLE */}
        <div style={{ margin: `0 ${PL}px`, borderTop: `3px solid ${C.primary}`, borderBottom: `1px solid ${C.secondary}`, paddingBottom: 1 }} />

        {/* CLIENTE — con fondo suave */}
        <div style={{ padding: `14px ${PL}px`, backgroundColor: C.surface }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 }}>
            Preparado exclusivamente para
          </div>
          <div style={{ fontSize: 23, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>
            {data.empresa || 'Nombre de la empresa'}
          </div>
          <div style={{ fontSize: 13, color: C.textLight, marginTop: 4, display: 'flex', gap: 16 }}>
            {data.contacto && <span>Attn: <strong style={{ color: C.textMid }}>{data.contacto}</strong></span>}
            {data.email    && <span>{data.email}</span>}
          </div>
        </div>

        {/* LÍNEA */}
        <div style={{ height: 1, backgroundColor: C.border, margin: `0 ${PL}px` }} />

        {/* APERTURA */}
        <div style={{ padding: `14px ${PL}px` }}>
          <p style={{ margin: '0 0 7px', fontSize: 13, lineHeight: 1.7, color: C.textMid, fontWeight: 500 }}>{APERTURA_P1}</p>
          <p style={{ margin: 0,          fontSize: 13, lineHeight: 1.7, color: C.textMid, fontWeight: 500 }}>{APERTURA_P2}</p>
        </div>

        {/* LÍNEA */}
        <div style={{ height: 1, backgroundColor: C.border, margin: `0 ${PL}px` }} />

        {/* VEHÍCULO + INVERSIÓN */}
        <div style={{ padding: `14px ${PL}px`, display: 'flex', gap: 0 }}>
          {/* Vehículo */}
          <div style={{ flex: 1, paddingRight: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
              Vehículo propuesto
            </div>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 3 }}>{CATEGORIA_LABEL[data.categoria]}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{vehiculo}</div>
            {data.fecha_desde && data.fecha_hasta && (
              <div style={{ fontSize: 11, color: C.textLight, marginTop: 6 }}>
                {fmtDate(data.fecha_desde)} — {fmtDate(data.fecha_hasta)}
                {ds > 0 && <span style={{ marginLeft: 8, fontWeight: 600, color: C.textMid }}>({ds} días)</span>}
              </div>
            )}
          </div>

          {/* Inversión — caja prominente */}
          <div style={{ width: 230, flexShrink: 0, backgroundColor: C.surface, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
              Resumen de inversión
            </div>
            <div style={{ fontSize: 12, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>
              {MODALIDAD_LABEL[data.modalidad]}
              {prec > 0 && <span style={{ color: C.textMid }}> · $ {fmtPesos(prec)} / {UNIDAD_LABEL[data.modalidad]}</span>}
            </div>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `2px solid ${C.primary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMid }}>Total estimado</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: C.primary }}>{tot ? `$ ${fmtPesos(tot)}` : '—'}</span>
            </div>
          </div>
        </div>

        {/* QUÉ INCLUYE */}
        <div style={{ padding: `12px ${PL}px`, backgroundColor: C.surface }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
            Qué incluye su cotización
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px 20px' }}>
            {BENEFICIOS.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12 }}>
                <span style={{ color: C.success, fontWeight: 900, fontSize: 13, lineHeight: 1.3, flexShrink: 0 }}>✓</span>
                <span style={{ fontWeight: 600, color: C.textMid, lineHeight: 1.4 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* POR QUÉ UBICAR */}
        <div style={{ padding: `12px ${PL}px` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `2px solid ${C.primary}`, marginBottom: 9 }}>
            Por qué elegir Ubicar Rent
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px' }}>
            {DIFERENCIALES.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.primary, minWidth: 22, lineHeight: 1.5 }}>{d.num}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{d.titulo}</div>
                  <div style={{ fontSize: 11, color: C.textLight, lineHeight: 1.4 }}>{d.texto}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CONDICIONES */}
        <div style={{ padding: `10px ${PL}px`, backgroundColor: C.surface }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
            Condiciones de la propuesta
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 28px' }}>
            {CONDICIONES.map((c, i) => (
              <div key={i} style={{ fontSize: 12 }}>
                <span style={{ fontWeight: 800, color: C.textMid }}>{c.label}: </span>
                <span style={{ color: C.textLight, fontWeight: 500 }}>{c.value}</span>
              </div>
            ))}
          </div>
          {data.notas && (
            <div style={{ marginTop: 7, fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>
              <strong style={{ color: C.textMid }}>Notas: </strong>{data.notas}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ padding: `18px ${PL}px`, backgroundColor: NAVY, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.white, fontSize: 15, fontWeight: 900, marginBottom: 4 }}>¿Listo para dar el siguiente paso?</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 8 }}>Reserve su unidad hoy y garantice la disponibilidad para la fecha indicada.</div>
            <div style={{ color: C.secondary, fontSize: 13, fontWeight: 800 }}>ubicar-rent.com.ar</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 2 }}>+54 9 291 4180554 / +54 9 11 25164791</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 10 }}>ubicar.rent@gmail.com</div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 800 }}>{data.agente || 'Martín González'}</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Agente de alquiler — Ubicar Rent</div>
          </div>
        </div>
      </div>
    </div>
  );
}
