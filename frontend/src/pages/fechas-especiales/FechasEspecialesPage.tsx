import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFechasEspeciales, indexarPorDia } from '@/hooks/useFechasEspeciales';
import { FechasEspecialesPanel } from '@/components/fechas-especiales/FechasEspecialesPanel';
import { COLOR_FECHA_ESPECIAL, TIPO_FECHA_ESPECIAL_LABEL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { FechaEspecial } from '@/types';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Módulo de Fechas especiales. Autónomo a propósito: el calendario de
 * ocupación se ocupa de la ocupación de la flota y nada más. Acá se ven y se
 * administran los feriados, fechas comerciales y temporadas — que más
 * adelante van a ser la base de los precios por fecha.
 */
export function FechasEspecialesPage() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());

  const { data: fechas = [] } = useFechasEspeciales({
    desde: `${anio}-01-01`,
    hasta: `${anio}-12-31`,
  });
  const porDia = useMemo(() => indexarPorDia(fechas), [fechas]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Fechas especiales"
        description="Feriados, fechas comerciales y temporadas. Son la base sobre la que después se cargan los precios por fecha."
      />

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Calendario {anio}</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setAnio(a => a - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnio(hoy.getFullYear())}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnio(a => a + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MESES.map((nombreMes, mes) => (
            <MesMini key={mes} anio={anio} mes={mes} nombre={nombreMes} porDia={porDia} hoyStr={ymd(hoy)} />
          ))}
        </div>

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

function MesMini({
  anio, mes, nombre, porDia, hoyStr,
}: {
  anio: number;
  mes: number;
  nombre: string;
  porDia: Map<string, FechaEspecial[]>;
  hoyStr: string;
}) {
  const primero = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offset = (primero.getDay() + 6) % 7; // 0 = lunes

  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];

  const conFecha = Array.from({ length: diasEnMes }, (_, i) => i + 1)
    .map(d => porDia.get(ymd(new Date(anio, mes, d))) ?? [])
    .filter(l => l.length > 0).length;

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-foreground">{nombre}</p>
        {conFecha > 0 && (
          <span className="text-[10px] text-muted-foreground">{conFecha} día{conFecha !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground/60">{d}</div>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) return <div key={i} />;
          const clave = ymd(new Date(anio, mes, dia));
          const especiales = porDia.get(clave) ?? [];
          // Si un día cae en varias (Navidad dentro de "Fiestas"), gana la de
          // rango más corto: es la más específica.
          const principal = especiales.length > 0
            ? [...especiales].sort((a, b) =>
                (new Date(a.fecha_hasta).getTime() - new Date(a.fecha_desde).getTime()) -
                (new Date(b.fecha_hasta).getTime() - new Date(b.fecha_desde).getTime()))[0]
            : null;
          const esHoy = clave === hoyStr;
          return (
            <div
              key={i}
              title={especiales.map(e => e.nombre).join(' · ')}
              className={cn(
                'aspect-square flex items-center justify-center rounded text-[10px] transition-colors',
                principal
                  ? `${COLOR_FECHA_ESPECIAL[principal.color].chip} font-bold`
                  : 'text-muted-foreground',
                esHoy && !principal && 'ring-1 ring-primary text-primary font-bold',
                esHoy && principal && 'ring-2 ring-foreground/50',
              )}
            >
              {dia}
            </div>
          );
        })}
      </div>
    </div>
  );
}
