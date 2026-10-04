import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Megaphone, RefreshCw, Search, Upload, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useCambiarEstadoProspectos, useCampanaProspecto, useCampanasProspecto, useContarSeleccion,
  useCrearCampanaProspecto, useCruzarProspectos, useGuardarMensajeCampana, useImportarArchivoProspectos,
  useNoEsClienteProspecto, usePrepararCampana, useProspectos, useResumenProspectos,
  type FiltroProspectos, type Prospecto,
} from '@/hooks/useProspectos';
import { cn, extractError, formatDate } from '@/lib/utils';

const POR_PAGINA = 50;
const ESTADO_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', respondio: 'Respondió', cliente: 'Cliente',
  descartado: 'Descartado', no_contactar: 'No contactar',
};
const CAMPANA_LABEL: Record<string, string> = {
  borrador: 'Borrador', lista: 'Lista', enviando: 'Enviando', pausada: 'Pausada',
  terminada: 'Terminada', cancelada: 'Cancelada',
};

/**
 * Prospectos de Ubicar: empresas que podrían alquilar, cruzadas contra los
 * clientes que ya tiene. Se filtran, se seleccionan en masa (las de la página,
 * o **todas las que cumplen el filtro**) y se arma una campaña.
 *
 * Los mensajes todavía no están escritos: la campaña se arma y se prepara, el
 * envío está apagado.
 */
export function ProspectosPage() {
  const [vista, setVista] = useState<'prospectos' | 'campanas'>('prospectos');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Prospectos"
        description="Empresas que podrían alquilar, cruzadas con tus clientes. Elegí un grupo y armá una campaña."
      />
      <div className="inline-flex w-fit overflow-hidden rounded-lg border border-ubicar-border bg-white">
        {(['prospectos', 'campanas'] as const).map(v => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              vista === v ? 'bg-ubicar-primary text-white' : 'text-ubicar-text hover:bg-surface',
            )}
          >
            {v === 'prospectos' ? 'Prospectos' : 'Campañas'}
          </button>
        ))}
      </div>
      {vista === 'prospectos' ? <ListaDeProspectos /> : <ListaDeCampanas />}
    </div>
  );
}

// ─── Prospectos ──────────────────────────────────────────────────────────────

function ListaDeProspectos() {
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

  const seleccion = todosElFiltro ? { filtro } : { ids: [...ids] };
  const cambiarEstado = useCambiarEstadoProspectos();
  const noEsCliente = useNoEsClienteProspecto();
  const cruzar = useCruzarProspectos();
  const importar = useImportarArchivoProspectos();
  const archivo = useRef<HTMLInputElement>(null);
  const [armando, setArmando] = useState(false);

  /** El archivo que arma `sincronizar_prospectos_leadgen --archivo`: `{ prospectos: [...] }` o la lista sola. */
  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
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
      const datos = JSON.parse(texto);
      const lista: unknown[] = Array.isArray(datos) ? datos : datos.prospectos;
      if (!Array.isArray(lista) || lista.length === 0) throw new Error('vacío');
      importar.mutate(lista, {
        onSuccess: t => toast.success(
          `${t.nuevos} nuevos, ${t.actualizados} actualizados · ${t.ya_clientes} ya son clientes`),
        onError: err => toast.error(extractError(err)),
      });
    } catch {
      toast.error('No pude leer ese archivo: tiene que ser el .json que arma el sincronizador.');
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato titulo="En la base" valor={resumen?.total} />
        <Dato titulo="Se les puede escribir" valor={resumen?.contactables} destacado />
        <Dato titulo="Ya son clientes" valor={resumen?.por_estado?.cliente ?? 0} />
        <Dato titulo="No contactar" valor={resumen?.por_estado?.no_contactar ?? 0} />
      </div>

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
        <input ref={archivo} type="file" accept=".json,application/json" className="hidden"
          data-testid="archivo-prospectos" onChange={subirArchivo} />
        <Button variant="outline" size="sm" disabled={importar.isPending}
          onClick={() => archivo.current?.click()}>
          <Upload className="h-4 w-4" /> {importar.isPending ? 'Importando…' : 'Importar archivo'}
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
            <Button size="sm" onClick={() => setArmando(true)} disabled={!!conteo?.supera_el_maximo}>
              <Megaphone className="h-4 w-4" /> Crear campaña
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => cambiarEstado.mutate({ ...seleccion, estado: 'descartado' }, {
                onSuccess: () => { toast.success('Descartados'); setIds(new Set()); setTodosElFiltro(false); },
                onError: e => toast.error(extractError(e)),
              })}>
              <Ban className="h-4 w-4" /> Descartar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIds(new Set()); setTodosElFiltro(false); }}>
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

      {armando && (
        <NuevaCampana seleccion={seleccion} cantidad={cantidadSeleccionada} onClose={() => {
          setArmando(false);
        }} onCreada={() => { setIds(new Set()); setTodosElFiltro(false); }} />
      )}
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
          {p.contacto_previo && <Etiqueta color="ambar">Contactado antes</Etiqueta>}
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

function NuevaCampana({ seleccion, cantidad, onClose, onCreada }: {
  seleccion: { ids?: number[]; filtro?: FiltroProspectos }; cantidad: number;
  onClose: () => void; onCreada: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [conPrevios, setConPrevios] = useState(false);
  const crear = useCrearCampanaProspecto();

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva campaña</DialogTitle>
          <DialogDescription>
            {cantidad.toLocaleString('es-AR')} prospectos. A los que ya son clientes, a los que pidieron
            que no los contacten y a los que no tienen mail ni teléfono no se les va a escribir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre de la campaña</span>
            <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
              placeholder="Constructoras de Bahía Blanca" className="input-base" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conPrevios} onChange={e => setConPrevios(e.target.checked)}
              className="h-4 w-4 accent-primary" />
            Incluir a los que ya fueron contactados antes
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!nombre.trim() || crear.isPending}
            onClick={() => crear.mutate({ ...seleccion, nombre, incluir_contacto_previo: conPrevios }, {
              onSuccess: c => {
                toast.success(`Campaña creada: ${c.por_estado.pendiente ?? 0} destinatarios, ${c.por_estado.omitido ?? 0} omitidos`);
                onCreada();
                onClose();
              },
              onError: e => toast.error(extractError(e)),
            })}>
            {crear.isPending ? 'Creando…' : 'Crear campaña'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campañas ────────────────────────────────────────────────────────────────

function ListaDeCampanas() {
  const { data: campanas = [], isLoading } = useCampanasProspecto();
  const [abierta, setAbierta] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (campanas.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Todavía no armaste ninguna campaña. Elegí prospectos en la otra pestaña y apretá «Crear campaña».
      </Card>
    );
  }
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {campanas.map(c => (
          <Card key={c.id} className="cursor-pointer p-4 transition-colors hover:bg-surface" onClick={() => setAbierta(c.id)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{c.nombre}</p>
                <p className="text-xs text-muted-foreground">{c.created_at ? formatDate(c.created_at) : ''}</p>
              </div>
              <span className="rounded bg-ubicar-primary/10 px-2 py-0.5 text-xs font-semibold text-ubicar-dark">
                {CAMPANA_LABEL[c.estado]}
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground">
              <strong>{c.por_estado.pendiente ?? 0}</strong> a contactar · {c.por_estado.omitido ?? 0} omitidos
            </p>
            {!c.asunto && <p className="mt-1 text-xs text-amber-700">Falta escribir el mensaje.</p>}
          </Card>
        ))}
      </div>
      {abierta !== null && <DetalleDeCampana id={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

function DetalleDeCampana({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: c } = useCampanaProspecto(id);
  const guardar = useGuardarMensajeCampana();
  const preparar = usePrepararCampana();
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  useEffect(() => { if (c) { setAsunto(c.asunto ?? ''); setCuerpo(c.cuerpo ?? ''); } }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return null;
  const puedeEditar = c.estado === 'borrador' || c.estado === 'lista';
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c.nombre}</DialogTitle>
          <DialogDescription>
            {CAMPANA_LABEL[c.estado]} · {c.destinatarios} prospectos · {c.por_estado.pendiente ?? 0} a contactar
          </DialogDescription>
        </DialogHeader>

        {Object.keys(c.omitidos_por_motivo).length > 0 && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="mb-1 font-medium">No se les escribe:</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {Object.entries(c.omitidos_por_motivo).map(([motivo, n]) => (
                <li key={motivo}><strong className="text-foreground">{n}</strong> · {motivo}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Mensaje</p>
          <input value={asunto} onChange={e => setAsunto(e.target.value)} disabled={!puedeEditar}
            placeholder="Asunto" className="input-base" />
          <Textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} disabled={!puedeEditar}
            rows={8} placeholder="Todavía sin escribir." />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={!puedeEditar || guardar.isPending}
            onClick={() => guardar.mutate({ id, asunto, cuerpo }, {
              onSuccess: () => toast.success('Mensaje guardado'),
              onError: e => toast.error(extractError(e)),
            })}>
            Guardar mensaje
          </Button>
          <Button disabled={!puedeEditar || preparar.isPending}
            onClick={() => preparar.mutate(id, {
              onSuccess: () => toast.success('Campaña lista. El envío todavía no está encendido.'),
              onError: e => toast.error(extractError(e)),
            })}>
            Preparar campaña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
