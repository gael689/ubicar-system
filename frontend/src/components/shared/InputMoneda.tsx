import { useEffect, useState } from 'react';
import { cn, formatMiles, parseMiles } from '@/lib/utils';

interface Props {
  value: number | '';
  onChange: (valor: number | '') => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  /** Se muestra pegado a la izquierda, dentro del campo. `$` por defecto. */
  simbolo?: string | null;
}

/**
 * Un campo de plata: con el puntito de los miles y sin decimales de más.
 *
 * **Por qué no alcanza con `<input type="number">`.** Fue lo que hubo hasta
 * ahora en los quince campos de importe del sistema, y trae dos problemas que
 * el mostrador reportó por separado sin darse cuenta de que eran el mismo:
 *
 * 1. *"Estaría bueno que cuando escribimos precios aparezca el puntito de los
 *    miles: 200.000, así."* Un `type="number"` **no puede** mostrarlo: el
 *    navegador exige que el valor sea un número válido en formato máquina, y
 *    un punto de miles no lo es. Con seis cifras seguidas, poner un cero de más
 *    o de menos no se ve.
 * 2. *"Cuando pones un precio y te sale precio por día y es justo un número
 *    irracional, poner sólo 2 decimales."* Un `type="number"` pinta el valor
 *    crudo del estado, así que `100000/3` aparece como `33333.333333333336`.
 *
 * Los dos se resuelven con lo mismo: un `type="text"` que formatea.
 *
 * **Mientras se tipea no se pelea con quien escribe.** El texto se conserva tal
 * cual mientras el campo tiene el foco —si no, escribir "1000" agregaría un
 * punto en medio de la palabra y movería el cursor— y se formatea al salir. Lo
 * que sí pasa en el acto es avisar el número al formulario, para que el precio
 * total se recalcule mientras se escribe, como antes.
 *
 * **`''` es "vacío" y `0` es "cero"**, y no son lo mismo: un campo de anticipo
 * en blanco significa que no hubo anticipo, y uno en cero significa que se
 * decidió que fuera cero.
 */
export function InputMoneda({
  value, onChange, placeholder, disabled, className, id, autoFocus, simbolo = '$',
}: Props) {
  const [texto, setTexto] = useState(() => formatMiles(value));
  const [enfocado, setEnfocado] = useState(false);

  // El valor puede cambiar desde afuera —el precio por día se recalcula cuando
  // cambian las fechas, o se aprieta "usar el precio sugerido"— y el campo
  // tiene que reflejarlo. **Salvo mientras se está escribiendo en él**: ahí
  // pisar el texto le sacaría las teclas de la mano a la persona.
  useEffect(() => {
    if (!enfocado) setTexto(formatMiles(value));
  }, [value, enfocado]);

  return (
    <div className="relative">
      {simbolo && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
          {simbolo}
        </span>
      )}
      <input
        id={id}
        type="text"
        // Teclado numérico en celular, sin las flechitas de incremento que
        // `type="number"` mete al lado de un importe de seis cifras.
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        onFocus={() => setEnfocado(true)}
        onChange={e => {
          const crudo = e.target.value;
          setTexto(crudo);
          const n = parseMiles(crudo);
          onChange(n === null ? '' : n);
        }}
        onBlur={() => {
          setEnfocado(false);
          const n = parseMiles(texto);
          setTexto(n === null ? '' : formatMiles(n));
          onChange(n === null ? '' : n);
        }}
        className={cn(simbolo ? 'pl-7' : undefined, className)}
      />
    </div>
  );
}
