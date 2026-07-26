import { useState } from 'react';
import { Plus, AlertTriangle, CheckCircle2, Clock, RefreshCw, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useEcheqs, useCrearEcheq, useActualizarEcheq } from '@/hooks/useEcheqs';
import { formatCurrency, formatDate, extractError } from '@/lib/utils';
import { ESTADO_ECHEQ_LABEL, ESTADO_ECHEQ_COLOR } from '@/lib/constants';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import type { Echeq, EstadoEcheq } from '@/types';

const ESTADOS_TRANSICION: Record<string, EstadoEcheq[]> = {
  en_cartera: ['depositado', 'endosado', 'rechazado', 'cobrado'],
  depositado: ['cobrado', 'rechazado'],
  endosado: ['cobrado', 'rechazado'],
  pendiente: ['cobrado', 'rechazado', 'en_cartera'],
  cobrado: [],
  rechazado: [],
  vencido: [],
};

const schema = z.object({
  tipo: z.enum(['emitido', 'recibido']),
  monto: z.coerce.number().min(0.01, 'Requerido'),
  fecha_emision: z.string().min(1, 'Requerido'),
  fecha_cobro: z.string().min(1, 'Requerido'),
  contraparte: z.string().min(1, 'Requerido'),
  banco: z.string().min(1, 'Requerido'),
  numero_cheque: z.string().min(1, 'Requerido'),
  alquiler_id: z.coerce.number().optional().nullable(),
  notas: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function EcheqCard({ e, onEstado }: { e: Echeq; onEstado: (echeq: Echeq, estado: EstadoEcheq) => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const transiciones = ESTADOS_TRANSICION[e.estado] ?? [];

  const diasParaCobro = (() => {
    const hoy = new Date().toISOString().slice(0, 10);
    if (e.fecha_cobro < hoy) return -1;
    const diff = Math.round((new Date(e.fecha_cobro).getTime() - new Date(hoy).getTime()) / 86400000);
    return diff;
  })();

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-foreground">{formatCurrency(e.monto)}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ESTADO_ECHEQ_COLOR[e.estado] ?? 'bg-muted text-muted-foreground border-border'}`}>
              {ESTADO_ECHEQ_LABEL[e.estado] ?? e.estado}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${e.tipo === 'recibido' ? 'bg-success/10 text-success border-success/30' : 'bg-danger/10 text-danger border-danger/30'}`}>
              {e.tipo === 'recibido' ? '← Recibido' : '→ Emitido'}
            </span>
          </div>
          <p className="text-sm text-foreground font-medium mt-1">{e.contraparte}</p>
          <p className="text-xs text-muted-foreground">{e.banco} · #{e.numero_cheque}</p>
        </div>

        {transiciones.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(v => !v)}
              className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-lg hover:bg-accent text-muted-foreground"
            >
              Estado <ChevronDown className="h-3 w-3" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[130px]">
                  {transiciones.map(est => (
                    <button
                      key={est}
                      onClick={() => { onEstado(e, est); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                    >
                      {ESTADO_ECHEQ_LABEL[est] ?? est}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Emisión: {formatDate(e.fecha_emision)}</span>
        <span className={diasParaCobro < 0 ? 'text-danger font-medium' : diasParaCobro <= 7 ? 'text-warning font-medium' : ''}>
          Cobro: {formatDate(e.fecha_cobro)}
          {diasParaCobro === 0 && ' (hoy)'}
          {diasParaCobro > 0 && diasParaCobro <= 7 && ` (en ${diasParaCobro}d)`}
          {diasParaCobro < 0 && e.estado === 'en_cartera' && ' ⚠ vencido'}
        </span>
        {e.alquiler_id && <span>Alq. #{e.alquiler_id}</span>}
      </div>

      {e.notas && <p className="text-xs text-muted-foreground italic">{e.notas}</p>}
    </div>
  );
}

export function EcheqsPage() {
  const [tab, setTab] = useState<'recibido' | 'emitido'>('recibido');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [rechazando, setRechazando] = useState<Echeq | null>(null);

  const { data: echeqs = [], isLoading, refetch, isFetching } = useEcheqs({
    tipo: tab,
    estado: estadoFiltro || undefined,
  });
  const crear = useCrearEcheq();
  const actualizar = useActualizarEcheq();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: 'recibido',
      fecha_emision: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(data: FormData) {
    try {
      await crear.mutateAsync({
        ...data,
        alquiler_id: data.alquiler_id || null,
        notas: data.notas || null,
      });
      toast.success('Echeq registrado');
      reset();
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
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

  const proximos = echeqs.filter(e => {
    if (!['en_cartera', 'depositado', 'pendiente'].includes(e.estado)) return false;
    const hoy = new Date().toISOString().slice(0, 10);
    const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return e.fecha_cobro <= en7 && e.fecha_cobro >= hoy;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 gap-3">
        <div className="flex items-center gap-3">
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
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo echeq
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Alerta de próximos a cobrar */}
        {proximos.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm text-foreground">
              <span className="font-bold">{proximos.length}</span> echeq{proximos.length !== 1 ? 's' : ''} a cobrar en los próximos 7 días
            </p>
          </div>
        )}

        {/* Formulario nuevo */}
        {showForm && (
          <div className="bg-card border border-primary/30 rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Nuevo echeq</p>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select {...register('tipo')} className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background">
                  <option value="recibido">← Recibido (cobro)</option>
                  <option value="emitido">→ Emitido (pago)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monto</label>
                <input {...register('monto')} type="number" step="0.01" placeholder="0.00"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.monto && <p className="text-xs text-danger">{errors.monto.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Contraparte</label>
                <input {...register('contraparte')} placeholder="Nombre cliente o proveedor"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.contraparte && <p className="text-xs text-danger">{errors.contraparte.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Banco</label>
                <input {...register('banco')} placeholder="Banco Galicia"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.banco && <p className="text-xs text-danger">{errors.banco.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nro. de cheque</label>
                <input {...register('numero_cheque')} placeholder="00012345"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.numero_cheque && <p className="text-xs text-danger">{errors.numero_cheque.message}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Alquiler ID (opcional)</label>
                <input {...register('alquiler_id')} type="number" placeholder="Ej: 7"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha de emisión</label>
                <input {...register('fecha_emision')} type="date"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha de cobro</label>
                <input {...register('fecha_cobro')} type="date"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
                {errors.fecha_cobro && <p className="text-xs text-danger">{errors.fecha_cobro.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Notas</label>
                <input {...register('notas')} placeholder="Opcional"
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowForm(false); reset(); }}
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

        {/* Lista de echeqs */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Cargando...</div>
        ) : echeqs.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No hay echeqs {tab === 'recibido' ? 'recibidos' : 'emitidos'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {echeqs.map(e => (
              <EcheqCard key={e.id} e={e} onEstado={handleEstado} />
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
