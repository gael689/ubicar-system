import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, Pencil, Trash2, X, Save, FileWarning } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useMultas } from '@/hooks/useMultas';
import { ESTADO_MULTA_LABEL, ESTADO_MULTA_COLOR } from '@/lib/constants';
import type { Multa, EstadoMulta } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  clienteId: number;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
}

const ESTADOS: EstadoMulta[] = ['pendiente', 'imputada', 'cobrada', 'apelando'];

export function MultasTab({ clienteId }: Props) {
  const { listMultas, crearMulta, actualizarMulta, eliminarMulta, loading, error } = useMultas();
  const [multas, setMultas] = useState<Multa[]>([]);
  const [total, setTotal] = useState(0);
  const [editando, setEditando] = useState<number | null>(null);
  const [estadoEdit, setEstadoEdit] = useState<EstadoMulta>('pendiente');
  const [notasEdit, setNotasEdit] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form nueva multa
  const [form, setForm] = useState({
    patente: '',
    fecha_infraccion: '',
    hora_infraccion: '',
    monto: '',
    descripcion: '',
    notas: '',
  });

  const cargar = useCallback(async () => {
    const res = await listMultas({ cliente_id: clienteId, page_size: 50 });
    setMultas(res.data);
    setTotal(res.total);
  }, [clienteId, listMultas]);

  useEffect(() => { cargar().catch(() => {}); }, [cargar]);

  const handleGuardarEstado = async (multa: Multa) => {
    await actualizarMulta(multa.id, { estado: estadoEdit, notas: notasEdit || undefined });
    setEditando(null);
    cargar();
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    await crearMulta({
      patente: form.patente,
      cliente_id: clienteId,
      fecha_infraccion: form.fecha_infraccion,
      hora_infraccion: form.hora_infraccion || undefined,
      monto: parseFloat(form.monto),
      descripcion: form.descripcion || undefined,
      notas: form.notas || undefined,
    });
    setShowForm(false);
    setForm({ patente: '', fecha_infraccion: '', hora_infraccion: '', monto: '', descripcion: '', notas: '' });
    cargar();
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h3 className="font-semibold text-foreground">Multas e infracciones</h3>
          {total > 0 && (
            <span className="inline-flex items-center rounded-full bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 text-xs font-semibold">
              {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/multas">Buscador global</Link>
          </Button>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4" /> Cargar multa
          </Button>
        </div>
      </div>

      {/* Formulario de nueva multa */}
      {showForm && (
        <form onSubmit={handleCrear} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">Nueva multa</span>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FormField label="Patente *">
              <input
                value={form.patente}
                onChange={e => setForm(f => ({ ...f, patente: e.target.value.toUpperCase() }))}
                placeholder="ABC123"
                className="input-base font-mono uppercase"
                required
              />
            </FormField>
            <FormField label="Fecha infracción *">
              <input
                type="date"
                value={form.fecha_infraccion}
                onChange={e => setForm(f => ({ ...f, fecha_infraccion: e.target.value }))}
                className="input-base"
                required
              />
            </FormField>
            <FormField label="Hora (opcional)">
              <input
                type="time"
                value={form.hora_infraccion}
                onChange={e => setForm(f => ({ ...f, hora_infraccion: e.target.value }))}
                className="input-base"
              />
            </FormField>
            <FormField label="Monto *">
              <input
                type="number"
                value={form.monto}
                onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                placeholder="ej: 15000"
                min={0}
                className="input-base"
                required
              />
            </FormField>
            <FormField label="Descripción">
              <input
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Ej: Exceso velocidad"
                className="input-base"
              />
            </FormField>
            <FormField label="Notas internas">
              <input
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Opcional"
                className="input-base"
              />
            </FormField>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={loading}>
              <Save className="h-4 w-4" /> {loading ? 'Guardando...' : 'Guardar multa'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-sm text-danger">{error}</div>
      )}

      {loading && multas.length === 0 ? (
        <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : multas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <FileWarning className="h-10 w-10 opacity-30" />
          <p className="text-sm">Sin multas registradas para este cliente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {multas.map(m => (
            <div
              key={m.id}
              className="rounded-xl border border-border bg-background p-4"
            >
              {editando === m.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Estado">
                      <select
                        value={estadoEdit}
                        onChange={e => setEstadoEdit(e.target.value as EstadoMulta)}
                        className="input-base"
                      >
                        {ESTADOS.map(s => (
                          <option key={s} value={s}>{ESTADO_MULTA_LABEL[s]}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Notas">
                      <input
                        value={notasEdit}
                        onChange={e => setNotasEdit(e.target.value)}
                        placeholder="Notas internas"
                        className="input-base"
                      />
                    </FormField>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleGuardarEstado(m)} disabled={loading}>
                      <Save className="h-3.5 w-3.5" /> Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-foreground text-sm">{m.patente}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.fecha_infraccion)}{m.hora_infraccion ? ` · ${m.hora_infraccion.slice(0, 5)}` : ''}
                      </span>
                      <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', ESTADO_MULTA_COLOR[m.estado])}>
                        {ESTADO_MULTA_LABEL[m.estado]}
                      </span>
                    </div>
                    {m.descripcion && <p className="text-sm text-muted-foreground">{m.descripcion}</p>}
                    {m.alquiler_id && (
                      <p className="text-xs text-muted-foreground">Contrato #{m.alquiler_id}</p>
                    )}
                    {m.notas && <p className="text-xs text-muted-foreground italic">{m.notas}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-base font-bold text-foreground">{formatMoney(m.monto)}</span>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditando(m.id);
                      setEstadoEdit(m.estado);
                      setNotasEdit(m.notas ?? '');
                    }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(m.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={open => !open && setDeleteId(null)}
        title="Eliminar multa"
        description="Esta acción da de baja la multa del sistema. No se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        loading={loading}
        onConfirm={async () => {
          if (deleteId) {
            await eliminarMulta(deleteId);
            setDeleteId(null);
            cargar();
          }
        }}
      />
    </Card>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
