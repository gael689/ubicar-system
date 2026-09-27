import type { Reserva } from '@/types';

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
  total: number;
  cobrado: number;
  saldo: number;
  /** Pagada por completo: hay total y lo cobrado lo cubre. */
  pagado: boolean;
}

/**
 * Cuánto se cobró y cuánto falta, con la misma cuenta en todas las pantallas.
 *
 * `anticipo_monto` es lo cobrado de la reserva (el backend lo mantiene
 * sincronizado con los créditos, ver `ReservaService.registrar_cobro`).
 */
export function resumenPago(r: Reserva): ResumenPago {
  const total = totalACobrar(r);
  const cobrado = Number(r.anticipo_monto ?? 0);
  const saldo = Math.max(0, total - cobrado);
  return {
    total,
    cobrado,
    saldo,
    pagado: (total > 0 && saldo <= 0) || r.estado_pago === 'pagado',
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
  cheque: 'Cheque',
  echeq: 'E-cheq',
  cuenta_corriente: 'Cuenta corriente',
};
