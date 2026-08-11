import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  ApiResponse,
  DestinatarioEmail,
  EmailDetalle,
  EmailEnviado,
  EstadoIntegracionEmail,
  PaginatedResponse,
  ResultadoEnvioOferta,
} from '@/types';

interface ListaParams {
  page?: number;
  tipo?: string | null;
  estado?: string | null;
  destinatario?: string | null;
}

export function useEmails({ page = 1, tipo, estado, destinatario }: ListaParams = {}) {
  return useQuery({
    queryKey: ['emails', page, tipo, estado, destinatario],
    queryFn: async () => {
      const params: Record<string, string | number> = { page };
      if (tipo) params.tipo = tipo;
      if (estado) params.estado = estado;
      if (destinatario) params.destinatario = destinatario;
      const { data } = await api.get<PaginatedResponse<EmailEnviado>>('/emails', { params });
      return data;
    },
  });
}

/**
 * Cómo está parada la integración con Resend.
 *
 * Se consulta siempre, no sólo cuando algo falla: es lo que sostiene el cartel
 * que explica por qué los mails a clientes no están saliendo. Sin esto, la
 * pantalla mostraría una columna de "omitido" sin ninguna razón visible.
 */
export function useEstadoEmails() {
  return useQuery({
    queryKey: ['emails', 'estado'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<EstadoIntegracionEmail>>('/emails/estado');
      return data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useEmailDetalle(id: number | null) {
  return useQuery({
    queryKey: ['emails', 'detalle', id],
    enabled: id !== null,
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<EmailDetalle>>(`/emails/${id}`);
      return data.data;
    },
  });
}

export function useDestinatariosEmail(soloConAlquileres = true) {
  return useQuery({
    queryKey: ['emails', 'destinatarios', soloConAlquileres],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DestinatarioEmail[]>>('/emails/destinatarios', {
        params: { solo_con_alquileres: soloConAlquileres },
      });
      return data.data;
    },
  });
}

export function usePrevisualizarOferta() {
  return useMutation({
    mutationFn: async (payload: { asunto: string; cuerpo: string }) => {
      const { data } = await api.post<ApiResponse<{ asunto: string; html: string }>>(
        '/emails/previsualizar',
        payload,
      );
      return data.data;
    },
  });
}

export function useEnviarOferta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      asunto: string;
      cuerpo: string;
      destinatarios: string[];
      forzar: boolean;
    }) => {
      const { data } = await api.post<ApiResponse<ResultadoEnvioOferta>>('/emails/oferta', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });
}

export function useReintentarEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, forzar = false }: { id: number; forzar?: boolean }) => {
      const { data } = await api.post<ApiResponse<EmailEnviado>>(`/emails/${id}/reintentar`, {
        forzar,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });
}
