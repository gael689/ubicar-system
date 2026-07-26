import type { CotizacionData, CategoriaVehiculo, ModalidadCotizacion } from '@/types/cotizacion';

// ─── Paleta Ubicar  70% #FFF  |  20% #407EC9  |  10% #8BB8E8 ─────────────────
const C = {
  primary:    '#407EC9',
  secondary:  '#8BB8E8',
  surface:    '#EEF5FD',
  text:       '#1A2A3A',
  textMid:    '#3d5166',
  textLight:  '#6b7f93',
  success:    '#1a9e4e',
  border:     '#d0e3f5',
  white:      '#ffffff',
};

// ─── Etiquetas ────────────────────────────────────────────────────────────────
const CATEGORIA_LABEL: Record<CategoriaVehiculo, string> = {
  compacto:   'Compacto',
  sedan:      'Sedán',
  suv:        'SUV',
  camioneta:  'Camioneta / Pickup',
  utilitario: 'Utilitario',
};
const MODALIDAD_LABEL: Record<ModalidadCotizacion, string> = {
  diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual',
};
const UNIDAD_LABEL: Record<ModalidadCotizacion, string> = {
  diaria: 'día', semanal: 'semana', mensual: 'mes',
};

// ─── Contenido comercial FIJO ─────────────────────────────────────────────────
const APERTURA_P1 =
  'Cada día que su empresa necesita movilidad y no la tiene de manera confiable, ' +
  'es tiempo y productividad que se pierden. Con Ubicar Rent nos encargamos de que eso no suceda: ' +
  'vehículo disponible, mantenido y listo cuando su equipo lo necesita, sin burocracia de por medio.';

const APERTURA_P2 =
  'A diferencia de las grandes rentadoras, su empresa habla directamente con quien toma decisiones. ' +
  'Sin call centers ni formularios interminables. Una llamada y el tema está resuelto.';

const BENEFICIOS = [
  'Kilometraje ilimitado',
  'Mantenimiento completo a cargo de Ubicar Rent',
  'Asistencia en ruta 24 horas, los 365 días',
  'Unidad entregada con tanque lleno',
  'Seguro todo riesgo incluido',
  'Telepeajes cobrados al costo real al regreso',
];

const DIFERENCIALES = [
  { titulo: 'Sin capital inmovilizado',  texto: 'Gasto operativo 100% deducible. Sin activo fijo que se deprecia.' },
  { titulo: 'Cero trámites',             texto: 'Seguro, VTV, patente y service: todo a cargo de Ubicar Rent.' },
  { titulo: 'Costo predecible',          texto: 'Tarifa fija con ajuste cuatrimestral por IPC. Sin sorpresas de taller.' },
  { titulo: 'Atención directa, sin 0800',texto: 'Contacto con nuestro equipo las 24 horas. Sin esperas.' },
  { titulo: 'Reemplazo garantizado',     texto: 'Ante falla mecánica, gestionamos la sustitución de inmediato.' },
  { titulo: 'Flota moderna',             texto: 'Mantenimiento preventivo al día. Lo mejor de nuestra flota para vos.' },
];

const CONDICIONES = [
  { label: 'Forma de pago',    value: 'Transferencia bancaria antes de la entrega' },
  { label: 'Ajuste de precio', value: 'Cuatrimestral por IPC (contratos de 30+ días)' },
  { label: 'Combustible',      value: 'Entrega tanque lleno — devolución tanque lleno' },
  { label: 'Telepeajes',       value: 'Se cobran al regreso al costo real registrado' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtDate(s: string): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]} ${y}`;
}
function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function dias(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0;
  return Math.max(1, Math.ceil((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1);
}
function total(d: CotizacionData): number {
  const p = parseFloat(d.precio) || 0;
  if (!p) return 0;
  const ds = dias(d.fecha_desde, d.fecha_hasta);
  if (d.modalidad === 'diaria')  return p * ds;
  if (d.modalidad === 'semanal') return p * Math.ceil(ds / 7);
  return p * Math.ceil(ds / 30);
}

// ─── Estilos comunes ──────────────────────────────────────────────────────────
const secTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: C.primary,
  textTransform: 'uppercase',
  letterSpacing: 2,
  paddingBottom: 7,
  borderBottom: `2px solid ${C.primary}`,
  marginBottom: 14,
};

// ─── Componente ───────────────────────────────────────────────────────────────
interface Props { data: CotizacionData }

export function CotizacionPreview({ data }: Props) {
  const tot  = total(data);
  const ds   = dias(data.fecha_desde, data.fecha_hasta);
  const prec = parseFloat(data.precio) || 0;

  return (
    <div
      id="cotizacion-preview"
      style={{
        width: 794,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        backgroundColor: C.white,
        color: C.text,
        lineHeight: 1.55,
      }}
    >

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* HEADER — logo en blanco + info en azul                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', height: 110 }}>
        {/* Logo directo sobre blanco */}
        <div
          style={{
            width: '52%',
            backgroundColor: C.white,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 40,
          }}
        >
          <img src="/logo.png" alt="Ubicar Rent" style={{ height: 60, width: 'auto', display: 'block' }} />
        </div>

        {/* Info propuesta sobre azul */}
        <div
          style={{
            width: '48%',
            backgroundColor: C.primary,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 32px',
          }}
        >
          <div style={{ color: C.white, fontWeight: 800, fontSize: 18, letterSpacing: 0.8 }}>
            PROPUESTA COMERCIAL
          </div>
          <div style={{ color: C.secondary, fontWeight: 600, fontSize: 13, marginTop: 6 }}>
            N° {data.numero || 'COT-000'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3 }}>
            Bahía Blanca, {fmtDate(data.fecha)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 }}>
            Válida hasta el {fmtDate(data.validez_hasta)}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CLIENTE                                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          padding: '18px 40px',
          borderLeft: `6px solid ${C.primary}`,
          backgroundColor: C.surface,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.primary,
            textTransform: 'uppercase',
            letterSpacing: 2,
            marginBottom: 6,
          }}
        >
          Propuesta preparada para:
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: C.text }}>
          {data.empresa || 'Nombre de la empresa'}
        </div>
        {(data.contacto || data.email) && (
          <div style={{ fontSize: 13, color: C.textMid, marginTop: 5, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {data.contacto && <span>Attn: <strong>{data.contacto}</strong></span>}
            {data.email    && <span>✉ {data.email}</span>}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* FRASE GANCHO                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          padding: '20px 40px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          gap: 18,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: 5,
            flexShrink: 0,
            alignSelf: 'stretch',
            backgroundColor: C.secondary,
            borderRadius: 3,
          }}
        />
        <div>
          <p style={{ fontSize: 14, margin: '0 0 9px', lineHeight: 1.7, color: C.text, fontWeight: 500 }}>
            {APERTURA_P1}
          </p>
          <p style={{ fontSize: 14, margin: 0, lineHeight: 1.7, color: C.text, fontWeight: 500 }}>
            {APERTURA_P2}
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VEHÍCULO  +  RESUMEN DE INVERSIÓN                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          padding: '18px 40px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          gap: 22,
          alignItems: 'flex-start',
        }}
      >
        {/* Vehículo */}
        <div style={{ flex: 1 }}>
          <div style={secTitle}>Vehículo propuesto</div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ color: C.textLight, paddingBottom: 7, width: 100, fontWeight: 600 }}>Categoría</td>
                <td style={{ fontWeight: 700, color: C.text }}>{CATEGORIA_LABEL[data.categoria]}</td>
              </tr>
              <tr>
                <td style={{ color: C.textLight, paddingBottom: 2, fontWeight: 600 }}>Vehículo</td>
                <td style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>
                  {data.marca && data.modelo
                    ? `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pricing */}
        <div
          style={{
            flex: 1,
            backgroundColor: C.surface,
            borderRadius: 10,
            padding: '15px 18px',
            border: `2px solid ${C.primary}`,
          }}
        >
          <div style={secTitle}>Resumen de inversión</div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ color: C.textLight, paddingBottom: 6, fontWeight: 600 }}>Modalidad</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{MODALIDAD_LABEL[data.modalidad]}</td>
              </tr>
              <tr>
                <td style={{ color: C.textLight, paddingBottom: 6, fontWeight: 600 }}>
                  Tarifa por {UNIDAD_LABEL[data.modalidad]}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {prec ? `$ ${fmtPesos(prec)}` : '—'}
                </td>
              </tr>
              <tr>
                <td style={{ color: C.textLight, paddingBottom: 6, fontWeight: 600 }}>Período</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>
                  {data.fecha_desde && data.fecha_hasta
                    ? `${fmtDate(data.fecha_desde)} – ${fmtDate(data.fecha_hasta)}`
                    : '—'}
                </td>
              </tr>
              {ds > 0 && (
                <tr>
                  <td style={{ color: C.textLight, paddingBottom: 6, fontWeight: 600 }}>Días del período</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{ds} días</td>
                </tr>
              )}
            </tbody>
          </table>
          <div
            style={{
              borderTop: `2px solid ${C.primary}`,
              marginTop: 8,
              paddingTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>TOTAL ESTIMADO</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: C.primary }}>
              {tot ? `$ ${fmtPesos(tot)}` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* QUÉ INCLUYE                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          padding: '18px 40px',
          backgroundColor: C.surface,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={secTitle}>Qué incluye su cotización</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
          {BENEFICIOS.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  minWidth: 20,
                  backgroundColor: C.success,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <span style={{ color: C.white, fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>
              </div>
              <span style={{ fontWeight: 600, color: C.textMid }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* POR QUÉ ELEGIR UBICAR                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '18px 40px', borderTop: `1px solid ${C.border}` }}>
        <div style={secTitle}>Por qué elegir Ubicar Rent</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 22px' }}>
          {DIFERENCIALES.map((d, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                backgroundColor: C.surface,
                borderRadius: 8,
                padding: '11px 13px',
                border: `1px solid ${C.border}`,
              }}
            >
              {/* Círculo numerado */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  minWidth: 26,
                  minHeight: 26,
                  borderRadius: 13,
                  backgroundColor: C.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <span
                  style={{
                    color: C.white,
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: '26px',
                    display: 'block',
                    textAlign: 'center',
                    width: '100%',
                  }}
                >
                  {i + 1}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.primary, marginBottom: 3 }}>
                  {d.titulo}
                </div>
                <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{d.texto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CONDICIONES                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          padding: '16px 40px',
          backgroundColor: C.surface,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={secTitle}>Condiciones de la propuesta</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 28px' }}>
          {CONDICIONES.map((c, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 800, color: C.primary }}>{c.label}: </span>
              <span style={{ color: C.textMid, fontWeight: 500 }}>{c.value}</span>
            </div>
          ))}
        </div>
        {data.notas && (
          <div
            style={{
              marginTop: 11,
              fontSize: 13,
              color: C.textLight,
              paddingTop: 10,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <strong style={{ color: C.textMid }}>Notas: </strong>{data.notas}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* FOOTER / CTA                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          backgroundColor: C.primary,
          padding: '22px 40px',
          borderTop: `4px solid ${C.secondary}`,
        }}
      >
        {/* CTA */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ color: C.white, fontSize: 18, fontWeight: 900, letterSpacing: 0.3, marginBottom: 5 }}>
            ¿Listo para dar el siguiente paso?
          </div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500 }}>
            Reserve su unidad hoy y garantice la disponibilidad para la fecha indicada.
          </div>
        </div>

        {/* Contacto */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 36,
            marginBottom: 16,
          }}
        >
          {[
            '📞 +54 9 291 4180554',
            '📞 +54 9 11 25164791',
            '✉ ubicar.rent@gmail.com',
          ].map((item, i) => (
            <span key={i} style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>
              {item}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 13 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ color: C.secondary, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                🌐 www.ubicar-rent.com.ar
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                Paraguay 241, Bahía Blanca &nbsp;|&nbsp; Seguí 3607, CABA
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 14 }}>
                {data.agente || 'Martín González'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500 }}>
                Agente de alquiler — Ubicar Rent
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
