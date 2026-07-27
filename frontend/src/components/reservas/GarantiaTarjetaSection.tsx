/**
 * Sección de garantía con tarjeta integrada al perfil del cliente.
 * Se usa dentro de CheckoutModal cuando el tipo de garantía es "tarjeta".
 *
 * Flujo:
 * 1. Busca automáticamente si el cliente ya tiene tarjeta registrada.
 * 2. Si tiene: muestra preview y opción de usar esa tarjeta o ingresar datos distintos.
 * 3. Si no tiene: ofrece registrar datos de tarjeta O subir una foto.
 *    En ambos casos guarda en el perfil del cliente para futuras consultas.
 */
import { useState, useEffect, useRef } from 'react';
import { CreditCard, Upload, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import type { ApiResponse } from '@/types';

const PIN = 'Ubicar123';

interface TarjetaCliente {
  id: number;
  nombre_completo: string;
  nro_tarjeta: string;
  vencimiento: string;
  codigo_3_digitos: string;
  dni_titular: string;
}

interface Props {
  clienteId: number;
  clienteNombre: string;
}

type EstadoCarga = 'idle' | 'loading' | 'found' | 'not_found' | 'error';
type ModoRegistro = 'datos' | 'foto';
type UsarTarjeta = 'registrada' | 'manual';

export function GarantiaTarjetaSection({ clienteId, clienteNombre }: Props) {
  const [estado, setEstado] = useState<EstadoCarga>('idle');
  const [tarjeta, setTarjeta] = useState<TarjetaCliente | null>(null);
  const [usarTarjeta, setUsarTarjeta] = useState<UsarTarjeta>('registrada');
  const [showRegistro, setShowRegistro] = useState(false);
  const [modoRegistro, setModoRegistro] = useState<ModoRegistro>('datos');

  // Form datos tarjeta
  const [form, setForm] = useState({ nombre_completo: '', nro_tarjeta: '', vencimiento: '', codigo_3_digitos: '', dni_titular: '' });
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  // Foto
  const fileRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoOk, setFotoOk] = useState(false);

  // ── Fetch tarjeta al montar ───────────────────────────────────────────────
  useEffect(() => {
    if (!clienteId) return;
    setEstado('loading');
    api.get<ApiResponse<TarjetaCliente | null>>(`/clientes/${clienteId}/tarjeta`, {
      headers: { 'x-tarjeta-pin': PIN },
    })
      .then(res => {
        if (res.data.data) {
          setTarjeta(res.data.data);
          setEstado('found');
        } else {
          setEstado('not_found');
        }
      })
      .catch(() => setEstado('not_found'));
  }, [clienteId]);

  // ── Guardar tarjeta (datos) ───────────────────────────────────────────────
  const handleGuardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const res = await api.put<ApiResponse<TarjetaCliente>>(
        `/clientes/${clienteId}/tarjeta`,
        form,
        { headers: { 'x-tarjeta-pin': PIN } },
      );
      setTarjeta(res.data.data);
      setEstado('found');
      setShowRegistro(false);
      setGuardadoOk(true);
    } catch (err: any) {
      setErrorGuardar(err?.response?.data?.detail || 'Error al guardar la tarjeta');
    } finally {
      setGuardando(false);
    }
  };

  // ── Subir foto ────────────────────────────────────────────────────────────
  const handleSubirFoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foto) return;
    setSubiendoFoto(true);
    setErrorGuardar(null);
    try {
      const formData = new FormData();
      formData.append('tipo', 'otro');
      formData.append('nombre', 'Foto tarjeta garantía');
      formData.append('file', foto);
      await api.post(`/clientes/${clienteId}/documentos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFotoOk(true);
      setShowRegistro(false);
    } catch (err: any) {
      setErrorGuardar(err?.response?.data?.detail || 'Error al subir la foto');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const maskCard = (n: string) => {
    const clean = n.replace(/\s/g, '');
    return '**** **** **** ' + clean.slice(-4);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (estado === 'loading') {
    return (
      <div className="flex items-center gap-2 py-2 text-slate-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando tarjeta del cliente...
      </div>
    );
  }

  if (estado === 'found' && tarjeta) {
    return (
      <div className="space-y-3">
        {guardadoOk && (
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Tarjeta registrada y vinculada
          </div>
        )}

        {/* Preview tarjeta registrada */}
        <div className="rounded-xl bg-gradient-to-br from-primary/80 to-blue-700/80 border border-primary/30 p-4 text-white">
          <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] opacity-60 uppercase tracking-widest">Tarjeta registrada</span>
            <CreditCard className="h-5 w-5 opacity-70" />
          </div>
          <div className="font-mono text-sm tracking-widest mb-3 text-white/90">
            {maskCard(tarjeta.nro_tarjeta)}
          </div>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[9px] opacity-50 uppercase">Titular</div>
              <div className="text-xs font-semibold uppercase">{tarjeta.nombre_completo}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] opacity-50 uppercase">Vence</div>
              <div className="text-xs font-mono">{tarjeta.vencimiento}</div>
            </div>
          </div>
        </div>

        {/* Opciones */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUsarTarjeta('registrada')}
            className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              usarTarjeta === 'registrada'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Usar esta tarjeta
          </button>
          <button
            type="button"
            onClick={() => setUsarTarjeta('manual')}
            className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
              usarTarjeta === 'manual'
                ? 'bg-slate-700 border-white/20 text-white'
                : 'bg-slate-800 border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            Usar datos distintos
          </button>
        </div>

        {usarTarjeta === 'manual' && (
          <div className="rounded-xl bg-slate-800/60 border border-white/10 p-3">
            <p className="text-xs text-slate-400 mb-3">
              Estos datos son solo de referencia para esta operación y no reemplazan la tarjeta guardada en el perfil.
            </p>
            <MiniCardForm
              form={form}
              setForm={setForm}
              onSubmit={() => {}} // solo referencia, no guarda
              guardando={false}
              soloReferencia
            />
          </div>
        )}
      </div>
    );
  }

  // not_found
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 py-1">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-xs text-amber-300">
          <strong>{clienteNombre}</strong> no tiene tarjeta registrada en su perfil.
        </span>
      </div>

      {fotoOk && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" /> Foto de tarjeta subida al perfil del cliente
        </div>
      )}

      {!fotoOk && (
        <button
          type="button"
          onClick={() => setShowRegistro(v => !v)}
          className="flex items-center gap-2 text-xs text-primary/60 hover:text-primary/35 transition-colors font-medium"
        >
          {showRegistro ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showRegistro ? 'Cerrar' : 'Registrar tarjeta ahora'}
        </button>
      )}

      {showRegistro && (
        <div className="rounded-xl bg-slate-800/60 border border-white/10 p-4 space-y-3">
          {/* Tabs modo */}
          <div className="flex gap-1 p-0.5 bg-slate-900/60 rounded-lg">
            <button
              type="button"
              onClick={() => setModoRegistro('datos')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                modoRegistro === 'datos'
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" /> Ingresar datos
            </button>
            <button
              type="button"
              onClick={() => setModoRegistro('foto')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                modoRegistro === 'foto'
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Upload className="h-3.5 w-3.5" /> Subir foto
            </button>
          </div>

          {modoRegistro === 'datos' && (
            <form onSubmit={handleGuardarDatos}>
              <MiniCardForm
                form={form}
                setForm={setForm}
                onSubmit={handleGuardarDatos}
                guardando={guardando}
              />
            </form>
          )}

          {modoRegistro === 'foto' && (
            <form onSubmit={handleSubirFoto} className="space-y-3">
              <p className="text-xs text-slate-400">
                Subí una foto de la tarjeta del cliente. Se guarda como documento en su perfil.
              </p>
              <div
                className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {foto ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto" />
                    <p className="text-xs text-emerald-400">{foto.name}</p>
                    <p className="text-[10px] text-slate-500">{(foto.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="h-6 w-6 text-slate-500 mx-auto" />
                    <p className="text-xs text-slate-400">Click para seleccionar imagen</p>
                    <p className="text-[10px] text-slate-500">JPG, PNG, PDF</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => setFoto(e.target.files?.[0] ?? null)}
              />
              {foto && (
                <button
                  type="submit"
                  disabled={subiendoFoto}
                  className="w-full py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {subiendoFoto && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {subiendoFoto ? 'Subiendo...' : 'Guardar foto en perfil'}
                </button>
              )}
            </form>
          )}

          {errorGuardar && (
            <p className="text-xs text-red-400">{errorGuardar}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mini formulario de tarjeta ─────────────────────────────────────────────

interface MiniCardFormProps {
  form: { nombre_completo: string; nro_tarjeta: string; vencimiento: string; codigo_3_digitos: string; dni_titular: string };
  setForm: React.Dispatch<React.SetStateAction<MiniCardFormProps['form']>>;
  onSubmit: (e: React.FormEvent) => void;
  guardando: boolean;
  soloReferencia?: boolean;
}

function MiniCardForm({ form, setForm, onSubmit, guardando, soloReferencia = false }: MiniCardFormProps) {
  const inputCls = 'w-full px-2.5 py-1.5 rounded-lg bg-slate-700 border border-white/10 text-white text-xs focus:outline-none focus:border-primary';
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre del titular *">
          <input
            value={form.nombre_completo}
            onChange={e => setForm(f => ({ ...f, nombre_completo: e.target.value.toUpperCase() }))}
            placeholder="JUAN PEREZ"
            className={`${inputCls} uppercase`}
            required={!soloReferencia}
          />
        </Field>
        <Field label="DNI titular *">
          <input
            value={form.dni_titular}
            onChange={e => setForm(f => ({ ...f, dni_titular: e.target.value.replace(/\D/g, '') }))}
            placeholder="12345678"
            className={`${inputCls} font-mono`}
            required={!soloReferencia}
          />
        </Field>
        <Field label="Número de tarjeta *" className="col-span-2">
          <input
            value={form.nro_tarjeta}
            onChange={e => setForm(f => ({ ...f, nro_tarjeta: e.target.value.replace(/[^\d\s]/g, '') }))}
            placeholder="1234 5678 9012 3456"
            maxLength={19}
            className={`${inputCls} font-mono tracking-widest`}
            required={!soloReferencia}
          />
        </Field>
        <Field label="Vencimiento">
          <input
            value={form.vencimiento}
            onChange={e => {
              let v = e.target.value.replace(/[^\d/]/g, '');
              if (v.length === 2 && !v.includes('/')) v += '/';
              setForm(f => ({ ...f, vencimiento: v }));
            }}
            placeholder="12/27"
            maxLength={5}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="CVV">
          <input
            value={form.codigo_3_digitos}
            onChange={e => setForm(f => ({ ...f, codigo_3_digitos: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            placeholder="123"
            maxLength={4}
            type="password"
            className={`${inputCls} font-mono`}
          />
        </Field>
      </div>

      {!soloReferencia && (
        <button
          type="submit"
          onClick={onSubmit}
          disabled={guardando || !form.nombre_completo || !form.nro_tarjeta}
          className="w-full py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {guardando ? 'Guardando...' : '💾 Guardar tarjeta en perfil del cliente'}
        </button>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
