import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Link2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrearReglaPrecio, useActualizarReglaPrecio, useSimularRegla } from '@/hooks/usePrecios';
import { cn, extractError, formatCurrency } from '@/lib/utils';
import { COLOR_FECHA_ESPECIAL } from '@/lib/constants';
import type {
  Canal, CanalTarifa, DiaCalendarioPrecio, FechaEspecial, TarifaCalendario,
} from '@/types';
import type { SeleccionPrecio } from './GrillaPrecios';

const DIAS = [
  { iso: 1, letra: 'L' }, { iso: 2, letra: 'M' }, { iso: 3, letra: 'M' },
  { iso: 4, letra: 'J' }, { iso: 5, letra: 'V' }, { iso: 6, letra: 'S' },
  { iso: 7, letra: 'D' },
];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Las tres capas del plan (§7.2), tal como los dueños las describieron. Se
 * ofrecen como preset para que nadie tenga que aprenderse los números: elegir
 * "Promoción" ya deja la prioridad en 20 y marca `es_promocional`.
 */
const CAPAS = [
  { valor: 0, label: 'Precio normal', ayuda: 'El precio de esos días. Es el piso.' },
  { valor: 10, label: 'Fecha especial', ayuda: 'Feriado, temporada alta. Le gana al normal.' },
  { valor: 20, label: 'Promoción', ayuda: 'Le gana a todo y se comunica como descuento.' },
];

function sumarDias(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000
  ) + 1;
}

/**
 * "del 3 al 10 de septiembre", "el 25 de diciembre", "del 28 de agosto al 3 de
 * septiembre". El rango se lee en voz alta antes de guardar un precio: en
 * `2026-09-03 → 2026-09-10` un error de un dígito no se ve.
 */
export function rangoEnPalabras(desde: string, hasta: string): string {
  const [, m1, d1] = desde.split('-');
  const [, m2, d2] = hasta.split('-');
  const dia1 = Number(d1);
  const dia2 = Number(d2);
  if (desde === hasta) return `el ${dia1} de ${MESES[Number(m1) - 1]}`;
  if (m1 === m2) return `del ${dia1} al ${dia2} de ${MESES[Number(m2) - 1]}`;
  return `del ${dia1} de ${MESES[Number(m1) - 1]} al ${dia2} de ${MESES[Number(m2) - 1]}`;
}

interface Props {
  canal: Canal;
  seleccion: SeleccionPrecio;
  /** Los días de la selección tal como están hoy, para el "hoy vale X". */
  diasActuales: DiaCalendarioPrecio[];
  /** Reglas del canal: sirven para reconocer que la selección ya es una regla. */
  reglas: TarifaCalendario[];
  fechasEspeciales: FechaEspecial[];
  /** Las demás categorías, para aplicar el mismo precio a varias de una. */
  otrasCategorias: { id: number; nombre: string }[];
  onCambiarRango: (desde: string, hasta: string) => void;
  onCerrar: () => void;
}

/**
 * El panel que aparece al soltar un rango sobre el calendario.
 *
 * **Pide una sola cosa: cuánto sale el día.** El resto —nombre, prioridad,
 * canal, días de la semana, mínimos y máximos— tiene un valor por defecto
 * razonable y vive detrás de "opciones avanzadas". El formulario viejo pedía
 * doce campos antes de dejar guardar un precio, y por eso nadie lo usaba.
 *
 * Lo que sí muestra sin que nadie lo pida es **el efecto**: cuántos días son,
 * cuánto suma el rango, qué descuento por duración le toca y si esos días ya
 * los manda otra regla. Esos números salen del backend (`/precios/simular`),
 * del mismo motor que después cobra.
 */
export function PanelCargaPrecio({
  canal, seleccion, diasActuales, reglas, fechasEspeciales, otrasCategorias,
  onCambiarRango, onCerrar,
}: Props) {
  const { desde, hasta, categoriaId, categoriaNombre } = seleccion;
  const dias = diasEntre(desde, hasta);

  // ¿La selección es exactamente una regla que ya existe? Entonces lo natural
  // es corregirla, no apilarle otra encima que diga casi lo mismo.
  const reglaExacta = useMemo(
    () => reglas.find(r =>
      r.activo &&
      r.categoria_id === categoriaId &&
      r.vigencia_desde === desde &&
      r.vigencia_hasta === hasta
    ) ?? null,
    [reglas, categoriaId, desde, hasta]
  );

  // ¿El rango coincide con una fecha especial ya cargada? Engancharle el precio
  // hace que se corrija solo si después se corre el feriado.
  const feCoincidente = useMemo(
    () => fechasEspeciales.find(f => f.fecha_desde === desde && f.fecha_hasta === hasta) ?? null,
    [fechasEspeciales, desde, hasta]
  );

  const [precio, setPrecio] = useState('');
  const [prioridad, setPrioridad] = useState(0);
  const [etiqueta, setEtiqueta] = useState('');
  const [usarFE, setUsarFE] = useState(false);
  const [extras, setExtras] = useState<number[]>([]);
  const [avanzado, setAvanzado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [minDias, setMinDias] = useState('');
  const [maxDias, setMaxDias] = useState('');
  const [canalRegla, setCanalRegla] = useState<CanalTarifa>(canal);
  const [precioReferencia, setPrecioReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [editando, setEditando] = useState(false);

  // El formulario se reinicia al cambiar de categoría o al caer sobre otra
  // regla; estirar el rango con las flechitas NO borra el precio ya tipeado.
  useEffect(() => {
    if (reglaExacta) {
      setEditando(true);
      setPrecio(String(Number(reglaExacta.precio_dia)));
      setPrioridad(reglaExacta.prioridad);
      setEtiqueta(reglaExacta.etiqueta_promo ?? '');
      setNombre(reglaExacta.nombre);
      setDiasSemana(reglaExacta.dias_semana ?? []);
      setMinDias(reglaExacta.min_dias ? String(reglaExacta.min_dias) : '');
      setMaxDias(reglaExacta.max_dias ? String(reglaExacta.max_dias) : '');
      setCanalRegla(reglaExacta.canal);
      setPrecioReferencia(reglaExacta.precio_referencia ?? '');
      setNotas(reglaExacta.notas ?? '');
      setUsarFE(reglaExacta.fecha_especial_id != null);
    } else {
      setEditando(false);
      setNombre('');
      setDiasSemana([]);
      setMinDias('');
      setMaxDias('');
      setCanalRegla(canal);
      setPrecioReferencia('');
      setNotas('');
    }
    setExtras([]);
  }, [reglaExacta, categoriaId, canal]);

  useEffect(() => {
    if (!editando) setUsarFE(feCoincidente != null);
  }, [feCoincidente, editando]);

  const crear = useCrearReglaPrecio();
  const actualizar = useActualizarReglaPrecio();

  // Qué se cobra hoy en esos días, resumido. Es la mitad de la decisión:
  // "$95.000 hoy" es lo que dice si $120.000 es un ajuste o un disparate.
  const actual = useMemo(() => {
    if (diasActuales.length === 0) return null;
    const precios = new Set(diasActuales.map(d => d.precio ?? 'sin'));
    const nombres = new Set(diasActuales.map(d => d.regla_nombre ?? 'sin precio'));
    return {
      unico: precios.size === 1,
      precio: diasActuales[0].precio,
      // Con un solo precio se dice de dónde sale; con varios, cuántos son.
      nombre: nombres.size === 1
        ? diasActuales[0].regla_nombre
        : `${nombres.size} precios distintos en esos días`,
    };
  }, [diasActuales]);

  const simPayload = useMemo(() => {
    const n = Number(precio);
    if (!Number.isFinite(n) || n <= 0) return null;
    return {
      fecha_desde: desde,
      fecha_hasta: hasta,
      precio_dia: precio,
      categoria_id: categoriaId,
      prioridad,
      canal,
    };
  }, [precio, desde, hasta, categoriaId, prioridad, canal]);

  const payloadDemorado = useRetardo(simPayload, 350);
  const { data: sim } = useSimularRegla(payloadDemorado);

  const nombreAuto = usarFE && feCoincidente
    ? `${feCoincidente.nombre} · ${categoriaNombre}`
    : `${categoriaNombre} · ${rangoEnPalabras(desde, hasta)}`;

  const esPromo = prioridad === 20;
  const guardando = crear.isPending || actualizar.isPending;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!precio || Number(precio) <= 0) {
      toast.error('Falta el precio por día');
      return;
    }
    if (esPromo && !etiqueta.trim()) {
      toast.error('Una promoción necesita una etiqueta: es el texto que ve el cliente');
      return;
    }

    const base = {
      precio_dia: precio,
      fecha_especial_id: usarFE && feCoincidente ? feCoincidente.id : null,
      fecha_desde: usarFE && feCoincidente ? null : desde,
      fecha_hasta: usarFE && feCoincidente ? null : hasta,
      dias_semana: diasSemana.length > 0 ? diasSemana : null,
      prioridad,
      canal: canalRegla,
      es_promocional: esPromo,
      etiqueta_promo: esPromo ? etiqueta.trim() : null,
      precio_referencia: esPromo && precioReferencia ? precioReferencia : null,
      min_dias: minDias ? Number(minDias) : null,
      max_dias: maxDias ? Number(maxDias) : null,
      notas: notas || null,
    };

    try {
      if (editando && reglaExacta) {
        await actualizar.mutateAsync({
          id: reglaExacta.id,
          payload: { ...base, nombre: nombre.trim() || nombreAuto, categoria_id: categoriaId },
        });
        toast.success('Precio actualizado');
      } else {
        const categorias = [categoriaId, ...extras];
        for (const catId of categorias) {
          const cat = catId === categoriaId
            ? categoriaNombre
            : otrasCategorias.find(c => c.id === catId)?.nombre ?? '';
          const nombreFila = categorias.length === 1
            ? (nombre.trim() || nombreAuto)
            : `${nombre.trim() || nombreAuto.replace(categoriaNombre, cat)}`;
          await crear.mutateAsync({ ...base, nombre: nombreFila, categoria_id: catId });
        }
        toast.success(
          categorias.length === 1
            ? `Precio cargado ${rangoEnPalabras(desde, hasta)}`
            : `Precio cargado en ${categorias.length} categorías`
        );
      }
      onCerrar();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <form
      onSubmit={guardar}
      className="sticky bottom-2 z-30 space-y-3 rounded-xl border-2 border-primary bg-card p-4 shadow-xl"
    >
      {/* Qué se está tocando, en castellano y con el rango ajustable. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <FlechaRango titulo="Un día antes" onClick={() => onCambiarRango(sumarDias(desde, -1), hasta)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </FlechaRango>
          <span className="text-sm font-semibold text-foreground">
            {categoriaNombre}, {rangoEnPalabras(desde, hasta)}
          </span>
          <FlechaRango
            titulo="Un día después"
            onClick={() => onCambiarRango(desde, sumarDias(hasta, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </FlechaRango>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {dias} {dias === 1 ? 'día' : 'días'}
        </span>
        {actual && (
          <span className="text-xs text-muted-foreground">
            hoy:{' '}
            {actual.unico ? (
              <>
                <strong className="text-foreground">{formatCurrency(actual.precio)}</strong>
                {actual.nombre ? ` · ${actual.nombre}` : ''}
              </>
            ) : (
              <strong className="text-foreground">{actual.nombre}</strong>
            )}
          </span>
        )}
        {editando && reglaExacta && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            <Pencil className="h-3 w-3" /> Editando «{reglaExacta.nombre}»
          </span>
        )}
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar"
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Lo único obligatorio. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Precio por día</label>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-semibold text-muted-foreground">$</span>
            <input
              type="number"
              min="1"
              step="0.01"
              autoFocus
              value={precio}
              onChange={e => setPrecio(e.target.value)}
              placeholder="0"
              className="w-36 rounded-md border border-border bg-background px-3 py-1.5 text-lg font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">¿Qué tipo de precio es?</label>
          <div className="flex flex-wrap gap-1.5">
            {CAPAS.map(c => (
              <button
                key={c.valor}
                type="button"
                onClick={() => setPrioridad(c.valor)}
                title={c.ayuda}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  prioridad === c.valor
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background text-foreground hover:border-primary/50'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={guardando}>
            {editando ? 'Guardar cambios' : 'Guardar precio'}
          </Button>
        </div>
      </div>

      {esPromo && (
        <div className="grid gap-2 rounded-lg bg-amber-500 p-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-white">
              Etiqueta de la promo * <span className="font-normal opacity-80">— la ve el cliente</span>
            </label>
            <input
              value={etiqueta}
              onChange={e => setEtiqueta(e.target.value)}
              placeholder="Ej: Promo Día del Amigo"
              className="input-base"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-white">
              Precio tachado <span className="font-normal opacity-80">— opcional</span>
            </label>
            <input
              type="number" min="1" step="0.01"
              value={precioReferencia}
              onChange={e => setPrecioReferencia(e.target.value)}
              className="input-base"
            />
          </div>
        </div>
      )}

      {feCoincidente && !editando && (
        <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
          <input
            type="checkbox"
            checked={usarFE}
            onChange={e => setUsarFE(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            <Link2 className="mr-1 inline h-3.5 w-3.5 text-primary" />
            El rango coincide con{' '}
            <span className={cn('rounded px-1.5 py-0.5 font-semibold', COLOR_FECHA_ESPECIAL[feCoincidente.color].chip)}>
              {feCoincidente.nombre}
            </span>
            . Engancharle el precio: si después se corrige esa fecha, el precio se corrige solo.
          </span>
        </label>
      )}

      {!editando && otrasCategorias.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">El mismo precio también en:</span>
          {otrasCategorias.map(c => {
            const puesto = extras.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setExtras(p => puesto ? p.filter(x => x !== c.id) : [...p, c.id])}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  puesto
                    ? 'border-primary bg-primary text-white'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                )}
              >
                {c.nombre}
              </button>
            );
          })}
        </div>
      )}

      {/* El efecto de la selección, calculado por el backend. */}
      {sim && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <p className="text-foreground">
            <strong className="tabular-nums">{sim.dias}</strong> {sim.dias === 1 ? 'día' : 'días'}
            {' × '}
            <strong className="tabular-nums">{formatCurrency(sim.precio_dia)}</strong>
            {' = '}
            <strong className="tabular-nums">{formatCurrency(sim.subtotal)}</strong>
            <span className="text-muted-foreground"> si alguien alquila justo ese tramo entero</span>
          </p>

          {Number(sim.descuento_monto) > 0 ? (
            <p className={cn(sim.descuento_condicionado ? 'text-muted-foreground' : 'text-emerald-700')}>
              Descuento por duración{' '}
              <strong>−{Number(sim.descuento_porcentaje)}%</strong>
              {sim.descuento_nombre ? ` («${sim.descuento_nombre}»)` : ''} →{' '}
              <strong className="tabular-nums">{formatCurrency(sim.total)}</strong>
              {' · '}
              <span className="tabular-nums">{formatCurrency(sim.precio_dia_con_descuento)} por día</span>
              {/* D-49: en la web ese descuento no es parte del precio de lista. */}
              {sim.descuento_condicionado && (
                <em className="not-italic"> — sólo si paga el 100% por adelantado (en la web)</em>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Sin descuento por duración para {sim.dias} {sim.dias === 1 ? 'día' : 'días'}.
            </p>
          )}

          {sim.dias_efectivos < sim.dias && (
            <p className="flex items-start gap-1.5 rounded bg-warning-bg px-2 py-1.5 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {sim.dias - sim.dias_efectivos} de esos días los sigue mandando{' '}
                <strong>{sim.pisado_por.map(n => `«${n}»`).join(', ')}</strong>, que tiene más
                prioridad. Ahí este precio no se va a cobrar.
              </span>
            </p>
          )}
        </div>
      )}

      {/* Todo lo demás. Existe, pero no le pega en la cara a nadie. */}
      <div>
        <button
          type="button"
          onClick={() => setAvanzado(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', avanzado && 'rotate-180')} />
          Opciones avanzadas
        </button>

        {avanzado && (
          <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nombre de la regla</label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder={nombreAuto}
                  className="input-base"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">¿Dónde aplica?</label>
                <select
                  value={canalRegla === 'ambos' ? 'ambos' : canal}
                  onChange={e => setCanalRegla(e.target.value as CanalTarifa)}
                  className="input-base"
                >
                  <option value={canal}>Sólo {canal}</option>
                  <option value="ambos">Los dos canales</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Sólo estos días de la semana <span className="font-normal">(ninguno = todos)</span>
              </label>
              <div className="flex gap-1">
                {DIAS.map(d => {
                  const activo = diasSemana.includes(d.iso);
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setDiasSemana(p =>
                        activo ? p.filter(x => x !== d.iso) : [...p, d.iso]
                      )}
                      className={cn(
                        'h-7 w-7 rounded text-xs font-semibold transition-colors',
                        activo
                          ? 'bg-primary text-white'
                          : 'border border-border bg-background text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {d.letra}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Mín. días de alquiler</label>
                <input
                  type="number" min="1" value={minDias}
                  onChange={e => setMinDias(e.target.value)}
                  placeholder="Sin mínimo" className="input-base"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Máx. días de alquiler</label>
                <input
                  type="number" min="1" value={maxDias}
                  onChange={e => setMaxDias(e.target.value)}
                  placeholder="Sin máximo" className="input-base"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} className="input-base" />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              La prioridad la define el tipo de precio de arriba: normal 0, fecha especial 10,
              promoción 20. La de mayor prioridad que cubre el día es la que se cobra.
            </p>
          </div>
        )}
      </div>
    </form>
  );
}

function FlechaRango({
  titulo, onClick, children,
}: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className="rounded border border-border p-0.5 text-muted-foreground hover:border-primary hover:text-primary"
    >
      {children}
    </button>
  );
}

/**
 * Retarda un valor. Sin esto la simulación sale una vez por tecla mientras se
 * escribe el precio: seis requests para escribir "120000".
 */
function useRetardo<T>(valor: T, ms: number): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}
