import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InputMoneda } from '@/components/shared/InputMoneda';
import {
  useActualizarReglaPrecio, useCalendarioPrecios, useCrearReglaPrecio,
  useDarDeBajaReglaPrecio, useReglasPrecio,
} from '@/hooks/usePrecios';
import { extractError, formatCurrency } from '@/lib/utils';
import type { FechaEspecial, TarifaCalendario } from '@/types';

/**
 * El precio de una fecha especial, cargado desde la fecha (14/10).
 *
 * *"No tiene sentido ir a fechas especiales, ver la fecha y después ir a
 * precios"*. Acá se ve, por categoría, cuánto se cobra hoy esos días y se
 * pone el precio de la fecha en el momento.
 *
 * **No es un segundo camino.** Guarda la misma regla de calendario que
 * Precios: colgada de la fecha (`fecha_especial_id`), así si la fecha se mueve
 * el precio se mueve con ella, y con prioridad de fecha especial (10), que le
 * gana al precio por día de la categoría. Si ya hay una regla de esa fecha para
 * la categoría, se edita esa; dejar el campo vacío la da de baja.
 */
export function PreciosDeLaFecha({ fecha }: { fecha: FechaEspecial }) {
  // Cuánto se cobra el primer día de la fecha, ya resuelto por el motor.
  const { data: calendario, isLoading } = useCalendarioPrecios({
    desde: fecha.fecha_desde, hasta: fecha.fecha_desde,
  });
  const { data: reglas = [] } = useReglasPrecio();
  const deLaFecha = reglas.filter(r => r.fecha_especial_id === fecha.id && r.vehiculo_id == null && r.activo);

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Precio <strong>por día</strong> para {fecha.nombre}. Vacío = se cobra el de siempre.
      </p>
      <div className="divide-y divide-border">
        {(calendario?.filas ?? []).map(f => (
          <FilaPrecio
            key={f.categoria_id}
            fecha={fecha}
            categoriaId={f.categoria_id}
            categoriaNombre={f.categoria_nombre}
            hoy={f.dias[0]?.precio ?? null}
            origenHoy={f.dias[0]?.origen}
            regla={deLaFecha.find(r => r.categoria_id === f.categoria_id)}
          />
        ))}
      </div>
    </div>
  );
}

function FilaPrecio({
  fecha, categoriaId, categoriaNombre, hoy, origenHoy, regla,
}: {
  fecha: FechaEspecial;
  categoriaId: number;
  categoriaNombre: string;
  hoy: string | number | null;
  origenHoy?: string;
  regla?: TarifaCalendario;
}) {
  const [valor, setValor] = useState<number | ''>(regla ? Number(regla.precio_dia) : '');
  const crear = useCrearReglaPrecio();
  const actualizar = useActualizarReglaPrecio();
  const baja = useDarDeBajaReglaPrecio();
  const ocupado = crear.isPending || actualizar.isPending || baja.isPending;
  const cambio = regla ? valor !== Number(regla.precio_dia) : valor !== '';

  const guardar = async () => {
    try {
      if (valor === '' && regla) {
        await baja.mutateAsync(regla.id);
        toast.success(`${categoriaNombre}: vuelve al precio de siempre`);
      } else if (valor !== '' && regla) {
        await actualizar.mutateAsync({ id: regla.id, payload: { precio_dia: String(valor) } });
        toast.success(`${categoriaNombre}: precio actualizado`);
      } else if (valor !== '') {
        await crear.mutateAsync({
          nombre: `${fecha.nombre} — ${categoriaNombre}`,
          precio_dia: String(valor),
          categoria_id: categoriaId,
          fecha_especial_id: fecha.id,
          prioridad: 10,
          canal: 'ambos',
        });
        toast.success(`${categoriaNombre}: precio cargado para ${fecha.nombre}`);
      }
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm font-medium text-foreground">{categoriaNombre}</p>
        <p className="text-[11px] text-muted-foreground">
          {hoy == null
            ? 'Hoy: sin precio'
            : `Hoy se cobra ${formatCurrency(hoy)}${origenHoy === 'calendario' && !regla ? ' (por otra regla)' : regla ? ' (esta fecha)' : ''}`}
        </p>
      </div>
      <InputMoneda
        value={valor}
        onChange={setValor}
        placeholder="Precio de la fecha"
        className="w-36 rounded-md border border-input bg-background px-2 py-1 text-sm"
      />
      <Button size="sm" onClick={guardar} disabled={!cambio || ocupado}>
        {ocupado ? '…' : 'Guardar'}
      </Button>
    </div>
  );
}
