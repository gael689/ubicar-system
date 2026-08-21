import { useState } from 'react';
import { Banknote, Landmark, ArrowDownLeft, ShieldCheck, Undo2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrearMovimientoCaja } from '@/hooks/usePagos';
import { formatCurrency, formatDate, extractError } from '@/lib/utils';
import type { DondeEstaLaPlata as Datos, MovimientoCaja, TipoMovimientoCaja } from '@/types';

const TIPO_LABEL: Record<TipoMovimientoCaja, string> = {
  deposito_banco: 'Depósito al banco',
  retiro: 'Retiro',
  garantia_recibida: 'Garantía recibida',
  garantia_devuelta: 'Garantía devuelta',
  reembolso: 'Reembolso',
};

const TIPO_ICONO: Record<TipoMovimientoCaja, typeof Landmark> = {
  deposito_banco: Landmark,
  retiro: ArrowDownLeft,
  garantia_recibida: ShieldCheck,
  garantia_devuelta: ShieldCheck,
  reembolso: Undo2,
};

/** El reembolso no se carga desde acá: revierte también la cuenta corriente. */
const TIPOS_CARGABLES: TipoMovimientoCaja[] = [
  'deposito_banco', 'retiro', 'garantia_recibida', 'garantia_devuelta',
];

interface Props {
  fecha: string;
  datos?: Datos;
  movimientos?: MovimientoCaja[];
}

/**
 * Cuánto efectivo tendría que haber en el cajón, y desde cuándo.
 *
 * `pagos` contesta cuánto entró y `gastos` cuánto salió. Ninguno de los dos
 * contesta **dónde quedó**, que es la pregunta de quien cierra el día.
 *
 * **La fecha del último depósito no es decoración.** El depósito y el retiro
 * son los dos únicos datos que ningún evento del sistema dispara solo: los
 * tiene que cargar una persona. Un número sin fecha al lado parece un saldo
 * confirmado; con la fecha, cuando está viejo se ve que está viejo, y el propio
 * número empuja a cargar lo que falta.
 */
export function DondeEstaLaPlata({ fecha, datos, movimientos = [] }: Props) {
  const crear = useCrearMovimientoCaja();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoMovimientoCaja>('deposito_banco');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');

  async function guardar() {
    const valor = parseFloat(monto);
    if (!valor || valor <= 0) {
      toast.error('Poné un monto mayor a cero');
      return;
    }
    if (!motivo.trim()) {
      toast.error('Escribí para qué fue: dentro de un mes nadie se va a acordar');
      return;
    }
    try {
      await crear.mutateAsync({
        tipo, monto: valor, medio: 'efectivo', motivo: motivo.trim(), fecha,
      });
      toast.success('Movimiento registrado');
      setMonto('');
      setMotivo('');
      setAbierto(false);
    } catch (e) {
      toast.error(extractError(e));
    }
  }

  const diasDesdeDeposito = datos?.ultimo_deposito_fecha
    ? Math.floor(
        (new Date(fecha).getTime() - new Date(datos.ultimo_deposito_fecha).getTime()) / 86400000
      )
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Dónde está la plata
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold tabular-nums">
              {formatCurrency(datos?.efectivo_sin_depositar ?? 0)}
            </span>
            <span className="text-sm text-muted-foreground">en efectivo, sin depositar</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {datos?.sin_depositos_cargados
              ? 'Nunca se cargó un depósito, así que esto se viene acumulando desde el principio.'
              : `Último depósito: ${formatDate(datos!.ultimo_deposito_fecha!)}` +
                (datos?.ultimo_deposito_monto != null
                  ? ` por ${formatCurrency(datos.ultimo_deposito_monto)}`
                  : '') +
                (diasDesdeDeposito != null && diasDesdeDeposito > 0
                  ? ` · hace ${diasDesdeDeposito} día${diasDesdeDeposito === 1 ? '' : 's'}`
                  : '')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAbierto(v => !v)}>
          <Plus className="h-3.5 w-3.5" /> Movimiento
        </Button>
      </div>

      {abierto && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Qué pasó</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as TipoMovimientoCaja)}
                className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
              >
                {TIPOS_CARGABLES.map(t => (
                  <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Monto</label>
              <input
                type="number"
                min={0}
                step={100}
                value={monto}
                onChange={e => setMonto(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Para qué fue *</label>
            <input
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: depósito semanal en el Patagonia"
              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button size="sm" onClick={guardar} disabled={crear.isPending}>
              {crear.isPending ? 'Guardando…' : 'Registrar'}
            </Button>
          </div>
        </div>
      )}

      {movimientos.length > 0 && (
        <div className="divide-y divide-border border-t border-border pt-2">
          {movimientos.map(m => {
            const Icono = TIPO_ICONO[m.tipo];
            return (
              <div key={m.id} className="flex items-center gap-2 py-2 text-sm">
                <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{TIPO_LABEL[m.tipo]}</span>
                <span className="text-muted-foreground truncate flex-1">{m.motivo}</span>
                <span
                  className={`font-semibold tabular-nums shrink-0 ${
                    m.efecto_en_caja >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {m.efecto_en_caja >= 0 ? '+' : '−'}{formatCurrency(Math.abs(m.efecto_en_caja))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
