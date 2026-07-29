import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const KEY = 'auditoria';

export interface RegistroAuditoria {
  id: number;
  usuario_id: number | null;
  usuario_nombre: string | null;
  accion: string;
  entidad_tipo: string;
  entidad_id: number | null;
  descripcion: string;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  monto: number | null;
  ip: string | null;
  created_at: string;
}

export interface FiltrosAuditoria {
  page?: number;
  page_size?: number;
  usuario_id?: number;
  accion?: string;
  entidad_tipo?: string;
  desde?: string;
  hasta?: string;
  buscar?: string;
}

export function useAuditoria(filtros: FiltrosAuditoria) {
  return useQuery({
    queryKey: [KEY, filtros],
    queryFn: async () => {
      const qs = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
      });
      const res = await api.get<{ data: RegistroAuditoria[]; total: number }>(
        `/auditoria?${qs}`
      );
      return { items: res.data.data, total: res.data.total };
    },
    // El libro es de sólo agregar: lo que ya se leyó no cambia nunca. Sin
    // esto, cada vuelta a la pestaña vuelve a pedir páginas idénticas.
    staleTime: 30_000,
  });
}

export function useOpcionesAuditoria() {
  return useQuery({
    queryKey: [KEY, 'opciones'],
    queryFn: async () => {
      const res = await api.get<{
        data: { acciones: string[]; entidades: string[]; usuarios: { id: number; nombre: string }[] };
      }>('/auditoria/opciones');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Todo lo que le pasó a un registro puntual — para la ficha de una reserva o un cliente. */
export function useHistorialDe(entidadTipo: string, entidadId: number | undefined) {
  return useQuery({
    queryKey: [KEY, entidadTipo, entidadId],
    enabled: entidadId !== undefined,
    queryFn: async () => {
      const res = await api.get<{ data: RegistroAuditoria[] }>(
        `/auditoria/${entidadTipo}/${entidadId}`
      );
      return res.data.data;
    },
  });
}
