/**
 * Una sola lista de medios de pago, y el cobro manual sin los dos que se
 * contaban mal: el echeq (se carga desde Echeqs, que ya le asienta el crédito
 * al cliente) y la cuenta corriente (no es plata que entró).
 */
import { describe, expect, it } from 'vitest';
import { MEDIOS_COBRO_MANUAL, MEDIOS_PAGO, etiquetaMedio } from './mediosPago';

describe('medios de pago', () => {
  it('la lista completa incluye Mercado Pago, que faltaba en las tres copias viejas', () => {
    expect(MEDIOS_PAGO).toContain('mercado_pago');
    expect(new Set(MEDIOS_PAGO).size).toBe(MEDIOS_PAGO.length);
  });

  it('el cobro manual no ofrece echeq ni cuenta corriente', () => {
    expect(MEDIOS_COBRO_MANUAL).not.toContain('echeq');
    expect(MEDIOS_COBRO_MANUAL).not.toContain('cuenta_corriente');
    expect(MEDIOS_COBRO_MANUAL).toContain('efectivo');
  });

  it('cada medio tiene su nombre para mostrar', () => {
    for (const m of MEDIOS_PAGO) expect(etiquetaMedio(m)).not.toBe(m);
  });
});
