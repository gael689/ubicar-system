import { TrendingDown, AlertTriangle } from 'lucide-react';
import { useDescuentosDuracion } from '@/hooks/usePrecios';
import { formatCurrency, cn } from '@/lib/utils';
import type { DescuentoDuracion } from '@/types';

/**
 * La escalera de precios por duración, vista como la ve el cliente.
 *
 * **Qué modelo dibuja.** El precio de una categoría es UN número: cuánto sale
 * un día al 100%. El largo del alquiler no se carga como precios distintos —
 * se descuenta con porcentajes, y el sistema los aplica solo. Esta tabla es
 * ese número pasado por la escalera: es lo que se dice en un aviso y lo que se
 * le contesta a alguien que pregunta "¿y si me lo llevo dos semanas?".
 *
 * **No es un segundo motor de precios.** Las bandas salen de la misma tabla
 * que usa el backend para cobrar, y acá sólo se multiplican por el precio del
 * día para mostrarlas. Lo que se factura sigue saliendo de `PrecioService`.
 * Por eso el encabezado dice "estimado": una regla del calendario que cubra
 * esas fechas manda sobre la tarifa y cambia el número.
 */

export interface TramoEscalera {
  etiqueta: string;
  desde: number;
  hasta: number | null;
  porcentaje: number;
}

/**
 * Traduce las bandas cargadas a tramos continuos, agregando adelante el tramo
 * sin descuento. Ese primer tramo no existe como fila en la base —un descuento
 * del 0% no se carga— pero es el que explica el 100%, y sin él la tabla
 * arranca en "3 a 6 días" y nadie sabe qué pasa con 2.
 */
export function armarTramos(
  descuentos: DescuentoDuracion[],
  categoriaId?: number | null,
): TramoEscalera[] {
  const aplicables = descuentos
    .filter(d => d.activo)
    .filter(d => d.categoria_id === null || d.categoria_id === categoriaId)
    .sort((a, b) => a.dias_desde - b.dias_desde);

  const tramos: TramoEscalera[] = [];
  const primera = aplicables[0];

  if (!primera || primera.dias_desde > 1) {
    const hasta = primera ? primera.dias_desde - 1 : null;
    tramos.push({
      etiqueta: hasta === null ? 'Cualquier duración' : hasta === 1 ? '1 día' : `1 a ${hasta} días`,
      desde: 1,
      hasta,
      porcentaje: 0,
    });
  }

  for (const d of aplicables) {
    tramos.push({
      etiqueta: d.nombre,
      desde: d.dias_desde,
      hasta: d.dias_hasta,
      porcentaje: Number(d.porcentaje),
    });
  }
  return tramos;
}

/**
 * ¿Quedó algún día sin ninguna banda entre dos que sí tienen?
 *
 * Es el error de carga más silencioso de todos: entre "7 a 14" y "16 a 30", el
 * día 15 se cobra al 100% —más caro que 14 días y más caro que 16—. No rompe
 * nada, factura mal.
 */
export function huecosEnLaEscalera(tramos: TramoEscalera[]): number[] {
  const huecos: number[] = [];
  for (let i = 0; i < tramos.length - 1; i++) {
    const fin = tramos[i].hasta;
    if (fin === null) break;
    const siguiente = tramos[i + 1].desde;
    for (let dia = fin + 1; dia < siguiente; dia++) huecos.push(dia);
  }
  return huecos;
}

interface Props {
  /** Precio de UN día al 100%. Sin él se muestran sólo los porcentajes. */
  precioDia?: number | null;
  categoriaId?: number | null;
  className?: string;
  /** Avisa si hay tarifa semanal o mensual cargada: descontarían dos veces. */
  tieneTarifaDeBloque?: boolean;
}

export function EscaleraDuracion({
  precioDia, categoriaId, className, tieneTarifaDeBloque = false,
}: Props) {
  const { data: descuentos = [] } = useDescuentosDuracion();
  const tramos = armarTramos(descuentos, categoriaId);
  const huecos = huecosEnLaEscalera(tramos);
  const hayDescuentos = tramos.some(t => t.porcentaje > 0);

  return (
    <div className={cn('rounded-xl border border-border bg-background', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <TrendingDown className="h-4 w-4 shrink-0 text-emerald-600" />
        <p className="flex-1 text-xs font-semibold text-foreground">
          Cuánto sale según cuántos días
        </p>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          web y mostrador
        </span>
      </div>

      {!hayDescuentos ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          No hay escalones cargados: hoy <strong className="text-foreground">un día y un mes
          salen lo mismo por día</strong>. Se cargan en Precios → Descuentos por duración.
        </p>
      ) : (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-1.5 font-medium">Duración</th>
                <th className="px-2 py-1.5 text-right font-medium">Descuento</th>
                {precioDia ? (
                  <>
                    <th className="px-2 py-1.5 text-right font-medium">Por día</th>
                    <th className="px-4 py-1.5 text-right font-medium">Desde</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tramos.map(t => {
                const porDia = precioDia ? precioDia * (1 - t.porcentaje / 100) : null;
                return (
                  <tr key={`${t.desde}-${t.hasta ?? 'fin'}`}>
                    <td className="px-4 py-2 text-foreground">
                      {t.etiqueta}
                      <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                        ({t.hasta === null ? `${t.desde}+` : `${t.desde}–${t.hasta}`} d)
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {t.porcentaje > 0 ? (
                        <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white tabular-nums">
                          −{t.porcentaje}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">precio de lista</span>
                      )}
                    </td>
                    {precioDia ? (
                      <>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-foreground">
                          {formatCurrency(porDia)}
                        </td>
                        {/* El mínimo del tramo: es el número con el que se
                            comunica ("desde $X por 3 días"). El máximo no se
                            muestra porque el último tramo no tiene. */}
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {formatCurrency((porDia ?? 0) * t.desde)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-muted-foreground">
            Estimado sobre la tarifa diaria. Si una regla del calendario cubre esas
            fechas, manda la regla y el número cambia. Los seguros y extras se suman
            aparte: <strong className="text-foreground">el descuento es sobre el auto</strong>.
          </p>
        </>
      )}

      {huecos.length > 0 && (
        <p className="flex items-start gap-1.5 border-t border-warning/30 bg-warning/10 px-4 py-2 text-[11px] leading-snug text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Sin banda para {huecos.length === 1 ? 'el día' : 'los días'}{' '}
            <strong>{huecos.join(', ')}</strong>: se cobran al 100%, más caro que un
            alquiler más corto. Estirá el tramo anterior para taparlo.
          </span>
        </p>
      )}

      {tieneTarifaDeBloque && hayDescuentos && (
        <p className="flex items-start gap-1.5 border-t border-warning/30 bg-warning/10 px-4 py-2 text-[11px] leading-snug text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Esta categoría tiene tarifa semanal o mensual además de la diaria. Esas
            tarifas ya abaratan el alquiler largo por su cuenta, y encima corre este
            porcentaje: <strong>se descuenta dos veces</strong>. Con la escalera
            cargada, dejá sólo la tarifa diaria.
          </span>
        </p>
      )}
    </div>
  );
}
