import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  Reserva,
  ReservaCreate,
  ReservaUpdate,
  ReservaConWarnings,
  SolapeWarning,
  PaginatedResponse,
  ApiResponse,
} from '@/types';

/**
 * Descarga el PDF de confirmación de la reserva. Se llama automáticamente al
 * crearla (para mandárselo al cliente) y también a demanda desde el listado.
 * El PDF además queda archivado solo en el perfil del cliente — eso lo hace
 * el backend, acá sólo se dispara la descarga.
 */
export async function descargarPdfReserva(reservaId: number): Promise<void> {
  const res = await api.get(`/reservas/${reservaId}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `reserva-${String(reservaId).padStart(5, '0')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

interface ListReservasParams {
  estado?: string;
  vehiculo_id?: number;
  cliente_id?: number;
  q?: string;
  fecha?: string;
  origen?: string;
  categoria_id?: number;
  /** sin_emitir | emitido | sin_firmar */
  contrato?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  page?: number;
  page_size?: number;
}

/** Versión con React Query, para pantallas que sólo leen. */
export function useListaReservas(params: ListReservasParams = {}) {
  return useQuery({
    queryKey: ['reservas', 'lista', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', { params });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

interface CreateReservaResult {
  reserva: Reserva;
  warnings: SolapeWarning[];
}

export function useReservas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listReservas = useCallback(
    async (params: ListReservasParams = {}): Promise<PaginatedResponse<Reserva>> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', { params });
        return data;
      } catch (err: any) {
        const msg = err?.response?.data?.detail?.message
          || err?.response?.data?.detail
          || 'Error al cargar reservas';
        setError(typeof msg === 'string' ? msg : 'Error al cargar reservas');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getReserva = useCallback(
    async (id: number): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ApiResponse<Reserva>>(`/reservas/${id}`);
        return data.data;
      } catch (err: any) {
        setError('Error al cargar reserva');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createReserva = useCallback(
    async (payload: ReservaCreate): Promise<CreateReservaResult> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<any>>('/reservas', payload);
        const { warnings, ...rest } = data.data;
        return { reserva: rest as Reserva, warnings: warnings ?? [] };
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al crear reserva');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Devuelve la reserva **y los avisos**. El backend los manda desde siempre
   * (`{...reserva, warnings}`) y acá se descartaban: entre ellos viaja el de
   * D-48, que avisa que se anuló un contrato ya firmado porque se le cambió
   * el auto a la reserva. O sea que se podía invalidar un contrato firmado y
   * no enterarse en ninguna pantalla.
   */
  const updateReserva = useCallback(
    async (id: number, payload: ReservaUpdate): Promise<ReservaConWarnings> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.patch<ApiResponse<Reserva & { warnings?: SolapeWarning[] }>>(
          `/reservas/${id}`, payload,
        );
        return { reserva: data.data, warnings: data.data.warnings ?? [] };
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al actualizar');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const confirmarReserva = useCallback(
    async (id: number): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<Reserva>>(`/reservas/${id}/confirmar`);
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al confirmar');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Cancela una reserva. `responsable` decide qué pasa con la seña:
   * `'cliente'` la retiene (D-11) y `'ubicar'` la reintegra entera, que es la
   * única excepción que D-11 admite.
   */
  const cancelarReserva = useCallback(
    async (
      id: number,
      motivo: string,
      opciones?: { responsable?: 'cliente' | 'ubicar'; reembolso_medio?: string },
    ): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<Reserva>>(`/reservas/${id}/cancelar`, {
          motivo,
          responsable: opciones?.responsable ?? 'cliente',
          reembolso_medio: opciones?.reembolso_medio ?? 'transferencia',
        });
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al cancelar');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reasignarReserva = useCallback(
    async (
      id: number,
      vehiculo_id_nuevo: number,
      // D-65: corregir el precio en el mismo paso. Sin esto, cambiar de auto
      // obliga a elegir entre entregar el que hay o respetar lo pactado.
      // El motivo lo exige el backend sólo si el precio cambia.
      precio?: { precio_total: number; precio_motivo?: string },
    ): Promise<{ reserva: Reserva; warnings: SolapeWarning[] }> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<any>>(`/reservas/${id}/reasignar`, {
          vehiculo_id_nuevo,
          ...(precio ?? {}),
        });
        const { warnings, ...rest } = data.data;
        return { reserva: rest as Reserva, warnings: warnings ?? [] };
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        setError(detail?.message || 'Error al reasignar');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getReservasAReasignar = useCallback(async (): Promise<Reserva[]> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApiResponse<Reserva[]>>('/reservas/a-reasignar');
      return data.data;
    } catch (err: any) {
      setError('Error al cargar reservas a reasignar');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    listReservas,
    getReserva,
    createReserva,
    updateReserva,
    confirmarReserva,
    cancelarReserva,
    reasignarReserva,
    getReservasAReasignar,
  };
}
