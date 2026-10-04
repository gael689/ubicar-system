import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { useCategorias } from '@/hooks/useCategorias';
import { useCalcularPrecio } from '@/hooks/usePrecios';
import { fechaLocal, formatCurrency, formatDate, hoyLocal } from '@/lib/utils';
import type { Cotizacion } from '@/types';

/**
 * Por qué ganó la regla de ese día, en castellano.
 *
 * Los códigos vienen del dominio (`domain/precios.py::MOTIVO_*`) y son los
 * cuatro criterios de desempate, en el orden en que se aplican.
 */
const MOTIVO_TEXTO: Record<string, string> = {
  unica: 'Es la única regla que cubre este día',
  prioridad: 'Ganó por tener la prioridad más alta',
  especificidad: 'Ganó por ser más específica (vehículo > categoría > general)',
  rango_mas_corto: 'Ganó por tener el rango de fechas más corto',
  mas_reciente: 'Empataron en todo: ganó la cargada más recientemente',
  no_es_solo_web: 'Ganó porque la otra estaba cargada solo para la web',
};

function hoyISO() {
  return hoyLocal();
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

/**
 * Simulador de precios.
 *
 * **El problema que resuelve.** El motor siempre resolvió bien qué precio gana
 * cada día, pero no había forma de VERLO: cargabas una promo y para saber si
 * le estaba ganando a la tarifa de un auto puntual tenías que crear una reserva
 * de prueba.
 *
 * Acá se ve el desglose **día por día**, con qué regla puso cada precio y **por
 * qué ganó**. Hay un solo precio: vale para el mostrador y para la web.
 *
 * Cotiza contra el mismo motor que usan las reservas y el sitio: no es una
 * cuenta paralela. Si acá dice $X, eso es lo que se va a cobrar.
 */
export function SimuladorPage() {
  const { data: categorias = [] } = useCategorias();
  const [categoriaId, setCategoriaId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(sumarDias(hoyISO(), 5));

  const base = categoriaId && fechaFin > fechaInicio
    ? { fecha_inicio: fechaInicio, fecha_fin: fechaFin, categoria_id: Number(categoriaId), adicionales: [] }
    : null;

  const cotizacion = useCalcularPrecio(base ? { ...base, canal: 'mostrador' } : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/precios"><ArrowLeft className="h-4 w-4" /> Precios</Link>
        </Button>
      </div>

      <PageHeader
        title="Simulador de precios"
        description="Cotiza contra el mismo motor que usan las reservas y el sitio. Sirve para verificar cómo quedaron las reglas antes de que las use un cliente."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Categoría</span>
            <select
              value={categoriaId}
              onChange={e => setCategoriaId(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Elegí una…</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Retiro</span>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Devolución</span>
            <input
              type="date"
              value={fechaFin}
              onChange={e => setFechaFin(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            El día de devolución no se cobra.
          </p>
        </div>
      </Card>

      {!base && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Elegí una categoría y un rango de fechas para ver el precio.
        </Card>
      )}

      {base && (
        <>
          <TotalPrecio
            cotizacion={cotizacion.data}
            cargando={cotizacion.isLoading}
            error={cotizacion.error}
          />

          {/* El desglose: de acá sale el "por qué" */}
          {cotizacion.data && <DesgloseDiario cotizacion={cotizacion.data} />}
        </>
      )}
    </div>
  );
}

function TotalPrecio({
  cotizacion, cargando, error,
}: {
  cotizacion?: Cotizacion;
  cargando: boolean;
  error: unknown;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Precio</h3>
      {cargando ? (
        <p className="text-sm text-muted-foreground">Calculando…</p>
      ) : error ? (
        // El caso más común es no tener tarifa cargada para esa categoría. Se
        // dice así y no "error": es información, no una falla del sistema.
        <p className="text-sm text-amber-700">
          No se puede cotizar: falta cargar tarifa para esta categoría.
        </p>
      ) : !cotizacion ? null : (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal ({cotizacion.duracion_dias} días)</span>
            <span className="tabular-nums">{formatCurrency(Number(cotizacion.subtotal))}</span>
          </div>
          {Number(cotizacion.descuento_monto) > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>
                {cotizacion.descuento_nombre ?? 'Descuento por duración'}
                {' '}(−{Number(cotizacion.descuento_porcentaje)}%)
              </span>
              <span className="tabular-nums">−{formatCurrency(Number(cotizacion.descuento_monto))}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total del vehículo</span>
            <span className="tabular-nums">{formatCurrency(Number(cotizacion.subtotal_vehiculo))}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Promedio {formatCurrency(Number(cotizacion.precio_dia_promedio))} por día.
            {' '}Los adicionales se suman aparte.
          </p>
        </div>
      )}
    </Card>
  );
}

function DesgloseDiario({ cotizacion }: { cotizacion: Cotizacion }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Día por día</h3>
        <p className="text-xs text-muted-foreground">
          Qué regla puso el precio de cada día y por qué ganó.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Día</th>
              <th className="px-4 py-2 font-medium">Precio</th>
              <th className="px-4 py-2 font-medium">De dónde sale</th>
              <th className="px-4 py-2 font-medium">Por qué ganó</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cotizacion.dias.map(d => {
              return (
                <tr key={d.fecha} className="hover:bg-muted/40">
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(d.fecha)}</td>
                  <td className="px-4 py-2 font-medium tabular-nums">
                    {formatCurrency(Number(d.precio))}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {d.origen === 'calendario' ? (
                      <span className="text-foreground">
                        Regla <strong>{d.regla_nombre}</strong>
                        {d.es_promocional && (
                          <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            promo
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{d.regla_nombre ?? 'Tarifa por banda'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {d.motivo ? (
                      <>
                        {MOTIVO_TEXTO[d.motivo] ?? d.motivo}
                        {d.candidatas > 1 && (
                          <span className="ml-1 opacity-70">({d.candidatas} competían)</span>
                        )}
                      </>
                    ) : (
                      // Sin reglas de calendario que cubran el día, el precio
                      // sale del fallback de bandas: no hubo competencia.
                      <span className="opacity-70">Ninguna regla cubre este día</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
