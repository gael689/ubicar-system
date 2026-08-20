import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CalendarRange, Calculator, Globe, Store,
  MousePointerClick, Maximize2, Minimize2, X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GrillaPrecios, type SeleccionPrecio } from '@/components/precios/GrillaPrecios';
import { PanelCargaPrecio, rangoEnPalabras } from '@/components/precios/PanelCargaPrecio';
import { ComoSeArmaElPrecio } from '@/components/precios/ComoSeArmaElPrecio';
import { ReglasPrecioPanel } from '@/components/precios/ReglasPrecioPanel';
import { DescuentosDuracionPanel } from '@/components/precios/DescuentosDuracionPanel';
import { useCalendarioPrecios, useCalcularPrecio, useReglasPrecio } from '@/hooks/usePrecios';
import { useFechasEspeciales } from '@/hooks/useFechasEspeciales';
import { useCategorias } from '@/hooks/useCategorias';
import { useAdicionales } from '@/hooks/useAdicionales';
import { COLOR_FECHA_ESPECIAL, TIPO_FECHA_ESPECIAL_LABEL } from '@/lib/constants';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Adicional, Canal, FechaEspecial } from '@/types';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Qué se está mirando en la grilla, según el canal elegido. */
const POR_CANAL = {
  mostrador: {
    etiqueta: 'Mostrador',
    ayuda: 'Lo que se cobra cuando el cliente reserva por teléfono, por WhatsApp o en el local.',
  },
  web: {
    etiqueta: 'Web',
    ayuda: 'Lo que ve y paga un cliente que reserva solo desde ubicar-rent.com.ar.',
  },
} as const;

/**
 * Calendario de precios (Fase 5, ítem 57 — plan §7.2).
 *
 * Es la pantalla donde Franco y Martín cargan los precios ellos mismos:
 * "planificar precios base, y precios por fecha… que tengan la posibilidad
 * de poner precios promocionales para incentivar más al marketing".
 *
 * **El calendario es la herramienta de carga, no una tabla de sólo lectura.**
 * Se arrastra sobre la fila de una categoría —"de acá a acá"— y se abre un
 * panel que pide una sola cosa: cuánto sale el día. El formulario de doce
 * campos sigue existiendo más abajo, en Reglas de precio, para los casos raros
 * (una regla sin fechas fijas, de un vehículo puntual, con mínimo de días).
 *
 * **Hay una pantalla por canal, no una con un interruptor.** Antes el canal
 * era un botoncito arriba de la grilla que sólo cambiaba lo que se veía: la
 * lista de reglas de abajo mostraba las de los dos canales mezcladas y el
 * alta traía "web y mostrador" por defecto. Con eso, cargar un precio pensando
 * en la web le cambiaba el precio al mostrador sin que nadie lo pidiera. Ahora
 * el canal lo define en qué pantalla estás parado, y no hay forma de
 * confundirse.
 */
export function PreciosPage({ canalInicial = 'mostrador' }: { canalInicial?: Canal }) {
  /**
   * Qué canal se está **previsualizando** en la grilla.
   *
   * Es una sola pantalla, no una por canal. La separación anterior existía por
   * un motivo real —un interruptor que sólo cambiaba la vista mientras el alta
   * seguía creando en "los dos canales", así que cargabas un precio pensando en
   * la web y le tocabas el precio al mostrador— y eso se resuelve donde estaba
   * el problema: **el canal es ahora una elección explícita en el formulario**,
   * con las tres opciones a la vista, y la tabla de reglas muestra los dos
   * canales juntos con su columna.
   *
   * Este estado sólo decide qué precios pinta el calendario y cuál viene
   * preseleccionado al cargar.
   */
  const [canal, setCanal] = useState<Canal>(canalInicial);
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [cantidadMeses, setCantidadMeses] = useState(1);
  // Arranca en grande. Al revés nadie descubre que se puede agrandar: se ve
  // una tabla apretada y se asume que la pantalla es así.
  const [compacto, setCompacto] = useState(false);
  const [seleccion, setSeleccion] = useState<SeleccionPrecio | null>(null);
  const [arrastrando, setArrastrando] = useState<SeleccionPrecio | null>(null);
  const [fechaAbierta, setFechaAbierta] = useState<FechaEspecial | null>(null);

  const cfg = POR_CANAL[canal];
  const desde = ymd(new Date(anio, mes, 1));
  const hasta = ymd(new Date(anio, mes + cantidadMeses, 0));

  const { data: calendario, isLoading } = useCalendarioPrecios({ desde, hasta, canal });
  const { data: fechasEspeciales = [] } = useFechasEspeciales({ desde, hasta });
  // Las reglas del canal sirven para reconocer que un rango marcado ya ES una
  // regla cargada: en ese caso el panel la edita en vez de apilar otra encima.
  const { data: reglas = [] } = useReglasPrecio({ canal });

  function moverMes(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  }

  // Al cambiar de canal se está mirando otro juego de precios: sostener una
  // selección de la pantalla anterior invitaría a cargarla en el canal
  // equivocado, que es justo el error que las dos pantallas evitan.
  useEffect(() => {
    setSeleccion(null);
    setFechaAbierta(null);
  }, [canal]);

  const fila = calendario?.filas.find(f => f.categoria_id === seleccion?.categoriaId);
  const diasActuales = useMemo(
    () => (seleccion && fila)
      ? fila.dias.filter(d => d.fecha >= seleccion.desde && d.fecha <= seleccion.hasta)
      : [],
    [seleccion, fila]
  );
  const otrasCategorias = useMemo(
    () => (calendario?.filas ?? [])
      .filter(f => f.categoria_id !== seleccion?.categoriaId)
      .map(f => ({ id: f.categoria_id, nombre: f.categoria_nombre })),
    [calendario, seleccion]
  );

  const titulo = cantidadMeses === 1
    ? `${MESES[mes]} ${anio}`
    : `${MESES[mes]} ${anio} — ${MESES[(mes + cantidadMeses - 1) % 12]} ${new Date(anio, mes + cantidadMeses - 1, 1).getFullYear()}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Precios"
        description="Marcá un rango sobre el calendario y poné el precio ahí mismo. Abajo quedan todas las reglas, de los dos canales."
        actions={
          <Link to="/precios/simulador">
            <Button variant="outline" size="sm">
              <Calculator className="h-4 w-4" />
              Simulador
            </Button>
          </Link>
        }
      />

      {/* Qué canal se está mirando. **Sólo cambia lo que pinta el calendario**
          y qué canal viene preseleccionado al cargar un precio: la tabla de
          reglas de abajo muestra siempre los dos. Dice "Viendo" y no es un
          filtro disfrazado, que es lo que hacía que antes se cargara en el
          canal equivocado. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Viendo precios de</span>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {(['mostrador', 'web'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCanal(c)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
                canal === c
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {c === 'web' ? <Globe className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
              {POR_CANAL[c].etiqueta}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{cfg.ayuda}</span>
      </div>

      <ComoSeArmaElPrecio />

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">{titulo}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCantidadMeses(n)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    cantidadMeses === n
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  )}
                >
                  {n === 1 ? '1 mes' : `${n} meses`}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompacto(v => !v)}
              title={compacto ? 'Celdas grandes con el precio completo' : 'Celdas chicas para ver más días de una'}
            >
              {compacto ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              {compacto ? 'Ver más grande' : 'Ver más días'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => moverMes(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAnio(hoy.getFullYear()); setMes(hoy.getMonth()); }}
            >
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => moverMes(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mientras se arrastra, esta línea deja de explicar y pasa a decir
            qué se marcó. Es la confirmación en vivo de que lo que se está
            eligiendo es un período entero, no un día. */}
        {arrastrando ? (
          <p className="flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/15 px-3 py-2 text-sm font-bold text-primary">
            <MousePointerClick className="h-4 w-4 shrink-0" />
            {arrastrando.categoriaNombre}, {rangoEnPalabras(arrastrando.desde, arrastrando.hasta)}
            <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-white tabular-nums">
              {diasDeRango(arrastrando.desde, arrastrando.hasta)} días
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
            <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong>Arrastrá sobre la fila de una categoría</strong> para marcar de qué día a qué
              día — el precio que cargues es <strong>por día</strong> y se aplica a todo el rango.
              Un clic marca un solo día. Las barras de colores son las fechas especiales: tocá una
              para ver cuál es.
            </span>
          </p>
        )}

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : calendario ? (
          <GrillaPrecios
            data={calendario}
            fechasEspeciales={fechasEspeciales}
            seleccion={seleccion}
            onSeleccion={setSeleccion}
            onArrastrando={setArrastrando}
            onFechaEspecial={setFechaAbierta}
            compacto={compacto}
          />
        ) : null}

        {fechaAbierta && (
          <DetalleFechaEspecial
            fecha={fechaAbierta}
            categorias={(calendario?.filas ?? []).map(f => ({ id: f.categoria_id, nombre: f.categoria_nombre }))}
            onPonerPrecio={cat => {
              setSeleccion({
                categoriaId: cat.id,
                categoriaNombre: cat.nombre,
                desde: fechaAbierta.fecha_desde,
                hasta: fechaAbierta.fecha_hasta,
              });
              setFechaAbierta(null);
            }}
            onCerrar={() => setFechaAbierta(null)}
          />
        )}

        {seleccion && (
          <PanelCargaPrecio
            canal={canal}
            seleccion={seleccion}
            diasActuales={diasActuales}
            reglas={reglas}
            fechasEspeciales={fechasEspeciales}
            otrasCategorias={otrasCategorias}
            onCambiarRango={(d, h) => setSeleccion(s => (s ? { ...s, desde: d, hasta: h } : s))}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        <div className="flex flex-wrap gap-4 border-t border-border pt-3">
          <Leyenda clase="bg-primary/25" texto="Precio cargado para esa fecha" />
          <Leyenda clase="bg-amber-500" texto="Promoción" />
          <Leyenda clase="border border-border bg-background" texto="Sin regla — usa la tarifa por duración" />
          <Leyenda clase="bg-danger" texto="Sin precio configurado" />
        </div>

        {/* Las celdas en blanco son la mayoría el día que se empieza a usar
            esto, y sin decir de dónde sale el número la pantalla parece rota. */}
        <p className="text-xs text-muted-foreground">
          Las celdas en blanco <strong>no están vacías</strong>: ese día no tiene ninguna
          regla y se cobra la tarifa por duración, que se carga en{' '}
          <Link to="/flota/categorias" className="text-primary underline underline-offset-2">
            Flota → Categorías
          </Link>
          . Las rojas sí son un hueco: no hay ni regla ni tarifa, y ese día no se puede cotizar.
        </p>
      </Card>

      <ProbadorDePrecio canal={canal} />
      <ReglasPrecioPanel canal={canal} />
      <DescuentosDuracionPanel />
    </div>
  );
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-foreground">
      <span className={cn('h-5 w-9 rounded', clase)} />
      {texto}
    </span>
  );
}

/** Días de un rango inclusivo. El 3 al 10 son 8 días, no 7. */
function diasDeRango(desde: string, hasta: string): number {
  return Math.round(
    (new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000
  ) + 1;
}

/**
 * "Si tocás en una fecha especial, que le salga qué fecha es."
 *
 * Además de decir cuál es, ofrece el único atajo que uno quiere en ese momento:
 * ponerle precio a esos días, con el rango ya marcado.
 */
function DetalleFechaEspecial({
  fecha, categorias, onPonerPrecio, onCerrar,
}: {
  fecha: FechaEspecial;
  categorias: { id: number; nombre: string }[];
  onPonerPrecio: (cat: { id: number; nombre: string }) => void;
  onCerrar: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', COLOR_FECHA_ESPECIAL[fecha.color].chip)}>
          {fecha.nombre}
        </span>
        <span className="text-xs text-muted-foreground">
          {TIPO_FECHA_ESPECIAL_LABEL[fecha.tipo]} · {rangoEnPalabras(fecha.fecha_desde, fecha.fecha_hasta)}
          {' ('}{formatDate(fecha.fecha_desde)}
          {fecha.fecha_hasta !== fecha.fecha_desde ? ` → ${formatDate(fecha.fecha_hasta)}` : ''}
          {')'}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar"
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {fecha.notas && <p className="mt-1.5 text-xs text-muted-foreground">{fecha.notas}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Ponerle precio a estos días:</span>
        {categorias.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPonerPrecio(c)}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {c.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Probador de precio: cotiza un rango real contra el mismo endpoint que usan
 * las reservas y la web.
 *
 * No es un extra: sin esto, cargar tres reglas superpuestas y entender qué
 * va a pagar el cliente es adivinar. Acá se ve el desglose día por día y de
 * qué regla salió cada precio.
 */
function ProbadorDePrecio({ canal }: { canal: Canal }) {
  const { data: categorias = [] } = useCategorias();
  const { data: adicionalesDisponibles = [] } = useAdicionales();
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [elegidos, setElegidos] = useState<number[]>([]);

  function toggleAdicional(a: Adicional) {
    setElegidos(prev => {
      if (prev.includes(a.id)) return prev.filter(x => x !== a.id);
      // Las coberturas son excluyentes: elegir una reemplaza a la anterior.
      // El backend lo valida igual, pero acá evita el error en vez de mostrarlo.
      if (a.grupo === 'cobertura') {
        const otrasCoberturas = adicionalesDisponibles
          .filter(x => x.grupo === 'cobertura')
          .map(x => x.id);
        return [...prev.filter(x => !otrasCoberturas.includes(x)), a.id];
      }
      return [...prev, a.id];
    });
  }

  const { data: cotizacion, isLoading, error } = useCalcularPrecio(
    categoriaId && fechaInicio && fechaFin
      ? {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          categoria_id: Number(categoriaId),
          canal,
          adicionales: elegidos.map(id => ({ adicional_id: id, cantidad: 1 })),
        }
      : null
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Probar un precio</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Cotiza contra el mismo motor que usan las reservas y la web, en el canal{' '}
        <strong>{canal}</strong>. Sirve para verificar cómo quedaron las reglas antes
        de que las use un cliente.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className="input-base">
            <option value="">Elegir…</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Retira</label>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="input-base" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Devuelve</label>
          <input type="date" value={fechaFin} min={fechaInicio || undefined}
            onChange={e => setFechaFin(e.target.value)} className="input-base" />
        </div>
      </div>

      {adicionalesDisponibles.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Adicionales</label>
          <div className="flex flex-wrap gap-1.5">
            {adicionalesDisponibles.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAdicional(a)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  elegidos.includes(a.id)
                    ? 'border-primary bg-primary text-white'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                )}
              >
                {a.nombre}
                {Number(a.precio) > 0 && (
                  <span className="ml-1 opacity-75">
                    {formatCurrency(a.precio)}{a.unidad_cobro === 'por_dia' ? '/día' : ''}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-24 w-full" />}

      {error && (
        <div className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">
          No se pudo cotizar: falta cargar un precio para alguno de esos días.
        </div>
      )}

      {cotizacion && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-y-auto">
            {cotizacion.dias.map(d => (
              <div key={d.fecha} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{formatDate(d.fecha)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {d.regla_nombre}
                  {d.etiqueta_promo && (
                    <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {d.etiqueta_promo}
                    </span>
                  )}
                </span>
                {d.precio_referencia && (
                  <span className="shrink-0 text-muted-foreground line-through tabular-nums">
                    {formatCurrency(d.precio_referencia)}
                  </span>
                )}
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatCurrency(d.precio)}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-muted/50 p-3 space-y-1 text-sm">
            <Linea label={`Subtotal (${cotizacion.duracion_dias} días)`} valor={formatCurrency(cotizacion.subtotal)} />
            {Number(cotizacion.descuento_monto) > 0 && (
              <Linea
                label={`Descuento ${cotizacion.descuento_nombre} (−${Number(cotizacion.descuento_porcentaje)}%)`}
                valor={`−${formatCurrency(cotizacion.descuento_monto)}`}
                clase="text-emerald-600"
              />
            )}
            {cotizacion.adicionales.map(a => (
              <Linea
                key={a.id}
                label={`${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}${a.unidad_cobro === 'por_dia' ? ` (${cotizacion.duracion_dias} días)` : ''}`}
                valor={formatCurrency(a.subtotal)}
              />
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="font-semibold text-foreground">Total</span>
              <div className="text-right">
                {cotizacion.tiene_promocion &&
                  cotizacion.total_referencia &&
                  Number(cotizacion.total_referencia) > Number(cotizacion.total) && (
                    <span className="mr-2 text-xs text-muted-foreground line-through tabular-nums">
                      {formatCurrency(cotizacion.total_referencia)}
                    </span>
                  )}
                <span className="text-base font-bold tabular-nums text-foreground">
                  {formatCurrency(cotizacion.total)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {formatCurrency(cotizacion.precio_dia_promedio)} por día promedio
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Linea({ label, valor, clase }: { label: string; valor: string; clase?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', clase ?? 'text-foreground')}>{valor}</span>
    </div>
  );
}
