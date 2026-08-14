import { useState, useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { CalendarioAnual, ymd } from '@/components/shared/CalendarioAnual';
import { useFechasEspeciales, indexarPorDia } from '@/hooks/useFechasEspeciales';
import { FechasEspecialesPanel } from '@/components/fechas-especiales/FechasEspecialesPanel';
import { COLOR_FECHA_ESPECIAL, TIPO_FECHA_ESPECIAL_LABEL } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Módulo de Fechas especiales. Autónomo a propósito: el calendario de
 * ocupación se ocupa de la ocupación de la flota y nada más. Acá se ven y se
 * administran los feriados, fechas comerciales y temporadas — que más
 * adelante van a ser la base de los precios por fecha.
 *
 * El cuadro de los 12 meses es `CalendarioAnual` (`components/shared/`),
 * compartido con la vista anual del calendario de ocupación (plan de
 * conexión 13/08, 2.8) — es la vista que le gustó al dueño acá y se replicó
 * allá, no al revés.
 */
export function FechasEspecialesPage() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());

  const { data: fechas = [] } = useFechasEspeciales({
    desde: `${anio}-01-01`,
    hasta: `${anio}-12-31`,
  });
  const porDia = useMemo(() => indexarPorDia(fechas), [fechas]);

  const contadorMes = (mes: number): number => {
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    let n = 0;
    for (let d = 1; d <= diasEnMes; d++) {
      if ((porDia.get(ymd(new Date(anio, mes, d))) ?? []).length > 0) n++;
    }
    return n;
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Fechas especiales"
        description="Feriados, fechas comerciales y temporadas. Son la base sobre la que después se cargan los precios por fecha."
      />

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Calendario {anio}</h3>
        </div>

        <CalendarioAnual
          anio={anio}
          onAnioChange={setAnio}
          hoy={hoy}
          contadorMes={contadorMes}
          renderDia={(fechaISO) => {
            const especiales = porDia.get(fechaISO) ?? [];
            if (especiales.length === 0) return null;
            // Si un día cae en varias (Navidad dentro de "Fiestas"), gana la
            // de rango más corto: es la más específica — mismo criterio que
            // el motor de precios (`resolver_regla_dia`).
            const principal = [...especiales].sort((a, b) =>
              (new Date(a.fecha_hasta).getTime() - new Date(a.fecha_desde).getTime()) -
              (new Date(b.fecha_hasta).getTime() - new Date(b.fecha_desde).getTime()))[0];
            return {
              className: `${COLOR_FECHA_ESPECIAL[principal.color].chip} font-bold`,
              title: especiales.map(e => e.nombre).join(' · '),
            };
          }}
        />

        <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
          {(Object.keys(TIPO_FECHA_ESPECIAL_LABEL) as (keyof typeof TIPO_FECHA_ESPECIAL_LABEL)[]).map(t => {
            const ejemplo = fechas.find(f => f.tipo === t);
            if (!ejemplo) return null;
            return (
              <span key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('h-2.5 w-2.5 rounded-full', COLOR_FECHA_ESPECIAL[ejemplo.color].punto)} />
                {TIPO_FECHA_ESPECIAL_LABEL[t]}
              </span>
            );
          })}
        </div>
      </Card>

      <FechasEspecialesPanel />
    </div>
  );
}
