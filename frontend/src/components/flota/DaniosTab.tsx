import { useState, useRef } from 'react';
import { AlertTriangle, Plus, X, Save, ImagePlus, Trash2, DollarSign, Gift, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { CobroDialog, type DatosDeCobro } from '@/components/shared/CobroDialog';
import {
  useDanios, useCrearDanio, useActualizarDanio, useImputarDanio,
  useCobrarDanio,
  useBonificarDanio, useDarDeBajaDanio, useSubirFotoDanio, useEliminarFotoDanio,
} from '@/hooks/useDanios';
import {
  TIPO_DANIO_LABEL, SEVERIDAD_DANIO_LABEL, SEVERIDAD_DANIO_COLOR,
  ESTADO_DANIO_LABEL, ESTADO_DANIO_COLOR, RESPONSABLE_DANIO_LABEL, ZONAS_DANIO,
} from '@/lib/constants';
import { resolveAssetUrl } from '@/lib/api';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cn, formatCurrency, formatDate, extractError } from '@/lib/utils';
import type { Danio, TipoDanio, SeveridadDanio, MomentoDanio } from '@/types';

interface Props {
  vehiculoId: number;
  /** Si viene, los daños nuevos se registran contra este alquiler. */
  alquilerId?: number;
  /** Momento con el que nacen los daños creados desde acá. */
  momento?: MomentoDanio;
  /** Modo compacto para usar dentro de un modal (sin Card exterior). */
  compacto?: boolean;
  titulo?: string;
}

const FORM_VACIO = {
  zona: '',
  tipo: 'rayon' as TipoDanio,
  severidad: 'leve' as SeveridadDanio,
  descripcion: '',
  costo_estimado: '',
};

export function DaniosTab({
  vehiculoId,
  alquilerId,
  momento = 'preexistente',
  compacto = false,
  titulo = 'Daños del vehículo',
}: Props) {
  const { data: danios = [], isLoading } = useDanios({ vehiculo_id: vehiculoId });
  const crear = useCrearDanio();
  const actualizar = useActualizarDanio();
  const imputar = useImputarDanio();
  const cobrar = useCobrarDanio();
  const bonificar = useBonificarDanio();
  const darDeBaja = useDarDeBajaDanio();
  const subirFoto = useSubirFotoDanio();
  const eliminarFoto = useEliminarFotoDanio();
  /** La foto que se está por borrar. El borrado es real y no hay vuelta atrás. */
  const [fotoAEliminar, setFotoAEliminar] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [bonificarId, setBonificarId] = useState<number | null>(null);
  const [cobrarId, setCobrarId] = useState<number | null>(null);
  const danioACobrar = danios.find(d => d.id === cobrarId) ?? null;
  const [imputandoId, setImputandoId] = useState<number | null>(null);
  const [montoImputar, setMontoImputar] = useState('');
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    try {
      await crear.mutateAsync({
        vehiculo_id: vehiculoId,
        alquiler_id: alquilerId ?? null,
        momento,
        zona: form.zona,
        tipo: form.tipo,
        severidad: form.severidad,
        descripcion: form.descripcion || null,
        costo_estimado: form.costo_estimado ? parseFloat(form.costo_estimado) : null,
      });
      toast.success('Daño registrado');
      setForm(FORM_VACIO);
      setShowForm(false);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleImputar(d: Danio) {
    const monto = parseFloat(montoImputar);
    if (!monto || monto <= 0) {
      toast.error('Indicá el monto a cobrarle al cliente');
      return;
    }
    try {
      await imputar.mutateAsync({ id: d.id, monto, cliente_id: d.cliente_id ?? undefined });
      toast.success('Daño imputado — se generó el débito en la cuenta corriente');
      setImputandoId(null);
      setMontoImputar('');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleCobrar(datos: DatosDeCobro) {
    if (!cobrarId) return;
    try {
      await cobrar.mutateAsync({ id: cobrarId, ...datos });
      toast.success('Daño cobrado — entró a la caja del día');
      setCobrarId(null);
    } catch (e) {
      toast.error(extractError(e));
    }
  }

  async function handleBonificar(motivo: string) {
    if (!bonificarId) return;
    try {
      await bonificar.mutateAsync({ id: bonificarId, motivo });
      toast.success('Daño bonificado');
      setBonificarId(null);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleFoto(danioId: number, file: File | undefined) {
    if (!file) return;
    try {
      await subirFoto.mutateAsync({ id: danioId, file });
      toast.success('Foto cargada');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  const contenido = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h3 className="font-semibold text-foreground">{titulo}</h3>
          {danios.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 text-xs font-semibold">
              {danios.length}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" /> Registrar daño
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCrear} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">Nuevo daño</span>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Zona *</label>
              <input
                value={form.zona}
                onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                list="zonas-danio"
                placeholder="Ej: Puerta trasera izq."
                className="input-base"
                required
              />
              <datalist id="zonas-danio">
                {ZONAS_DANIO.map(z => <option key={z} value={z} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoDanio }))}
                className="input-base"
              >
                {(Object.keys(TIPO_DANIO_LABEL) as TipoDanio[]).map(t => (
                  <option key={t} value={t}>{TIPO_DANIO_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Severidad</label>
              <select
                value={form.severidad}
                onChange={e => setForm(f => ({ ...f, severidad: e.target.value as SeveridadDanio }))}
                className="input-base"
              >
                {(Object.keys(SEVERIDAD_DANIO_LABEL) as SeveridadDanio[]).map(s => (
                  <option key={s} value={s}>{SEVERIDAD_DANIO_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Costo estimado</label>
              <input
                type="number"
                value={form.costo_estimado}
                onChange={e => setForm(f => ({ ...f, costo_estimado: e.target.value }))}
                placeholder="Opcional"
                min={0}
                className="input-base"
              />
            </div>
            <div className="space-y-1 col-span-2 sm:col-span-4">
              <label className="text-xs font-medium text-muted-foreground">Descripción</label>
              <input
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Detalle de lo observado"
                className="input-base"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Registrar un daño no le cobra nada al cliente. Para eso está "Cobrar al cliente", que genera el débito en su cuenta corriente.
          </p>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={crear.isPending}>
              <Save className="h-4 w-4" /> {crear.isPending ? 'Guardando...' : 'Guardar daño'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : danios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
          <Wrench className="h-9 w-9 opacity-30" />
          <p className="text-sm">Sin daños registrados para este vehículo.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {danios.map(d => (
            <div key={d.id} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground text-sm">{d.zona}</span>
                    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold', SEVERIDAD_DANIO_COLOR[d.severidad])}>
                      {SEVERIDAD_DANIO_LABEL[d.severidad]}
                    </span>
                    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', ESTADO_DANIO_COLOR[d.estado])}>
                      {ESTADO_DANIO_LABEL[d.estado]}
                    </span>
                    <span className="text-xs text-muted-foreground">{TIPO_DANIO_LABEL[d.tipo]}</span>
                  </div>
                  {d.descripcion && <p className="text-sm text-muted-foreground">{d.descripcion}</p>}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(d.fecha_deteccion)} · {d.momento === 'checkout' ? 'Detectado en la entrega' : d.momento === 'checkin' ? 'Detectado en la devolución' : 'Carga manual'}
                    {d.alquiler_id ? ` · Alquiler #${d.alquiler_id}` : ''}
                    {' · '}Responsable: {RESPONSABLE_DANIO_LABEL[d.responsable]}
                  </p>
                  {d.estado === 'bonificado' && d.motivo_bonificacion && (
                    <p className="text-xs text-muted-foreground italic">Bonificado: {d.motivo_bonificacion}</p>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  {d.costo_estimado && (
                    <p className="text-xs text-muted-foreground">Est. {formatCurrency(d.costo_estimado)}</p>
                  )}
                  {d.monto_imputado && (
                    <p className="text-sm font-bold text-warning">Cobrado {formatCurrency(d.monto_imputado)}</p>
                  )}
                </div>
              </div>

              {d.fotos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {d.fotos.map(f => (
                    <div key={f.id} className="relative group">
                      <img
                        src={resolveAssetUrl(f.url) ?? ''}
                        alt={f.descripcion ?? 'Foto del daño'}
                        className="h-20 w-20 object-cover rounded-lg border border-border"
                      />
                      {/* **La foto del rayón es la prueba con la que se le
                          cobra al cliente**, el borrado es real (no baja
                          lógica) y el botón aparece al pasar el mouse por una
                          miniatura de 80px. Un click de más y no está más.
                          Ahora pregunta. */}
                      <button
                        type="button"
                        onClick={() => setFotoAEliminar(f.id)}
                        className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar foto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  ref={el => { fileInputs.current[d.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { handleFoto(d.id, e.target.files?.[0]); e.target.value = ''; }}
                />
                <Button variant="outline" size="sm" onClick={() => fileInputs.current[d.id]?.click()} disabled={subirFoto.isPending}>
                  <ImagePlus className="h-3.5 w-3.5" /> Foto
                </Button>

                {d.estado !== 'imputado' && d.estado !== 'reparado' && (
                  imputandoId === d.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={montoImputar}
                        onChange={e => setMontoImputar(e.target.value)}
                        placeholder="Monto"
                        min={0}
                        autoFocus
                        className="input-base h-8 w-28 text-sm"
                      />
                      <Button size="sm" onClick={() => handleImputar(d)} disabled={imputar.isPending}>
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setImputandoId(null); setMontoImputar(''); }}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { setImputandoId(d.id); setMontoImputar(d.costo_estimado ?? ''); }}
                    >
                      <DollarSign className="h-3.5 w-3.5" /> Imputar al cliente
                    </Button>
                  )
                )}

                {/* Imputar y cobrar son dos actos distintos y el botón de
                    arriba decía "Cobrar al cliente" para el primero. Imputar
                    genera el débito —el cliente lo debe—; cobrar es la plata
                    entrando, y desde `PLAN_DINERO.md` §1.4 crea el Pago que la
                    hace aparecer en la caja del día. */}
                {d.estado === 'imputado' && (
                  <Button variant="default" size="sm" onClick={() => setCobrarId(d.id)}>
                    <DollarSign className="h-3.5 w-3.5" /> Registrar cobro
                  </Button>
                )}

                {d.estado !== 'bonificado' && (
                  <Button variant="outline" size="sm" onClick={() => setBonificarId(d.id)}>
                    <Gift className="h-3.5 w-3.5" /> Bonificar
                  </Button>
                )}

                {d.estado !== 'reparado' && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => actualizar.mutate({ id: d.id, payload: { estado: 'reparado' } })}
                  >
                    <Wrench className="h-3.5 w-3.5" /> Marcar reparado
                  </Button>
                )}

                {d.estado !== 'imputado' && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => darDeBaja.mutate(d.id)}
                    title="Baja lógica — el daño no se borra"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CobroDialog
        open={cobrarId !== null}
        onOpenChange={open => !open && setCobrarId(null)}
        title="Cobrar daño"
        description="El cliente pagó el daño imputado. Se registra el cobro en la caja del día y se cancela el débito en su cuenta corriente. El daño sigue figurando en el auto hasta que se marque reparado."
        monto={danioACobrar?.monto_imputado ? `$${parseFloat(String(danioACobrar.monto_imputado)).toLocaleString('es-AR')}` : undefined}
        loading={cobrar.isPending}
        onConfirm={handleCobrar}
      />

      <MotivoDialog
        open={bonificarId !== null}
        onOpenChange={open => !open && setBonificarId(null)}
        title="Bonificar daño"
        description="Se le perdona el daño al cliente. Si ya estaba imputado, el débito se revierte con un contra-asiento en su cuenta corriente."
        confirmLabel="Bonificar"
        loading={bonificar.isPending}
        onConfirm={handleBonificar}
      />

      <ConfirmDialog
        open={fotoAEliminar !== null}
        onOpenChange={(abierto) => { if (!abierto) setFotoAEliminar(null); }}
        title="Eliminar la foto del daño"
        description="Esta foto es la constancia del daño y se elimina de verdad: no se puede recuperar. Si el daño todavía no se le cobró al cliente, es la prueba con la que se le cobra."
        confirmLabel="Eliminar la foto"
        destructive
        loading={eliminarFoto.isPending}
        onConfirm={async () => {
          if (fotoAEliminar === null) return;
          await eliminarFoto.mutateAsync(fotoAEliminar);
          setFotoAEliminar(null);
        }}
      />
    </div>
  );

  return compacto ? contenido : <Card className="p-5">{contenido}</Card>;
}
