import { useState } from 'react';
import { toast } from 'sonner';
import {
  Check, Loader2, Car, Wallet, FileSignature, X, AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccionesContrato } from '@/components/reservas/AccionesContrato';
import {
  useVehiculosDisponibles, useRegistrarCobro, useAsignarVehiculo,
  type VehiculoLibre,
} from '@/hooks/useResolverReserva';
import { cn, formatCurrency, formatDate, extractError } from '@/lib/utils';
import type { Reserva } from '@/types';

/**
 * Los tres pasos que convierten una solicitud web en una venta cerrada:
 * **cobrar, asignar el auto y emitir el contrato**.
 *
 * Existe porque una reserva web por transferencia entra en `pendiente_pago`,
 * sin auto y sin contrato, y **no se confirma sola**: no hay webhook. El
 * cliente manda el comprobante por WhatsApp, alguien lo concilia contra el
 * extracto y recién ahí la reserva es una venta.
 *
 * **Los tres pasos se ven siempre, hechos o no.** El criterio es que el
 * operador no tenga que saber en qué orden va cada cosa: la pantalla se lo
 * dice. Antes esto estaba repartido entre la bandeja web (que sólo sabía
 * aceptar), el listado de reservas (que sólo sabía el contrato) y la caja
 * (que sólo sabía cobrar), y quedarse a mitad de camino no dejaba ninguna
 * marca visible.
 */
export function PanelResolverReserva({
  reserva: inicial, onClose, onCambio,
}: {
  reserva: Reserva;
  onClose: () => void;
  /** El listado de atrás tiene que enterarse: la fila puede cambiar de sección. */
  onCambio?: () => void;
}) {
  // Se trabaja sobre una copia viva: cada paso devuelve la reserva ya
  // actualizada, así el panel avanza sin esperar a que el listado refresque.
  const [reserva, setReserva] = useState<Reserva>(inicial);

  const total = totalACobrar(reserva);
  const cobrado = Number(reserva.anticipo_monto ?? 0);
  const saldo = total - cobrado;

  const faltaCobrar = reserva.estado === 'pendiente_pago';
  const faltaAuto = !reserva.vehiculo_id;
  const faltaContrato = !faltaAuto && reserva.contrato_estado !== 'firmado';

  const aplicar = (r: Reserva) => { setReserva({ ...reserva, ...r }); onCambio?.(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-background shadow-xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              Reserva #{reserva.id}
              {reserva.origen === 'web' && (
                <span className="ml-2 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  web
                </span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground">
              {reserva.web_contacto_nombre || reserva.cliente?.nombre_completo || `Cliente ${reserva.cliente_id}`}
              {' · '}
              {formatDate(reserva.fecha_inicio)} {reserva.hora_inicio?.slice(0, 5)}
              {' → '}
              {formatDate(reserva.fecha_fin)} {reserva.hora_fin?.slice(0, 5)}
            </p>
            {reserva.categoria?.nombre && (
              <p className="text-xs text-muted-foreground">
                Pidió: <span className="font-medium text-foreground">{reserva.categoria.nombre}</span>
                {' — la web vende por categoría, el auto se elige acá.'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* El resumen de lo que falta, arriba de todo: es la respuesta a
            "¿qué hago con esto?" sin tener que leer los tres pasos. */}
        <div className="flex flex-wrap gap-2 border-b border-border bg-muted/30 px-5 py-3">
          {!faltaCobrar && !faltaAuto && !faltaContrato ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <Check className="h-4 w-4" /> No falta nada: cobrada, con auto y con el contrato firmado.
            </span>
          ) : (
            <>
              <span className="text-sm font-medium text-foreground">Falta:</span>
              {faltaCobrar && <Chip>confirmar el pago</Chip>}
              {faltaAuto && <Chip>asignar el auto</Chip>}
              {faltaContrato && (
                <Chip>{reserva.contrato_estado === 'emitido' ? 'la firma del contrato' : 'emitir el contrato'}</Chip>
              )}
            </>
          )}
        </div>

        <div className="space-y-4 p-5">
          <Paso
            n={1}
            icono={<Wallet className="h-4 w-4" />}
            titulo="El pago"
            hecho={!faltaCobrar}
            resumen={
              faltaCobrar
                ? `Esperando la transferencia. Total ${formatCurrency(total)}.`
                : `Cobrado ${formatCurrency(cobrado)}${reserva.anticipo_medio_pago ? ` por ${reserva.anticipo_medio_pago}` : ''}` +
                  (saldo > 0 ? ` · quedan ${formatCurrency(saldo)} para el mostrador` : ' · pagada por completo')
            }
          >
            <FormularioCobro reserva={reserva} saldo={saldo} onListo={aplicar} />
          </Paso>

          <Paso
            n={2}
            icono={<Car className="h-4 w-4" />}
            titulo="El vehículo"
            hecho={!faltaAuto}
            resumen={
              faltaAuto
                ? 'Sin auto asignado. Una categoría no se puede entregar.'
                : `${reserva.vehiculo?.patente ?? `Vehículo ${reserva.vehiculo_id}`}` +
                  (reserva.vehiculo ? ` — ${reserva.vehiculo.marca} ${reserva.vehiculo.modelo}` : '')
            }
          >
            <SelectorVehiculo reserva={reserva} onListo={aplicar} />
          </Paso>

          <Paso
            n={3}
            icono={<FileSignature className="h-4 w-4" />}
            titulo="El contrato"
            hecho={reserva.contrato_estado === 'firmado'}
            resumen={
              faltaAuto
                ? 'Todavía no: un contrato sin vehículo no dice qué se entrega.'
                : reserva.contrato_estado === 'firmado'
                  ? 'Firmado.'
                  : reserva.contrato_estado === 'emitido'
                    ? 'Emitido, sin firmar. Mandale el link al cliente.'
                    : 'Sin emitir.'
            }
          >
            {/* D-47: asignar el auto es lo que habilita el contrato. El
                backend no lo bloquea —emitiría uno con el vehículo en
                blanco—, así que el freno está acá, que es donde se decide. */}
            {faltaAuto ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                Asignale el auto en el paso 2 y el contrato se emite desde acá mismo.
              </p>
            ) : (
              <AccionesContrato
                reservaId={reserva.id}
                estado={reserva.contrato_estado}
                entregadoSinContrato={reserva.entregado_sin_contrato}
                onCambio={() => {
                  // El estado del contrato lo sabe el backend; acá se
                  // adelanta lo único que puede haber pasado al emitir.
                  setReserva(r => ({ ...r, contrato_estado: 'emitido' }));
                  onCambio?.();
                }}
              />
            )}
          </Paso>
        </div>

        <div className="flex justify-end border-t border-border p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * El total real de la reserva.
 *
 * Los adicionales y el late checkout **viven fuera de `precio_total`** (ver
 * `Reserva.total_adicionales` en el backend): un saldo calculado sólo contra
 * `precio_total` cobra de menos, y la diferencia aparece en el mostrador.
 */
function totalACobrar(r: Reserva): number {
  return (
    Number(r.precio_total ?? 0)
    + Number(r.cargo_late_checkout ?? 0)
    + Number(r.total_adicionales ?? 0)
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

/**
 * Un paso, con su estado a la vista.
 *
 * Los pasos ya hechos **no se ocultan**: quedan colapsados con el dato que
 * resultó (cuánto se cobró, qué patente). Esconderlos obliga a abrir otra
 * pantalla para verificar lo que uno acaba de hacer.
 */
function Paso({
  n, icono, titulo, hecho, resumen, children,
}: {
  n: number;
  icono: React.ReactNode;
  titulo: string;
  hecho: boolean;
  resumen: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(!hecho);

  return (
    <div className={cn(
      'rounded-xl border p-4',
      hecho ? 'border-border bg-muted/20' : 'border-warning/40 bg-warning/5',
    )}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          hecho ? 'bg-success text-white' : 'bg-warning text-white',
        )}>
          {hecho ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {icono} {titulo}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{resumen}</span>
        </span>
        <span className="text-xs text-muted-foreground">{abierto ? 'Ocultar' : 'Abrir'}</span>
      </button>
      {abierto && <div className="mt-3 border-t border-border pt-3">{children}</div>}
    </div>
  );
}

const MEDIOS = ['transferencia', 'efectivo', 'tarjeta', 'mercado_pago', 'echeq', 'cheque'] as const;
const MEDIO_LABEL: Record<string, string> = {
  transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta',
  mercado_pago: 'Mercado Pago', echeq: 'E-cheq', cheque: 'Cheque',
};

/**
 * Cargar la plata que entró y confirmar, en un solo movimiento.
 *
 * Quien ve la transferencia en el extracto está confirmando la reserva, no
 * cargando un dato. Separarlo en dos acciones dejaba reservas cobradas que
 * nadie confirmaba.
 */
function FormularioCobro({
  reserva, saldo, onListo,
}: { reserva: Reserva; saldo: number; onListo: (r: Reserva) => void }) {
  const registrar = useRegistrarCobro();
  const esperandoPago = reserva.estado === 'pendiente_pago';
  // El saldo como default cubre al que paga todo junto; el que señó el 30%
  // lo pisa con lo que efectivamente transfirió.
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo) : '');
  const [medio, setMedio] = useState<string>(reserva.forma_pago_prevista ?? 'transferencia');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');

  if (saldo <= 0 && !esperandoPago) {
    return <p className="text-xs text-muted-foreground">No queda saldo por cobrar.</p>;
  }

  return (
    <div className="space-y-3">
      {esperandoPago && (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Por transferencia <strong className="text-foreground">no hay aviso automático</strong>:
          el cliente manda el comprobante y alguien lo cruza contra el extracto.
          Registrarlo acá es lo que confirma la reserva.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Monto recibido *</span>
          <input
            type="number" min="0" step="0.01" value={monto}
            onChange={e => setMonto(e.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Medio</span>
          <select value={medio} onChange={e => setMedio(e.target.value)} className="input-base">
            {MEDIOS.map(m => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Fecha en que entró</span>
          <input
            type="date" value={fecha} max={new Date().toISOString().slice(0, 10)}
            onChange={e => setFecha(e.target.value)} className="input-base"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">N° de operación</span>
          <input
            value={referencia} onChange={e => setReferencia(e.target.value)}
            placeholder="Para cruzarlo con el extracto"
            className="input-base"
          />
        </label>
      </div>

      <Button
        size="sm"
        disabled={!monto || Number(monto) <= 0 || registrar.isPending}
        onClick={() => {
          registrar.mutate(
            {
              id: reserva.id,
              monto: Number(monto),
              medio_pago: medio,
              fecha,
              referencia: referencia || undefined,
              confirmar: true,
            },
            {
              onSuccess: r => {
                onListo(r);
                toast.success(
                  esperandoPago
                    ? 'Cobro registrado y reserva confirmada.'
                    : 'Cobro registrado.',
                );
              },
              onError: e => toast.error(extractError(e, 'No pudimos registrar el cobro')),
            },
          );
        }}
      >
        {registrar.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</>
          : esperandoPago ? 'Registrar cobro y confirmar' : 'Registrar cobro'}
      </Button>
    </div>
  );
}

/**
 * Los autos que están libres **de verdad** en esas fechas.
 *
 * No es la flota entera: el backend descuenta reservas, bloqueos, holds y el
 * margen de preparación entre que un auto vuelve y se puede volver a
 * entregar. Los de otra categoría se muestran aparte y marcados — dar un
 * upgrade es una decisión comercial válida, y muchas veces la única forma de
 * no perder la venta.
 */
function SelectorVehiculo({
  reserva, onListo,
}: { reserva: Reserva; onListo: (r: Reserva) => void }) {
  const { data, isLoading } = useVehiculosDisponibles(reserva.id);
  const asignar = useAsignarVehiculo();
  const [elegido, setElegido] = useState<number | null>(null);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Buscando los autos libres…</p>;
  }

  const todos = data?.vehiculos ?? [];
  const deLaCategoria = todos.filter(v => v.es_categoria_pedida);
  const otros = todos.filter(v => !v.es_categoria_pedida);
  const hayCategoria = reserva.categoria_id != null;
  const vehiculoElegido = todos.find(v => v.id === elegido) ?? null;

  const confirmar = (vehiculoId: number) => {
    asignar.mutate(
      {
        id: reserva.id, vehiculo_id: vehiculoId,
        // Si todavía espera el pago, asignar no puede confirmarla sola: la
        // plata sigue sin estar y confirmarla ocuparía el auto por una venta
        // que puede no cerrarse nunca.
        confirmar: reserva.estado !== 'pendiente_pago',
        // Concurrencia optimista: qué auto tenía cuando se abrió esta
        // pantalla. Son hasta tres personas trabajando y el aviso de
        // pendientes les aparece a todas; sin esto, el segundo que asigna
        // pisa al primero en silencio y queda un auto comprometido que el
        // calendario ya no muestra ocupado.
        vehiculo_actual: reserva.vehiculo_id ?? null,
      },
      {
        onSuccess: r => {
          onListo(r);
          // D-48: si el cambio de auto anuló un contrato firmado, hay que
          // enterarse ahora — no cuando el cliente llega con un papel que
          // nombra otra patente.
          const avisos = r.warnings ?? [];
          if (avisos.length) avisos.forEach(w => toast.warning(w.mensaje, { duration: 12_000 }));
          else toast.success('Vehículo asignado.');
        },
        onError: e => toast.error(extractError(e, 'Ese auto no quedó libre')),
      },
    );
  };

  return (
    <div className="space-y-3">
      {todos.length === 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          No queda ninguna unidad libre en esas fechas, de ninguna categoría.
          Hay que hablar con el cliente: otras fechas, o devolverle lo que pagó.
        </p>
      )}

      {hayCategoria && (
        <Grupo
          titulo={`${data?.categoria_nombre ?? 'La categoría pedida'} — lo que pidió`}
          vehiculos={deLaCategoria}
          vacio="No queda ninguna unidad de la categoría que pidió. Mirá el upgrade de abajo."
          elegido={elegido}
          actual={data?.vehiculo_actual_id ?? null}
          onElegir={setElegido}
        />
      )}

      <Grupo
        titulo={hayCategoria ? 'Otras categorías — upgrade' : 'Autos libres'}
        vehiculos={otros.length || hayCategoria ? otros : todos}
        vacio="Sin unidades libres en otras categorías."
        elegido={elegido}
        actual={data?.vehiculo_actual_id ?? null}
        onElegir={setElegido}
        atenuado={hayCategoria}
      />

      {/* D-54/checklist 56: se avisa ANTES de confirmar, no sólo se registra
          después — un downgrade en particular necesita que quien lo asigna
          se dé cuenta antes de apretar el botón, no leerlo en el historial. */}
      {vehiculoElegido && !vehiculoElegido.es_categoria_pedida && (
        vehiculoElegido.es_downgrade ? (
          <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
            <span>
              <strong>Esto es un downgrade.</strong> Pidió{' '}
              {data?.categoria_nombre ?? 'una categoría'} y este auto es{' '}
              {vehiculoElegido.categoria_nombre ?? 'de una categoría menor'}.
              Avisale al cliente antes de confirmar.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-foreground">
            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>
              <strong>Upgrade a {vehiculoElegido.categoria_nombre ?? 'otra categoría'}, mismo precio</strong> para el cliente.
            </span>
          </p>
        )
      )}

      <Button
        size="sm"
        variant={vehiculoElegido?.es_downgrade ? 'destructive' : 'default'}
        disabled={elegido === null || asignar.isPending}
        onClick={() => elegido !== null && confirmar(elegido)}
      >
        {asignar.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Asignando…</>
          : vehiculoElegido?.es_downgrade ? 'Confirmar downgrade' : 'Asignar este vehículo'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Se revalida que siga libre al asignarlo: entre que abriste esta pantalla
        y elegiste pudo entrar otra reserva.
      </p>
    </div>
  );
}

function Grupo({
  titulo, vehiculos, vacio, elegido, actual, onElegir, atenuado,
}: {
  titulo: string;
  vehiculos: VehiculoLibre[];
  vacio: string;
  elegido: number | null;
  actual: number | null;
  onElegir: (id: number) => void;
  atenuado?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className={cn(
        'text-xs font-semibold uppercase tracking-wide',
        atenuado ? 'text-muted-foreground' : 'text-foreground',
      )}>
        {titulo} <span className="font-normal normal-case">({vehiculos.length} libre{vehiculos.length === 1 ? '' : 's'})</span>
      </p>
      {vehiculos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {vehiculos.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => onElegir(v.id)}
              className={cn(
                'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                elegido === v.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted',
              )}
            >
              <span>
                <span className="block font-semibold text-foreground">{v.patente}</span>
                <span className="block text-xs text-muted-foreground">
                  {v.marca} {v.modelo}{v.anio ? ` ${v.anio}` : ''}
                </span>
              </span>
              {!v.es_categoria_pedida && (
                <span
                  title={
                    v.es_downgrade
                      ? `Es ${v.categoria_nombre ?? 'de una categoría menor'} — downgrade`
                      : `Es ${v.categoria_nombre ?? 'de otra categoría'} — upgrade, mismo precio`
                  }
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    v.es_downgrade
                      ? 'bg-danger/15 text-danger'
                      : 'bg-success/15 text-success',
                  )}
                >
                  {v.es_downgrade
                    ? <ArrowDownRight className="h-3 w-3" />
                    : <ArrowUpRight className="h-3 w-3" />}
                  {v.categoria_nombre ?? 'otra'}
                </span>
              )}
              {v.id === actual && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                  actual
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
