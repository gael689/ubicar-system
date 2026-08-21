import { useState, useMemo } from 'react';
import { Trash2, Wrench, Zap, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MotivoDialog } from '@/components/shared/MotivoDialog';

import {
  useGastos, useCreateGasto, useDeleteGasto,
  type GastoCreate,
} from '@/hooks/useGastos';
import { useServicios, useCrearServicio, useEliminarServicio } from '@/hooks/useServicios';
import type { Servicio, ServicioCreate, TipoServicio } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

type Mode = null | 'rapido' | 'mantenimiento';

const TIPO_SERVICIO_INFO: Record<TipoServicio, { label: string; icon: string }> = {
  service_general: { label: 'Service general', icon: '🔧' },
  aceite:          { label: 'Cambio aceite',   icon: '🛢️' },
  neumaticos:      { label: 'Neumáticos',      icon: '⭕' },
  frenos:          { label: 'Frenos',          icon: '🔴' },
  filtros:         { label: 'Filtros',         icon: '🌀' },
  correa:          { label: 'Correa distribución', icon: '⚙️' },
  suspension:      { label: 'Suspensión',      icon: '🚗' },
  otro:            { label: 'Otro',            icon: '📋' },
};

const TIPOS_SERVICIO = Object.entries(TIPO_SERVICIO_INFO) as [TipoServicio, { label: string; icon: string }][];

interface Props {
  vehiculoId: number;
  kmActual: number;
  kmProximoService: number;
  kmEntreServices: number;
}

export function GastosMantenimientoTab({ vehiculoId, kmActual, kmProximoService, kmEntreServices }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; tipo: 'gasto' | 'servicio'; label: string } | null>(null);

  const { data: gastosData, isLoading: gastosLoading } = useGastos(vehiculoId, { page: 1, page_size: 100 });
  const { data: servicios = [], isLoading: serviciosLoading } = useServicios(vehiculoId);
  const createGasto = useCreateGasto(vehiculoId);
  const deleteGasto = useDeleteGasto(vehiculoId);
  const crearServicio = useCrearServicio(vehiculoId);
  const eliminarServicio = useEliminarServicio(vehiculoId);

  const gastos = gastosData?.data ?? [];

  // Unified sorted list
  const items = useMemo(() => {
    type Item =
      | { kind: 'gasto'; fecha: string; data: typeof gastos[0] }
      | { kind: 'servicio'; fecha: string; data: Servicio };
    const g: Item[] = gastos.map(g => ({ kind: 'gasto' as const, fecha: g.fecha, data: g }));
    const s: Item[] = servicios.map(s => ({ kind: 'servicio' as const, fecha: s.fecha, data: s }));
    return [...g, ...s].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [gastos, servicios]);

  const loading = gastosLoading || serviciosLoading;

  const restantes = kmProximoService > 0 ? kmProximoService - kmActual : null;

  return (
    <div className="space-y-4">
      {/* Service status banner */}
      {kmProximoService > 0 && (
        <ServiceBanner kmActual={kmActual} kmProximo={kmProximoService} restantes={restantes} />
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={mode === 'rapido' ? 'default' : 'outline'}
          onClick={() => setMode(mode === 'rapido' ? null : 'rapido')}
        >
          <Zap className="h-4 w-4" />
          {mode === 'rapido' ? 'Cancelar' : 'Gasto rápido'}
        </Button>
        <Button
          size="sm"
          variant={mode === 'mantenimiento' ? 'default' : 'outline'}
          onClick={() => setMode(mode === 'mantenimiento' ? null : 'mantenimiento')}
        >
          <Wrench className="h-4 w-4" />
          {mode === 'mantenimiento' ? 'Cancelar' : 'Registrar mantenimiento'}
        </Button>
      </div>

      {/* Gasto rápido form */}
      {mode === 'rapido' && (
        <GastoRapidoForm
          onSubmit={async (data) => {
            await createGasto.mutateAsync(data);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
          loading={createGasto.isPending}
        />
      )}

      {/* Mantenimiento form */}
      {mode === 'mantenimiento' && (
        <MantenimientoForm
          kmActual={kmActual}
          kmProximoService={kmProximoService}
          kmEntreServices={kmEntreServices}
          onSubmit={async (data) => {
            await crearServicio.mutateAsync(data);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
          loading={crearServicio.isPending}
        />
      )}

      {/* Unified list */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <Wrench className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Sin registros aún</p>
          <p className="text-xs text-muted-foreground mt-1">Usá "Gasto rápido" para importes simples o "Registrar mantenimiento" para services y reparaciones.</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {items.map(item =>
              item.kind === 'gasto' ? (
                <GastoRow
                  key={`g-${item.data.id}`}
                  gasto={item.data}
                  onDelete={() => setDeleteTarget({ id: item.data.id, tipo: 'gasto', label: item.data.descripcion })}
                />
              ) : (
                <ServicioRow
                  key={`s-${item.data.id}`}
                  servicio={item.data}
                  onDelete={() => setDeleteTarget({ id: item.data.id, tipo: 'servicio', label: TIPO_SERVICIO_INFO[item.data.tipo]?.label ?? item.data.tipo })}
                />
              )
            )}
          </div>
        </Card>
      )}

      <MotivoDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Dar de baja el registro"
        description={`"${deleteTarget?.label}" deja de contar en los totales. No se borra: queda registrado con el motivo.`}
        confirmLabel="Dar de baja"
        loading={deleteGasto.isPending || eliminarServicio.isPending}
        onConfirm={async (motivo) => {
          if (!deleteTarget) return;
          if (deleteTarget.tipo === 'gasto') {
            await deleteGasto.mutateAsync({ id: deleteTarget.id, motivo });
          } else {
            await eliminarServicio.mutateAsync(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function ServiceBanner({ kmActual, kmProximo, restantes }: { kmActual: number; kmProximo: number; restantes: number | null }) {
  const vencido = restantes !== null && restantes <= 0;
  const proximo = restantes !== null && restantes > 0 && restantes < 1000;
  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3 text-sm ${
      vencido ? 'bg-red-500/10 border-red-500/30' :
      proximo ? 'bg-amber-500/10 border-amber-500/30' :
      'bg-emerald-500/10 border-emerald-500/30'
    }`}>
      {vencido || proximo
        ? <AlertTriangle className={`h-5 w-5 shrink-0 ${vencido ? 'text-red-400' : 'text-amber-400'}`} />
        : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
      <span className="text-muted-foreground">
        KM actual <strong className="text-foreground">{kmActual.toLocaleString()}</strong>
        {' · '}
        Próximo service <strong className="text-foreground">{kmProximo.toLocaleString()} km</strong>
        {restantes !== null && (
          vencido
            ? <span className="text-red-500"> · {Math.abs(restantes).toLocaleString()} km vencido</span>
            : <span> · {restantes.toLocaleString()} km restantes</span>
        )}
      </span>
    </div>
  );
}

function GastoRapidoForm({ onSubmit, onCancel, loading }: {
  onSubmit: (d: GastoCreate) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = Number(monto);
    if (!m || !descripcion.trim()) { toast.error('Completá descripción y monto'); return; }
    await onSubmit({ tipo: 'otro', descripcion: descripcion.trim(), monto: m, medio_pago: 'efectivo', fecha });
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gasto rápido</p>
      <form onSubmit={handle} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Descripción *</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
            placeholder="Ej: Nafta, lavado, peaje..."
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Monto ($) *</label>
          <input type="number" min="1" value={monto} onChange={e => setMonto(e.target.value)}
            placeholder="15000"
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha *</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" required />
        </div>
        <div className="sm:col-span-3 flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}

function MantenimientoForm({ kmActual, kmProximoService, kmEntreServices, onSubmit, onCancel, loading }: {
  kmActual: number;
  kmProximoService: number;
  kmEntreServices: number;
  onSubmit: (d: ServicioCreate) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tipo, setTipo] = useState<TipoServicio>('service_general');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [kmRealizado, setKmRealizado] = useState(kmActual);
  const [proximoKm, setProximoKm] = useState<number | ''>(
    kmProximoService > 0 ? kmProximoService : kmActual + kmEntreServices
  );
  const [costo, setCosto] = useState('');
  const [proximaFecha, setProximaFecha] = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tipo === 'otro' && !descripcion.trim()) { toast.error('Especificá qué fue el servicio'); return; }
    await onSubmit({
      tipo,
      km_realizado: kmRealizado,
      fecha,
      descripcion: descripcion.trim() || null,
      costo: costo ? parseFloat(costo) : null,
      proximo_km: proximoKm !== '' ? Number(proximoKm) : null,
      proxima_fecha: proximaFecha || null,
    });
  };

  const inp = 'block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5 space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registrar mantenimiento</p>

      <form onSubmit={handle} className="space-y-4">
        {/* Tipo */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIPOS_SERVICIO.map(([value, info]) => (
              <button key={value} type="button"
                onClick={() => setTipo(value)}
                className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${
                  tipo === value
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                <span>{info.icon}</span> {info.label}
              </button>
            ))}
          </div>
        </div>

        {/* Si es "Otro", campo obligatorio */}
        {tipo === 'otro' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">¿Qué fue exactamente? *</label>
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Cambio de batería, limpieza de inyectores..."
              className={inp}
              required
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Fecha *</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className={inp} required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">KM al momento *</label>
            <input type="number" value={kmRealizado}
              onChange={e => setKmRealizado(parseInt(e.target.value) || 0)}
              min={0} className={inp} required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Próximo service (KM)</label>
            <input type="number" value={proximoKm}
              onChange={e => setProximoKm(e.target.value ? parseInt(e.target.value) : '')}
              min={0} placeholder={`ej: ${kmRealizado + (kmEntreServices || 10000)}`}
              className={inp} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Costo ($)</label>
            <input type="number" value={costo}
              onChange={e => setCosto(e.target.value)}
              min={0} step="0.01" placeholder="ej: 35000" className={inp} />
          </div>
          {tipo !== 'otro' && (
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                rows={2} className={`${inp} resize-none`} placeholder="Taller, repuestos, notas..." />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Próxima fecha (opcional)</label>
            <input type="date" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)}
              className={inp} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}

function GastoRow({ gasto, onDelete }: { gasto: any; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">💰</span>
          <span className="text-sm font-medium text-foreground truncate">{gasto.descripcion}</span>
          <span className="text-[10px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">gasto</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(gasto.fecha)}
          {gasto.km_al_momento != null && ` · ${gasto.km_al_momento.toLocaleString()} km`}
          {gasto.proveedor && ` · ${gasto.proveedor}`}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(gasto.monto)}</span>
        <button onClick={onDelete} className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ServicioRow({ servicio, onDelete }: { servicio: Servicio; onDelete: () => void }) {
  const info = TIPO_SERVICIO_INFO[servicio.tipo] ?? { label: servicio.tipo, icon: '🔧' };
  const label = servicio.tipo === 'otro' && servicio.descripcion ? servicio.descripcion : info.label;
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{info.icon}</span>
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">mant.</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(servicio.fecha)}
          {' · '}{servicio.km_realizado.toLocaleString()} km
          {servicio.proximo_km && ` · próx: ${servicio.proximo_km.toLocaleString()} km`}
        </div>
        {servicio.tipo !== 'otro' && servicio.descripcion && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{servicio.descripcion}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {servicio.costo && (
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(servicio.costo)}</span>
        )}
        <button onClick={onDelete} className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
