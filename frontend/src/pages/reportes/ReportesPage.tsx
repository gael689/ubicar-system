import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { useReporteIngresos, useReporteFlota } from '@/hooks/useReportes';
import { formatCurrency, formatDate } from '@/lib/utils';

const COLORES = ['#407EC9', '#8BB8E8', '#34d399', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
}

function ReporteIngresos() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const { data, isLoading, refetch, isFetching } = useReporteIngresos(anio);

  const chartData = data?.meses ?? [];
  const totalIngresos = chartData.reduce((s, m) => s + m.ingresos, 0);
  const totalEgresos = chartData.reduce((s, m) => s + m.egresos, 0);

  function exportCSV() {
    if (!data) return;
    const rows = [
      ['Mes', 'Ingresos', 'Egresos', 'Margen'],
      ...data.meses.map(m => [m.mes_label, m.ingresos, m.egresos, m.margen]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ingresos_${anio}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={anio}
          onChange={e => setAnio(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background"
        >
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-primary hover:underline ml-auto">
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* Resumen anual */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Ingresos {anio}</p>
          <p className="text-2xl font-bold text-success">{formatCurrency(totalIngresos)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Egresos {anio}</p>
          <p className="text-2xl font-bold text-danger">{formatCurrency(totalEgresos)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Margen {anio}</p>
          <p className={`text-2xl font-bold ${totalIngresos - totalEgresos >= 0 ? 'text-primary' : 'text-danger'}`}>
            {formatCurrency(totalIngresos - totalEgresos)}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">Cargando...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground mb-4">Ingresos vs Egresos por mes</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend />
              <Bar dataKey="ingresos" name="Ingresos" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla resumen */}
      {!isLoading && chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Mes</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Ingresos</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Egresos</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Margen</th>
              </tr>
            </thead>
            <tbody>
              {chartData.filter(m => m.ingresos > 0 || m.egresos > 0).map(m => (
                <tr key={m.mes} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{m.mes_label}</td>
                  <td className="px-4 py-2 text-right text-success">{formatCurrency(m.ingresos)}</td>
                  <td className="px-4 py-2 text-right text-danger">{formatCurrency(m.egresos)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${m.margen >= 0 ? 'text-primary' : 'text-danger'}`}>
                    {formatCurrency(m.margen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReporteFlota() {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);

  const { data = [], isLoading, refetch, isFetching } = useReporteFlota(desde, hasta);

  function exportCSV() {
    const rows = [
      ['Patente', 'Marca', 'Modelo', 'Alquileres', 'Días', 'Ocupación %', 'Ingresos', 'Gastos', 'Margen'],
      ...data.map(v => [v.patente, v.marca, v.modelo, v.alquileres_count, v.dias_alquilados, v.ocupacion_porcentaje, v.ingresos, v.gastos, v.margen]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flota_${desde}_${hasta}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background" />
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
        {data.length > 0 && (
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-primary hover:underline ml-auto">
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Sin datos en el período seleccionado</div>
      ) : (
        <>
          {/* Gráfico de ocupación */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground mb-4">Ocupación por vehículo (%)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="patente" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip
                  formatter={(v: number) => `${v}%`}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="ocupacion_porcentaje" name="Ocupación" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla detalle */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Vehículo</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Alquileres</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Días</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Ocupación</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Ingresos</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Gastos</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Margen</th>
                </tr>
              </thead>
              <tbody>
                {data.map(v => (
                  <tr key={v.vehiculo_id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <p className="font-medium">{v.patente}</p>
                      <p className="text-xs text-muted-foreground">{v.marca} {v.modelo}</p>
                    </td>
                    <td className="px-4 py-2 text-right">{v.alquileres_count}</td>
                    <td className="px-4 py-2 text-right">{v.dias_alquilados}d</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-semibold ${v.ocupacion_porcentaje >= 70 ? 'text-success' : v.ocupacion_porcentaje >= 40 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {v.ocupacion_porcentaje}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-success">{formatCurrency(v.ingresos)}</td>
                    <td className="px-4 py-2 text-right text-danger">{formatCurrency(v.gastos)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${v.margen >= 0 ? 'text-primary' : 'text-danger'}`}>
                      {formatCurrency(v.margen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function ReportesPage() {
  const [tab, setTab] = useState<'ingresos' | 'flota' | 'demanda'>('ingresos');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card shrink-0">
        <h1 className="text-lg font-bold text-foreground">Reportes</h1>
        <div className="flex gap-1 ml-4">
          <TabBtn active={tab === 'ingresos'} onClick={() => setTab('ingresos')}>Ingresos</TabBtn>
          <TabBtn active={tab === 'flota'} onClick={() => setTab('flota')}>Flota</TabBtn>
          <TabBtn active={tab === 'demanda'} onClick={() => setTab('demanda')}>Demanda no atendida</TabBtn>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'ingresos' && <ReporteIngresos />}
        {tab === 'flota' && <ReporteFlota />}
        {tab === 'demanda' && <ReporteDemanda />}
      </div>
    </div>
  );
}


/**
 * Lo que el sitio no pudo vender.
 *
 * Cada vez que alguien busca y el sitio no puede cerrar —no hay cupo, la fecha
 * cae fuera de la ventana de venta, quiere otro lugar de retiro— aparece el
 * cartel que deriva a WhatsApp y esa búsqueda queda registrada. **La mayoría de
 * esa gente no completa ningún formulario**, así que sin esto el negocio sólo
 * ve la minoría que sí lo hace.
 *
 * Son dos preguntas distintas y por eso hay dos tablas: por categoría, qué auto
 * conviene comprar; por motivo, si lo que falta es flota o si son las propias
 * reglas de la ventana las que están dejando ventas afuera.
 */
function ReporteDemanda() {
  const { data, isLoading } = useQuery({
    queryKey: ['reportes', 'demanda-no-atendida'],
    queryFn: async () => {
      const { data } = await api.get('/reportes/demanda-no-atendida');
      return data.data as {
        desde: string; hasta: string; total: number;
        por_categoria: { categoria: string; consultas: number }[];
        por_motivo: { motivo: string; label: string; consultas: number }[];
      };
    },
  });

  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Cargando…</Card>;
  if (!data) return null;

  if (data.total === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-foreground">Nadie se fue sin poder reservar</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Entre el {formatDate(data.desde)} y el {formatDate(data.hasta)} no hubo búsquedas que el
          sitio no pudiera resolver. También puede ser que todavía no haya tráfico suficiente.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-foreground">
          <strong>{data.total}</strong> búsqueda{data.total !== 1 ? 's' : ''} que el sitio no pudo
          cerrar, entre el {formatDate(data.desde)} y el {formatDate(data.hasta)}.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <TablaDemanda
          titulo="Por categoría"
          ayuda="Qué auto conviene comprar."
          filas={data.por_categoria.map(f => ({ label: f.categoria, n: f.consultas }))}
          total={data.total}
        />
        <TablaDemanda
          titulo="Por qué no se pudo"
          ayuda="Si falta flota, o si son las reglas de la ventana de venta las que frenan."
          filas={data.por_motivo.map(f => ({ label: f.label, n: f.consultas }))}
          total={data.total}
        />
      </div>
    </div>
  );
}

function TablaDemanda({
  titulo, ayuda, filas, total,
}: {
  titulo: string; ayuda: string;
  filas: { label: string; n: number }[]; total: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>
      <ul className="divide-y divide-border">
        {filas.map(f => (
          <li key={f.label} className="flex items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{f.label}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${total ? (f.n / total) * 100 : 0}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm font-semibold tabular-nums text-foreground">
              {f.n}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
