import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Megaphone, Plus, RefreshCw, Search, Upload, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useAgregarProspecto, useCambiarEstadoProspectos, useContarSeleccion, useCruzarProspectos,
  useImportarArchivoProspectos, useNoEsClienteProspecto, usePanelProspeccion, useProspectos,
  useResumenProspectos, useSimularImportacion,
  type FiltroProspectos, type Prospecto, type ProspectoNuevo, type Seleccion, type TotalesDeImportacion,
} from '@/hooks/useProspectos';
import { leerProspectos } from '@/lib/leerProspectos';
import { cn, extractError } from '@/lib/utils';
import { CampanasTab } from './CampanasTab';
import { CasillasTab } from './CasillasTab';
import { NuevaCampana } from './NuevaCampana';

const POR_PAGINA = 50;
const ESTADO_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', respondio: 'Respondió', cliente: 'Cliente',
  descartado: 'Descartado', no_contactar: 'No contactar',
};

type Pestana = 'empresas' | 'campanas' | 'casillas';
const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'empresas', texto: 'Empresas' }, { id: 'campanas', texto: 'Campañas' }, { id: 'casillas', texto: 'Casillas' },
];

/**
 * Prospectos de Ubicar: empresas que podrían alquilar, cruzadas contra los
 * clientes que ya tiene, y las campañas de mail que se les mandan.
 *
 * Tres pestañas: **Empresas** (la base: filtrar, cargar, importar),
 * **Campañas** (lo que salió y lo que pasó) y **Casillas** (desde dónde sale).
 * "Nueva campaña" se abre desde cualquiera y es un asistente de una pantalla.
 */
export function ProspectosPage() {
  const [vista, setVista] = useState<Pestana>('empresas');
  // El asistente vive acá y no en la tabla: se abre desde Empresas (con o sin
  // selección) y desde Campañas, y su cartel "sin casilla" cambia de pestaña.
  const [nueva, setNueva] = useState<{ seleccion: Seleccion | null; cantidad: number } | null>(null);
  const [alCrear, setAlCrear] = useState<(() => void) | null>(null);

  const abrirNueva = (seleccion: Seleccion | null = null, cantidad = 0, despues?: () => void) => {
    setNueva({ seleccion, cantidad });
    setAlCrear(() => despues ?? null);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Prospectos"
        description="Empresas que podrían alquilar, cruzadas con tus clientes, y las campañas de mail que les mandás."
      />
      <Resumen />
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex w-fit overflow-hidden rounded-lg border border-ubicar-border bg-white">
          {PESTANAS.map(t => (
            <button key={t.id} role="tab" aria-selected={vista === t.id} onClick={() => setVista(t.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                vista === t.id ? 'bg-ubicar-primary text-white' : 'text-ubicar-text hover:bg-surface',
              )}>
              {t.texto}
            </button>
          ))}
        </div>
        <Button size="lg" className="ml-auto" onClick={() => abrirNueva()}>
          <Megaphone className="h-5 w-5" /> Nueva campaña
        </Button>
      </div>
      {vista === 'empresas' && <ListaDeProspectos onNuevaCampana={abrirNueva} />}
      {vista === 'campanas' && <CampanasTab onNueva={() => abrirNueva()} />}
      {vista === 'casillas' && <CasillasTab />}

      {nueva && (
        <NuevaCampana seleccion={nueva.seleccion} cantidadSeleccionada={nueva.cantidad}
          onClose={() => setNueva(null)}
          onCreada={() => { alCrear?.(); setVista('campanas'); }}
          onIrACasillas={() => setVista('casillas')} />
      )}
    </div>
  );
}

/** Los cuatro números que importan, arriba de todo. */
function Resumen() {
  const { data } = usePanelProspeccion();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Dato titulo="Se les puede escribir" valor={data?.contactables} destacado />
      <Dato titulo="Enviados esta semana" valor={data?.enviados_semana} />
      <Dato titulo="Respondieron" valor={data?.respuestas} />
      <Dato titulo="Se dieron de baja" valor={data?.bajas} />
    </div>
  );
}

// ─── Prospectos ──────────────────────────────────────────────────────────────

function ListaDeProspectos({ onNuevaCampana }: {
  onNuevaCampana: (seleccion: Seleccion, cantidad: number, despues: () => void) => void;
}) {
  const { data: resumen } = useResumenProspectos();
  const [q, setQ] = useState('');
  const qDebounced = useDebouncedValue(q, 300);
  const [segmento, setSegmento] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [estado, setEstado] = useState('');
  const [soloContactables, setSoloContactables] = useState(true);
  const [pagina, setPagina] = useState(1);

  const filtro: FiltroProspectos = useMemo(() => ({
    ...(qDebounced ? { q: qDebounced } : {}),
    ...(segmento ? { segmento } : {}),
    ...(ciudad ? { ciudad } : {}),
    ...(estado ? { estado } : {}),
    ...(soloContactables ? { solo_contactables: true } : {}),
  }), [qDebounced, segmento, ciudad, estado, soloContactables]);

  const { data, isLoading, isFetching } = useProspectos(filtro, pagina, POR_PAGINA);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // La selección: ids elegidos a mano, o "todos los del filtro".
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [todosElFiltro, setTodosElFiltro] = useState(false);
  useEffect(() => { setPagina(1); setIds(new Set()); setTodosElFiltro(false); }, [filtro]);

  const { data: conteo } = useContarSeleccion(todosElFiltro ? filtro : null);
  const cantidadSeleccionada = todosElFiltro ? (conteo?.cantidad ?? total) : ids.size;

  const todosEnPagina = items.length > 0 && items.every(p => ids.has(p.id));
  const alternarPagina = () => {
    const sig = new Set(ids);
    if (todosEnPagina) items.forEach(p => sig.delete(p.id));
    else items.forEach(p => sig.add(p.id));
    setIds(sig);
    setTodosElFiltro(false);
  };
  const alternar = (id: number) => {
    const sig = new Set(ids);
    if (sig.has(id)) sig.delete(id); else sig.add(id);
    setIds(sig);
    setTodosElFiltro(false);
  };

  const seleccion: Seleccion = todosElFiltro ? { filtro } : { ids: [...ids] };
  const cambiarEstado = useCambiarEstadoProspectos();
  const noEsCliente = useNoEsClienteProspecto();
  const cruzar = useCruzarProspectos();
  const archivo = useRef<HTMLInputElement>(null);
  const [aImportar, setAImportar] = useState<{ nombre: string; lista: unknown[] } | null>(null);
  const [agregando, setAgregando] = useState(false);
  const limpiar = () => { setIds(new Set()); setTodosElFiltro(false); };

  /** Un `.json` (el del sincronizador o una lista investigada) o un `.csv` de planilla. */
  async function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const texto = await new Promise<string>((ok, mal) => {
        const lector = new FileReader();
        lector.onload = () => ok(String(lector.result ?? ''));
        lector.onerror = () => mal(lector.error);
        lector.readAsText(f);
      });
      setAImportar({ nombre: f.name, lista: leerProspectos(texto, f.name) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No pude leer ese archivo.');
    }
  }

  return (
    <>
      <p className="-mt-1 text-xs text-muted-foreground">
        {resumen ? <>
          {resumen.total.toLocaleString('es-AR')} empresas en la base · {(resumen.por_estado?.cliente ?? 0).toLocaleString('es-AR')} ya
          son clientes · {(resumen.por_estado?.no_contactar ?? 0).toLocaleString('es-AR')} pidieron que no las contacten
        </> : ' '}
      </p>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, mail, ciudad…"
              className="input-base pl-8" />
          </span>
        </label>
        <Selector etiqueta="Segmento" valor={segmento} onChange={setSegmento}
          opciones={(resumen?.segmentos ?? []).map(s => ({ valor: s.segmento, texto: `${s.segmento} (${s.cantidad})` }))} />
        <Selector etiqueta="Ciudad" valor={ciudad} onChange={setCiudad}
          opciones={(resumen?.ciudades ?? []).map(c => ({ valor: c, texto: c }))} />
        <Selector etiqueta="Estado" valor={estado} onChange={setEstado}
          opciones={Object.entries(ESTADO_LABEL).map(([valor, texto]) => ({ valor, texto }))} />
        <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
          <input type="checkbox" checked={soloContactables}
            onChange={e => setSoloContactables(e.target.checked)} className="h-4 w-4 accent-primary" />
          Solo a los que se les puede escribir
        </label>
        <Button variant="outline" size="sm" disabled={cruzar.isPending}
          onClick={() => cruzar.mutate(undefined, { onSuccess: () => toast.success('Cruce actualizado con tus clientes') })}>
          <RefreshCw className={cn('h-4 w-4', cruzar.isPending && 'animate-spin')} /> Volver a cruzar
        </Button>
        <input ref={archivo} type="file" accept=".json,.csv,application/json,text/csv" className="hidden"
          data-testid="archivo-prospectos" onChange={elegirArchivo} />
        <Button variant="outline" size="sm" onClick={() => archivo.current?.click()}>
          <Upload className="h-4 w-4" /> Importar archivo
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
          <Plus className="h-4 w-4" /> Agregar prospecto
        </Button>
      </Card>

      {/* La selección en masa */}
      {(ids.size > 0 || todosElFiltro) && (
        <Card className="flex flex-wrap items-center gap-3 border-ubicar-primary/40 bg-surface p-3">
          <p className="text-sm text-foreground">
            <strong>{cantidadSeleccionada.toLocaleString('es-AR')}</strong> seleccionados
            {!todosElFiltro && total > items.length && ids.size >= items.length && (
              <button className="ml-2 text-ubicar-primary underline underline-offset-2"
                onClick={() => setTodosElFiltro(true)}>
                Seleccionar los {total.toLocaleString('es-AR')} que cumplen el filtro
              </button>
            )}
            {todosElFiltro && conteo?.supera_el_maximo && (
              <span className="ml-2 text-amber-700">Son más de {conteo.maximo}: filtrá un poco más.</span>
            )}
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" disabled={!!conteo?.supera_el_maximo}
              onClick={() => onNuevaCampana(seleccion, cantidadSeleccionada, limpiar)}>
              <Megaphone className="h-4 w-4" /> Crear campaña
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => cambiarEstado.mutate({ ...seleccion, estado: 'descartado' }, {
                onSuccess: () => { toast.success('Descartados'); limpiar(); },
                onError: e => toast.error(extractError(e)),
              })}>
              <Ban className="h-4 w-4" /> Descartar
            </Button>
            <Button size="sm" variant="ghost" onClick={limpiar}>
              Limpiar
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={todosEnPagina} onChange={alternarPagina}
                    aria-label="Seleccionar los de esta página" className="h-4 w-4 accent-primary" />
                </th>
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium">Segmento</th>
                <th className="px-3 py-2 font-medium">Contacto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 6 }, (_, i) => (
                <tr key={i}><td colSpan={5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  No hay prospectos con ese filtro.
                </td></tr>
              )}
              {items.map(p => (
                <Fila key={p.id} p={p} marcado={ids.has(p.id) || todosElFiltro} onMarcar={() => alternar(p.id)}
                  onNoEsCliente={() => noEsCliente.mutate(p.id, {
                    onSuccess: () => toast.success('Listo: ya no se lo cuenta como cliente'),
                  })} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>{total.toLocaleString('es-AR')} prospectos{isFetching && ' · actualizando…'}</span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
            Página {pagina} de {paginas}
            <Button size="sm" variant="ghost" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
          </span>
        </div>
      </Card>

      {aImportar && <VistaPreviaImportacion {...aImportar} onClose={() => setAImportar(null)} />}
      {agregando && <AgregarProspecto onClose={() => setAgregando(false)} />}
    </>
  );
}

function Dato({ titulo, valor, destacado }: { titulo: string; valor?: number; destacado?: boolean }) {
  return (
    <Card className={cn('p-4', destacado && 'border-ubicar-primary/40 bg-surface')}>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ubicar-dark">
        {valor === undefined ? '—' : valor.toLocaleString('es-AR')}
      </p>
    </Card>
  );
}

function Selector({ etiqueta, valor, onChange, opciones }: {
  etiqueta: string; valor: string; onChange: (v: string) => void;
  opciones: { valor: string; texto: string }[];
}) {
  return (
    <label className="flex min-w-[150px] flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <select value={valor} onChange={e => onChange(e.target.value)} className="input-base">
        <option value="">Todos</option>
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </label>
  );
}

function Fila({ p, marcado, onMarcar, onNoEsCliente }: {
  p: Prospecto; marcado: boolean; onMarcar: () => void; onNoEsCliente: () => void;
}) {
  return (
    <tr className={cn('hover:bg-muted/40', marcado && 'bg-surface')}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={marcado} onChange={onMarcar}
          aria-label={`Seleccionar ${p.nombre}`} className="h-4 w-4 accent-primary" />
      </td>
      <td className="px-3 py-2">
        <p className="font-medium text-foreground">{p.nombre}</p>
        <p className="text-xs text-muted-foreground">{[p.ciudad, p.direccion].filter(Boolean).join(' · ')}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {p.es_cliente && (
            <Etiqueta color="verde">
              {p.cruce_por === 'nombre' ? `¿Es ${p.ya_cliente_nombre ?? 'un cliente'}?` : `Ya es cliente (${p.cruce_por})`}
            </Etiqueta>
          )}
          {p.no_contactar && <Etiqueta color="rojo">No contactar</Etiqueta>}
          {p.es_cliente && p.cruce_por === 'nombre' && (
            <button onClick={onNoEsCliente} className="text-[11px] text-ubicar-primary underline">
              <UserCheck className="mr-0.5 inline h-3 w-3" />No es el mismo
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{p.segmento ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        {p.email && <p className="text-foreground">{p.email}</p>}
        {p.telefono && <p className="text-muted-foreground">{p.telefono}</p>}
        {!p.email && !p.telefono && <p className="text-muted-foreground">Sin contacto</p>}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{ESTADO_LABEL[p.estado] ?? p.estado}</td>
    </tr>
  );
}

function Etiqueta({ color, children }: { color: 'verde' | 'ambar' | 'rojo'; children: React.ReactNode }) {
  const c = {
    verde: 'bg-emerald-100 text-emerald-800',
    ambar: 'bg-amber-100 text-amber-800',
    rojo: 'bg-red-100 text-red-800',
  }[color];
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', c)}>{children}</span>;
}

// ─── Importar y agregar ──────────────────────────────────────────────────────

/**
 * Antes de importar se muestra qué va a pasar: el servidor lo cuenta con
 * `simular` (las mismas reglas de "ya estaba" que al guardar de verdad), así
 * nadie importa a ciegas una lista que en realidad repite media base.
 */
function VistaPreviaImportacion({ nombre, lista, onClose }: { nombre: string; lista: unknown[]; onClose: () => void }) {
  const simular = useSimularImportacion();
  const importar = useImportarArchivoProspectos();
  const [previa, setPrevia] = useState<TotalesDeImportacion | null>(null);
  const { mutate } = simular;
  useEffect(() => {
    mutate(lista, { onSuccess: setPrevia, onError: e => toast.error(extractError(e)) });
  }, [lista, mutate]);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar {nombre}</DialogTitle>
          <DialogDescription>
            {lista.length.toLocaleString('es-AR')} {lista.length === 1 ? 'fila' : 'filas'}. Las empresas que ya estaban
            (mismo mail, teléfono o web) se completan, no se duplican. Nunca se borra un dato ni se vuelve a escribir
            a quien pidió la baja.
          </DialogDescription>
        </DialogHeader>
        {!previa ? <Skeleton className="h-16 w-full" /> : (
          <div className="grid grid-cols-3 gap-2 text-center" data-testid="vista-previa-importacion">
            <Cifra titulo="Nuevas" valor={previa.nuevos} />
            <Cifra titulo="Ya estaban" valor={previa.actualizados} />
            <Cifra titulo="Sin nombre (no entran)" valor={previa.invalidos} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!previa || previa.nuevos + previa.actualizados === 0 || importar.isPending}
            onClick={() => importar.mutate(lista, {
              onSuccess: t => {
                toast.success(`${t.nuevos} nuevas, ${t.actualizados} actualizadas · ${t.ya_clientes} ya son clientes`);
                onClose();
              },
              onError: e => toast.error(extractError(e)),
            })}>
            {importar.isPending ? 'Importando…' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cifra({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-2xl font-bold tabular-nums text-ubicar-dark">{valor.toLocaleString('es-AR')}</p>
      <p className="text-xs text-muted-foreground">{titulo}</p>
    </div>
  );
}

const CAMPOS_ALTA: { campo: keyof ProspectoNuevo; texto: string; ejemplo?: string }[] = [
  { campo: 'nombre', texto: 'Empresa', ejemplo: 'Constructora Sur S.A.' },
  { campo: 'segmento', texto: 'Rubro', ejemplo: 'Constructoras' },
  { campo: 'ciudad', texto: 'Ciudad', ejemplo: 'Bahía Blanca' },
  { campo: 'email', texto: 'Mail' },
  { campo: 'telefono', texto: 'Teléfono' },
  { campo: 'website', texto: 'Web' },
];

function AgregarProspecto({ onClose }: { onClose: () => void }) {
  const agregar = useAgregarProspecto();
  const [datos, setDatos] = useState<ProspectoNuevo>({ nombre: '' });
  const poner = (campo: keyof ProspectoNuevo, valor: string) => setDatos(d => ({ ...d, [campo]: valor }));

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar prospecto</DialogTitle>
          <DialogDescription>Una empresa a mano. Si ya estaba, se completan sus datos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS_ALTA.map(c => (
            <label key={c.campo} className="flex flex-col gap-1">
              <span className="text-sm font-medium">{c.texto}</span>
              <input value={datos[c.campo] ?? ''} onChange={e => poner(c.campo, e.target.value)}
                placeholder={c.ejemplo} className="input-base" aria-label={c.texto}
                autoFocus={c.campo === 'nombre'} />
            </label>
          ))}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">Nota interna</span>
            <input value={datos.notas ?? ''} onChange={e => poner('notas', e.target.value)}
              placeholder="Por qué nos interesa. No va en ningún mail." className="input-base" aria-label="Nota interna" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!datos.nombre.trim() || agregar.isPending}
            onClick={() => agregar.mutate(
              Object.fromEntries(Object.entries(datos).filter(([, v]) => v?.trim())) as unknown as ProspectoNuevo, {
                onSuccess: p => {
                  toast.success(p.era_nuevo ? 'Empresa agregada' : 'Esa empresa ya estaba: se completaron sus datos');
                  onClose();
                },
                onError: e => toast.error(extractError(e)),
              })}>
            {agregar.isPending ? 'Guardando…' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
