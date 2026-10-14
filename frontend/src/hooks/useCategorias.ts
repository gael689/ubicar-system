import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { CACHE } from '@/lib/queryClient';
import { extractError } from '@/lib/utils';
import type { ApiResponse, Categoria, CategoriaUpdate } from '@/types';
import type { Tarifa, TarifaCreate } from '@/hooks/useTarifas';

const KEY = 'categorias';

export function useCategorias(incluirInactivas = false) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, { incluirInactivas }],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Categoria[]>>('/categorias', {
        params: { incluir_inactivas: incluirInactivas },
      });
      return data.data;
    },
  });
}

/** Sube la foto que muestra la tarjeta de la categoría en la web. */
export function useUploadFotoCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<ApiResponse<Categoria>>(`/categorias/${id}/foto`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Foto subida. La web la muestra en unos minutos.');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useUpdateCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: CategoriaUpdate }) => {
      const { data } = await api.patch<ApiResponse<Categoria>>(`/categorias/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Categoría actualizada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

// --- Tarifas por categoría (D-08) ---

export function useTarifasCategoria(categoriaId: number, incluirInactivas = false) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, categoriaId, 'tarifas', { incluirInactivas }],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Tarifa[]>>(
        `/categorias/${categoriaId}/tarifas`,
        { params: { incluir_inactivas: incluirInactivas } },
      );
      return data.data;
    },
    enabled: !!categoriaId,
  });
}

export function useCreateTarifaCategoria(categoriaId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TarifaCreate) => {
      const { data } = await api.post<ApiResponse<Tarifa>>(
        `/categorias/${categoriaId}/tarifas`, body,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, categoriaId, 'tarifas'] });
      toast.success('Tarifa de categoría creada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
