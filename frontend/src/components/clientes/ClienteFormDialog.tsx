import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { User, Building2, Plus, Trash2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  BORRADOR_VACIO, CamposConductor, borradorAPayload, type BorradorConductor,
} from '@/components/clientes/SelectorConductores';

import { useCreateCliente, useUpdateCliente } from '@/hooks/useClientes';
import api from '@/lib/api';
import { extractError, formatDocumento, irAlError } from '@/lib/utils';
import type { Cliente } from '@/types';

const schema = z.object({
  nombre_completo: z.string().min(2, 'Requerido'),
  dni_cuit: z.string().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  licencia_vencimiento: z.string().optional().or(z.literal('')),
  tipo: z.enum(['particular', 'empresa']),
  es_frecuente: z.boolean(),
  notas: z.string().optional().or(z.literal('')),
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
  // Representante de la empresa (migración 100).
  representante_nombre: z.string().optional().or(z.literal('')),
  representante_dni: z.string().optional().or(z.literal('')),
  representante_cargo: z.string().optional().or(z.literal('')),
  representante_telefono: z.string().optional().or(z.literal('')),
  representante_email: z.string().email('Email inválido').optional().or(z.literal('')),
}).refine(data => data.telefono || data.email, {
  message: "Debe ingresar teléfono o email",
  path: ["telefono"],
});

type FormData = z.infer<typeof schema>;

// El orden en que se recorren los errores para llevar al primero: el mismo en
// que aparecen en pantalla.
const ORDEN_CAMPOS: (keyof FormData)[] = [
  'representante_nombre', 'representante_email',
  'nombre_completo', 'dni_cuit', 'telefono', 'email',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente?: Cliente;
}

export function ClienteFormDialog({ open, onOpenChange, cliente }: Props) {
  const isEdit = !!cliente;
  const qc = useQueryClient();
  const create = useCreateCliente();
  const update = useUpdateCliente();
  // Onboarding: al dar de alta, primero se elige Empresa/Particular y recién
  // después se muestra el formulario. Al editar no aplica: el tipo ya existe.
  const [step, setStep] = useState<'onboarding' | 'form'>('onboarding');

  // **Los conductores nuevos viajan con el alta, en la misma llamada** (plan
  // 27/09, A3). Antes el cliente se creaba primero y el conductor después, con
  // otra llamada que fallaba en silencio si el vencimiento iba vacío: el
  // cliente quedaba creado, el conductor no, y reintentar duplicaba al cliente.
  const [nuevos, setNuevos] = useState<BorradorConductor[]>([]);
  const [erroresConductor, setErroresConductor] = useState<Record<number, string>>({});
  // Al editar: los que ya tiene, y cuáles se marcaron para sacar.
  const [aQuitar, setAQuitar] = useState<number[]>([]);
  // Guarda contra el doble envío: el `isPending` de las mutaciones no cubre el
  // tramo de conductores al editar, que son llamadas aparte.
  const enviando = useRef(false);
  const [guardando, setGuardando] = useState(false);

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'particular', es_frecuente: false },
  });

  const tipoCliente = useWatch({ control, name: 'tipo' });
  const esEmpresa = tipoCliente === 'empresa';
  const existentes = (cliente?.conductores_adicionales ?? []).filter(c => c.activo);

  // **Se resetea al abrir o al cambiar de cliente, no en cada refetch.** Con
  // `cliente` (el objeto) en las dependencias, el refetch que dispara guardar
  // un conductor re-corría esto a mitad del envío y vaciaba lo pendiente.
  useEffect(() => {
    if (!open || enviando.current) return;
    setStep(isEdit ? 'form' : 'onboarding');
    setNuevos([]);
    setErroresConductor({});
    setAQuitar([]);
    enviando.current = false;
    setGuardando(false);
    reset(cliente ? {
      nombre_completo: cliente.nombre_completo,
      dni_cuit: cliente.dni_cuit,
      telefono: cliente.telefono,
      email: cliente.email ?? '',
      licencia_vencimiento: cliente.licencia_vencimiento ?? '',
      tipo: cliente.tipo as 'particular' | 'empresa',
      es_frecuente: cliente.es_frecuente,
      notas: cliente.notas ?? '',
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
      representante_nombre: cliente.representante_nombre ?? '',
      representante_dni: cliente.representante_dni ?? '',
      representante_cargo: cliente.representante_cargo ?? '',
      representante_telefono: cliente.representante_telefono ?? '',
      representante_email: cliente.representante_email ?? '',
    } : {
      tipo: 'particular', es_frecuente: false,
      nombre_completo: '', dni_cuit: '', telefono: '', email: '', licencia_vencimiento: '',
      notas: '', razon_social: '', condicion_iva: '', domicilio: '', localidad: '',
      provincia: '', codigo_postal: '', fecha_nacimiento: '', licencia_pais: '',
      licencia_desde: '', condicion_pago_default: '',
      representante_nombre: '', representante_dni: '', representante_cargo: '',
      representante_telefono: '', representante_email: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente?.id]);

  const elegirTipo = (tipo: 'particular' | 'empresa') => {
    setValue('tipo', tipo);
    // Una empresa casi siempre viene con alguien que maneja: se deja la primera
    // fila lista para completar (se puede sacar).
    if (tipo === 'empresa' && nuevos.length === 0) setNuevos([{ ...BORRADOR_VACIO }]);
    setStep('form');
  };

  /** Las filas de conductor nuevas que tienen algo escrito, validadas. */
  const conductoresValidos = (): BorradorConductor[] | null => {
    const errs: Record<number, string> = {};
    const usados: BorradorConductor[] = [];
    nuevos.forEach((c, i) => {
      const algo = Object.values(c).some(v => v.trim());
      if (!algo) return; // fila vacía: se ignora
      if (c.nombre_completo.trim().length < 2) errs[i] = 'Escribí el nombre del conductor';
      else usados.push(c);
    });
    setErroresConductor(errs);
    const primero = Object.keys(errs)[0];
    if (primero !== undefined) {
      irAlError(`conductor-${primero}-nombre`);
      return null;
    }
    return usados;
  };

  const onInvalid = (errs: FieldErrors<FormData>) => {
    const campo = ORDEN_CAMPOS.find(k => errs[k]);
    irAlError(campo ?? null);
  };

  const onSubmit = async (data: FormData) => {
    if (enviando.current) return;
    const conductores = conductoresValidos();
    if (conductores === null) return;

    const empresa = data.tipo === 'empresa';
    const payload = {
      nombre_completo: data.nombre_completo,
      dni_cuit: data.dni_cuit || '',
      telefono: data.telefono || '',
      email: data.email || undefined,
      // La licencia es del cliente, y una empresa no maneja: sus conductores
      // van en la lista de abajo con su propia licencia.
      licencia_vencimiento: empresa ? '' : (data.licencia_vencimiento || ''),
      licencia_pais: empresa ? null : (data.licencia_pais || null),
      licencia_desde: empresa ? null : (data.licencia_desde || null),
      tipo: data.tipo,
      es_frecuente: data.es_frecuente,
      notas: data.notas || undefined,
      razon_social: data.razon_social || null,
      condicion_iva: data.condicion_iva || null,
      domicilio: data.domicilio || null,
      localidad: data.localidad || null,
      provincia: data.provincia || null,
      codigo_postal: data.codigo_postal || null,
      fecha_nacimiento: empresa ? null : (data.fecha_nacimiento || null),
      condicion_pago_default: data.condicion_pago_default || null,
      // `''` al editar = borrarlo (el backend lo normaliza a null).
      representante_nombre: empresa ? (data.representante_nombre || '').trim() : '',
      representante_dni: empresa ? (data.representante_dni || '').trim() : '',
      representante_cargo: empresa ? (data.representante_cargo || '').trim() : '',
      representante_telefono: empresa ? (data.representante_telefono || '').trim() : '',
      representante_email: empresa ? (data.representante_email || '').trim() : '',
    };

    enviando.current = true;
    setGuardando(true);
    try {
      if (isEdit && cliente) {
        await update.mutateAsync({ id: cliente.id, body: payload });
        // Los cambios de conductores también se guardan al editar. Antes el
        // formulario de edición los mostraba y los descartaba al guardar.
        //
        // **Cada uno sale de la lista apenas se guarda.** Son llamadas
        // sueltas: si falla la tercera, las dos primeras ya están en la base,
        // y reintentar con la lista entera las duplicaba.
        let cambio = false;
        try {
          for (const c of conductores) {
            await api.post(`/clientes/${cliente.id}/conductores`, borradorAPayload(c));
            cambio = true;
            setNuevos(prev => prev.filter(x => x !== c));
          }
          for (const id of aQuitar) {
            await api.delete(`/clientes/${cliente.id}/conductores/${id}`);
            cambio = true;
            setAQuitar(prev => prev.filter(x => x !== id));
          }
        } finally {
          // También si falló a mitad: lo que sí se guardó tiene que verse.
          if (cambio) qc.invalidateQueries({ queryKey: ['clientes'] });
        }
      } else {
        await create.mutateAsync({
          ...payload,
          representante_nombre: payload.representante_nombre || null,
          representante_dni: payload.representante_dni || null,
          representante_cargo: payload.representante_cargo || null,
          representante_telefono: payload.representante_telefono || null,
          representante_email: payload.representante_email || null,
          conductores: conductores.map(borradorAPayload),
        });
      }
      onOpenChange(false);
    } catch (err) {
      // Las mutaciones ya muestran su toast; las llamadas sueltas de
      // conductores (al editar) no, así que se avisa acá.
      if (isEdit) toast.error(extractError(err));
      irAlError(null);
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  };

  const loading = guardando || create.isPending || update.isPending;

  // Se guarda aparte para poder encadenar su `onBlur` con el formateo del
  // documento sin pisarlo.
  const registroDni = register('dni_cuit');

  const bloqueRepresentante = (
    <Seccion titulo="1. Representante" ayuda="Quien firma por la empresa.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre y apellido">
          <input data-campo="representante_nombre" {...register('representante_nombre')} placeholder="Laura Díaz" className="input-base" />
        </Field>
        <Field label="DNI">
          <input {...register('representante_dni')} placeholder="28.111.222" className="input-base" />
        </Field>
        <Field label="Cargo">
          <input {...register('representante_cargo')} placeholder="Apoderada, socio gerente…" className="input-base" />
        </Field>
        <Field label="Teléfono">
          <input {...register('representante_telefono')} placeholder="2914123456" className="input-base" />
        </Field>
        <Field label="Email" error={errors.representante_email?.message}>
          <input data-campo="representante_email" {...register('representante_email')} type="email" placeholder="laura@empresa.com" className="input-base" />
        </Field>
      </div>
    </Seccion>
  );

  const bloqueConductores = (
    <Seccion
      titulo={esEmpresa ? '3. Conductores' : 'Otros conductores (opcional)'}
      ayuda={esEmpresa
        ? 'Quiénes van a manejar. En cada reserva se eligen de 1 a 3.'
        : 'Si además del titular maneja otra persona.'}
    >
      {existentes.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {existentes.map(c => {
            const quitado = aQuitar.includes(c.id);
            return (
              <div key={c.id} className="flex items-center justify-between px-3 py-2">
                <div className={quitado ? 'text-muted-foreground line-through' : ''}>
                  <span className="text-sm font-medium">{c.nombre_completo}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.dni ? `DNI ${c.dni}` : 'Sin DNI'}</span>
                </div>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setAQuitar(q => quitado ? q.filter(x => x !== c.id) : [...q, c.id])}
                >
                  {quitado ? <><Undo2 className="h-3.5 w-3.5" /> Deshacer</> : <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {nuevos.map((c, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Conductor nuevo {existentes.length + i + 1}</span>
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => {
                setNuevos(n => n.filter((_, j) => j !== i));
                setErroresConductor({});
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" /> Quitar
            </Button>
          </div>
          <CamposConductor
            valor={c}
            prefijo={`conductor-${i}`}
            errorNombre={erroresConductor[i]}
            onChange={v => setNuevos(n => n.map((x, j) => (j === i ? v : x)))}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setNuevos(n => [...n, { ...BORRADOR_VACIO }])}>
        <Plus className="h-4 w-4" /> Agregar conductor
      </Button>
    </Seccion>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* El alto está topeado y sólo scrollea el cuerpo, así los botones de
          guardar nunca se van abajo del borde de la pantalla. */}
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        </DialogHeader>

        {!isEdit && step === 'onboarding' ? (
          <>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-sm text-muted-foreground">¿El cliente es una empresa o una persona particular?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => elegirTipo('particular')}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent/40 transition-colors p-6 text-center"
                >
                  <User className="h-8 w-8 text-primary" />
                  <span className="text-base font-semibold text-foreground">Particular</span>
                  <span className="text-xs text-muted-foreground">Persona física — alquila a título personal</span>
                </button>
                <button
                  type="button"
                  onClick={() => elegirTipo('empresa')}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent/40 transition-colors p-6 text-center"
                >
                  <Building2 className="h-8 w-8 text-primary" />
                  <span className="text-base font-semibold text-foreground">Empresa</span>
                  <span className="text-xs text-muted-foreground">Representante, datos de la empresa y conductores</span>
                </button>
              </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </DialogFooter>
          </>
        ) : (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {!isEdit && (
              <button
                type="button"
                onClick={() => setStep('onboarding')}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {esEmpresa ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                <span className="font-medium">{esEmpresa ? 'Empresa' : 'Particular'}</span>
                <span className="underline">Cambiar</span>
              </button>
            )}

            {/* Empresa: 1) quien la representa, 2) la empresa, 3) quiénes manejan
                (plan 27/09, A3). Es el orden en que el mostrador lo pregunta. */}
            {esEmpresa && bloqueRepresentante}

            <Seccion titulo={esEmpresa ? '2. Datos de la empresa' : 'Datos del cliente'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={esEmpresa ? 'Nombre de la empresa' : 'Nombre completo'} error={errors.nombre_completo?.message} required>
                  <input data-campo="nombre_completo" {...register('nombre_completo')}
                    placeholder={esEmpresa ? 'Transportes del Sur' : 'Juan Pérez'} className="input-base" />
                </Field>
                {/* Se puede editar siempre: un documento mal cargado de apuro
                    no puede dejar la ficha inservible. El backend valida que no
                    se pise el de otro cliente. */}
                <Field label={esEmpresa ? 'CUIT' : 'DNI / CUIT'} error={errors.dni_cuit?.message}>
                  <input
                    data-campo="dni_cuit"
                    {...registroDni}
                    placeholder={esEmpresa ? '30-71234567-8' : '12.345.678'}
                    className="input-base"
                    // Se llama al `onBlur` de react-hook-form y después al
                    // formateo: el orden importa (ver historial del campo).
                    onBlur={e => {
                      registroDni.onBlur(e);
                      setValue('dni_cuit', formatDocumento(e.target.value));
                    }}
                  />
                </Field>
                {esEmpresa && (
                  <>
                    <Field label="Razón social">
                      <input {...register('razon_social')} placeholder="Transportes del Sur S.A." className="input-base" />
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
                )}
                <Field label="Teléfono" error={errors.telefono?.message}>
                  <input data-campo="telefono" {...register('telefono')} placeholder="2914123456" className="input-base" />
                </Field>
                <Field label="Email" error={errors.email?.message}>
                  <input data-campo="email" {...register('email')} type="email"
                    placeholder={esEmpresa ? 'administracion@empresa.com' : 'juan@email.com'} className="input-base" />
                </Field>
                {!esEmpresa && (
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
                {/* Sólo empresa: la cuenta corriente se pacta con una empresa,
                    no con alguien que alquila un fin de semana. */}
                {esEmpresa && (
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
                )}
              </div>
            </Seccion>

            {/* La licencia del titular: sólo de un particular. Una empresa no
                maneja; la licencia es de cada conductor. */}
            {!esEmpresa && (
              <Seccion titulo="Licencia del titular">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="País de licencia">
                    <input {...register('licencia_pais')} placeholder="Argentina" className="input-base" />
                  </Field>
                  <Field label="Licencia desde">
                    <input {...register('licencia_desde')} type="date" className="input-base" />
                  </Field>
                  <Field label="Vencimiento" error={errors.licencia_vencimiento?.message}>
                    <input {...register('licencia_vencimiento')} type="date" className="input-base" />
                  </Field>
                </div>
              </Seccion>
            )}

            {bloqueConductores}

            <div className="border-t border-border pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isEdit && (
                  <Field label="Tipo de cliente" error={errors.tipo?.message} required>
                    <select {...register('tipo')} className="input-base">
                      <option value="particular">Particular</option>
                      <option value="empresa">Empresa</option>
                    </select>
                  </Field>
                )}
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

          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      </div>
      {children}
    </div>
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
