/**
 * Diseño 3 — "Bloques Modernos" (estética Blanco Premium)
 * Multi-ítem por categoría. Fondo blanco, bordes azul claro.
 */
import type { CotizacionData, ItemCotizacion } from '@/types/cotizacion';
import {
  C, MODALIDAD_LABEL,
  fmtDate, fmtPesos, calcGranTotal, precioPorDia, itemLabel,
} from './cotizacionUtils';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}logo.png`;

const BENEFICIOS_3 = [
  'Asistencia en ruta',
  'Seguro con franquicia',
  'Km según contrato',
  'Mantenimiento a cargo de Ubicar Rent',
  'Telepeajes: Consultar disponibilidad',
];

const DIFERENCIALES_3 = [
  { num: '01', titulo: 'Sin capital inmovilizado', texto: 'Gasto operativo 100 % deducible. Sin activo fijo que se deprecia.' },
  { num: '02', titulo: 'Flota moderna',            texto: 'Mantenimiento preventivo al día. Siempre lo mejor para vos.' },
  { num: '03', titulo: 'Costo predecible',         texto: 'Tarifa fija mensual. Sin costos variables ni sorpresas en la liquidación.' },
];

const CONDICIONES_3 = [
  { label: 'Forma de pago',    value: 'Efectivo, transferencia, echeq, consultar otras' },
  { label: 'Combustible',      value: 'El tanque se devuelve como se entregó' },
  { label: 'Ajuste de precio', value: 'Según contrato' },
];

interface Props { data: CotizacionData }

// ── Tarjeta individual por ítem ───────────────────────────────────────────────
function ItemCard({ item }: { item: ItemCotizacion }) {
  const ppd = precioPorDia(item);

  return (
    <div style={{
      border: `1.5px solid ${C.secondary}`,
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      minHeight: 100,
    }}>
      {/* IZQUIERDA — categoría, modalidad, fechas */}
      <div style={{
        flex: '0 0 44%',
        padding: '11px 18px',
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 }}>
          {item.unidad ? 'Unidad' : 'Categoría'}
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.primary, lineHeight: 1.1, marginBottom: 7 }}>
          {itemLabel(item)}
        </div>
        <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600 }}>
          {MODALIDAD_LABEL[item.modalidad]}{item.dias > 0 ? ` · ${item.dias} días` : ''}
        </div>
        {item.fecha_desde && item.fecha_hasta && (
          <div style={{ fontSize: 10, color: C.textLight, marginTop: 3 }}>
            {fmtDate(item.fecha_desde)} — {fmtDate(item.fecha_hasta)}
          </div>
        )}
      </div>

      {/* DERECHA — precio por día + inversión total */}
      <div style={{
        flex: 1,
        padding: '11px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {ppd !== null && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 3 }}>
                Precio por día
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.textMid }}>
                $ {fmtPesos(ppd)}
              </div>
            </div>
            <div style={{ height: 1, backgroundColor: C.border, marginBottom: 10 }} />
          </>
        )}
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
            Inversión total
          </div>
          <div style={{ fontSize: 38, fontWeight: 900, color: C.primary, lineHeight: 1, paddingBottom: 6 }}>
            {item.precio_total ? `$ ${fmtPesos(item.precio_total)}` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fila de total combinado (solo si hay más de 1 ítem) ───────────────────────
function TotalCombinado({ items }: { items: ItemCotizacion[] }) {
  const gran = calcGranTotal(items);
  return (
    <div style={{
      border: `1.5px solid ${C.secondary}`,
      borderRadius: 10,
      overflow: 'hidden',
      marginTop: 6,
      backgroundColor: '#EEF5FD',
    }}>
      <div style={{ padding: '10px 20px' }}>
        {/* Líneas por ítem */}
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: C.textMid, fontWeight: 500 }}>
              {itemLabel(item)}
              <span style={{ color: C.textLight, marginLeft: 8 }}>
                {MODALIDAD_LABEL[item.modalidad]}{item.dias > 0 ? ` · ${item.dias} días` : ''}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              $ {fmtPesos(item.precio_total)}
            </div>
          </div>
        ))}

        {/* Separador */}
        <div style={{ height: 1, backgroundColor: C.border, margin: '10px 0' }} />

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.primary, textTransform: 'uppercase', letterSpacing: 2 }}>
            Inversión total
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, color: C.primary, lineHeight: 1, paddingBottom: 5 }}>
            $ {fmtPesos(gran)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function CotizacionPreview3({ data }: Props) {
  const numeroDisplay = (data.numero || 'COT-000').replace(/^COT-/, '');
  const items = data.items ?? [];

  return (
    <div id="cotizacion-preview" style={{ width: 794, fontFamily: FONT, backgroundColor: C.white, color: C.text, lineHeight: 1.5 }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <div style={{ backgroundColor: C.primary, padding: '16px 40px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <img src={LOGO} alt="Ubicar Rent" style={{ height: 64, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
          <div style={{ textAlign: 'right', color: C.white }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>N° Presupuesto {numeroDisplay}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 3 }}>
              {fmtDate(data.fecha)} — Válida hasta {fmtDate(data.validez_hasta)}
            </div>
          </div>
        </div>
      </div>

      {/* ══ PREPARADO PARA ══════════════════════════════════════════════ */}
      <div style={{ backgroundColor: C.white, padding: '11px 40px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 }}>
          Preparado para
        </div>
        <div style={{ color: C.text, fontSize: 23, fontWeight: 900 }}>
          {data.empresa || 'Nombre de la empresa'}
        </div>
      </div>

      {/* ══ ÍTEMS ════════════════════════════════════════════════════════ */}
      <div style={{ padding: '10px 40px', backgroundColor: C.white }}>
        {items.length === 0 ? (
          <div style={{ color: C.textLight, fontSize: 13, textAlign: 'center', padding: '30px 0', border: `1.5px dashed ${C.border}`, borderRadius: 12 }}>
            Agregá al menos un vehículo para ver la cotización
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => <ItemCard key={item.id} item={item} />)}
            {/* El total se suma **sólo si lo pidieron**. Cuando la cotización
                es un abanico de opciones para que el cliente elija una, la
                suma informa un número que nadie va a pagar. */}
            {items.length > 1 && data.mostrar_total !== false && (
              <TotalCombinado items={items} />
            )}
          </div>
        )}
      </div>

      {/* ══ NOTA ════════════════════════════════════════════════════════ */}
      {data.notas && (
        <div style={{ padding: '9px 40px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, backgroundColor: '#FFFBEE' }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: C.primary }}>Nota: </span>
          <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{data.notas}</span>
        </div>
      )}

      {/* ══ QUÉ INCLUYE ═════════════════════════════════════════════════ */}
      <div style={{ padding: '10px 40px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `2px solid ${C.primary}`, marginBottom: 8 }}>
          Qué incluye su cotización
        </div>
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 0, justifyContent: 'space-between' }}>
          {BENEFICIOS_3.map((b, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 11, paddingRight: i < BENEFICIOS_3.length - 1 ? 10 : 0 }}>
              <span style={{ color: C.success, fontWeight: 900, fontSize: 12, lineHeight: 1.3, flexShrink: 0 }}>✓</span>
              <span style={{ fontWeight: 600, color: C.textMid, lineHeight: 1.35 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ POR QUÉ UBICAR ══════════════════════════════════════════════ */}
      <div style={{ padding: '10px 40px', backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `2px solid ${C.primary}`, marginBottom: 7 }}>
          Por qué elegir Ubicar Rent
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px' }}>
          {DIFERENCIALES_3.map((d, i) => (
            <div key={i} style={{ padding: '7px 10px', backgroundColor: C.white, borderRadius: 7, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.primary, lineHeight: 1 }}>{d.num}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{d.titulo}</span>
              </div>
              <div style={{ fontSize: 10, color: C.textLight, lineHeight: 1.4 }}>{d.texto}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ CONDICIONES ═════════════════════════════════════════════════ */}
      <div style={{ padding: '9px 40px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 2, paddingBottom: 5, borderBottom: `1px solid ${C.border}`, marginBottom: 7 }}>
          Condiciones
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {CONDICIONES_3.map((c, i) => (
            <div key={i} style={{ flex: 1, fontSize: 12, paddingRight: i < CONDICIONES_3.length - 1 ? 16 : 0, borderRight: i < CONDICIONES_3.length - 1 ? `1px solid ${C.border}` : 'none', marginRight: i < CONDICIONES_3.length - 1 ? 16 : 0 }}>
              <span style={{ fontWeight: 800, color: C.textMid }}>{c.label}: </span>
              <span style={{ color: C.textLight, fontWeight: 500 }}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <div style={{ backgroundColor: C.primary, padding: '15px 40px' }}>
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
            <div style={{ color: C.white, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              www.ubicar-rent.com.ar
            </div>
            <div style={{ color: C.white, fontSize: 15, fontWeight: 900, marginBottom: 2 }}>
              {data.agente || 'Martín González'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
              Agente de alquiler — Ubicar Rent
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
