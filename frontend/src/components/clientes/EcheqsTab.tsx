import { useState } from 'react';
import { Banknote, ChevronDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
import { useEcheqs, useActualizarEcheq } from '@/hooks/useEcheqs';
import { ESTADO_ECHEQ_LABEL, ESTADO_ECHEQ_COLOR } from '@/lib/constants';
import { formatCurrency, formatDate, extractError, cn } from '@/lib/utils';
import type { Echeq, EstadoEcheq } from '@/types';

const ESTADOS_TRANSICION: Record<string, EstadoEcheq[]> = {
  en_cartera: ['depositado', 'endosado', 'rechazado', 'cobrado'],
  depositado: ['cobrado', 'rechazado'],
  endosado: ['cobrado', 'rechazado'],
  pendiente: ['cobrado', 'rechazado', 'en_cartera'],
  cobrado: [],
  rechazado: [],
  vencido: [],
};

interface Props {
  clienteId: number;
}

export function EcheqsTab({ clienteId }: Props) {
  const { data: echeqs = [], isLoading } = useEcheqs({ cliente_id: clienteId });
  const actualizar = useActualizarEcheq();
  const [rechazando, setRechazando] = useState<Echeq | null>(null);
  const [completandoId, setCompletandoId] = useState<number | null>(null);
  const [showMenuId, setShowMenuId] = useState<number | null>(null);
  const [completarForm, setCompletarForm] = useState({ banco: '', numero_cheque: '', fecha_cobro: '' });

  async function handleEstado(echeq: Echeq, estado: EstadoEcheq) {
    if (estado === 'rechazado') {
      setRechazando(echeq);
      return;
    }
    try {
      await actualizar.mutateAsync({ id: echeq.id, payload: { estado } });
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleRechazar(motivo: string) {
    if (!rechazando) return;
    try {
      await actualizar.mutateAsync({ id: rechazando.id, payload: { estado: 'rechazado', motivo_rechazo: motivo } });
      toast.success('Echeq rechazado');
      setRechazando(null);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  function abrirCompletar(echeq: Echeq) {
    setCompletandoId(echeq.id);
    setCompletarForm({
      banco: echeq.banco ?? '',
      numero_cheque: echeq.numero_cheque ?? '',
      fecha_cobro: echeq.fecha_cobro ?? '',
    });
  }

  async function handleCompletar(echeq: Echeq) {
    try {
      await actualizar.mutateAsync({
        id: echeq.id,
        payload: {
          banco: completarForm.banco.trim() || null,
          numero_cheque: completarForm.numero_cheque.trim() || null,
          fecha_cobro: completarForm.fecha_cobro || null,
        },
      });
      toast.success('Datos del echeq completados');
      setCompletandoId(null);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Echeqs</h3>
        {echeqs.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold">
            {echeqs.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-6 text-sm">Cargando...</div>
      ) : echeqs.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          Sin echeqs registrados para este cliente
        </div>
      ) : (
        <div className="space-y-2">
          {echeqs.map(e => {
            const transiciones = ESTADOS_TRANSICION[e.estado] ?? [];
            return (
              <div key={e.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-foreground">{formatCurrency(e.monto)}</span>
                      <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', ESTADO_ECHEQ_COLOR[e.estado])}>
                        {ESTADO_ECHEQ_LABEL[e.estado] ?? e.estado}
                      </span>
                      {!e.datos_completos && (
                        <span className="inline-flex items-center rounded-full bg-warning text-white px-2 py-0.5 text-xs font-semibold">
                          Pendiente de completar
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Emisión: {formatDate(e.fecha_emision)}
                      {e.fecha_cobro ? ` · Cobro: ${formatDate(e.fecha_cobro)}` : ' · Sin fecha de cobro todavía'}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.banco ?? 'Sin banco'} · #{e.numero_cheque ?? '—'}</p>
                    {e.reserva_id && <p className="text-xs text-muted-foreground">Reserva #{e.reserva_id}</p>}
                    {e.alquiler_id && <p className="text-xs text-muted-foreground">Alquiler #{e.alquiler_id}</p>}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {!e.datos_completos && (
                        <Button variant="outline" size="sm" onClick={() => abrirCompletar(e)}>
                          <Pencil className="h-3.5 w-3.5" /> Completar datos
                        </Button>
                      )}
                      {transiciones.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => setShowMenuId(v => v === e.id ? null : e.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-lg hover:bg-accent text-muted-foreground"
                          >
                            Estado <ChevronDown className="h-3 w-3" />
                          </button>
                          {showMenuId === e.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setShowMenuId(null)} />
                              <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[130px]">
                                {transiciones.map(est => (
                                  <button
                                    key={est}
                                    onClick={() => { handleEstado(e, est); setShowMenuId(null); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                                  >
                                    {ESTADO_ECHEQ_LABEL[est] ?? est}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {completandoId === e.id && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Banco</label>
                      <input
                        value={completarForm.banco}
                        onChange={ev => setCompletarForm(f => ({ ...f, banco: ev.target.value }))}
                        placeholder="Banco Nación"
                        className="input-base"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Número de cheque</label>
                      <input
                        value={completarForm.numero_cheque}
                        onChange={ev => setCompletarForm(f => ({ ...f, numero_cheque: ev.target.value }))}
                        placeholder="00012345"
                        className="input-base"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Fecha de cobro</label>
                      <input
                        type="date"
                        value={completarForm.fecha_cobro}
                        onChange={ev => setCompletarForm(f => ({ ...f, fecha_cobro: ev.target.value }))}
                        className="input-base"
                      />
                    </div>
                    <div className="sm:col-span-3 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setCompletandoId(null)}>Cancelar</Button>
                      <Button size="sm" onClick={() => handleCompletar(e)} disabled={actualizar.isPending}>
                        {actualizar.isPending ? 'Guardando...' : 'Guardar'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MotivoDialog
        open={rechazando !== null}
        onOpenChange={open => !open && setRechazando(null)}
        title="Rechazar echeq"
        description="El banco rechazó el cheque. Si había generado un crédito en la cuenta corriente del cliente, se revierte con un contra-asiento."
        confirmLabel="Rechazar"
        loading={actualizar.isPending}
        onConfirm={handleRechazar}
      />
    </Card>
  );
}
