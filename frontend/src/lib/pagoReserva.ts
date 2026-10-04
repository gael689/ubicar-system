import type { PagoPendiente, Reserva } from '@/types';

/**
 * El total real de la reserva.
 *
 * Los adicionales y el late checkout **viven fuera de `precio_total`** (ver
 * `Reserva.total_adicionales` en el backend): un saldo calculado sólo contra
 * `precio_total` cobra de menos, y la diferencia aparece en el mostrador.
 */
export function totalACobrar(r: Pick<Reserva, 'precio_total' | 'cargo_late_checkout' | 'total_adicionales'>): number {
  return (
    Number(r.precio_total ?? 0)
    + Number(r.cargo_late_checkout ?? 0)
    + Number(r.total_adicionales ?? 0)
  );
}

export interface ResumenPago {
  /** `null` cuando no se sabe desde acá (ver `fuente`). */
  total: number | null;
  cobrado: number | null;
  saldo: number | null;
  /** Pagada por completo: se sabe el saldo y es cero. Nunca con saldo > 0. */
  pagado: boolean;
  /**
   * De dónde salen los números:
   * - `reserva`: todavía no hay alquiler; lo cobrado es la seña de la reserva.
   * - `alquiler`: el auto está afuera y el saldo lo calcula el backend (`/pagos/a-cobrar`).
   * - `cuenta_corriente`: no se puede afirmar nada desde la reserva; la verdad
   *   está en la cuenta corriente del cliente.
   */
  fuente: 'reserva' | 'alquiler' | 'cuenta_corriente';
}

/**
 * Cuánto se cobró y cuánto falta, con la misma cuenta en todas las pantallas.
 *
 * **`anticipo_monto` sólo sirve mientras no hay alquiler.** Después, los cobros
 * de la caja (`POST /pagos`), el pago inmediato del check-out y el de una
 * extensión no lo tocan: usarlo mostraba "Sin cobrar" con el alquiler pagado,
 * o "Pagada" al lado de un saldo. Con alquiler, el número sale de lo que el
 * backend calcula para ese alquiler (`cobrables`, de `/pagos/a-cobrar`) y, si
 * no se puede saber, se manda a la cuenta corriente en vez de inventarlo.
 *
 * `cobrables` es la respuesta de `useCobrablesDeCliente`: `undefined` mientras
 * carga (o si no se pidió).
 */
export function resumenPago(r: Reserva, cobrables?: PagoPendiente[]): ResumenPago {
  if (!r.alquiler_id) {
    const total = totalACobrar(r);
    const cobrado = Number(r.anticipo_monto ?? 0);
    const saldo = Math.max(0, total - cobrado);
    return {
      total,
      cobrado,
      saldo,
      // `estado_pago === 'pagado'` ya no alcanza solo: con saldo no está pagada.
      pagado: saldo <= 0 && (total > 0 || r.estado_pago === 'pagado'),
      fuente: 'reserva',
    };
  }
  const desconocido: ResumenPago = { total: null, cobrado: null, saldo: null, pagado: false, fuente: 'cuenta_corriente' };
  // Un alquiler que ya volvió debe (o no) en la cuenta corriente: `/a-cobrar`
  // sólo lista los abiertos.
  if (r.alquiler_estado !== 'activo' || !cobrables) return desconocido;
  const item = cobrables.find(c => c.tipo === 'alquiler_checkout' && c.id_origen === r.alquiler_id);
  if (!item) {
    // `/a-cobrar` lista los alquileres abiertos **con saldo**: si el abierto no
    // está, no debe nada.
    return { total: null, cobrado: null, saldo: 0, pagado: true, fuente: 'alquiler' };
  }
  const saldo = Math.max(0, Number(item.saldo_pendiente));
  return {
    total: Number(item.monto_total),
    cobrado: Number(item.monto_abonado),
    saldo,
    pagado: saldo <= 0,
    fuente: 'alquiler',
  };
}

export const ESTADO_PAGO_LABEL: Record<string, string> = {
  pendiente: 'Sin cobrar',
  anticipo: 'Con seña',
  pagado: 'Pagada',
};

export const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mercado_pago: 'Mercado Pago',
  wapa: 'Wapa',
  otro: 'Otro',
  cheque: 'Cheque',
  echeq: 'E-cheq',
  cuenta_corriente: 'Cuenta corriente',
};
