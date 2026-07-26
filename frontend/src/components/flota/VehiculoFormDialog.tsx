import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useCreateVehiculo, useUpdateVehiculo } from '@/hooks/useVehiculos';
import { useCategorias } from '@/hooks/useCategorias';
import {
  DEFAULT_VEHICULO_VALUES,
  vehiculoFormSchema,
  type VehiculoFormValues,
} from '@/pages/flota/schemas';
import { TIPO_VEHICULO_LABEL } from '@/lib/constants';
import type { Vehiculo, TipoVehiculo } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, es edición. Si no, es alta. */
  vehiculo?: Vehiculo | null;
}

export function VehiculoFormDialog({ open, onOpenChange, vehiculo }: Props) {
  const isEdit = !!vehiculo;
  const create = useCreateVehiculo();
  const update = useUpdateVehiculo();
  const { data: categorias } = useCategorias();

  const form = useForm<VehiculoFormValues>({
    resolver: zodResolver(vehiculoFormSchema),
    defaultValues: DEFAULT_VEHICULO_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (vehiculo) {
      form.reset({
        patente: vehiculo.patente,
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        anio: vehiculo.anio,
        tipo: vehiculo.tipo,
        color: vehiculo.color,
        km_actual: vehiculo.km_actual,
        km_entre_services: vehiculo.km_entre_services,
        km_proximo_service: vehiculo.km_proximo_service,
        categoria_id: vehiculo.categoria_id,
      });
    } else {
      form.reset(DEFAULT_VEHICULO_VALUES);
    }
  }, [open, vehiculo, form]);

  const onSubmit = async (values: VehiculoFormValues) => {
    try {
      if (isEdit && vehiculo) {
        // El backend no permite cambiar patente vía PATCH — la omitimos.
        const { patente: _ignored, ...rest } = values;
        await update.mutateAsync({ id: vehiculo.id, body: rest });
      } else {
        await create.mutateAsync(values);
      }
      onOpenChange(false);
    } catch {
      // El error ya se muestra como toast desde el hook.
    }
  };

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar vehículo' : 'Nuevo vehículo'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Modificar los datos de ${vehiculo?.patente}.`
              : 'Completá los datos del vehículo. Podrás subir foto desde la ficha del vehículo.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              label="Patente *"
              error={form.formState.errors.patente?.message}
            >
              <Input
                {...form.register('patente')}
                placeholder="AB123CD"
                disabled={isEdit}
                className="uppercase"
              />
              {isEdit && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  La patente no se modifica.
                </p>
              )}
            </Field>

            <Field label="Tipo *" error={form.formState.errors.tipo?.message}>
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as TipoVehiculo)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_VEHICULO_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Categoría">
              <Controller
                control={form.control}
                name="categoria_id"
                render={({ field }) => (
                  <Select
                    value={field.value != null ? String(field.value) : '__none__'}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin categoría</SelectItem>
                      {(categorias ?? []).map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Marca *" error={form.formState.errors.marca?.message}>
              <Input {...form.register('marca')} placeholder="Toyota" />
            </Field>
            <Field label="Modelo *" error={form.formState.errors.modelo?.message}>
              <Input {...form.register('modelo')} placeholder="Hilux" />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Año *" error={form.formState.errors.anio?.message}>
              <Input type="number" {...form.register('anio')} />
            </Field>
            <Field label="Color *" error={form.formState.errors.color?.message}>
              <Input {...form.register('color')} placeholder="Blanco" />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              label="Kilometraje actual *"
              error={form.formState.errors.km_actual?.message}
            >
              <Input type="number" {...form.register('km_actual')} />
            </Field>
            <Field
              label="Km entre services *"
              error={form.formState.errors.km_entre_services?.message}
            >
              <Input type="number" {...form.register('km_entre_services')} />
            </Field>
          </div>

          {isEdit && (
            <Field
              label="Próximo service (KM)"
              error={form.formState.errors.km_proximo_service?.message}
            >
              <Input type="number" {...form.register('km_proximo_service')} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Se actualiza automáticamente al registrar un service. Podés ajustarlo manualmente acá.
              </p>
            </Field>
          )}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear vehículo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
