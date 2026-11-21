import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { InputMoneda } from '@/components/shared/InputMoneda';
import { cn, formatMiles } from '@/lib/utils';
import {
  DIAS_SEMANA, ETIQUETA_MODALIDAD, cantidadDeSemanas, diaDeSemana, fechaCorta, realinearFechas,
  totalUber, validarFechasDePago, type ModalidadUber,
} from '@/lib/uber';

export interface DatosUber {
  tipo: 'alquiler' | 'uber';
  valorSemana: number | '';
  kmSemana: number | '';
  precioKmExtra: number | '';
  /** Cuándo se paga cada semana: antes de usarla o al terminarla. */
  modalidad: ModalidadUber;
  /** Aclaración opcional: "por transferencia", "en efectivo en el local". */
  nota: string;
  /** Fechas ISO de pago, **una por semana**. Se proponen solas. */
  fechasPago: string[];
}

export const UBER_VACIO: DatosUber = {
  tipo: 'alquiler', valorSemana: '', kmSemana: '', precioKmExtra: '',
  modalidad: 'adelantado', nota: '', fechasPago: [],
};

/** Lo que se cargó en el último contrato de Uber (`GET /uber/ultimos-valores`). */
export interface SugeridosUber {
  valor_semana: number | null;
  km_semana: number | null;
  precio_km_extra: number | null;
  modalidad?: ModalidadUber;
}

interface Props {
  value: DatosUber;
  onChange: (v: DatosUber) => void;
  fechaInicio: string;
  dias: number;
  /** El tipo ya viene decidido (desde el menú Nueva operación): no se muestra el selector. */
  ocultarTipo?: boolean;
  /** Si viene y el formulario está vacío, se precarga: casi siempre son los mismos valores. */
  sugeridos?: SugeridosUber | null;
}

const campo = 'w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';

/**
 * Tipo de contrato (Alquiler / Uber) y, si es Uber, lo que pidió Franco:
 * valor de la semana, condición de pago, fechas de pago, kilometraje y precio
 * del km extra. El total sale del valor de la semana.
 *
 * **Las fechas de pago son una por semana, siempre** (21/11/2026). Antes eran
 * una lista libre —se podían sacar y agregar— y con una fecha de menos las
 * cuotas de la cuenta corriente salían más caras que el valor de la semana
 * pactado. Ahora se generan solas con un solo control ("Paga los: lunes") y lo
 * único que se puede hacer a mano es mover una fecha puntual.
 */
export function CamposUber({ value, onChange, fechaInicio, dias, ocultarTipo, sugeridos }: Props) {
  const esUber = value.tipo === 'uber';
  const semanas = cantidadDeSemanas(dias);
  const total = value.valorSemana === '' ? null : totalUber(Number(value.valorSemana), dias);

  // El día de pago acompaña al del retiro hasta que alguien elige otro.
  const [diaElegido, setDiaElegido] = useState<number | null>(null);
  const dia = diaElegido ?? (fechaInicio ? diaDeSemana(fechaInicio) : 0);

  // **Cualquier cambio del retiro, la duración, el día o la modalidad rehace
  // todas las fechas.** Una fecha movida a mano dura mientras nada de eso
  // cambie: es la única forma de garantizar que nunca queden más o menos
  // fechas que semanas.
  const clave = `${esUber}|${fechaInicio}|${dias}|${dia}|${value.modalidad}`;
  const claveAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (!esUber) { claveAnterior.current = clave; return; }
    const primeraVez = claveAnterior.current === null;
    const cambio = claveAnterior.current !== clave;
    claveAnterior.current = clave;
    // Al montar con fechas que ya sirven (vienen de afuera), se respetan.
    if (primeraVez && value.fechasPago.length > 0 && !validarFechasDePago(value.fechasPago, dias)) return;
    if (!cambio && !primeraVez) return;
    const propuesta = realinearFechas(fechaInicio, dias, dia, value.modalidad);
    if (propuesta.join() !== value.fechasPago.join()) onChange({ ...value, fechasPago: propuesta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Los valores del último contrato, una sola vez y sólo si no se cargó nada.
  const sugerido = useRef(false);
  const [vieneDelUltimo, setVieneDelUltimo] = useState(false);
  useEffect(() => {
    if (!esUber || !sugeridos || sugerido.current) return;
    sugerido.current = true;
    if (value.valorSemana !== '' || value.kmSemana !== '' || value.precioKmExtra !== '') return;
    if (!sugeridos.valor_semana) return;
    setVieneDelUltimo(true);
    const modalidad = sugeridos.modalidad ?? value.modalidad;
    onChange({
      ...value,
      valorSemana: sugeridos.valor_semana,
      kmSemana: sugeridos.km_semana ?? '',
      precioKmExtra: sugeridos.precio_km_extra ?? '',
      modalidad,
      // Si este efecto corre en la misma pasada que el de las fechas, `value`
      // todavía no las tiene: se calculan acá para no pisarlas con una lista vacía.
      fechasPago: realinearFechas(fechaInicio, dias, dia, modalidad),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esUber, sugeridos]);

  const set = (cambios: Partial<DatosUber>) => onChange({ ...value, ...cambios });

  // Con el tipo decidido y siendo un alquiler común, no hay nada que mostrar.
  if (ocultarTipo && !esUber) return null;

  const problemaFechas = esUber && value.fechasPago.length > 0
    ? validarFechasDePago(value.fechasPago, dias)
    : null;
  // Lo que va a valer cada cuota: el total en partes iguales, que es como las
  // asienta el check-out (no "semanas enteras y un resto").
  const cuota = total !== null && total > 0 ? total / semanas : null;

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
          {vieneDelUltimo && (
            <p className="-mt-2 text-xs text-slate-500">
              Son los valores del último contrato de Uber. Cambialos si este es distinto.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="uber-modalidad" className="text-sm font-semibold text-slate-700">Condición de pago</label>
              <select id="uber-modalidad" value={value.modalidad}
                onChange={e => set({ modalidad: e.target.value as ModalidadUber })} className={campo}>
                {(Object.keys(ETIQUETA_MODALIDAD) as ModalidadUber[]).map(m => (
                  <option key={m} value={m}>{ETIQUETA_MODALIDAD[m]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="uber-dia" className="text-sm font-semibold text-slate-700">Paga los</label>
              <select id="uber-dia" value={dia}
                onChange={e => setDiaElegido(Number(e.target.value))} className={campo}>
                {DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="uber-nota" className="text-sm font-semibold text-slate-700">
                Nota <span className="font-normal text-slate-500">(opcional)</span>
              </label>
              <input id="uber-nota" type="text" value={value.nota}
                onChange={e => set({ nota: e.target.value })}
                placeholder="Por transferencia" className={campo} />
            </div>
          </div>

          <div className="space-y-1.5" data-campo="uber_fechas_pago">
            <p className="text-sm font-semibold text-slate-700">
              Fechas de pago <span className="font-normal text-slate-500">({semanas} {semanas === 1 ? 'semana' : 'semanas'}, una por semana)</span>
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
              {value.fechasPago.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                  <span className="text-slate-800">
                    <span className="font-medium">Semana {i + 1}</span>
                    <span className="text-slate-500"> · {fechaCorta(f)}</span>
                    {cuota !== null && <span className="text-slate-500"> · ${formatMiles(cuota, 0)}</span>}
                  </span>
                  <input type="date" value={f} aria-label={`Fecha de pago de la semana ${i + 1}`}
                    onChange={e => set({ fechasPago: value.fechasPago.map((x, j) => j === i ? e.target.value : x) })}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </li>
              ))}
            </ul>
            {problemaFechas ? (
              <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {problemaFechas}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Se puede mover una fecha puntual. Cambiar el día de pago o la duración las vuelve a alinear.
              </p>
            )}
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
