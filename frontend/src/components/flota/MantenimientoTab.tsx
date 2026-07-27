import { useState } from 'react';
import { Wrench, Plus, Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useServicios, useCrearServicio, useEliminarServicio } from '@/hooks/useServicios';
import type { Servicio, ServicioCreate, TipoServicio } from '@/types';

interface Props {
  vehiculoId: number;
  kmActual: number;
  kmProximoService: number;
  kmEntreServices: number;
}

const TIPO_INFO: Record<TipoServicio, { label: string; icon: string }> = {
  service_general: { label: 'Service general', icon: '🔧' },
  aceite:          { label: 'Cambio aceite',   icon: '🛢️' },
  neumaticos:      { label: 'Neumáticos',      icon: '⭕' },
  frenos:          { label: 'Frenos',          icon: '🔴' },
  filtros:         { label: 'Filtros',         icon: '🌀' },
  correa:          { label: 'Correa de distribución', icon: '⚙️' },
  suspension:      { label: 'Suspensión',      icon: '🚗' },
  otro:            { label: 'Otro',            icon: '📋' },
};

const TIPOS = Object.entries(TIPO_INFO) as [TipoServicio, { label: string; icon: string }][];

export function MantenimientoTab({ vehiculoId, kmActual, kmProximoService, kmEntreServices }: Props) {
  const { data: servicios = [], isLoading } = useServicios(vehiculoId);
  const crear = useCrearServicio(vehiculoId);
  const eliminar = useEliminarServicio(vehiculoId);

  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ServicioCreate>({
    tipo: 'service_general',
    km_realizado: kmActual,
    fecha: new Date().toISOString().split('T')[0],
    descripcion: null,
    costo: null,
    proximo_km: kmProximoService > 0 ? kmProximoService : (kmActual + kmEntreServices),
    proxima_fecha: null,
  });

  const restantes = kmProximoService > 0 ? kmProximoService - kmActual : null;

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    await crear.mutateAsync(form);
    setShowForm(false);
    setForm(prev => ({ ...prev, km_realizado: kmActual, descripcion: null, costo: null }));
  }

  function inputCls(extra = '') {
    return `w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm focus:outline-none focus:border-primary ${extra}`;
  }

  return (
    <div className="space-y-4">
      {/* Estado actual del service */}
      <ServiceStatus kmActual={kmActual} kmProximoService={kmProximoService} restantes={restantes} />

      {/* Botón nuevo */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-white text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancelar' : 'Registrar servicio'}
        </button>
      </div>

      {/* Formulario nuevo service */}
      {showForm && (
        <form onSubmit={handleCrear} className="rounded-2xl bg-slate-800/60 border border-white/10 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Nuevo registro de servicio</h3>

          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tipo de servicio *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIPOS.map(([value, info]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo: value }))}
                  className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 ${
                    form.tipo === value
                      ? 'bg-primary/20 border-primary/40 text-primary/35'
                      : 'bg-slate-800 border-white/10 text-slate-400 hover:border-white/20'
                  }`}
                >
                  <span>{info.icon}</span> {info.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Fecha *</label>
              <input type="date" value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className={inputCls()} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">KM al momento del servicio *</label>
              <input type="number" value={form.km_realizado}
                onChange={e => setForm(f => ({ ...f, km_realizado: parseInt(e.target.value) || 0 }))}
                min={0} className={inputCls()} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Próximo service (KM)</label>
              <input type="number" value={form.proximo_km ?? ''}
                onChange={e => setForm(f => ({ ...f, proximo_km: e.target.value ? parseInt(e.target.value) : null }))}
                min={0} placeholder={`ej: ${(form.km_realizado || kmActual) + (kmEntreServices || 10000)}`}
                className={inputCls()} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Costo ($)</label>
              <input type="number" value={form.costo ?? ''}
                onChange={e => setForm(f => ({ ...f, costo: e.target.value ? parseFloat(e.target.value) : null }))}
                min={0} step="0.01" placeholder="ej: 35000"
                className={inputCls()} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Observaciones</label>
              <textarea value={form.descripcion ?? ''}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))}
                rows={2} className={inputCls('resize-none')}
                placeholder="Taller, repuestos usados, notas..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Próxima fecha (opcional)</label>
              <input type="date" value={form.proxima_fecha ?? ''}
                onChange={e => setForm(f => ({ ...f, proxima_fecha: e.target.value || null }))}
                className={inputCls()} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={crear.isPending}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2">
              {crear.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      )}

      {/* Historial */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Cargando historial...</div>
      ) : servicios.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Wrench className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay servicios registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Historial</h3>
          {servicios.map(s => (
            <ServicioCard key={s.id} servicio={s} onDelete={() => setDeleteId(s.id)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar servicio"
        description="¿Seguro que querés eliminar este registro de servicio?"
        confirmLabel="Eliminar"
        onConfirm={async () => { if (deleteId) { await eliminar.mutateAsync(deleteId); setDeleteId(null); } }}
        onOpenChange={open => !open && setDeleteId(null)}
        destructive
      />
    </div>
  );
}

function ServiceStatus({ kmActual, kmProximoService, restantes }: {
  kmActual: number; kmProximoService: number; restantes: number | null;
}) {
  if (kmProximoService <= 0) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-white/10 p-4 text-slate-400 text-sm">
        Sin configuración de service. Registrá el primer servicio para activar el tracking.
      </div>
    );
  }

  const vencido = restantes !== null && restantes <= 0;
  const proximo = restantes !== null && restantes > 0 && restantes < 1000;

  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${
      vencido ? 'bg-red-500/10 border-red-500/30' :
      proximo ? 'bg-amber-500/10 border-amber-500/30' :
      'bg-emerald-500/10 border-emerald-500/30'
    }`}>
      <div className={`text-2xl ${vencido ? 'text-red-400' : proximo ? 'text-amber-400' : 'text-emerald-400'}`}>
        {vencido ? <AlertTriangle className="h-7 w-7" /> : proximo ? <AlertTriangle className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
      </div>
      <div>
        <div className={`text-sm font-semibold ${vencido ? 'text-red-300' : proximo ? 'text-amber-300' : 'text-emerald-300'}`}>
          {vencido ? 'Service vencido' : proximo ? 'Service próximo' : 'Al día'}
        </div>
        <div className="text-xs text-slate-400">
          KM actual: <strong className="text-white">{kmActual.toLocaleString()}</strong>
          {' · '}
          Próximo service: <strong className="text-white">{kmProximoService.toLocaleString()} km</strong>
          {restantes !== null && (
            <> · {vencido ? <span className="text-red-400">{Math.abs(restantes).toLocaleString()} km pasados</span> : <span className="text-slate-300">{restantes.toLocaleString()} km restantes</span>}</>
          )}
        </div>
      </div>
    </div>
  );
}

function ServicioCard({ servicio, onDelete }: { servicio: Servicio; onDelete: () => void }) {
  const info = TIPO_INFO[servicio.tipo] ?? { label: servicio.tipo, icon: '🔧' };
  return (
    <div className="rounded-xl bg-slate-800/50 border border-white/10 p-4 flex items-start gap-3">
      <span className="text-xl shrink-0 mt-0.5">{info.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{info.label}</span>
          <span className="text-xs text-slate-400">{servicio.fecha}</span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400">{servicio.km_realizado.toLocaleString()} km</span>
          {servicio.costo && (
            <>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-emerald-400">${parseFloat(servicio.costo).toLocaleString()}</span>
            </>
          )}
        </div>
        {servicio.descripcion && <p className="text-xs text-slate-400 mt-0.5 truncate">{servicio.descripcion}</p>}
        {servicio.proximo_km && (
          <p className="text-xs text-slate-500 mt-0.5">Próximo: {servicio.proximo_km.toLocaleString()} km{servicio.proxima_fecha ? ` / ${servicio.proxima_fecha}` : ''}</p>
        )}
      </div>
      <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
