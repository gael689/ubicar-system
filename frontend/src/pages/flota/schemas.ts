import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const vehiculoFormSchema = z.object({
  patente: z
    .string()
    .min(4, 'La patente es muy corta')
    .max(20, 'La patente es muy larga')
    .transform((v) => v.trim().toUpperCase()),
  marca: z.string().min(1, 'Requerido').max(100),
  modelo: z.string().min(1, 'Requerido').max(100),
  anio: z.coerce
    .number()
    .int()
    .min(1980, 'Año demasiado antiguo')
    .max(currentYear + 1, `Máximo ${currentYear + 1}`),
  tipo: z.enum(['auto', 'camioneta']),
  color: z.string().min(1, 'Requerido').max(50),
  km_actual: z.coerce.number().int().min(0, 'No puede ser negativo'),
  km_entre_services: z.coerce.number().int().min(1000, 'Mínimo 1000 km'),
  km_proximo_service: z.coerce.number().int().min(0).optional(),
});

export type VehiculoFormValues = z.infer<typeof vehiculoFormSchema>;

export const DEFAULT_VEHICULO_VALUES: VehiculoFormValues = {
  patente: '',
  marca: '',
  modelo: '',
  anio: currentYear,
  tipo: 'auto',
  color: '',
  km_actual: 0,
  km_entre_services: 10000,
};
