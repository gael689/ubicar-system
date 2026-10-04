import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useACobrar, useMesDeCaja } from '@/hooks/useCajaSocios';
import { useReporteFlota, useReporteIngresos } from '@/hooks/useReportes';
import { cn, formatCurrency, hoyLocal } from '@/lib/utils';

const AZUL = '#407EC9';
const AZUL_OSCURO = '#1B3F6B';
const CELESTE = '#8BB8E8';

const primerDia = (iso: string) => `${iso.slice(0, 7)}-01`;
function moverMes(iso: string, n: number) {
  const d = new Date(`${primerDia(iso)}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7) + '-01';
}
const ultimoDia = (iso: string) => {
  const d = new Date(`${moverMes(iso, 1)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const nombreDelMes = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
const MILES = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : `${Math.round(n / 1000)} mil`);

/**
 * El resumen de la plata y de la flota, en una sola pantalla: lo que entró este
 * mes contra el anterior, lo que falta cobrar, cuánto se reparte y cómo está la
 * ocupación. Todo sale de la caja y de los reportes de siempre.
 */
export function TableroDeReportes() {
  const [mes, setMes] = useState(primerDia(hoyLocal()));
  const anterior = moverMes(mes, -1);
  const { data: actual, isLoading } = useMesDeCaja(mes);
  const { data: previo } = useMesDeCaja(anterior);
  const { data: porCobrar } = useACobrar();
  const anio = Number(mes.slice(0, 4));
  const { data: ingresos } = useReporteIngresos(anio);
  const { data: flota } = useReporteFlota(mes, ultimoDia(mes));

  const ocupacion = useMemo(() => {
    const lista = flota ?? [];
    const ordenada = [...lista].sort((a, b) => b.ocupacion_porcentaje - a.ocupacion_porcentaje);
    return {
      top: ordenada.slice(0, 8).map(v => ({ nombre: v.patente, valor: Math.round(v.ocupacion_porcentaje) })),
      promedio: lista.length
        ? Math.round(lista.reduce((t, v) => t + v.ocupacion_porcentaje, 0) / lista.length)
        : 0,
      usados: lista.filter(v => v.dias_alquilados > 0).length,
    };
  }, [flota]);

  const antiguedad = useMemo(() => {
    const tramos = [
      { nombre: 'Hasta 7 días', desde: 0, hasta: 7, valor: 0 },
      { nombre: '8 a 15', desde: 8, hasta: 15, valor: 0 },
      { nombre: '16 a 30', desde: 16, hasta: 30, valor: 0 },
      { nombre: 'Más de 30', desde: 31, hasta: Infinity, valor: 0 },
    ];
    for (const i of porCobrar?.items ?? []) {
      const t = tramos.find(x => i.dias_desde_devolucion >= x.desde && i.dias_desde_devolucion <= x.hasta);
      if (t) t.valor += i.saldo;
    }
    return tramos;
  }, [porCobrar]);

  if (isLoading || !actual) return <Skeleton className="h-64 w-full" />;

  const serie = (ingresos?.meses ?? []).map(m => ({ mes: m.mes_label, Ingresos: m.ingresos, Egresos: m.egresos }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior"
            className="rounded-lg border border-ubicar-border px-2.5 py-1 text-sm hover:bg-surface">‹</button>
          <span className="min-w-[150px] text-center text-sm font-semibold capitalize text-ubicar-dark">{nombreDelMes(mes)}</span>
          <button onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente"
            className="rounded-lg border border-ubicar-border px-2.5 py-1 text-sm hover:bg-surface">›</button>
        </div>
        <p className="text-xs text-muted-foreground">Contra {nombreDelMes(anterior)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Ingresado" valor={formatCurrency(actual.total_cobrado)}
          variacion={variacion(actual.total_cobrado, previo?.total_cobrado)} destacado />
        <Kpi titulo="Distribuible" valor={formatCurrency(actual.distribuible)}
          variacion={variacion(actual.distribuible, previo?.distribuible)} />
        <Kpi titulo="Falta cobrar" valor={formatCurrency(porCobrar?.total_pendiente ?? 0)}
          nota={`${porCobrar?.cantidad ?? 0} alquileres`} invertir />
        <Kpi titulo="Ocupación de la flota" valor={`${ocupacion.promedio}%`}
          nota={`${ocupacion.usados} autos con alquileres`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <Titulo>Ingresos y egresos de {anio}</Titulo>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AZUL} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={AZUL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#D0E4F5" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={MILES} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="Ingresos" stroke={AZUL} strokeWidth={2.5} fill="url(#gIng)" />
                <Area type="monotone" dataKey="Egresos" stroke={CELESTE} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <Titulo>Lo que falta cobrar, por antigüedad</Titulo>
          <div className="space-y-3 pt-1">
            {antiguedad.map(t => {
              const max = Math.max(...antiguedad.map(x => x.valor), 1);
              return (
                <div key={t.nombre}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t.nombre}</span>
                    <span className="font-medium tabular-nums text-foreground">{formatCurrency(t.valor)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface">
                    <div className={cn('h-2 rounded-full', t.desde > 15 ? 'bg-red-500' : 'bg-ubicar-primary')}
                      style={{ width: `${(t.valor / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <Titulo>Ocupación por auto</Titulo>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ocupacion.top} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#D0E4F5" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {ocupacion.top.map((_, i) => <Cell key={i} fill={i === 0 ? AZUL_OSCURO : AZUL} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <Titulo>Reparto entre socios</Titulo>
          <div className="space-y-2 pt-1">
            {actual.socios.filter(s => s.porcentaje > 0).map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                <span className="text-sm text-foreground">{s.nombre.split(' ')[0]} <span className="text-muted-foreground">({s.porcentaje}%)</span></span>
                <span className="text-sm font-semibold tabular-nums text-ubicar-dark">
                  {formatCurrency(actual.parte_por_socio[String(s.id)] ?? 0)}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Gastos del mes: <strong className="text-foreground">{formatCurrency(actual.gastos.total)}</strong> · se ven aparte, no entran en el reparto.
            </p>
            {actual.compensacion?.transferencias.map((t, i) => (
              <p key={i} className="text-sm text-foreground">
                <strong>{t.de_nombre}</strong> le pasa <strong className="text-ubicar-dark">{formatCurrency(t.monto)}</strong> a <strong>{t.a_nombre}</strong>
              </p>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function variacion(actual: number, previo?: number) {
  if (previo === undefined || previo === 0) return null;
  return ((actual - previo) / previo) * 100;
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-ubicar-dark">{children}</h3>;
}

function Kpi({ titulo, valor, variacion, nota, destacado, invertir }: {
  titulo: string; valor: string; variacion?: number | null; nota?: string; destacado?: boolean; invertir?: boolean;
}) {
  // Para "falta cobrar" que baje es bueno: `invertir` da vuelta los colores.
  const sube = (variacion ?? 0) > 0;
  const bueno = invertir ? !sube : sube;
  return (
    <Card className={cn('p-4', destacado && 'border-ubicar-primary/40 bg-surface')}>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ubicar-dark">{valor}</p>
      <div className="mt-1 flex items-center gap-1 text-xs">
        {variacion === null || variacion === undefined ? (
          <span className="text-muted-foreground">{nota ?? <Minus className="inline h-3 w-3" />}</span>
        ) : (
          <>
            {sube ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            <span className={cn('font-medium', Math.abs(variacion) < 0.5 ? 'text-muted-foreground' : bueno ? 'text-emerald-700' : 'text-red-700')}>
              {Math.abs(variacion).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">vs mes anterior</span>
          </>
        )}
      </div>
    </Card>
  );
}
