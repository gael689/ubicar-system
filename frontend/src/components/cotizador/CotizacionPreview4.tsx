/**
 * Diseño 4 — "Blanco Premium"
 * Paleta 70% blanco / 20% azul marca / 10% azul claro.
 * Sección de vehículo: contenedor único con imagen genérica por categoría.
 */
import type { CotizacionData } from '@/types/cotizacion';
import {
  C, CATEGORIA_LABEL, MODALIDAD_LABEL, UNIDAD_LABEL,
  fmtDate, fmtPesos, calcTotal, calcDias,
} from './cotizacionUtils';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

/** Imagen genérica (sin logotipo) según categoría */
const VEHICLE_IMG: Record<string, string> = {
  compacto:  '/img/compacto.jpg',
  sedan:     '/img/sedan.jpg',
  sedan_sup: '/img/sedan-sup.jpg',
  suv:       '/img/suv.jpg',
  camioneta: '/img/pickup.jpg',
  utilitario:'/img/pickup.jpg',
};

const BENEFICIOS_4 = [
  'Asistencia en ruta',
  'Seguro con franquicia',
  'Km según contrato',
  'Mantenimiento completo a cargo de Ubicar Rent',
  'Telepeajes: Consultar disponibilidad',
];

const DIFERENCIALES_4 = [
  { num: '01', titulo: 'Sin capital inmovilizado', texto: 'Gasto operativo 100 % deducible. Sin activo fijo que se deprecia.' },
  { num: '02', titulo: 'Flota moderna',            texto: 'Mantenimiento preventivo al día. Siempre lo mejor para vos.' },
  { num: '03', titulo: 'Costo predecible',         texto: 'Sin ajuste cuatrimestral por IPC.' },
];

const CONDICIONES_4 = [
  { label: 'Forma de pago',    value: 'Efectivo, transferencia, echeq, consultar otras' },
  { label: 'Combustible',      value: 'El tanque se devuelve como se entregó' },
  { label: 'Ajuste de precio', value: 'Según contrato' },
];

interface Props { data: CotizacionData }

export function CotizacionPreview4({ data }: Props) {
  const tot  = calcTotal(data);
  const ds   = calcDias(data.fecha_desde, data.fecha_hasta);
  const prec = parseFloat(data.precio) || 0;
  const vehiculo = data.marca && data.modelo
    ? `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`
    : '—';
  const numeroDisplay = (data.numero || 'COT-000').replace(/^COT-/, '');
  const vehiculoImg = VEHICLE_IMG[data.categoria] ?? '/img/sedan.svg';

  return (
    <div id="cotizacion-preview" style={{ width: 794, fontFamily: FONT, backgroundColor: C.white, color: C.text, lineHeight: 1.5 }}>

      {/* ══ HEADER — idéntico al modelo 3 ══════════════════════════════ */}
      <div style={{ backgroundColor: C.primary, padding: '22px 40px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <img src="/logo.png" alt="Ubicar Rent" style={{ height: 76, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
          <div style={{ textAlign: 'right', color: C.white }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>N° Presupuesto {numeroDisplay}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 3 }}>{fmtDate(data.fecha)} — Válida hasta {fmtDate(data.validez_hasta)}</div>
          </div>
        </div>
      </div>

      {/* ══ PREPARADO PARA — fondo blanco ══════════════════════════════ */}
      <div style={{ backgroundColor: C.white, padding: '14px 40px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Preparado para</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: C.text, fontSize: 20, fontWeight: 900 }}>{data.empresa || 'Nombre de la empresa'}</div>
          <div style={{ textAlign: 'right', fontSize: 11, color: C.textMid }}>
            {data.contacto && <div>Attn: <strong style={{ color: C.text }}>{data.contacto}</strong></div>}
            {data.email    && <div>{data.email}</div>}
          </div>
        </div>
      </div>

      {/* ══ CONTENEDOR ÚNICO ════════════════════════════════════════════ */}
      <div style={{ padding: '20px 40px 16px', backgroundColor: C.white }}>
        <div style={{ border: `1.5px solid ${C.secondary}`, borderRadius: 12, overflow: 'hidden' }}>

          {/* FILA SUPERIOR: info vehículo (izq) | foto vehículo (der) */}
          <div style={{ display: 'flex', minHeight: 195 }}>

            {/* IZQUIERDA — datos */}
            <div style={{
              flex: '0 0 42%',
              padding: '22px 26px',
              borderRight: `1px solid ${C.border}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>
                Vehículo propuesto
              </div>
              <div style={{ fontSize: 12, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>
                {CATEGORIA_LABEL[data.categoria]}
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: C.primary, lineHeight: 1.15 }}>
                {vehiculo}
              </div>
              {ds > 0 && (
                <div style={{ marginTop: 14, fontSize: 12, color: C.textLight }}>
                  {MODALIDAD_LABEL[data.modalidad]} · {ds} días
                </div>
              )}
              {data.fecha_desde && data.fecha_hasta && (
                <div style={{ fontSize: 11, color: C.textLight, marginTop: 3 }}>
                  {fmtDate(data.fecha_desde)} — {fmtDate(data.fecha_hasta)}
                </div>
              )}
            </div>

            {/* DERECHA — foto realista del vehículo */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 20px',
              backgroundColor: '#F8FAFC',
            }}>
              <img
                src={vehiculoImg}
                alt={CATEGORIA_LABEL[data.categoria]}
                style={{ maxHeight: 155, maxWidth: '100%', objectFit: 'contain', display: 'block' }}
              />
            </div>
          </div>

          {/* FILA INFERIOR: precio a todo lo ancho */}
          <div style={{
            borderTop: `1.5px solid ${C.secondary}`,
            padding: '16px 30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: C.white,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 2 }}>
              Inversión total
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
              <div style={{ fontSize: 54, fontWeight: 900, color: C.primary, lineHeight: 1 }}>
                {tot ? `$ ${fmtPesos(tot)}` : '—'}
              </div>
              {prec > 0 && (
                <div style={{ fontSize: 14, color: C.textLight }}>
                  {`$ ${fmtPesos(prec)} / ${UNIDAD_LABEL[data.modalidad]}`}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ══ NOTA ════════════════════════════════════════════════════════ */}
      <div style={{ padding: '13px 40px', borderTop: `1.5px solid ${C.secondary}`, borderBottom: `1px solid ${C.border}`, backgroundColor: C.white }}>
        <span style={{ fontWeight: 900, fontSize: 15, color: C.primary }}>Nota: </span>
        <span style={{ fontSize: 14, color: C.textMid, fontWeight: 500 }}>{data.notas}</span>
      </div>

      {/* ══ QUÉ INCLUYE ═════════════════════════════════════════════════ */}
      <div style={{ padding: '14px 40px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 7, borderBottom: `2px solid ${C.primary}`, marginBottom: 12 }}>
          Qué incluye su cotización
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 0', justifyContent: 'center' }}>
          {BENEFICIOS_4.map((b, i) => (
            <div key={i} style={{ width: 'calc(33.333% - 1px)', display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, paddingRight: 12 }}>
              <span style={{ color: C.success, fontWeight: 900, fontSize: 13, lineHeight: 1.3, flexShrink: 0 }}>✓</span>
              <span style={{ fontWeight: 600, color: C.textMid, lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ POR QUÉ UBICAR ══════════════════════════════════════════════ */}
      <div style={{ padding: '14px 40px', backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 7, borderBottom: `2px solid ${C.primary}`, marginBottom: 10 }}>
          Por qué elegir Ubicar Rent
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 18px' }}>
          {DIFERENCIALES_4.map((d, i) => (
            <div key={i} style={{ padding: '10px 12px', backgroundColor: C.white, borderRadius: 7, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: C.primary, lineHeight: 1 }}>{d.num}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{d.titulo}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textLight, lineHeight: 1.45 }}>{d.texto}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ CONDICIONES ═════════════════════════════════════════════════ */}
      <div style={{ padding: '12px 40px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
          Condiciones
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {CONDICIONES_4.map((c, i) => (
            <div key={i} style={{ flex: 1, fontSize: 12, paddingRight: i < CONDICIONES_4.length - 1 ? 16 : 0, borderRight: i < CONDICIONES_4.length - 1 ? `1px solid ${C.border}` : 'none', marginRight: i < CONDICIONES_4.length - 1 ? 16 : 0 }}>
              <span style={{ fontWeight: 800, color: C.textMid }}>{c.label}: </span>
              <span style={{ color: C.textLight, fontWeight: 500 }}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <div style={{ backgroundColor: C.primary, padding: '20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 900, marginBottom: 4 }}>¿Listo para dar el siguiente paso?</div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12 }}>Reserve hoy y garantice la unidad para la fecha indicada.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 18px', marginTop: 9 }}>
              <span style={{ color: C.white, fontSize: 11 }}>📞 +54 9 291 4180554 (Bahía Blanca)</span>
              <span style={{ color: C.white, fontSize: 11 }}>📞 +54 9 11 5264791 (CABA)</span>
              <span style={{ color: C.white, fontSize: 11 }}>✉ ubicar.rent@gmail.com</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <img src="/logo.png" alt="Ubicar Rent" style={{ height: 40, width: 'auto', display: 'block', marginLeft: 'auto', marginBottom: 8, filter: 'brightness(0) invert(1)' }} />
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginBottom: 2 }}>www.ubicar-rent.com.ar</div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 800 }}>{data.agente || 'Martín González'}</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Agente de alquiler — Ubicar Rent</div>
          </div>
        </div>
      </div>
    </div>
  );
}
