import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { InputMoneda } from '@/components/shared/InputMoneda';
import {
  exportarAlquileres, useACobrar, useAlquileresDeCaja, useAnotarPropio, useAnularPropio,
  useAnularReparto, useCambiarFacturado, useGuardarSocios, useMesDeCaja, usePropios,
  useRepartirMes, useSocioDelPago, useSocios, type FilaAlquiler,
} from '@/hooks/useCajaSocios';
import { cn, extractError, formatCurrency, formatDate, hoyLocal } from '@/lib/utils';

type Vista = 'alquileres' | 'a-cobrar' | 'mes' | 'propio';
const VISTAS: { id: Vista; label: string }[] = [
  { id: 'alquileres', label: 'Alquileres' },
  { id: 'a-cobrar', label: 'A cobrar' },
  { id: 'mes', label: 'Mes' },
  { id: 'propio', label: 'Propio' },
];
const MEDIO: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', cheque: 'Cheque',
  echeq: 'eCheq', cuenta_corriente: 'Cuenta corriente', mercado_pago: 'Mercado Pago', wapa: 'Wapa',
  sin_medio: 'Sin medio cargado',
};

const primerDiaDelMes = (iso: string) => `${iso.slice(0, 7)}-01`;
function mesAnterior(iso: string) {
  const d = new Date(`${primerDiaDelMes(iso)}T12:00:00`);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7) + '-01';
}
function mesSiguiente(iso: string) {
  const d = new Date(`${primerDiaDelMes(iso)}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7) + '-01';
}
const nombreDelMes = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

/**
 * La caja como la pidió Franco en su planilla: una fila por alquiler, lo que
 * falta cobrar, el cierre del mes con los socios, y la cuenta propia (privada).
 * Todo sale de los alquileres y sus cobros: no hay una segunda carga.
 */
export function CajaSociosPage() {
  const [vista, setVista] = useState<Vista>('alquileres');
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="inline-flex w-fit overflow-hidden rounded-lg border border-ubicar-border bg-white">
        {VISTAS.map(v => (
          <button
            key={v.id}
            onClick={() => setVista(v.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              vista === v.id ? 'bg-ubicar-primary text-white' : 'text-ubicar-text hover:bg-surface',
            )}
          >
            {v.id === 'propio' && <Lock className="mr-1 inline h-3 w-3" />}
            {v.label}
          </button>
        ))}
      </div>
      {vista === 'alquileres' && <Alquileres />}
      {vista === 'a-cobrar' && <ACobrarVista />}
      {vista === 'mes' && <MesVista />}
      {vista === 'propio' && <PropioVista />}
    </div>
  );
}

// ─── Alquileres ──────────────────────────────────────────────────────────────

function Alquileres() {
  const hoy = hoyLocal();
  const [mes, setMes] = useState(primerDiaDelMes(hoy));
  const [q, setQ] = useState('');
  const [cobrado, setCobrado] = useState<'' | 'si' | 'no'>('');
  const hasta = useMemo(() => mesSiguiente(mes).replace(/-01$/, '-01'), [mes]);
  const hastaInclusivo = useMemo(() => {
    const d = new Date(`${hasta}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [hasta]);
  const filtro = { desde: mes, hasta: hastaInclusivo, ...(q ? { q } : {}), ...(cobrado ? { cobrado: cobrado === 'si' } : {}) };
  const { data, isLoading } = useAlquileresDeCaja(filtro);
  const filas = data?.items ?? [];
  const cambiar = useCambiarFacturado();

  const sumas = useMemo(() => filas.reduce((a, f) => ({
    facturado: a.facturado + f.facturado, caja: a.caja + f.caja, total: a.total + f.total,
    distribuible: a.distribuible + f.distribuible,
  }), { facturado: 0, caja: 0, total: 0, distribuible: 0 }), [filas]);

  return (
    <>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <SelectorDeMes mes={mes} onChange={setMes} />
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Buscar cliente o patente</span>
          <input value={q} onChange={e => setQ(e.target.value)} className="input-base" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">¿Cobrado?</span>
          <select value={cobrado} onChange={e => setCobrado(e.target.value as '' | 'si' | 'no')} className="input-base">
            <option value="">Todos</option><option value="si">Sí</option><option value="no">No</option>
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={() => exportarAlquileres(mes, hastaInclusivo).catch(e => toast.error(extractError(e)))}>
          <Download className="h-4 w-4" /> Exportar a Excel
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Facturado" valor={formatCurrency(sumas.facturado)} />
        <Tarjeta titulo="Caja (sin factura)" valor={formatCurrency(sumas.caja)} />
        <Tarjeta titulo="Total" valor={formatCurrency(sumas.total)} />
        <Tarjeta titulo="Distribuible" valor={formatCurrency(sumas.distribuible)} destacada />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {['Patente', 'Retiro', 'Devolución', 'Cliente', 'Días', '$/día', 'Facturado', 'Caja', 'Total',
                  'Medio', '¿Cobrado?', 'Fecha cobro', 'Cobró', '¿Repartido?', 'Distribuible'].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={15} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>}
              {!isLoading && filas.length === 0 && (
                <tr><td colSpan={15} className="px-3 py-8 text-center text-muted-foreground">No hay alquileres en este mes.</td></tr>
              )}
              {filas.map(f => (
                <FilaCaja key={f.reserva_id} f={f}
                  onFacturado={monto => cambiar.mutate({ reservaId: f.reserva_id, monto }, {
                    onSuccess: () => toast.success('Facturado actualizado'),
                    onError: e => toast.error(extractError(e)),
                  })} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function FilaCaja({ f, onFacturado }: { f: FilaAlquiler; onFacturado: (monto: number) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<number | ''>(f.facturado);
  const guardar = () => {
    setEditando(false);
    if (valor !== '' && Number(valor) !== f.facturado) onFacturado(Number(valor));
  };
  return (
    <tr className="hover:bg-muted/40">
      <td className="whitespace-nowrap px-3 py-2 font-medium">
        {f.patente ?? '—'}
        {f.tipo === 'uber' && <span className="ml-1 rounded bg-ubicar-primary/10 px-1 text-[10px] font-semibold text-ubicar-dark">Uber</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2">{formatDate(f.retiro_fecha)} <span className="text-muted-foreground">{f.retiro_hora}</span></td>
      <td className="whitespace-nowrap px-3 py-2">{formatDate(f.devolucion_fecha)} <span className="text-muted-foreground">{f.devolucion_hora}</span></td>
      <td className="px-3 py-2">{f.cliente ?? '—'}</td>
      <td className="px-3 py-2 tabular-nums">{f.dias}</td>
      <td className="px-3 py-2 tabular-nums">{f.precio_dia ? formatCurrency(f.precio_dia) : '—'}</td>
      <td className="px-3 py-2 tabular-nums">
        {editando ? (
          <span className="flex w-32 items-center gap-1">
            <InputMoneda value={valor} onChange={setValor} autoFocus className="w-full rounded border border-border px-2 py-1 text-sm" />
            <Button size="sm" onClick={guardar}>OK</Button>
          </span>
        ) : (
          <button onClick={() => { setValor(f.facturado); setEditando(true); }}
            className="rounded px-1 text-left underline decoration-dotted underline-offset-4 hover:bg-surface"
            title="Tocá para cambiar cuánto va con factura">
            {formatCurrency(f.facturado)}
          </button>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">{formatCurrency(f.caja)}</td>
      <td className="px-3 py-2 font-medium tabular-nums">{formatCurrency(f.total)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">{f.medios.map(m => MEDIO[m] ?? m).join(', ') || '—'}</td>
      <td className="px-3 py-2"><Si valor={f.cobrado} /></td>
      <td className="whitespace-nowrap px-3 py-2">{f.fecha_cobro ? formatDate(f.fecha_cobro) : '—'}</td>
      <td className="px-3 py-2 text-xs">
        {f.cobro_socios.join(', ') || '—'}
        {f.cobro_sin_socio && <span className="ml-1 text-amber-700" title="Hay un cobro sin socio asignado">⚠</span>}
      </td>
      <td className="px-3 py-2"><Si valor={f.repartido} /></td>
      <td className="px-3 py-2 font-medium tabular-nums text-ubicar-dark">{formatCurrency(f.distribuible)}</td>
    </tr>
  );
}

function Si({ valor }: { valor: boolean }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', valor ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{valor ? 'Sí' : 'No'}</span>;
}

// ─── A cobrar ────────────────────────────────────────────────────────────────

function ACobrarVista() {
  const { data, isLoading } = useACobrar();
  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Total pendiente" valor={formatCurrency(data.total_pendiente)} destacada />
        <Tarjeta titulo="Alquileres sin cobrar" valor={String(data.cantidad)} />
        {Object.entries(data.por_medio).slice(0, 2).map(([m, v]) => (
          <Tarjeta key={m} titulo={`Pendiente · ${MEDIO[m] ?? m}`} valor={formatCurrency(v)} />
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>{['Cliente', 'Patente', 'Retiro', 'Devolución', 'Total', 'Falta cobrar', 'Medio previsto', 'Días desde la devolución']
                .map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No hay nada pendiente de cobro.</td></tr>}
              {data.items.map(i => (
                <tr key={i.reserva_id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium">{i.cliente ?? '—'}</td>
                  <td className="px-3 py-2">{i.patente ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(i.retiro_fecha)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(i.devolucion_fecha)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(i.total)}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-ubicar-dark">{formatCurrency(i.saldo)}</td>
                  <td className="px-3 py-2 text-xs">{MEDIO[i.medio_previsto] ?? i.medio_previsto}</td>
                  <td className={cn('px-3 py-2 tabular-nums', i.dias_desde_devolucion > 7 && 'font-semibold text-red-700')}>
                    {i.dias_desde_devolucion}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── Mes ─────────────────────────────────────────────────────────────────────

function MesVista() {
  const [mes, setMes] = useState(primerDiaDelMes(hoyLocal()));
  const { data: m, isLoading } = useMesDeCaja(mes);
  const repartir = useRepartirMes();
  const anular = useAnularReparto();
  const asignar = useSocioDelPago();
  const [socios, setSocios] = useState(false);

  if (isLoading || !m) return <Skeleton className="h-48 w-full" />;
  const nombre = (id: number) => m.socios.find(s => s.id === id)?.nombre.split(' ')[0] ?? '?';
  const columnas = [...m.socios.map(s => ({ clave: String(s.id), texto: s.nombre.split(' ')[0] })),
    ...(m.sin_socio > 0 ? [{ clave: 'sin_socio', texto: 'Sin asignar' }] : [])];
  const sinAsignar = m.cobros.filter(c => c.socio_id === null);

  return (
    <>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <SelectorDeMes mes={mes} onChange={setMes} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSocios(true)}>Socios y porcentajes</Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Ingresado en el mes" valor={formatCurrency(m.total_cobrado)} destacada />
        <Tarjeta titulo="Distribuible cobrado" valor={formatCurrency(m.distribuible)} />
        {m.socios.filter(s => s.porcentaje > 0).map(s => (
          <Tarjeta key={s.id} titulo={`Parte de ${s.nombre.split(' ')[0]} (${s.porcentaje}%)`}
            valor={formatCurrency(m.parte_por_socio[String(s.id)] ?? 0)} />
        ))}
      </div>

      {m.sin_socio > 0 && (
        <Card className="space-y-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Hay {formatCurrency(m.sin_socio)} cobrados sin socio. Asignalos para poder repartir el mes.
          </p>
          <div className="flex flex-wrap gap-2">
            {sinAsignar.map(c => (
              <label key={c.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs">
                {formatDate(c.fecha)} · {formatCurrency(c.monto)} · {MEDIO[c.medio] ?? c.medio}
                <select defaultValue="" className="rounded border border-border text-xs"
                  onChange={e => e.target.value && asignar.mutate({ pagoId: c.id, socioId: Number(e.target.value) }, {
                    onError: err => toast.error(extractError(err)),
                  })}>
                  <option value="">¿Quién cobró?</option>
                  {m.socios.map(s => <option key={s.id} value={s.id}>{s.nombre.split(' ')[0]}</option>)}
                </select>
              </label>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <p className="border-b border-border px-4 py-2 text-sm font-semibold text-ubicar-dark">Ingresado por medio de pago</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Medio</th>
                {columnas.map(c => <th key={c.clave} className="px-3 py-2 text-right font-medium">{c.texto}</th>)}
                <th className="px-3 py-2 text-right font-medium">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {m.medios.length === 0 && <tr><td colSpan={columnas.length + 2} className="px-3 py-6 text-center text-muted-foreground">Sin cobros este mes.</td></tr>}
              {m.medios.map(medio => {
                const fila = m.por_medio[medio] ?? {};
                return (
                  <tr key={medio}>
                    <td className="px-3 py-2">{MEDIO[medio] ?? medio}</td>
                    {columnas.map(c => <td key={c.clave} className="px-3 py-2 text-right tabular-nums">{fila[c.clave] ? formatCurrency(fila[c.clave]) : '—'}</td>)}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(Object.values(fila).reduce((a, b) => a + b, 0))}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-3 py-2">Total ingresado</td>
                {columnas.map(c => (
                  <td key={c.clave} className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(c.clave === 'sin_socio' ? m.sin_socio : (m.cobrado_por_socio[c.clave] ?? 0))}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.total_cobrado)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold text-ubicar-dark">Compensación entre socios</p>
        <p className="text-xs text-muted-foreground">Se compensa sobre el total cobrado. Los gastos se ven aparte.</p>
        {!m.compensacion ? (
          <p className="text-sm text-amber-700">Los porcentajes de los socios no suman 100.</p>
        ) : m.compensacion.transferencias.length === 0 ? (
          <p className="text-sm text-foreground">Están parejos: no hay que compensar.</p>
        ) : (
          <ul className="space-y-1">
            {m.compensacion.transferencias.map((t, i) => (
              <li key={i} className="text-sm text-foreground">
                <strong>{nombre(t.de)}</strong> le pasa <strong className="text-ubicar-dark">{formatCurrency(t.monto)}</strong> a <strong>{nombre(t.a)}</strong>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border pt-2 text-sm text-muted-foreground">
          Gastos del mes: <strong className="text-foreground">{formatCurrency(m.gastos.total)}</strong> ({m.gastos.cantidad})
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {m.reparto ? (
            <>
              <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Repartido el {formatDate(m.reparto.fecha)}</span>
              <Button size="sm" variant="outline" onClick={() => anular.mutate(m.reparto!.id, { onError: e => toast.error(extractError(e)) })}>Anular reparto</Button>
            </>
          ) : (
            <Button size="sm" disabled={m.total_cobrado === 0 || repartir.isPending}
              onClick={() => repartir.mutate({ mes }, {
                onSuccess: () => toast.success('Mes repartido'),
                onError: e => toast.error(extractError(e)),
              })}>
              Registrar reparto de {nombreDelMes(mes)}
            </Button>
          )}
        </div>
      </Card>

      {socios && <EditorDeSocios onClose={() => setSocios(false)} />}
    </>
  );
}

function EditorDeSocios({ onClose }: { onClose: () => void }) {
  const { data = [] } = useSocios();
  const guardar = useGuardarSocios();
  const [cambios, setCambios] = useState<Record<number, number>>({});
  const valor = (id: number, base: number) => cambios[id] ?? base;
  const suma = data.filter(s => s.activo).reduce((a, s) => a + valor(s.id, s.porcentaje), 0);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Socios y porcentajes</DialogTitle>
          <DialogDescription>Quien cobra pero no es socio va en 0: su plata se le pasa a los socios al compensar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {data.filter(s => s.activo).map(s => (
            <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{s.nombre}</span>
              <span className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={valor(s.id, s.porcentaje)}
                  onChange={e => setCambios(c => ({ ...c, [s.id]: Number(e.target.value) }))}
                  className="input-base w-20 text-right" /> %
              </span>
            </label>
          ))}
          <p className={cn('text-xs', suma === 100 ? 'text-emerald-700' : 'text-red-700')}>Suman {suma}%</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={suma !== 100 || guardar.isPending}
            onClick={() => guardar.mutate(data.filter(s => s.activo).map(s => ({ id: s.id, porcentaje: valor(s.id, s.porcentaje) })), {
              onSuccess: () => { toast.success('Guardado'); onClose(); },
              onError: e => toast.error(extractError(e)),
            })}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Propio ──────────────────────────────────────────────────────────────────

function PropioVista() {
  const { data, isLoading } = usePropios();
  const anotar = useAnotarPropio();
  const anular = useAnularPropio();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState<number | ''>('');
  const [tipo, setTipo] = useState<'entra' | 'sale'>('entra');
  const [fecha, setFecha] = useState(hoyLocal());

  return (
    <>
      <Card className="flex items-start gap-2 bg-surface p-3 text-sm text-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ubicar-primary" />
        Esta cuenta es solo tuya: nadie más la ve y no suma en ningún total de la empresa. Los alquileres son siempre de todos.
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Tarjeta titulo="Entró" valor={formatCurrency(data?.entra ?? 0)} />
        <Tarjeta titulo="Salió" valor={formatCurrency(data?.sale ?? 0)} />
        <Tarjeta titulo="Saldo" valor={formatCurrency(data?.saldo ?? 0)} destacada />
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted-foreground">Fecha</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-base" /></label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1"><span className="text-xs font-medium text-muted-foreground">Concepto</span>
          <input value={concepto} onChange={e => setConcepto(e.target.value)} className="input-base" placeholder="De qué es" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted-foreground">Monto</span>
          <InputMoneda value={monto} onChange={setMonto} className="input-base w-36" /></label>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(['entra', 'sale'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={cn('px-3 py-2 text-sm', tipo === t ? 'bg-ubicar-primary text-white' : 'bg-white text-ubicar-text')}>
              {t === 'entra' ? 'Entra' : 'Sale'}
            </button>
          ))}
        </div>
        <Button disabled={!concepto.trim() || !monto || anotar.isPending}
          onClick={() => anotar.mutate({ fecha, concepto, tipo, monto: Number(monto) }, {
            onSuccess: () => { setConcepto(''); setMonto(''); toast.success('Anotado'); },
            onError: e => toast.error(extractError(e)),
          })}>
          <Plus className="h-4 w-4" /> Anotar
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td className="p-4"><Skeleton className="h-6 w-full" /></td></tr>}
            {(data?.items ?? []).length === 0 && !isLoading && <tr><td className="px-3 py-8 text-center text-muted-foreground">Todavía no anotaste nada.</td></tr>}
            {(data?.items ?? []).map(i => (
              <tr key={i.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(i.fecha)}</td>
                <td className="px-3 py-2">{i.concepto}</td>
                <td className={cn('px-3 py-2 text-right font-medium tabular-nums', i.tipo === 'entra' ? 'text-emerald-700' : 'text-red-700')}>
                  {i.tipo === 'entra' ? '+' : '−'}{formatCurrency(i.monto)}
                </td>
                <td className="w-10 px-3 py-2">
                  <button aria-label="Anular" onClick={() => anular.mutate(i.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({ titulo, valor, destacada }: { titulo: string; valor: string; destacada?: boolean }) {
  return (
    <Card className={cn('p-4', destacada && 'border-ubicar-primary/40 bg-surface')}>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ubicar-dark">{valor}</p>
    </Card>
  );
}

function SelectorDeMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={() => onChange(mesAnterior(mes))} aria-label="Mes anterior">‹</Button>
      <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-ubicar-dark">{nombreDelMes(mes)}</span>
      <Button size="sm" variant="outline" onClick={() => onChange(mesSiguiente(mes))} aria-label="Mes siguiente">›</Button>
    </div>
  );
}
