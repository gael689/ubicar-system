/**
 * Diseño 2 — "Sidebar Profesional"
 * Columna izquierda azul (#407EC9) con logo, meta-info, pricing y contacto.
 * Columna derecha blanca con todo el contenido narrativo.
 * Estilo consultora / Big 4.
 */
import type { CotizacionData } from '@/types/cotizacion';
import {
  C, CATEGORIA_LABEL, MODALIDAD_LABEL, UNIDAD_LABEL,
  APERTURA_P1, APERTURA_P2, BENEFICIOS, DIFERENCIALES, CONDICIONES,
  fmtDate, fmtPesos, calcTotal, calcDias,
} from './cotizacionUtils';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const SIDEBAR_W = 210;

interface Props { data: CotizacionData }

export function CotizacionPreview2({ data }: Props) {
  const tot  = calcTotal(data);
  const ds   = calcDias(data.fecha_desde, data.fecha_hasta);
  const prec = parseFloat(data.precio) || 0;
  const vehiculo = data.marca && data.modelo
    ? `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`
    : '—';

  const sideLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: C.secondary,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4,
  };
  const sideDivider = () => (
    <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', margin: '12px 0' }} />
  );

  return (
    <div id="cotizacion-preview" style={{ width: 794, fontFamily: FONT, backgroundColor: C.white, color: C.text, lineHeight: 1.5, display: 'flex', flexDirection: 'column' }}>

      {/* ── CUERPO PRINCIPAL: sidebar + contenido ─────────────────────── */}
      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── SIDEBAR AZUL ──────────────────────────────────────────── */}
        <div style={{ width: SIDEBAR_W, backgroundColor: C.primary, padding: '26px 22px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Logo */}
          <img src="/logo.png" alt="Ubicar Rent" style={{ height: 46, width: 'auto', display: 'block', marginBottom: 20, filter: 'brightness(0) invert(1)' }} />

          {/* Cotización meta */}
          <div style={sideLabel}>Propuesta</div>
          <div style={{ color: C.white, fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{data.numero || 'COT-000'}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{fmtDate(data.fecha)}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Válida hasta: {fmtDate(data.validez_hasta)}</div>

          {sideDivider()}

          {/* Cliente */}
          <div style={sideLabel}>Para</div>
          <div style={{ color: C.white, fontSize: 13, fontWeight: 800, lineHeight: 1.3, marginBottom: 4 }}>
            {data.empresa || 'Empresa cliente'}
          </div>
          {data.contacto && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginBottom: 1 }}>Attn: {data.contacto}</div>}
          {data.email    && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{data.email}</div>}

          {sideDivider()}

          {/* Vehículo */}
          <div style={sideLabel}>Vehículo</div>
          <div style={{ color: C.white, fontSize: 11, fontWeight: 700, marginBottom: 1 }}>{CATEGORIA_LABEL[data.categoria]}</div>
          <div style={{ color: C.secondary, fontSize: 13, fontWeight: 900, lineHeight: 1.3 }}>{vehiculo}</div>

          {sideDivider()}

          {/* Inversión */}
          <div style={sideLabel}>Inversión</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginBottom: 2 }}>{MODALIDAD_LABEL[data.modalidad]}</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginBottom: 8 }}>
            {data.fecha_desde && data.fecha_hasta
              ? `${fmtDate(data.fecha_desde)} → ${fmtDate(data.fecha_hasta)}`
              : '—'}
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 2 }}>Total estimado</div>
            <div style={{ color: C.white, fontSize: 22, fontWeight: 900 }}>
              {tot ? `$ ${fmtPesos(tot)}` : '—'}
            </div>
            {prec > 0 && (
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 }}>
                {`$ ${fmtPesos(prec)} / ${UNIDAD_LABEL[data.modalidad]}`}
              </div>
            )}
          </div>

          {sideDivider()}

          {/* Contacto */}
          <div style={sideLabel}>Contacto</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, lineHeight: 1.7 }}>
            <div>+54 9 291 4180554</div>
            <div>+54 9 11 25164791</div>
            <div>ubicar.rent@gmail.com</div>
          </div>
          <div style={{ color: C.secondary, fontSize: 10, fontWeight: 700, marginTop: 5 }}>www.ubicar-rent.com.ar</div>

          {sideDivider()}

          {/* Agente */}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ color: C.white, fontSize: 12, fontWeight: 800 }}>{data.agente || 'Martín González'}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>Agente de alquiler</div>
          </div>
        </div>

        {/* ── CONTENIDO DERECHO ─────────────────────────────────────── */}
        <div style={{ flex: 1, padding: '26px 30px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Apertura */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 5, borderBottom: `2px solid ${C.primary}`, marginBottom: 10 }}>
              Propuesta de movilidad corporativa
            </div>
            <p style={{ margin: '0 0 7px', fontSize: 13, lineHeight: 1.65, color: C.textMid, fontWeight: 500 }}>{APERTURA_P1}</p>
            <p style={{ margin: 0,          fontSize: 13, lineHeight: 1.65, color: C.textMid, fontWeight: 500 }}>{APERTURA_P2}</p>
          </div>

          {/* Qué incluye */}
          <div style={{ marginBottom: 14, padding: '12px 14px', backgroundColor: C.surface, borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
              Qué incluye su cotización
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {BENEFICIOS.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: C.success, fontWeight: 900, fontSize: 13 }}>✓</span>
                  <span style={{ fontWeight: 600, color: C.textMid }}>{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Por qué Ubicar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 5, borderBottom: `2px solid ${C.primary}`, marginBottom: 9 }}>
              Por qué elegir Ubicar Rent
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 16px' }}>
              {DIFERENCIALES.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.primary, minWidth: 20, lineHeight: 1.5 }}>{d.num}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{d.titulo}</div>
                    <div style={{ fontSize: 11, color: C.textLight, lineHeight: 1.4 }}>{d.texto}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Condiciones */}
          <div style={{ padding: '10px 14px', backgroundColor: C.surface, borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1.8, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
              Condiciones
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px' }}>
              {CONDICIONES.map((c, i) => (
                <div key={i} style={{ fontSize: 11 }}>
                  <span style={{ fontWeight: 800, color: C.textMid }}>{c.label}: </span>
                  <span style={{ color: C.textLight }}>{c.value}</span>
                </div>
              ))}
            </div>
            {data.notas && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>
                <strong style={{ color: C.textMid }}>Notas: </strong>{data.notas}
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ marginTop: 14, textAlign: 'center', padding: '14px 0', borderTop: `2px solid ${C.primary}` }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.primary }}>¿Listo para dar el siguiente paso?</div>
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 3 }}>Reserve su unidad hoy y garantice la disponibilidad para la fecha indicada.</div>
          </div>
        </div>
      </div>

      {/* ── FOOTER FULL WIDTH ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: C.dark, padding: '10px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Paraguay 241, Bahía Blanca &nbsp;|&nbsp; Seguí 3607, CABA</div>
        <div style={{ color: C.secondary, fontSize: 10, fontWeight: 700 }}>ubicar-rent.com.ar</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>ubicar.rent@gmail.com</div>
      </div>
    </div>
  );
}
