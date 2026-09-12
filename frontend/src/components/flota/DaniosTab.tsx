import { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle, Plus, X, Save, ImagePlus, Trash2, DollarSign, Gift, Wrench, Camera, Loader2,
} from 'lucide-react';
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
import { comprimirImagen } from '@/lib/imagen';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cn, formatCurrency, formatDate, extractError } from '@/lib/utils';
import type { Danio, TipoDanio, SeveridadDanio, MomentoDanio } from '@/types';

/**
 * Qué daños lista el componente.
 *
 * - `vehiculo`: todos los del auto. Es la ficha de Flota.
 * - `alquiler`: sólo los que nacieron en este alquiler y en este momento. Es
 *   la devolución: los que ya estaban se muestran arriba, aparte, y repetirlos
 *   acá mezclaba "lo que trajo" con "lo que apareció".
 * - `sesion`: sólo los cargados desde esta pantalla. Es la entrega: el
 *   alquiler todavía no existe, así que no hay otra forma de reconocerlos.
 */
export type AlcanceDanios = 'vehiculo' | 'alquiler' | 'sesion';

interface Props {
  vehiculoId: number;
  /** Si viene, los daños nuevos se registran contra este alquiler. */
  alquilerId?: number;
  /** Momento con el que nacen los daños creados desde acá. */
  momento?: MomentoDanio;
  /** Modo compacto para usar dentro de un modal (sin Card exterior). */
  compacto?: boolean;
  titulo?: string;
  alcance?: AlcanceDanios;
  /** Aviso de cada daño recién creado (la entrega junta los ids). */
  onCreado?: (danio: Danio) => void;
}

const FORM_VACIO = {
  zona: '',
  tipo: 'rayon' as TipoDanio,
  severidad: 'leve' as SeveridadDanio,
  descripcion: '',
  costo_estimado: '',
};

interface FotoPendiente {
  file: File;
  url: string;
}

/**
 * Parte de daños: registrar, fotografiar, imputar, cobrar y bonificar.
 *
 * **Este componente vive adentro de los modales de entrega y devolución, y
 * no puede tener ni un `<form>` ni un botón que envíe.** Un `<button>` sin
 * `type` dentro de un formulario es de tipo *submit*, y el evento de envío
 * burbujea por el árbol de React —atravesando incluso los diálogos en portal—
 * hasta el formulario del modal. El reporte del mostrador:
 *
 * > *"Desde el celu, cuando estoy registrando el check-in, pongo registrar
 * > daños, agrego un daño y me saca a la parte de reservas y alquileres."*
 *
 * Lo que pasaba: tocar "Registrar daño" **registraba la devolución** con lo
 * que hubiera en pantalla —combustible lleno, limpio, garantía devuelta— y
 * cerraba el modal. Por eso todo botón acá lleva `type="button"`, el alta es
 * un `<div>` que se guarda con un click y no un `<form>`, y el test
 * `DaniosTab.test.tsx` lo cuida.
 */
export function DaniosTab({
  vehiculoId,
  alquilerId,
  momento = 'preexistente',
  compacto = false,
  titulo = 'Daños del vehículo',
  alcance = 'vehiculo',
  onCreado,
}: Props) {
  const { data: todos = [], isLoading } = useDanios(
    alcance === 'alquiler' && alquilerId ? { alquiler_id: alquilerId } : { vehiculo_id: vehiculoId },
  );
  const [idsDeLaSesion, setIdsDeLaSesion] = useState<number[]>([]);
  const danios = todos.filter(d => {
    if (alcance === 'alquiler') return d.momento === momento;
    if (alcance === 'sesion') return idsDeLaSesion.includes(d.id);
    return true;
  });

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
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [fotosNuevas, setFotosNuevas] = useState<FotoPendiente[]>([]);
  /** Progreso de subida, por daño: "subiendo 2 de 3". */
  const [subiendo, setSubiendo] = useState<{ danioId: number; hecho: number; total: number } | null>(null);

  const [bonificarId, setBonificarId] = useState<number | null>(null);
  const [cobrarId, setCobrarId] = useState<number | null>(null);
  const danioACobrar = danios.find(d => d.id === cobrarId) ?? null;
  const [imputandoId, setImputandoId] = useState<number | null>(null);
  const [montoImputar, setMontoImputar] = useState('');
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const inputCamara = useRef<HTMLInputElement | null>(null);
  const inputGaleria = useRef<HTMLInputElement | null>(null);

  // Las vistas previas son URLs de objeto: si no se liberan, cada foto sacada
  // queda ocupando memoria hasta cerrar la pestaña — y en un teléfono con
  // poca memoria eso es lo que hace que el navegador recargue la página.
  const fotosRef = useRef(fotosNuevas);
  fotosRef.current = fotosNuevas;
  useEffect(() => () => fotosRef.current.forEach(f => URL.revokeObjectURL(f.url)), []);

  function agregarFotosNuevas(files: FileList | null) {
    if (!files?.length) return;
    const nuevas = Array.from(files).map(file => ({ file, url: URL.createObjectURL(file) }));
    setFotosNuevas(prev => [...prev, ...nuevas]);
  }

  function quitarFotoNueva(i: number) {
    setFotosNuevas(prev => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  function cerrarForm() {
    fotosNuevas.forEach(f => URL.revokeObjectURL(f.url));
    setFotosNuevas([]);
    setForm(FORM_VACIO);
    setErrorForm(null);
    setShowForm(false);
  }

  /**
   * Sube fotos de a una. **Devuelve cuántas fallaron** en vez de tirar: el
   * daño ya existe, y una foto que no subió por la señal no puede hacer
   * parecer que el daño tampoco quedó.
   */
  async function subirFotos(danioId: number, files: File[]): Promise<number> {
    let fallidas = 0;
    setSubiendo({ danioId, hecho: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      try {
        const chica = await comprimirImagen(files[i]);
        await subirFoto.mutateAsync({ id: danioId, file: chica });
      } catch {
        fallidas++;
      }
      setSubiendo({ danioId, hecho: i + 1, total: files.length });
    }
    setSubiendo(null);
    return fallidas;
  }

  async function handleCrear() {
    if (!form.zona.trim()) {
      setErrorForm('Indicá la zona del daño.');
      return;
    }
    setErrorForm(null);
    let danio: Danio;
    try {
      const res = await crear.mutateAsync({
        vehiculo_id: vehiculoId,
        alquiler_id: alquilerId ?? null,
        momento,
        zona: form.zona.trim(),
        tipo: form.tipo,
        severidad: form.severidad,
        descripcion: form.descripcion || null,
        costo_estimado: form.costo_estimado ? parseFloat(form.costo_estimado) : null,
      });
      danio = res.data.data;
    } catch (err) {
      setErrorForm(extractError(err));
      return;
    }

    setIdsDeLaSesion(ids => [...ids, danio.id]);
    onCreado?.(danio);

    const files = fotosNuevas.map(f => f.file);
    cerrarForm();
    if (files.length === 0) {
      toast.success('Daño registrado');
      return;
    }
    const fallidas = await subirFotos(danio.id, files);
    if (fallidas === 0) {
      toast.success(`Daño registrado con ${files.length} foto${files.length > 1 ? 's' : ''}`);
    } else {
      toast.error(
        `El daño quedó registrado, pero ${fallidas} de ${files.length} fotos no subieron. ` +
        'Volvé a cargarlas con el botón "Foto" del daño.',
      );
    }
  }

  async function handleFotos(danioId: number, files: FileList | null) {
    if (!files?.length) return;
    const lista = Array.from(files);
    const fallidas = await subirFotos(danioId, lista);
    if (fallidas === 0) toast.success(lista.length > 1 ? `${lista.length} fotos cargadas` : 'Foto cargada');
    else toast.error(`${fallidas} de ${lista.length} fotos no subieron. Probá de nuevo.`);
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

  const textoVacio =
    alcance === 'alquiler' ? 'No se registraron daños nuevos en esta devolución.'
    : alcance === 'sesion' ? 'Si ves algo que no figura arriba, registralo con foto antes de entregar.'
    : 'Sin daños registrados para este vehículo.';

  const contenido = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <h3 className="font-semibold text-foreground truncate">{titulo}</h3>
          {danios.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 text-xs font-semibold">
              {danios.length}
            </span>
          )}
        </div>
        {!showForm && (
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Registrar daño
          </Button>
        )}
      </div>

      {showForm && (
        <div role="group" aria-label="Nuevo daño" className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">Nuevo daño</span>
            <button type="button" onClick={cerrarForm} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Zona *</label>
              <input
                value={form.zona}
                onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                // Enter guarda. Sin `<form>` no hay envío implícito, y tampoco
                // se quiere: el Enter del teclado del teléfono no puede
                // disparar el formulario del modal.
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCrear(); } }}
                list="zonas-danio"
                placeholder="Ej: Puerta trasera izq."
                className="input-base"
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
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Costo estimado</label>
              <input
                type="number"
                inputMode="numeric"
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

          {/* ── Fotos ─────────────────────────────────────────────────
              Dos entradas y no una: con `capture` el teléfono abre la cámara
              trasera directo, que es lo que se usa parado al lado del auto;
              sin `capture`, deja elegir una foto que ya estaba en la galería. */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Fotos</label>
            {fotosNuevas.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {fotosNuevas.map((f, i) => (
                  <div key={f.url} className="relative">
                    <img src={f.url} alt={`Foto ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-border" />
                    <button
                      type="button"
                      onClick={() => quitarFotoNueva(i)}
                      className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full p-0.5"
                      aria-label={`Quitar foto ${i + 1}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={inputCamara}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              data-testid="danio-camara"
              onChange={e => { agregarFotosNuevas(e.target.files); e.target.value = ''; }}
            />
            <input
              ref={inputGaleria}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              data-testid="danio-galeria"
              onChange={e => { agregarFotosNuevas(e.target.files); e.target.value = ''; }}
            />
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={() => inputCamara.current?.click()}>
                <Camera className="h-3.5 w-3.5" /> Sacar foto
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => inputGaleria.current?.click()}>
                <ImagePlus className="h-3.5 w-3.5" /> Elegir de la galería
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Registrar un daño no le cobra nada al cliente. Para eso está "Imputar al cliente", que genera el débito en su cuenta corriente.
          </p>
          {errorForm && <p className="text-xs font-medium text-danger">{errorForm}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" disabled={crear.isPending} onClick={handleCrear}>
              <Save className="h-4 w-4" />
              {crear.isPending
                ? 'Guardando...'
                : fotosNuevas.length > 0
                  ? `Guardar daño con ${fotosNuevas.length} foto${fotosNuevas.length > 1 ? 's' : ''}`
                  : 'Guardar daño'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cerrarForm}>Cancelar</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : danios.length === 0 ? (
        <div className={cn('flex flex-col items-center justify-center gap-2 text-muted-foreground text-center', compacto ? 'py-3' : 'py-8')}>
          {!compacto && <Wrench className="h-9 w-9 opacity-30" />}
          <p className="text-sm">{textoVacio}</p>
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
                      <a href={resolveAssetUrl(f.url) ?? '#'} target="_blank" rel="noreferrer">
                        <img
                          src={resolveAssetUrl(f.url) ?? ''}
                          alt={f.descripcion ?? 'Foto del daño'}
                          className="h-20 w-20 object-cover rounded-lg border border-border"
                        />
                      </a>
                      {/* **La foto del rayón es la prueba con la que se le
                          cobra al cliente**, y el borrado es real (no baja
                          lógica): por eso pregunta. En pantallas táctiles no
                          hay hover, así que ahí el botón se ve siempre. */}
                      <button
                        type="button"
                        onClick={() => setFotoAEliminar(f.id)}
                        className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full p-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        title="Eliminar foto"
                        aria-label="Eliminar foto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {subiendo?.danioId === d.id && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Subiendo foto {Math.min(subiendo.hecho + 1, subiendo.total)} de {subiendo.total}…
                </p>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  ref={el => { fileInputs.current[d.id] = el; }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { handleFotos(d.id, e.target.files); e.target.value = ''; }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputs.current[d.id]?.click()} disabled={subiendo !== null}>
                  <ImagePlus className="h-3.5 w-3.5" /> Foto
                </Button>

                {d.estado !== 'imputado' && d.estado !== 'reparado' && (
                  imputandoId === d.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={montoImputar}
                        onChange={e => setMontoImputar(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleImputar(d); } }}
                        placeholder="Monto"
                        min={0}
                        autoFocus
                        className="input-base h-8 w-28 text-sm"
                      />
                      <Button type="button" size="sm" onClick={() => handleImputar(d)} disabled={imputar.isPending}>
                        Confirmar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setImputandoId(null); setMontoImputar(''); }}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => { setImputandoId(d.id); setMontoImputar(d.costo_estimado ?? ''); }}
                    >
                      <DollarSign className="h-3.5 w-3.5" /> Imputar al cliente
                    </Button>
                  )
                )}

                {/* Imputar y cobrar son dos actos distintos. Imputar genera el
                    débito —el cliente lo debe—; cobrar es la plata entrando, y
                    desde `PLAN_DINERO.md` §1.4 crea el Pago que la hace
                    aparecer en la caja del día. */}
                {d.estado === 'imputado' && (
                  <Button type="button" variant="default" size="sm" onClick={() => setCobrarId(d.id)}>
                    <DollarSign className="h-3.5 w-3.5" /> Registrar cobro
                  </Button>
                )}

                {d.estado !== 'bonificado' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setBonificarId(d.id)}>
                    <Gift className="h-3.5 w-3.5" /> Bonificar
                  </Button>
                )}

                {d.estado !== 'reparado' && (
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => actualizar.mutate({ id: d.id, payload: { estado: 'reparado' } })}
                  >
                    <Wrench className="h-3.5 w-3.5" /> Marcar reparado
                  </Button>
                )}

                {d.estado !== 'imputado' && (
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => darDeBaja.mutate(d.id)}
                    title="Baja lógica — el daño no se borra"
                    aria-label="Dar de baja el daño"
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
