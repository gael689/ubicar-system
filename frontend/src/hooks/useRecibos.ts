import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Recibo, ReciboCreate } from '@/types';

const KEY = 'recibos';

export function useRecibosCliente(clienteId: number | undefined) {
  return useQuery({
    queryKey: [KEY, 'cliente', clienteId],
    queryFn: async () => {
      const res = await api.get<{ data: Recibo[]; total: number }>('/recibos', {
        params: { cliente_id: clienteId, page_size: 100 },
      });
      return res.data.data;
    },
    enabled: !!clienteId,
  });
}

/**
 * Cobrar y documentar en una acción: el backend crea el `Pago` (que genera el
 * crédito en la cuenta corriente) y su recibo. Por eso invalida también caja y
 * pagos: el cobro aparece en el arqueo del día.
 */
export function useCrearRecibo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReciboCreate) => api.post<{ data: Recibo }>('/recibos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
      qc.invalidateQueries({ queryKey: ['pagos'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

/**
 * El recibo de un cobro que ya se registró. **No mueve plata** — el crédito lo
 * generó el pago cuando se creó, así que el saldo no cambia.
 */
export function useEmitirReciboDePago() {
  const qc = useQueryClient();
  return useMutation({
    // `concepto` opcional: sin él, el backend lo arma con los datos del cobro.
    // Es lo que permite que el botón del listado sea un solo click.
    mutationFn: ({ pagoId, concepto }: { pagoId: number; concepto?: string }) =>
      api.post<{ data: Recibo }>(`/pagos/${pagoId}/recibo`, { concepto: concepto ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['pagos'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

/**
 * Anula el papel, no el cobro. Si además hay que revertir la plata, se elimina
 * el `Pago` — que es donde vive el asiento.
 */
export function useAnularRecibo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<{ data: Recibo }>(`/recibos/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
      qc.invalidateQueries({ queryKey: ['pagos'] });
    },
  });
}

/** Descarga el PDF autenticado (blob) y dispara la descarga en el navegador. */
export async function descargarPdfRecibo(recibo: Recibo): Promise<void> {
  const res = await api.get(`/recibos/${recibo.id}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `recibo_${recibo.prefijo}-${String(recibo.numero).padStart(5, '0')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
