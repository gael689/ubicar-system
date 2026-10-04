import { useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { InputMoneda } from '@/components/shared/InputMoneda';
import { cn, formatMiles } from '@/lib/utils';
import { cantidadDeSemanas, fechasDePagoUber, totalUber } from '@/lib/uber';

export interface DatosUber {
  tipo: 'alquiler' | 'uber';
  valorSemana: number | '';
  kmSemana: number | '';
  precioKmExtra: number | '';
  /** Texto libre: "Semanal adelantada, por transferencia". */
  condicion: string;
  /** Fechas ISO de pago. Se proponen solas y se pueden editar. */
  fechasPago: string[];
}

export const UBER_VACIO: DatosUber = {
  tipo: 'alquiler', valorSemana: '', kmSemana: '', precioKmExtra: '', condicion: '', fechasPago: [],
};

interface Props {
  value: DatosUber;
  onChange: (v: DatosUber) => void;
  fechaInicio: string;
  dias: number;
  /** El tipo ya viene decidido (desde el menú Nueva operación): no se muestra el selector. */
  ocultarTipo?: boolean;
}

const campo = 'w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';

/**
 * Tipo de contrato (Alquiler / Uber) y, si es Uber, lo que pidió Franco:
 * valor de la semana, condición de pago, fechas de pago, kilometraje y precio
 * del km extra. El total sale del valor de la semana; las fechas de pago se
 * proponen una por semana y se pueden cambiar.
 */
export function CamposUber({ value, onChange, fechaInicio, dias, ocultarTipo }: Props) {
  const esUber = value.tipo === 'uber';
  const semanas = cantidadDeSemanas(dias);
  const total = value.valorSemana === '' ? null : totalUber(Number(value.valorSemana), dias);

  // Las fechas siguen al retiro y a la duración **hasta que alguien las
  // toca**: ahí pasan a ser las suyas y no se pisan más.
  const editadas = useRef(false);
  useEffect(() => {
    if (!esUber || editadas.current) return;
    const propuesta = fechasDePagoUber(fechaInicio, dias);
    if (propuesta.join() !== value.fechasPago.join()) onChange({ ...value, fechasPago: propuesta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esUber, fechaInicio, dias]);

  const set = (cambios: Partial<DatosUber>) => onChange({ ...value, ...cambios });
  const setFechas = (fechas: string[]) => {
    editadas.current = true;
    set({ fechasPago: fechas });
  };

  // Con el tipo decidido y siendo un alquiler común, no hay nada que mostrar.
  if (ocultarTipo && !esUber) return null;

  return (
    <div className="space-y-4" data-campo="uber">
      {!ocultarTipo && (
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700">Tipo de contrato</label>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
          {(['alquiler', 'uber'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => set({ tipo: t })}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                value.tipo === t ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-primary/10',
              )}
            >
              {t === 'alquiler' ? 'Alquiler' : 'Uber'}
            </button>
          ))}
        </div>
        {esUber && (
          <p className="text-xs text-slate-600">
            El auto pasa a Uber con este contrato. Los términos reemplazan la prohibición de
            transportar personas por la responsabilidad del titular.
          </p>
        )}
      </div>
      )}

      {esUber && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5" data-campo="uber_valor_semana">
              <label className="text-sm font-semibold text-slate-700">Valor semana *</label>
              <InputMoneda value={value.valorSemana} onChange={v => set({ valorSemana: v })}
                placeholder="200.000" className={campo} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Km permitidos por semana</label>
              <input type="number" min={0} value={value.kmSemana}
                onChange={e => set({ kmSemana: e.target.value === '' ? '' : Number(e.target.value) })}
                placeholder="1500" className={campo} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Precio del km extra</label>
              <InputMoneda value={value.precioKmExtra} onChange={v => set({ precioKmExtra: v })}
                placeholder="150" className={campo} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Condición de pago</label>
            <input type="text" value={value.condicion}
              onChange={e => set({ condicion: e.target.value })}
              placeholder="Semanal adelantada, por transferencia" className={campo} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              Fechas de pago <span className="font-normal text-slate-500">({semanas} {semanas === 1 ? 'semana' : 'semanas'})</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {value.fechasPago.map((f, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white pr-1">
                  <input type="date" value={f}
                    onChange={e => setFechas(value.fechasPago.map((x, j) => j === i ? e.target.value : x))}
                    className="rounded-l-lg bg-transparent px-2 py-2 text-sm focus:outline-none" />
                  <button type="button" aria-label="Sacar esta fecha"
                    onClick={() => setFechas(value.fechasPago.filter((_, j) => j !== i))}
                    className="rounded p-1 text-slate-400 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => setFechas([...value.fechasPago, value.fechasPago[value.fechasPago.length - 1] ?? fechaInicio])}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-primary/10">
                <Plus className="h-3.5 w-3.5" /> Agregar fecha
              </button>
            </div>
          </div>

          {total !== null && total > 0 && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              Total del alquiler: <strong>${formatMiles(total)}</strong>
              <span className="text-slate-600"> · {dias} días a ${formatMiles(Number(value.valorSemana))} la semana</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
