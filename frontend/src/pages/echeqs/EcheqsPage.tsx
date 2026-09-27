import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useEcheqs, useCrearEcheq, useActualizarEcheq } from '@/hooks/useEcheqs';
import { cn, formatCurrency, formatDate, extractError, hoyLocal, irAlError } from '@/lib/utils';
import { ESTADO_ECHEQ_LABEL, ESTADO_ECHEQ_COLOR } from '@/lib/constants';
import {
  ESTADOS_TRANSICION, diasParaCobro, estaEnCartera, seccionesEcheqs, type SeccionEcheqs,
} from '@/lib/echeqs';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { BuscadorCliente, type ClienteBuscado } from '@/components/clientes/BuscadorCliente';
import type { Echeq, EstadoEcheq } from '@/types';

// Banco y número son opcionales, como en el modelo: a veces llegan después y
// el echeq queda "pendiente de completar" (encabeza la lista). La fecha de
// cobro no: sin ella no hay aviso de vencimiento.
const schema = z.object({
  tipo: z.enum(['emitido', 'recibido']),
  monto: z.coerce.number().min(0.01, 'Falta el monto'),
  fecha_emision: z.string().min(1, 'Falta la fecha de emisión'),
  fecha_cobro: z.string().min(1, 'Falta la fecha de cobro'),
  contraparte: z.string().trim().min(1, 'Falta a nombre de quién'),
  banco: z.string().optional(),
  numero_cheque: z.string().optional(),
  alquiler_id: z.coerce.number().optional().nullable(),
  notas: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const inputCls = 'w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background';

function VenceCelda({ e }: { e: Echeq }) {
  const dias = diasParaCobro(e);
  if (dias === null) return <span className="italic text-muted-foreground">Sin fecha</span>;
  const abierto = estaEnCartera(e);
  return (
    <div>
      <div className="text-foreground">{formatDate(e.fecha_cobro)}</div>
      {abierto && (
        <div className={cn(
          'text-xs font-semibold',
          dias < 0 ? 'text-danger' : dias <= 7 ? 'text-warning' : 'text-muted-foreground',
        )}>
          {dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? 'hoy' : `en ${dias} d`}
        </div>
      )}
    </div>
  );
}

function MenuEstado({ e, onEstado }: { e: Echeq; onEstado: (echeq: Echeq, estado: EstadoEcheq) => void }) {
  const [abierto, setAbierto] = useState(false);
  const transiciones = ESTADOS_TRANSICION[e.estado] ?? [];
  if (transiciones.length === 0) return null;
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-lg hover:bg-accent text-foreground"
      >
        Cambiar estado <ChevronDown className="h-3 w-3" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
            {transiciones.map(est => (
              <button
                key={est}
                onClick={() => { onEstado(e, est); setAbierto(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent text-foreground"
              >
                {ESTADO_ECHEQ_LABEL[est] ?? est}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TablaSeccion({
  seccion, onEstado, colapsable,
}: {
  seccion: SeccionEcheqs;
  onEstado: (echeq: Echeq, estado: EstadoEcheq) => void;
  colapsable?: boolean;
}) {
  const [abierta, setAbierta] = useState(!colapsable);
  if (seccion.echeqs.length === 0) return null;
  const tono =
    seccion.clave === 'vencidos' ? 'border-danger/40 bg-danger/5'
      : seccion.clave === 'proximos' ? 'border-warning/40 bg-warning/5'
        : 'border-border bg-muted/30';

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierta(v => !v)}
        className={cn('w-full flex items-center justify-between gap-3 px-4 py-2.5 border-b text-left', tono)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {seccion.titulo}
          <span className="rounded-full bg-background border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {seccion.echeqs.length}
          </span>
        </span>
        <span className="text-sm font-bold text-foreground">{formatCurrency(seccion.total)}</span>
      </button>
      {abierta && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 font-medium text-right">Monto</th>
                <th className="px-4 py-2 font-medium">Cliente / contraparte</th>
                <th className="px-4 py-2 font-medium">Banco / Nº</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Reserva / alquiler</th>
                <th className="px-4 py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {seccion.echeqs.map(e => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30 align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap"><VenceCelda e={e} /></td>
                  <td className="px-4 py-2.5 text-right font-bold text-foreground whitespace-nowrap">{formatCurrency(e.monto)}</td>
                  <td className="px-4 py-2.5">
                    {e.cliente_id ? (
                      <Link to={`/clientes/${e.cliente_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {e.cliente_nombre ?? e.contraparte}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{e.contraparte}</span>
                    )}
                    {e.notas && <div className="text-xs italic text-muted-foreground">{e.notas}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {e.banco ?? <span className="italic">Sin banco</span>}
                    <div className="text-xs">#{e.numero_cheque ?? '—'}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-medium', ESTADO_ECHEQ_COLOR[e.estado] ?? 'bg-muted text-muted-foreground border-border')}>
                        {ESTADO_ECHEQ_LABEL[e.estado] ?? e.estado}
                      </span>
                      {!e.datos_completos && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning text-white font-semibold">
                          Pendiente de completar
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {e.reserva_id && <div>Reserva #{e.reserva_id}</div>}
                    {e.alquiler_id && <div>Alquiler #{e.alquiler_id}</div>}
                    {!e.reserva_id && !e.alquiler_id && '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right"><MenuEstado e={e} onEstado={onEstado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function EcheqsPage() {
  const [tab, setTab] = useState<'recibido' | 'emitido'>('recibido');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [rechazando, setRechazando] = useState<Echeq | null>(null);
  const [cliente, setCliente] = useState<ClienteBuscado | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const { data: echeqs = [], isLoading, refetch, isFetching } = useEcheqs({
    tipo: tab,
    estado: estadoFiltro || undefined,
  });
  const crear = useCrearEcheq();
  const actualizar = useActualizarEcheq();

  const { register, handleSubmit, reset, control, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'recibido', fecha_emision: hoyLocal() },
  });
  const tipoForm = useWatch({ control, name: 'tipo' });

  // Elegir el cliente completa la contraparte: es la misma persona, y
  // escribirla dos veces es la forma de que queden distintas.
  function elegirCliente(c: ClienteBuscado | null) {
    setCliente(c);
    if (c) setValue('contraparte', c.razon_social || c.nombre_completo, { shouldValidate: true });
    else if (getValues('contraparte') && cliente && getValues('contraparte') === (cliente.razon_social || cliente.nombre_completo)) {
      setValue('contraparte', '');
    }
  }

  function cerrarForm() {
    setShowForm(false);
    setCliente(null);
    setErrorForm(null);
    reset({ tipo: 'recibido', fecha_emision: hoyLocal() });
  }

  async function onSubmit(data: FormData) {
    setErrorForm(null);
    try {
      await crear.mutateAsync({
        ...data,
        banco: data.banco?.trim() || null,
        numero_cheque: data.numero_cheque?.trim() || null,
        cliente_id: data.tipo === 'recibido' ? (cliente?.id ?? null) : null,
        alquiler_id: data.alquiler_id || null,
        notas: data.notas || null,
      });
      toast.success('Echeq registrado');
      cerrarForm();
    } catch (err) {
      setErrorForm(extractError(err, 'No se pudo registrar el echeq.'));
      irAlError();
    }
  }

  // Lleva al primer campo con error en el orden en que aparecen en pantalla.
  function onInvalid(errs: FieldErrors<FormData>) {
    const orden: (keyof FormData)[] = ['monto', 'contraparte', 'fecha_emision', 'fecha_cobro'];
    irAlError(orden.find(k => errs[k]) ?? null);
  }

  async function handleEstado(echeq: Echeq, estado: EstadoEcheq) {
    if (estado === 'rechazado') {
      setRechazando(echeq);
      return;
    }
    try {
      await actualizar.mutateAsync({ id: echeq.id, payload: { estado } });
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleRechazar(motivo: string) {
    if (!rechazando) return;
    try {
      await actualizar.mutateAsync({ id: rechazando.id, payload: { estado: 'rechazado', motivo_rechazo: motivo } });
      toast.success('Echeq rechazado');
      setRechazando(null);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  const secciones = seccionesEcheqs(echeqs);
  const porClave = Object.fromEntries(secciones.map(s => [s.clave, s]));
  const totalCartera = echeqs.filter(estaEnCartera).reduce((s, e) => s + Number(e.monto || 0), 0);
  const venceSemana = porClave.proximos;
  const vencidos = porClave.vencidos;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Echeqs</h1>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(['recibido', 'emitido'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'recibido' ? '← Recibidos' : '→ Emitidos'}
              </button>
            ))}
          </div>
          <select
            value={estadoFiltro}
            onChange={e => setEstadoFiltro(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1 bg-background text-foreground"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_ECHEQ_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => (showForm ? cerrarForm() : setShowForm(true))}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo echeq
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Resumen: lo que hay y lo que vence. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">Total en cartera</div>
            <div className="text-lg font-bold text-foreground">{formatCurrency(totalCartera)}</div>
          </div>
          <div className={cn('rounded-xl border px-4 py-3', venceSemana.echeqs.length ? 'border-warning/40 bg-warning/10' : 'border-border bg-card')}>
            <div className="text-xs text-muted-foreground">Vence esta semana</div>
            <div className="text-lg font-bold text-foreground">
              {formatCurrency(venceSemana.total)}
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                {venceSemana.echeqs.length} echeq{venceSemana.echeqs.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className={cn('rounded-xl border px-4 py-3', vencidos.echeqs.length ? 'border-danger/40 bg-danger/10' : 'border-border bg-card')}>
            <div className="text-xs text-muted-foreground">Vencidos sin cobrar</div>
            <div className="text-lg font-bold text-foreground">
              {formatCurrency(vencidos.total)}
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                {vencidos.echeqs.length} echeq{vencidos.echeqs.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {/* Formulario nuevo */}
        {showForm && (
          <div className="bg-card border border-primary/30 rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Nuevo echeq</p>
            <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select {...register('tipo')} className={inputCls}>
                  <option value="recibido">← Recibido (cobro)</option>
                  <option value="emitido">→ Emitido (pago)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monto *</label>
                <input {...register('monto')} data-campo="monto" type="number" step="0.01" placeholder="0"
                  className={inputCls} />
                {errors.monto && <p className="text-xs text-danger">{errors.monto.message}</p>}
              </div>
              {tipoForm === 'recibido' && (
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Cliente</label>
                  <BuscadorCliente
                    valor={cliente}
                    onCambiar={elegirCliente}
                    origenAlta="un echeq"
                    className="mt-0.5"
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Con cliente, el echeq genera el crédito en su cuenta corriente y aparece en su ficha.
                    Si no existe, escribí el nombre y creálo desde la lista.
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">
                  {tipoForm === 'recibido' ? 'A nombre de (contraparte) *' : 'Proveedor (contraparte) *'}
                </label>
                <input {...register('contraparte')} data-campo="contraparte" placeholder="Nombre de quien firma"
                  className={inputCls} />
                {errors.contraparte && <p className="text-xs text-danger">{errors.contraparte.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Banco</label>
                <input {...register('banco')} placeholder="Banco Galicia" className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nº de cheque</label>
                <input {...register('numero_cheque')} placeholder="00012345" className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nº de alquiler (opcional)</label>
                <input {...register('alquiler_id')} type="number" placeholder="Ej: 7" className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha de emisión *</label>
                <input {...register('fecha_emision')} data-campo="fecha_emision" type="date" className={inputCls} />
                {errors.fecha_emision && <p className="text-xs text-danger">{errors.fecha_emision.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha de cobro *</label>
                <input {...register('fecha_cobro')} data-campo="fecha_cobro" type="date" className={inputCls} />
                {errors.fecha_cobro && <p className="text-xs text-danger">{errors.fecha_cobro.message}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Notas</label>
                <input {...register('notas')} placeholder="Opcional" className={inputCls} />
              </div>
              <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                Sin banco o número se guarda igual y queda como "pendiente de completar".
              </p>
              {errorForm && (
                <div data-error-banner className="sm:col-span-2 rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">
                  {errorForm}
                </div>
              )}
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button type="button" onClick={cerrarForm}
                  className="px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground">
                  Cancelar
                </button>
                <button type="submit" disabled={crear.isPending}
                  className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  {crear.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de echeqs, por secciones de trabajo */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Cargando...</div>
        ) : echeqs.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No hay echeqs {tab === 'recibido' ? 'recibidos' : 'emitidos'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {secciones.map(s => (
              <TablaSeccion
                key={s.clave}
                seccion={s}
                onEstado={handleEstado}
                colapsable={s.clave === 'cerrados'}
              />
            ))}
          </div>
        )}
      </div>

      <MotivoDialog
        open={rechazando !== null}
        onOpenChange={open => !open && setRechazando(null)}
        title="Rechazar echeq"
        description="El banco rechazó el cheque. Si había generado un crédito en la cuenta corriente del cliente, se revierte con un contra-asiento."
        confirmLabel="Rechazar"
        loading={actualizar.isPending}
        onConfirm={handleRechazar}
      />
    </div>
  );
}
