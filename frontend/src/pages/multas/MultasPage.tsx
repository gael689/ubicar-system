import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, AlertTriangle, Plus, Pencil, Save, User, FileWarning, CheckCircle2, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { useMultas } from '@/hooks/useMultas';
import { ESTADO_MULTA_LABEL, ESTADO_MULTA_COLOR, ESTADO_MULTA_COLOR_OUTLINE } from '@/lib/constants';
import type { Multa, BusquedaMultaResult, EstadoMulta, EstadoMultaEditable, MultaCreate } from '@/types';
import { cn, extractError } from '@/lib/utils';

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
}

// "cobrada"/"bonificada" no se setean a mano: van por los botones de
// resolución (generan el movimiento de cuenta corriente). El resto son
// transiciones directas, un click, sin pasar por "Editar".
const ESTADOS_DIRECTOS: EstadoMultaEditable[] = ['pendiente', 'imputada', 'apelando'];

/**
 * Chip de vencimiento (D-28). Sólo aparece si la multa tiene fecha y sigue
 * sin resolverse — una multa ya cobrada no necesita apurar a nadie.
 * Colores sólidos porque es un estado que requiere acción, no un dato pasivo.
 */
function vencimientoChip(m: Multa) {
  if (!m.fecha_vencimiento) return null;
  if (m.estado === 'cobrada' || m.estado === 'bonificada') return null;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const vence = new Date(`${m.fecha_vencimiento}T00:00:00`);
  const dias = Math.round((vence.getTime() - hoy.getTime()) / 86_400_000);

  if (dias < 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-danger px-2 py-0.5 text-xs font-semibold text-white">
        Vencida hace {Math.abs(dias)}d
      </span>
    );
  }
  if (dias <= 7) {
    return (
      <span className="inline-flex items-center rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white">
        {dias === 0 ? 'Vence hoy' : `Vence en ${dias}d`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
      Vence {formatDate(m.fecha_vencimiento)}
    </span>
  );
}
const ESTADO_FILTROS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  ...(['pendiente', 'imputada', 'cobrada', 'bonificada', 'apelando'] as EstadoMulta[])
    .map(e => ({ value: e, label: ESTADO_MULTA_LABEL[e] })),
];

export function MultasPage() {
  const { loading, error, buscarResponsable, crearMulta, actualizarMulta, resolverMulta, listMultas } = useMultas();

  // ── Buscador ──────────────────────────────────────────────────────────────
  const [busPatente, setBusPatente] = useState('');
  const [busFecha, setBusFecha] = useState('');
  const [busHora, setBusHora] = useState('');
  const [busqueda, setBusqueda] = useState<BusquedaMultaResult | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [showCrearDesde, setShowCrearDesde] = useState(false);

  // ── Lista global ──────────────────────────────────────────────────────────
  const [multas, setMultas] = useState<Multa[]>([]);
  const [total, setTotal] = useState(0);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPatente, setFiltroPatente] = useState('');

  // ── Form multa nueva ──────────────────────────────────────────────────────
  const [form, setForm] = useState<Partial<MultaCreate>>({});

  // ── Edición inline ────────────────────────────────────────────────────────
  const [editandoNotas, setEditandoNotas] = useState<number | null>(null);
  const [notasEdit, setNotasEdit] = useState('');
  const [cobrarId, setCobrarId] = useState<number | null>(null);
  const [bonificarId, setBonificarId] = useState<number | null>(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const cargarMultas = useCallback(async () => {
    const res = await listMultas({
      estado: filtroEstado || undefined,
      patente: filtroPatente || undefined,
      page_size: 50,
    });
    setMultas(res.data);
    setTotal(res.total);
  }, [listMultas, filtroEstado, filtroPatente]);

  useEffect(() => { cargarMultas().catch(() => {}); }, [cargarMultas]);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busPatente || !busFecha) return;
    setBuscando(true);
    setBusqueda(null);
    try {
      const res = await buscarResponsable(busPatente, busFecha, busHora || undefined);
      setBusqueda(res);
      if (res.encontrado) {
        setForm({
          patente: res.patente,
          fecha_infraccion: res.fecha_infraccion,
          hora_infraccion: res.hora_infraccion ?? undefined,
          cliente_id: res.cliente_id ?? undefined,
          alquiler_id: res.alquiler_id ?? undefined,
        });
        setShowCrearDesde(true);
      }
    } finally {
      setBuscando(false);
    }
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patente || !form.fecha_infraccion || !form.monto) return;
    await crearMulta({
      patente: form.patente,
      fecha_infraccion: form.fecha_infraccion,
      fecha_vencimiento: form.fecha_vencimiento ?? null,
      hora_infraccion: form.hora_infraccion ?? undefined,
      monto: Number(form.monto),
      cliente_id: form.cliente_id ?? undefined,
      alquiler_id: form.alquiler_id ?? undefined,
      descripcion: form.descripcion ?? undefined,
      notas: form.notas ?? undefined,
    });
    setShowCrearDesde(false);
    setBusqueda(null);
    setBusPatente(''); setBusFecha(''); setBusHora('');
    setForm({});
    cargarMultas();
  };

  const handleCambiarEstado = async (m: Multa, estado: EstadoMultaEditable) => {
    if (m.estado === estado) return;
    setCambiandoEstado(true);
    try {
      await actualizarMulta(m.id, { estado });
      cargarMultas();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleGuardarNotas = async (m: Multa) => {
    await actualizarMulta(m.id, { notas: notasEdit || undefined });
    setEditandoNotas(null);
    cargarMultas();
  };

  const handleCobrar = async () => {
    if (!cobrarId) return;
    setResolviendo(true);
    try {
      await resolverMulta(cobrarId, { decision: 'cobrada' });
      toast.success('Multa marcada como cobrada');
      setCobrarId(null);
      cargarMultas();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setResolviendo(false);
    }
  };

  const handleBonificar = async (motivo: string) => {
    if (!bonificarId) return;
    setResolviendo(true);
    try {
      await resolverMulta(bonificarId, { decision: 'bonificada', motivo });
      toast.success('Multa bonificada');
      setBonificarId(null);
      cargarMultas();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setResolviendo(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Multas e Infracciones"
        description={`${total} multa${total !== 1 ? 's' : ''} registrada${total !== 1 ? 's' : ''}`}
      />

      {/* ── Buscador ──────────────────────────────────────────────────────── */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Identificar responsable</h3>
          <span className="text-xs text-muted-foreground">Ingresá patente + fecha para cruzar con el historial de alquileres</span>
        </div>

        <form onSubmit={handleBuscar} className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Patente *</label>
            <input
              value={busPatente}
              onChange={e => setBusPatente(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="input-base font-mono w-32 uppercase"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Fecha infracción *</label>
            <input
              type="date"
              value={busFecha}
              onChange={e => setBusFecha(e.target.value)}
              className="input-base"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Hora (opcional)</label>
            <input
              type="time"
              value={busHora}
              onChange={e => setBusHora(e.target.value)}
              className="input-base"
            />
          </div>
          <Button type="submit" disabled={buscando || loading}>
            <Search className="h-4 w-4" />
            {buscando ? 'Buscando...' : 'Buscar responsable'}
          </Button>
        </form>

        {/* Resultado de búsqueda */}
        {busqueda && (
          <div className={cn(
            'rounded-xl border p-4',
            busqueda.encontrado
              ? 'bg-success/5 border-success/30'
              : 'bg-warning/5 border-warning/30',
          )}>
            {busqueda.encontrado ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-success" />
                  <span className="font-semibold text-foreground">Responsable encontrado</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Cliente</div>
                    <Link to={`/clientes/${busqueda.cliente_id}`} className="font-medium text-primary hover:underline">
                      {busqueda.cliente_nombre}
                    </Link>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">DNI/CUIT</div>
                    <div className="font-mono font-medium">{busqueda.cliente_dni}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Contrato (reserva)</div>
                    <div className="font-medium">#{busqueda.contrato_numero}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Período alquiler</div>
                    <div className="text-xs">
                      {busqueda.fecha_checkout ? formatDate(busqueda.fecha_checkout) : '?'} →{' '}
                      {busqueda.fecha_checkin ? formatDate(busqueda.fecha_checkin) : 'en curso'}
                    </div>
                  </div>
                </div>

                {/* Formulario para crear la multa */}
                {showCrearDesde && (
                  <form onSubmit={handleCrear} className="mt-3 border-t border-border pt-3 space-y-3">
                    <p className="text-sm font-medium text-foreground">Cargar multa al cliente</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Monto *</label>
                        <input
                          type="number"
                          value={form.monto ?? ''}
                          onChange={e => setForm(f => ({ ...f, monto: Number(e.target.value) }))}
                          placeholder="ej: 25000"
                          min={0}
                          className="input-base"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Vence el</label>
                        <input
                          type="date"
                          value={form.fecha_vencimiento ?? ''}
                          onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value || null }))}
                          className="input-base"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                        <input
                          value={form.descripcion ?? ''}
                          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                          placeholder="Ej: Exceso de velocidad"
                          className="input-base"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Notas internas</label>
                        <input
                          value={form.notas ?? ''}
                          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                          placeholder="Opcional"
                          className="input-base"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={loading}>
                        <Save className="h-4 w-4" /> {loading ? 'Guardando...' : 'Crear multa'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowCrearDesde(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}

                {!showCrearDesde && (
                  <Button size="sm" onClick={() => setShowCrearDesde(true)}>
                    <Plus className="h-4 w-4" /> Cargar multa a este cliente
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  No se encontró ningún alquiler para la patente <strong>{busqueda.patente}</strong> en la fecha {formatDate(busqueda.fecha_infraccion)}.
                  Podés cargar la multa manualmente desde el perfil del cliente.
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-sm text-danger">{error}</div>
      )}

      {/* ── Lista global ──────────────────────────────────────────────────── */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Todas las multas
          </h3>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={filtroPatente}
              onChange={e => setFiltroPatente(e.target.value.toUpperCase())}
              placeholder="Filtrar por patente"
              className="input-base font-mono w-36 uppercase text-sm"
            />
            <div className="flex gap-1">
              {ESTADO_FILTROS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFiltroEstado(f.value)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                    filtroEstado === f.value
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && multas.length === 0 ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : multas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <FileWarning className="h-12 w-12 opacity-20" />
            <p className="text-sm">No hay multas registradas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {multas.map(m => (
              <div key={m.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm">{m.patente}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.fecha_infraccion)}{m.hora_infraccion ? ` · ${m.hora_infraccion.slice(0, 5)}` : ''}
                      </span>
                      <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', ESTADO_MULTA_COLOR[m.estado])}>
                        {ESTADO_MULTA_LABEL[m.estado]}
                      </span>
                      {vencimientoChip(m)}
                    </div>
                    {m.cliente && (
                      <Link to={`/clientes/${m.cliente.id}`} className="text-sm text-primary hover:underline">
                        {m.cliente.nombre_completo}
                        <span className="text-muted-foreground font-normal"> · {m.cliente.dni_cuit}</span>
                      </Link>
                    )}
                    {m.descripcion && <p className="text-xs text-muted-foreground">{m.descripcion}</p>}
                    {m.alquiler_id && <p className="text-xs text-muted-foreground">Contrato #{m.alquiler_id}</p>}
                    {editandoNotas === m.id ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          value={notasEdit}
                          onChange={e => setNotasEdit(e.target.value)}
                          placeholder="Notas internas"
                          className="input-base text-sm"
                          autoFocus
                        />
                        <Button size="sm" onClick={() => handleGuardarNotas(m)} disabled={loading}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditandoNotas(null)}>Cancelar</Button>
                      </div>
                    ) : (
                      m.notas && <p className="text-xs text-muted-foreground italic">{m.notas}</p>
                    )}
                    {m.estado === 'bonificada' && m.motivo_bonificacion && (
                      <p className="text-xs text-muted-foreground italic">Motivo: {m.motivo_bonificacion}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-bold text-foreground">{formatMoney(m.monto)}</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {ESTADOS_DIRECTOS.map(s => (
                        <button
                          key={s}
                          type="button"
                          disabled={cambiandoEstado || m.estado === s}
                          onClick={() => handleCambiarEstado(m, s)}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors disabled:cursor-default',
                            m.estado === s
                              ? ESTADO_MULTA_COLOR[s]
                              : ESTADO_MULTA_COLOR_OUTLINE[s],
                          )}
                        >
                          {ESTADO_MULTA_LABEL[s]}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={m.estado === 'cobrada'}
                        onClick={() => setCobrarId(m.id)}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors disabled:cursor-default',
                          m.estado === 'cobrada'
                            ? ESTADO_MULTA_COLOR.cobrada
                            : ESTADO_MULTA_COLOR_OUTLINE.cobrada,
                        )}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Cobrada
                      </button>
                      <button
                        type="button"
                        disabled={m.estado === 'bonificada'}
                        onClick={() => setBonificarId(m.id)}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors disabled:cursor-default',
                          m.estado === 'bonificada'
                            ? ESTADO_MULTA_COLOR.bonificada
                            : ESTADO_MULTA_COLOR_OUTLINE.bonificada,
                        )}
                      >
                        <Gift className="h-3.5 w-3.5" /> Bonificada
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditandoNotas(m.id);
                        setNotasEdit(m.notas ?? '');
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={cobrarId !== null}
        onOpenChange={open => !open && setCobrarId(null)}
        title="Marcar multa como cobrada"
        description="El cliente pagó la multa: se genera el crédito que cancela el débito en su cuenta corriente."
        confirmLabel="Marcar cobrada"
        loading={resolviendo}
        onConfirm={handleCobrar}
      />

      <MotivoDialog
        open={bonificarId !== null}
        onOpenChange={open => !open && setBonificarId(null)}
        title="Bonificar multa"
        description="Se le perdona la multa al cliente: el débito se anula con un contra-asiento en su cuenta corriente."
        confirmLabel="Bonificar"
        loading={resolviendo}
        onConfirm={handleBonificar}
      />
    </div>
  );
}
