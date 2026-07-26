import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { conductorSchema, type ConductorFormData } from '@/pages/clientes/schemas';
import type { ConductorAdicionalCreate } from '@/types';

interface Props {
  onSubmit: (data: ConductorAdicionalCreate) => void;
  onCancel: () => void;
  loading: boolean;
}

export function ConductorForm({ onSubmit, onCancel, loading }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConductorFormData>({
    resolver: zodResolver(conductorSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nombre completo</label>
          <Input {...register('nombre_completo')} placeholder="Ej. Ana López" className="h-9" />
          {errors.nombre_completo && <p className="text-[10px] text-danger">{errors.nombre_completo.message}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">DNI</label>
          <Input {...register('dni')} placeholder="Sin puntos" className="h-9" />
          {errors.dni && <p className="text-[10px] text-danger">{errors.dni.message}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Número de licencia</label>
          <Input {...register('licencia_numero')} className="h-9" />
          {errors.licencia_numero && <p className="text-[10px] text-danger">{errors.licencia_numero.message}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Vencimiento licencia</label>
          <Input type="date" {...register('licencia_vencimiento')} className="h-9" />
          {errors.licencia_vencimiento && <p className="text-[10px] text-danger">{errors.licencia_vencimiento.message}</p>}
        </div>
      </div>
      
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar conductor'}
        </Button>
      </div>
    </form>
  );
}
