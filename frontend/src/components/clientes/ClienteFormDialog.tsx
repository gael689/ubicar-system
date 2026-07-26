import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

import { useCreateCliente, useUpdateCliente } from '@/hooks/useClientes';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse, Cliente } from '@/types';

const schema = z.object({
  nombre_completo: z.string().min(2, 'Requerido'),
  dni_cuit: z.string().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  licencia_vencimiento: z.string().optional().or(z.literal('')),
  tipo: z.enum(['particular', 'empresa']),
  es_frecuente: z.boolean(),
  notas: z.string().optional().or(z.literal('')),
  tipo_conductor: z.enum(['es_conductor', 'conductor_designado']),
  conductor_nombre: z.string().optional().or(z.literal('')),
  conductor_licencia_vencimiento: z.string().optional().or(z.literal('')),
  // Datos fiscales — todos opcionales, se completan con el tiempo.
  razon_social: z.string().optional().or(z.literal('')),
  condicion_iva: z.enum(['responsable_inscripto', 'monotributo', 'consumidor_final', 'exento', '']).optional(),
  domicilio: z.string().optional().or(z.literal('')),
  localidad: z.string().optional().or(z.literal('')),
  provincia: z.string().optional().or(z.literal('')),
  codigo_postal: z.string().optional().or(z.literal('')),
  fecha_nacimiento: z.string().optional().or(z.literal('')),
  licencia_pais: z.string().optional().or(z.literal('')),
  licencia_desde: z.string().optional().or(z.literal('')),
  condicion_pago_default: z.enum(['contado', 'cta_cte_15', 'cta_cte_30', 'cta_cte_60', 'cta_cte_90', '']).optional(),
}).refine(data => data.telefono || data.email, {
  message: "Debe ingresar teléfono o email",
  path: ["telefono"],
}).refine(data => {
  if (data.tipo_conductor === 'conductor_designado') {
    return !!data.conductor_nombre && data.conductor_nombre.trim().length >= 2;
  }
  return true;
}, {
  message: "Ingrese el nombre del conductor designado",
  path: ["conductor_nombre"],
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente?: Cliente;
}

export function ClienteFormDialog({ open, onOpenChange, cliente }: Props) {
  const isEdit = !!cliente;
  const create = useCreateCliente();
  const update = useUpdateCliente();

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: 'particular',
      es_frecuente: false,
      tipo_conductor: 'es_conductor',
    },
  });

  const tipoConductor = useWatch({ control, name: 'tipo_conductor' });
  const tipoCliente = useWatch({ control, name: 'tipo' });

  useEffect(() => {
    if (open) {
      const hasConductor = isEdit && (cliente?.conductores_adicionales?.length ?? 0) > 0;
      reset(cliente ? {
        nombre_completo: cliente.nombre_completo,
        dni_cuit: cliente.dni_cuit,
        telefono: cliente.telefono,
        email: cliente.email ?? '',
        licencia_vencimiento: cliente.licencia_vencimiento,
        tipo: cliente.tipo as 'particular' | 'empresa',
        es_frecuente: cliente.es_frecuente,
        notas: cliente.notas ?? '',
        tipo_conductor: hasConductor ? 'conductor_designado' : 'es_conductor',
        conductor_nombre: hasConductor ? cliente.conductores_adicionales[0].nombre_completo : '',
        conductor_licencia_vencimiento: hasConductor ? cliente.conductores_adicionales[0].licencia_vencimiento : '',
        razon_social: cliente.razon_social ?? '',
        condicion_iva: cliente.condicion_iva ?? '',
        domicilio: cliente.domicilio ?? '',
        localidad: cliente.localidad ?? '',
        provincia: cliente.provincia ?? '',
        codigo_postal: cliente.codigo_postal ?? '',
        fecha_nacimiento: cliente.fecha_nacimiento ?? '',
        licencia_pais: cliente.licencia_pais ?? '',
        licencia_desde: cliente.licencia_desde ?? '',
        condicion_pago_default: cliente.condicion_pago_default ?? '',
      } : {
        tipo: 'particular',
        es_frecuente: false,
        tipo_conductor: 'es_conductor',
        nombre_completo: '',
        dni_cuit: '',
        telefono: '',
        email: '',
        licencia_vencimiento: '',
        conductor_nombre: '',
        conductor_licencia_vencimiento: '',
        notas: '',
        razon_social: '',
        condicion_iva: '',
        domicilio: '',
        localidad: '',
        provincia: '',
        codigo_postal: '',
        fecha_nacimiento: '',
        licencia_pais: '',
        licencia_desde: '',
        condicion_pago_default: '',
      });
    }
  }, [open, cliente, isEdit, reset]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      nombre_completo: data.nombre_completo,
      dni_cuit: data.dni_cuit || '',
      telefono: data.telefono || '',
      email: data.email || undefined,
      licencia_vencimiento: data.tipo_conductor === 'es_conductor' ? (data.licencia_vencimiento || '') : '',
      tipo: data.tipo,
      es_frecuente: data.es_frecuente,
      notas: data.notas || undefined,
      razon_social: data.razon_social || null,
      condicion_iva: data.condicion_iva || null,
      domicilio: data.domicilio || null,
      localidad: data.localidad || null,
      provincia: data.provincia || null,
      codigo_postal: data.codigo_postal || null,
      fecha_nacimiento: data.fecha_nacimiento || null,
      licencia_pais: data.licencia_pais || null,
      licencia_desde: data.licencia_desde || null,
      condicion_pago_default: data.condicion_pago_default || null,
    };

    if (isEdit && cliente) {
      update.mutate({ id: cliente.id, body: payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      try {
        const { data: res } = await api.post<ApiResponse<Cliente>>('/clientes', payload);
        const nuevoCliente = res.data;
        if (data.tipo_conductor === 'conductor_designado' && data.conductor_nombre?.trim()) {
          await api.post(`/clientes/${nuevoCliente.id}/conductores`, {
            nombre_completo: data.conductor_nombre.trim(),
            licencia_vencimiento: data.conductor_licencia_vencimiento || '',
          });
        }
        toast.success('Cliente creado');
        onOpenChange(false);
      } catch (err) {
        toast.error(extractError(err));
      }
    }
  };

  const loading = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre completo" error={errors.nombre_completo?.message} required>
              <input {...register('nombre_completo')} placeholder="Juan Pérez"
                className="input-base" />
            </Field>
            <Field label="DNI / CUIT" error={errors.dni_cuit?.message}>
              <input {...register('dni_cuit')} placeholder="12345678"
                className="input-base" disabled={isEdit && !!cliente?.dni_cuit} />
            </Field>
            <Field label="Teléfono" error={errors.telefono?.message}>
              <input {...register('telefono')} placeholder="2914123456"
                className="input-base" />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input {...register('email')} type="email" placeholder="juan@email.com"
                className="input-base" />
            </Field>
          </div>

          {/* Conductor */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Conductor
            </p>
            <div className="flex gap-6 mb-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" {...register('tipo_conductor')} value="es_conductor"
                  className="accent-primary" />
                <span>El cliente es el conductor</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" {...register('tipo_conductor')} value="conductor_designado"
                  className="accent-primary" />
                <span>Tiene conductor designado</span>
              </label>
            </div>

            {tipoConductor === 'es_conductor' && (
              <Field label="Vencimiento licencia" error={errors.licencia_vencimiento?.message}>
                <input {...register('licencia_vencimiento')} type="date"
                  className="input-base max-w-xs" />
              </Field>
            )}

            {tipoConductor === 'conductor_designado' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre del conductor" error={errors.conductor_nombre?.message} required>
                  <input {...register('conductor_nombre')} placeholder="Juan García"
                    className="input-base" />
                </Field>
                <Field label="Vencimiento licencia conductor" error={errors.conductor_licencia_vencimiento?.message}>
                  <input {...register('conductor_licencia_vencimiento')} type="date"
                    className="input-base" />
                </Field>
              </div>
            )}
          </div>

          {/* Datos fiscales */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Datos fiscales
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tipoCliente === 'empresa' ? (
                <>
                  <Field label="Razón social">
                    <input {...register('razon_social')} placeholder="Ubicar Rent SA" className="input-base" />
                  </Field>
                  <Field label="Condición IVA">
                    <select {...register('condicion_iva')} className="input-base">
                      <option value="">Sin especificar</option>
                      <option value="responsable_inscripto">Responsable Inscripto</option>
                      <option value="monotributo">Monotributo</option>
                      <option value="exento">Exento</option>
                    </select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Fecha de nacimiento">
                    <input {...register('fecha_nacimiento')} type="date" className="input-base" />
                  </Field>
                  <Field label="Condición IVA">
                    <select {...register('condicion_iva')} className="input-base">
                      <option value="">Sin especificar</option>
                      <option value="consumidor_final">Consumidor Final</option>
                      <option value="responsable_inscripto">Responsable Inscripto</option>
                      <option value="monotributo">Monotributo</option>
                      <option value="exento">Exento</option>
                    </select>
                  </Field>
                  <Field label="País de licencia">
                    <input {...register('licencia_pais')} placeholder="Argentina" className="input-base" />
                  </Field>
                  <Field label="Licencia desde">
                    <input {...register('licencia_desde')} type="date" className="input-base" />
                  </Field>
                </>
              )}
              <Field label="Domicilio">
                <input {...register('domicilio')} placeholder="Av. Alem 123" className="input-base" />
              </Field>
              <Field label="Localidad">
                <input {...register('localidad')} placeholder="Bahía Blanca" className="input-base" />
              </Field>
              <Field label="Provincia">
                <input {...register('provincia')} placeholder="Buenos Aires" className="input-base" />
              </Field>
              <Field label="Código postal">
                <input {...register('codigo_postal')} placeholder="8000" className="input-base" />
              </Field>
              <Field label="Condición de pago">
                <select {...register('condicion_pago_default')} className="input-base">
                  <option value="">Sin especificar</option>
                  <option value="contado">Contado</option>
                  <option value="cta_cte_15">Cta. Cte. 15 días</option>
                  <option value="cta_cte_30">Cta. Cte. 30 días</option>
                  <option value="cta_cte_60">Cta. Cte. 60 días</option>
                  <option value="cta_cte_90">Cta. Cte. 90 días</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tipo de cliente" error={errors.tipo?.message} required>
                <select {...register('tipo')} className="input-base">
                  <option value="particular">Particular</option>
                  <option value="empresa">Empresa</option>
                </select>
              </Field>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...register('es_frecuente')}
                    className="rounded border-border" />
                  <span className="text-foreground">Cliente frecuente</span>
                </label>
              </div>
            </div>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <textarea {...register('notas')} rows={2} placeholder="Observaciones opcionales..."
              className="input-base resize-none" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, required, children }: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
