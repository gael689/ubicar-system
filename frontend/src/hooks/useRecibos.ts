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

export function useCrearRecibo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReciboCreate) => api.post<{ data: Recibo }>('/recibos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
    },
  });
}

export function useAnularRecibo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<{ data: Recibo }>(`/recibos/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
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
