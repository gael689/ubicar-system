import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Contrato, ContratoPreparado, ContratoSnapshot, ContratoPlantilla } from '@/types';

const KEY = 'contratos';

/**
 * El anverso precargado y editable. No persiste nada — lo que el operador
 * corrija acá es lo que después se congela en el snapshot del contrato.
 */
export function usePrepararContrato(reservaId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'preparar', reservaId],
    queryFn: async () => {
      const res = await api.get<{ data: ContratoPreparado }>(`/contratos/preparar/${reservaId}`);
      return res.data.data;
    },
    enabled: !!reservaId && enabled,
  });
}

/**
 * El contrato de una reserva.
 *
 * Cuelga de la reserva y no del alquiler: el contrato se puede emitir al
 * reservar, mucho antes de que el auto salga.
 */
export function useContratoDeReserva(reservaId: number | undefined) {
  return useQuery({
    queryKey: [KEY, 'reserva', reservaId],
    queryFn: async () => {
      const res = await api.get<{ data: Contrato[] }>('/contratos', {
        params: { reserva_id: reservaId },
      });
      return res.data.data.find(c => !c.anulado) ?? null;
    },
    enabled: !!reservaId,
  });
}

export function useCrearContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { reserva_id: number; snapshot: ContratoSnapshot }) =>
      api.post<{ data: Contrato }>('/contratos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['alquileres'] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}

/**
 * Firma ológrafa digitalizada, no firma digital con certificado. Vale como
 * prueba —es lo que usan todas las rentadoras— pero no hay que llamarla
 * "firma digital" en la interfaz.
 */
export function useFirmarContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: number; nombre: string; dni: string;
      firma_medio?: 'pantalla' | 'papel'; firma_base64?: string | null;
    }) =>
      api.post<{ data: Contrato }>(`/contratos/${id}/firmar`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['alquileres'] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}

export function useAnularContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<{ data: Contrato }>(`/contratos/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['alquileres'] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}

export function usePlantillasContrato() {
  return useQuery({
    queryKey: [KEY, 'plantillas'],
    queryFn: async () => {
      const res = await api.get<{ data: ContratoPlantilla[] }>('/contratos/plantillas');
      return res.data.data;
    },
  });
}

/** Descarga el PDF autenticado (blob) y dispara la descarga en el navegador. */
export async function descargarPdfContrato(contrato: Contrato): Promise<void> {
  const res = await api.get(`/contratos/${contrato.id}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `contrato_${contrato.numero_formateado}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
