/**
 * Los medios de pago, en una sola lista.
 *
 * Estaban copiados en la caja, en cobros y en los pendientes, cada copia un
 * poco distinta y las tres sin Mercado Pago: filtrar los cobros por ese medio
 * no se podía, aunque la web cobra por ahí. Si el backend suma un medio
 * (`models/pago.py`), se agrega acá y listo.
 */
import { METODO_PAGO_LABEL } from '@/lib/constants';
import type { MetodoPago } from '@/types';

/** Todos los medios con que puede quedar registrado un cobro. */
export const MEDIOS_PAGO: MetodoPago[] = [
  'efectivo',
  'transferencia',
  'tarjeta',
  'mercado_pago',
  'cheque',
  'echeq',
  'wapa',
  'otro',
  'cuenta_corriente',
];

/**
 * Lo que **no es plata que entró**. "Cuenta corriente" quiere decir "se lo
 * anotamos": no suma a los ingresos ni cancela deuda (mismo criterio que
 * `caja_service.MEDIOS_QUE_NO_SON_PLATA` en el backend).
 */
export const MEDIOS_QUE_NO_SON_PLATA: MetodoPago[] = ['cuenta_corriente'];

/**
 * Los medios para cobrar plata a mano desde Finanzas (la caja y los cobros
 * pendientes). Quedan afuera:
 *
 * - `echeq`: un echeq se carga desde la pestaña Echeqs, que ya le asienta su
 *   crédito al cliente. Cargarlo además acá como cobro lo contaba dos veces.
 * - `cuenta_corriente`: no es plata. Para dejar algo "a cuenta" no hay que
 *   cobrar nada: la deuda ya está en la cuenta del cliente.
 */
export const MEDIOS_COBRO_MANUAL: MetodoPago[] = MEDIOS_PAGO.filter(
  m => m !== 'echeq' && !MEDIOS_QUE_NO_SON_PLATA.includes(m),
);

export function etiquetaMedio(medio: string): string {
  return METODO_PAGO_LABEL[medio] ?? medio;
}

/** `{ value, label }` para un `<select>`. */
export function opcionesDeMedio(medios: MetodoPago[] = MEDIOS_PAGO) {
  return medios.map(value => ({ value, label: etiquetaMedio(value) }));
}
