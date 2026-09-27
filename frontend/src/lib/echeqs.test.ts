import { describe, expect, it } from 'vitest';
import { ordenarEcheqs, seccionesEcheqs } from './echeqs';
import type { Echeq } from '@/types';

function echeq(id: number, extra: Partial<Echeq>): Echeq {
  return {
    id, tipo: 'recibido', monto: '1000', fecha_emision: '2026-09-01', fecha_cobro: '2026-10-15',
    fecha_acreditacion: null, estado: 'en_cartera', contraparte: `e${id}`, banco: 'Galicia',
    numero_cheque: '1', cliente_id: null, proveedor_nombre: null, motivo_rechazo: null,
    reserva_id: null, alquiler_id: null, gasto_id: null, cuenta_corriente_id: null,
    movimiento_cc_id: null, notas: null, activo: true, creado_por: null,
    created_at: '2026-09-01T00:00:00', datos_completos: true, ...extra,
  };
}

const HOY = '2026-09-27';

describe('echeqs en orden de trabajo', () => {
  it('pone primero los incompletos, después cartera por vencimiento, y los cerrados al final', () => {
    const lista = [
      echeq(1, { estado: 'cobrado', fecha_cobro: '2026-08-01' }),
      echeq(2, { estado: 'depositado' }),
      echeq(3, { fecha_cobro: '2026-11-01' }),
      echeq(4, { fecha_cobro: '2026-10-01' }),
      echeq(5, { datos_completos: false, fecha_cobro: null }),
      echeq(6, { estado: 'endosado' }),
    ];
    expect(ordenarEcheqs(lista).map(e => e.id)).toEqual([5, 4, 3, 2, 6, 1]);
  });

  it('reparte en secciones con su total', () => {
    const lista = [
      echeq(1, { fecha_cobro: '2026-09-20', monto: '100' }),   // vencido
      echeq(2, { fecha_cobro: '2026-09-30', monto: '200' }),   // próximos 7 días
      echeq(3, { fecha_cobro: '2026-09-27', monto: '50' }),    // hoy: próximos
      echeq(4, { fecha_cobro: '2026-12-01', monto: '300' }),   // cartera
      echeq(5, { estado: 'depositado', monto: '400' }),
      echeq(6, { estado: 'rechazado', monto: '500' }),
    ];
    const s = Object.fromEntries(seccionesEcheqs(lista, HOY).map(x => [x.clave, x]));
    expect(s.vencidos.echeqs.map(e => e.id)).toEqual([1]);
    expect(s.proximos.echeqs.map(e => e.id)).toEqual([3, 2]);
    expect(s.proximos.total).toBe(250);
    expect(s.cartera.echeqs.map(e => e.id)).toEqual([4]);
    expect(s.depositados.total).toBe(400);
    expect(s.cerrados.echeqs.map(e => e.id)).toEqual([6]);
  });
});
