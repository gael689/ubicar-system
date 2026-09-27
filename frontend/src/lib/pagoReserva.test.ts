/**
 * El resumen de pago: `anticipo_monto` vale sólo mientras no hay alquiler.
 * Después, los cobros de la caja, del check-out y de la extensión no lo tocan,
 * y la pantalla decía "Sin cobrar" con el alquiler pagado.
 */
import { describe, it, expect } from 'vitest';
import { resumenPago } from './pagoReserva';

const base: any = {
  id: 9, cliente_id: 3, precio_total: '100000', total_adicionales: '20000', cargo_late_checkout: '0',
  estado_pago: 'anticipo', anticipo_monto: '30000', alquiler_id: null, alquiler_estado: null,
};

describe('resumenPago', () => {
  it('sin alquiler, lo cobrado es la seña de la reserva', () => {
    expect(resumenPago(base)).toEqual({ total: 120000, cobrado: 30000, saldo: 90000, pagado: false, fuente: 'reserva' });
  });

  it('nunca dice pagada con saldo, aunque estado_pago diga "pagado"', () => {
    expect(resumenPago({ ...base, estado_pago: 'pagado' }).pagado).toBe(false);
  });

  it('con el auto afuera, el saldo sale de lo que calcula el backend', () => {
    const r = { ...base, alquiler_id: 5, alquiler_estado: 'activo' };
    const cobrables: any[] = [
      { tipo: 'alquiler_checkout', id_origen: 5, monto_total: 150000, monto_abonado: 150000 - 10000, saldo_pendiente: 10000 },
    ];
    expect(resumenPago(r, cobrables)).toMatchObject({ total: 150000, cobrado: 140000, saldo: 10000, pagado: false, fuente: 'alquiler' });
  });

  it('con el auto afuera y sin saldo en /a-cobrar, no debe nada', () => {
    const r = { ...base, alquiler_id: 5, alquiler_estado: 'activo' };
    expect(resumenPago(r, [])).toMatchObject({ saldo: 0, pagado: true, fuente: 'alquiler' });
  });

  it('mientras carga, o con el alquiler ya devuelto, no afirma nada', () => {
    expect(resumenPago({ ...base, alquiler_id: 5, alquiler_estado: 'activo' })).toMatchObject({ saldo: null, pagado: false, fuente: 'cuenta_corriente' });
    expect(resumenPago({ ...base, alquiler_id: 5, alquiler_estado: 'finalizado' }, [])).toMatchObject({ fuente: 'cuenta_corriente' });
  });
});
