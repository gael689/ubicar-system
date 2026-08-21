import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Danio, DanioCreate, DanioUpdate } from '@/types';

const KEY = 'danios';

interface DaniosParams {
  vehiculo_id?: number;
  alquiler_id?: number;
  cliente_id?: number;
  estado?: string;
}

export function useDanios(params?: DaniosParams) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.vehiculo_id) qs.set('vehiculo_id', String(params.vehiculo_id));
      if (params?.alquiler_id) qs.set('alquiler_id', String(params.alquiler_id));
      if (params?.cliente_id) qs.set('cliente_id', String(params.cliente_id));
      if (params?.estado) qs.set('estado', params.estado);
      const res = await api.get<{ data: Danio[] }>(`/danios?${qs}`);
      return res.data.data;
    },
  });
}

/**
 * Daños vigentes del vehículo — los que hay que mostrar antes de entregarlo
 * para no imputarle a un cliente algo que ya estaba.
 */
export function useDaniosPreexistentes(vehiculoId: number | undefined) {
  return useQuery({
    queryKey: [KEY, 'preexistentes', vehiculoId],
    queryFn: async () => {
      const res = await api.get<{ data: Danio[] }>(`/danios/preexistentes/${vehiculoId}`);
      return res.data.data;
    },
    enabled: !!vehiculoId,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [KEY] });
    qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
  };
}

export function useCrearDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: DanioCreate) => api.post<{ data: Danio }>('/danios', payload),
    onSuccess: invalidar,
  });
}

export function useActualizarDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: DanioUpdate }) =>
      api.patch<{ data: Danio }>(`/danios/${id}`, payload),
    onSuccess: invalidar,
  });
}

export function useImputarDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, monto, cliente_id }: { id: number; monto: number; cliente_id?: number }) =>
      api.post<{ data: Danio }>(`/danios/${id}/imputar`, { monto, cliente_id }),
    onSuccess: invalidar,
  });
}

/**
 * El cliente pagó el daño imputado.
 *
 * Crea el `Pago` —que lo hace entrar a la caja del día, con su medio— y el
 * crédito que cancela el débito, en un solo acto. El daño **sigue imputado**:
 * cobrarlo no lo repara. Ver `PLAN_DINERO.md` §1.4.
 */
export function useCobrarDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, medio_pago, fecha_cobro }: { id: number; medio_pago: string; fecha_cobro: string }) =>
      api.post<{ data: Danio }>(`/danios/${id}/cobrar`, { medio_pago, fecha_cobro }),
    onSuccess: invalidar,
  });
}

export function useBonificarDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<{ data: Danio }>(`/danios/${id}/bonificar`, { motivo }),
    onSuccess: invalidar,
  });
}

export function useDarDeBajaDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/danios/${id}`),
    onSuccess: invalidar,
  });
}

export function useSubirFotoDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, file, descripcion }: { id: number; file: File; descripcion?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (descripcion) form.append('descripcion', descripcion);
      const res = await api.post<{ data: Danio }>(`/danios/${id}/fotos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: invalidar,
  });
}

export function useEliminarFotoDanio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (fotoId: number) => api.delete(`/danios/fotos/${fotoId}`),
    onSuccess: invalidar,
  });
}
