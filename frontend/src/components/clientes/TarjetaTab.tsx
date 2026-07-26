import { useState } from 'react';
import { CreditCard, Eye, EyeOff, Lock, Pencil, Trash2, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

import { useTarjeta, useUpsertTarjeta, useDeleteTarjeta, type TarjetaClienteInput } from '@/hooks/useTarjeta';

interface Props {
  clienteId: number;
}

const CORRECT_PIN = 'Ubicar123';

export function TarjetaTab({ clienteId }: Props) {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === CORRECT_PIN) {
      setUnlocked(true);
      setPinError('');
    } else {
      setPinError('PIN incorrecto. Intentalo de nuevo.');
      setPinInput('');
    }
  };

  if (!unlocked) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center gap-5 max-w-sm mx-auto">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground">Sección protegida</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ingresa el PIN para ver los datos de la tarjeta.
          </p>
        </div>
        <form onSubmit={handleUnlock} className="w-full space-y-3">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              placeholder="PIN de acceso"
              className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPin(v => !v)}
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {pinError && <p className="text-xs text-danger">{pinError}</p>}
          <Button type="submit" className="w-full">Acceder</Button>
        </form>
      </Card>
    );
  }

  return <TarjetaContent clienteId={clienteId} onLock={() => { setUnlocked(false); setPinInput(''); }} />;
}

function TarjetaContent({ clienteId, onLock }: { clienteId: number; onLock: () => void }) {
  const { data: tarjeta, isLoading } = useTarjeta(clienteId, true);
  const upsert = useUpsertTarjeta(clienteId);
  const deleteTarjeta = useDeleteTarjeta(clienteId);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showCard, setShowCard] = useState(false);

  const [form, setForm] = useState<TarjetaClienteInput>({
    nombre_completo: '',
    nro_tarjeta: '',
    vencimiento: '',
    codigo_3_digitos: '',
    dni_titular: '',
  });

  const openEdit = () => {
    if (tarjeta) {
      setForm({
        nombre_completo: tarjeta.nombre_completo,
        nro_tarjeta: tarjeta.nro_tarjeta,
        vencimiento: tarjeta.vencimiento,
        codigo_3_digitos: tarjeta.codigo_3_digitos,
        dni_titular: tarjeta.dni_titular,
      });
    } else {
      setForm({ nombre_completo: '', nro_tarjeta: '', vencimiento: '', codigo_3_digitos: '', dni_titular: '' });
    }
    setEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate(form, { onSuccess: () => setEditing(false) });
  };

  const maskNumber = (n: string) => {
    const clean = n.replace(/\s/g, '');
    const last4 = clean.slice(-4);
    const masked = '**** **** **** ' + last4;
    return masked;
  };

  if (isLoading) {
    return <Card className="p-5"><Skeleton className="h-40 w-full" /></Card>;
  }

  if (editing) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            {tarjeta ? 'Editar tarjeta' : 'Cargar tarjeta'}
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nombre del titular" required>
              <input
                value={form.nombre_completo}
                onChange={e => setForm(f => ({ ...f, nombre_completo: e.target.value }))}
                placeholder="JUAN PEREZ"
                className="input-base uppercase"
                required
              />
            </FormField>
            <FormField label="DNI del titular" required>
              <input
                value={form.dni_titular}
                onChange={e => setForm(f => ({ ...f, dni_titular: e.target.value.replace(/\D/g, '') }))}
                placeholder="12345678"
                className="input-base font-mono"
                required
              />
            </FormField>
            <FormField label="Numero de tarjeta" required>
              <input
                value={form.nro_tarjeta}
                onChange={e => setForm(f => ({ ...f, nro_tarjeta: e.target.value.replace(/[^\d\s]/g, '') }))}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                className="input-base font-mono tracking-widest"
                required
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Vencimiento (MM/AA)" required>
                <input
                  value={form.vencimiento}
                  onChange={e => {
                    let v = e.target.value.replace(/[^\d\/]/g, '');
                    if (v.length === 2 && !v.includes('/')) v = v + '/';
                    setForm(f => ({ ...f, vencimiento: v }));
                  }}
                  placeholder="12/27"
                  maxLength={5}
                  className="input-base font-mono"
                  required
                />
              </FormField>
              <FormField label="CVV" required>
                <input
                  value={form.codigo_3_digitos}
                  onChange={e => setForm(f => ({ ...f, codigo_3_digitos: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="123"
                  maxLength={4}
                  className="input-base font-mono"
                  type="password"
                  required
                />
              </FormField>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={upsert.isPending}>
              <Save className="h-4 w-4" /> {upsert.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          Datos de tarjeta
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onLock}>
            <Lock className="h-4 w-4" /> Bloquear
          </Button>
          {tarjeta && (
            <>
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </>
          )}
          {!tarjeta && (
            <Button size="sm" onClick={openEdit}>
              <CreditCard className="h-4 w-4" /> Cargar tarjeta
            </Button>
          )}
        </div>
      </div>

      {!tarjeta ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <CreditCard className="h-10 w-10 opacity-30" />
          <p className="text-sm">No hay tarjeta registrada para este cliente.</p>
          <Button size="sm" onClick={openEdit}>Cargar tarjeta</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tarjeta visual */}
          <div className="relative rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white p-6 shadow-lg max-w-sm">
            <div className="flex justify-between items-start mb-8">
              <span className="text-xs opacity-70 font-medium uppercase tracking-widest">Ubicar Rent</span>
              <CreditCard className="h-8 w-8 opacity-80" />
            </div>
            <div className="font-mono text-lg tracking-widest mb-4 flex items-center gap-2">
              {showCard ? (
                <span>{tarjeta.nro_tarjeta.replace(/(.{4})/g, '$1 ').trim()}</span>
              ) : (
                <span>{maskNumber(tarjeta.nro_tarjeta)}</span>
              )}
              <button
                onClick={() => setShowCard(v => !v)}
                className="ml-2 opacity-70 hover:opacity-100"
                type="button"
              >
                {showCard ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <div className="text-[10px] opacity-60 uppercase">Titular</div>
                <div className="text-sm font-semibold uppercase tracking-wide">{tarjeta.nombre_completo}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] opacity-60 uppercase">Vence</div>
                <div className="text-sm font-mono">{tarjeta.vencimiento}</div>
              </div>
            </div>
          </div>

          {/* Datos extra */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">DNI Titular</dt>
              <dd className="font-mono font-medium">{tarjeta.dni_titular}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">CVV</dt>
              <dd className="font-mono font-medium">
                {showCard ? tarjeta.codigo_3_digitos : '***'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vencimiento</dt>
              <dd className="font-mono font-medium">{tarjeta.vencimiento}</dd>
            </div>
          </dl>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar tarjeta"
        description="Esto elimina los datos de tarjeta de forma permanente. Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        loading={deleteTarjeta.isPending}
        onConfirm={async () => {
          await deleteTarjeta.mutateAsync();
          setDeleteOpen(false);
        }}
      />
    </Card>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
