import { z } from 'zod';

export const clienteSchema = z.object({
  nombre_completo: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  dni_cuit: z.string().min(7, 'DNI/CUIT inválido'),
  telefono: z.string().min(8, 'Teléfono inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  licencia_numero: z.string().min(4, 'Número de licencia inválido'),
  licencia_vencimiento: z.string().min(10, 'Fecha obligatoria'),
  licencia_categoria: z.string().min(1, 'Categoría obligatoria'),
  tipo: z.enum(['particular', 'empresa']),
  es_frecuente: z.boolean().default(false),
  notas: z.string().optional(),
});

export type ClienteFormData = z.infer<typeof clienteSchema>;

export const conductorSchema = z.object({
  nombre_completo: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  dni: z.string().min(7, 'DNI inválido'),
  licencia_numero: z.string().min(4, 'Número de licencia inválido'),
  licencia_vencimiento: z.string().min(10, 'Fecha obligatoria'),
});

export type ConductorFormData = z.infer<typeof conductorSchema>;
