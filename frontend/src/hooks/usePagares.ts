import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { Pagare, PagarePreparado, PersonaPagare } from '@/types';

const KEY = 'pagares';

const avisar = (porDefecto: string) => (err: unknown) =>
  toast.error(extractError(err) || porDefecto);

/**
 * Lo precargado para emitir el pagaré: el monto sugerido (el valor del
 * alquiler), el deudor, las tasas de Configuración y qué falta para poder.
 */
export function usePrepararPagare(reservaId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'preparar', reservaId],
    queryFn: async () => {
      const res = await api.get<{ data: PagarePreparado }>(`/pagares/preparar/${reservaId}`);
      return res.data.data;
    },
    enabled: !!reservaId && enabled,
  });
}

/** El pagaré vigente de una reserva, o `null`. */
export function usePagareDeReserva(reservaId: number | undefined) {
  return useQuery({
    queryKey: [KEY, 'reserva', reservaId],
    queryFn: async () => {
      const res = await api.get<{ data: Pagare[] }>('/pagares', { params: { reserva_id: reservaId } });
      return res.data.data.find(p => !p.anulado) ?? null;
    },
    enabled: !!reservaId,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [KEY] });
    // El link y el estado "falta firmar" del contrato dependen del pagaré.
    qc.invalidateQueries({ queryKey: ['contratos'] });
  };
}

export interface PagareNuevo {
  reserva_id: number;
  monto: number;
  codeudores: PersonaPagare[];
}

export function useCrearPagare() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (payload: PagareNuevo) => {
      const res = await api.post<{ data: Pagare }>('/pagares', payload);
      return res.data.data;
    },
    onSuccess: invalidar,
  });
}

export function useAnularPagare() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<{ data: Pagare }>(`/pagares/${id}/anular`, { motivo }),
    onSuccess: invalidar,
    onError: avisar('No pudimos anular la franquicia.'),
  });
}

export function useSubirEscaneoPagare() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, archivo }: { id: number; archivo: File }) => {
      const form = new FormData();
      form.append('archivo', archivo);
      return api.post<{ data: Pagare }>(`/pagares/${id}/escaneo`, form);
    },
    onSuccess: invalidar,
    onError: avisar('No pudimos subir la franquicia firmada.'),
  });
}

export async function descargarPdfPagare(pagare: Pagare): Promise<void> {
  const res = await api.get(`/pagares/${pagare.id}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `pagare_${pagare.numero_formateado}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function verEscaneoPagare(pagare: Pagare): Promise<void> {
  const res = await api.get(`/pagares/${pagare.id}/escaneo`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}
