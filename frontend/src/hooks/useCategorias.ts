import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse, Categoria, CategoriaCreate, CategoriaUpdate } from '@/types';
import type { Tarifa, TarifaCreate } from '@/hooks/useTarifas';

const KEY = 'categorias';

export function useCategorias(incluirInactivas = false) {
  return useQuery({
    queryKey: [KEY, { incluirInactivas }],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Categoria[]>>('/categorias', {
        params: { incluir_inactivas: incluirInactivas },
      });
      return data.data;
    },
  });
}

export function useCreateCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CategoriaCreate) => {
      const { data } = await api.post<ApiResponse<Categoria>>('/categorias', body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Categoría creada');
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

export function useDeactivateCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/categorias/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Categoría desactivada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

// --- Tarifas por categoría (D-08) ---

export function useTarifasCategoria(categoriaId: number, incluirInactivas = false) {
  return useQuery({
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
