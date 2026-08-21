import { useState } from 'react';
import { toast } from 'sonner';
import {
  Check, Loader2, Car, Wallet, FileSignature, X, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Phone, Mail, CreditCard, MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccionesContrato } from '@/components/reservas/AccionesContrato';
import {
  useVehiculosDisponibles, useRegistrarCobro, useAsignarVehiculo,
  type VehiculoLibre,
} from '@/hooks/useResolverReserva';
import { useRechazarReservaWeb } from '@/hooks/useReservasWeb';
import { MotivoDialog } from '@/components/shared/MotivoDialog';
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

  // **Cancelar desde acá y no sólo desde la fila de atrás.**
  //
  // Este panel es donde el operador está mirando el caso completo —cuánto se
  // cobró, si hay auto, qué falta— y es justo donde se da cuenta de que la
  // reserva no va: el cliente nunca transfirió, o no quedó ninguna unidad de
  // lo que pidió y no acepta el upgrade. Obligarlo a cerrar el panel, buscar la
  // fila en el listado y recién ahí cancelar es un paso de más en el momento en
  // que ya tomó la decisión.
  const cancelar = useRechazarReservaWeb();
  const [cancelando, setCancelando] = useState(false);

  const yaCobrado = Number(reserva.anticipo_monto ?? 0);

  async function confirmarCancelacion(motivo: string) {
    try {
      await cancelar.mutateAsync({ id: reserva.id, motivo });
      toast.success(
        yaCobrado > 0
          ? `Reserva cancelada. Se le reintegran ${formatCurrency(yaCobrado)} al cliente.`
          : 'Reserva cancelada.',
      );
      setCancelando(false);
      onCambio?.();
      onClose();
    } catch (e) {
      toast.error(extractError(e));
    }
  }

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

            {/* **Los datos de la persona, acá y no a dos pantallas.**
                Asignar un auto casi nunca es un trámite mudo: hay que avisar
                del upgrade, preguntar si le sirve otro horario, o pedirle el
                comprobante. Tener sólo el nombre obliga a abrir Clientes en
                otra pestaña, buscarlo y volver — y con alguien esperando eso
                no pasa: se resuelve por afuera del sistema.

                Los tres son clickeables: WhatsApp abre el chat, el mail abre
                el cliente de correo. El DNI no es un link pero es lo que se
                necesita para el contrato. */}
            <ContactoDelCliente reserva={reserva} />
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

        {/* Cancelar va a la izquierda y separado de "Cerrar": son la acción
            más destructiva y la más inocua de la pantalla, y pegadas se
            confunden. */}
        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCancelando(true)}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <X className="h-3.5 w-3.5" /> Cancelar la reserva
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      <MotivoDialog
        open={cancelando}
        onOpenChange={setCancelando}
        title={`Cancelar la reserva #${reserva.id}`}
        description={
          yaCobrado > 0
            ? `El cliente ya pagó ${formatCurrency(yaCobrado)}. Al cancelar se le `
              + 'reintegran completos: la plata sale de la caja de hoy y su cuenta '
              + 'corriente queda en cero. El motivo queda registrado.'
            : 'No hay ningún pago registrado, así que no se genera ningún movimiento '
              + 'de plata. La reserva queda cancelada con el motivo, y el auto —si '
              + 'tenía uno asignado— vuelve a estar disponible.'
        }
        confirmLabel="Cancelar la reserva"
        loading={cancelar.isPending}
        onConfirm={confirmarCancelacion}
      />
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
 * El contacto de quien reservó, en una línea.
 *
 * **Sale de dos lados y por eso no se lee directo.** Una reserva web puede no
 * tener cliente todavía (D-04: una solicitud sin cupo no crea uno), y en ese
 * caso el contacto vive en `web_contacto_*`. Cuando sí hay cliente, el bueno es
 * el del cliente, que es el que alguien verificó.
 */
function ContactoDelCliente({ reserva }: { reserva: Reserva }) {
  const telefono = reserva.cliente?.telefono ?? reserva.web_contacto_telefono ?? null;
  const email = reserva.cliente?.email ?? reserva.web_contacto_email ?? null;
  const dni = reserva.cliente?.dni_cuit ?? null;

  if (!telefono && !email && !dni) return null;

  // `wa.me` quiere sólo dígitos. Los números argentinos se cargan de mil
  // formas ("+54 9 291 418-0554", "0291 15 418-0554"): se limpia lo que no
  // sea dígito y listo, sin intentar adivinar el formato correcto.
  const soloDigitos = telefono?.replace(/\D/g, '') ?? '';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
      {dni && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CreditCard className="h-3.5 w-3.5" />
          {dni}
        </span>
      )}
      {telefono && (
        <>
          <a
            href={`tel:${telefono}`}
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {telefono}
          </a>
          {soloDigitos.length >= 8 && (
            <a
              href={`https://wa.me/${soloDigitos}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 font-medium text-success hover:bg-success/20"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          )}
        </>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="inline-flex items-center gap-1 truncate text-foreground hover:underline"
        >
          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {email}
        </a>
      )}
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

  /**
   * Corregir el precio en el mismo paso (D-65).
   *
   * **Arranca apagado, y eso es la regla.** D-54 define que un upgrade va al
   * mismo precio, y mientras esto siga apagado no se manda ningún precio y
   * nada cambia. Se enciende para el acuerdo distinto: un upgrade que sí se
   * cobra, o —el que más importa— un downgrade que hay que compensar bajando
   * el precio, que hoy obliga a entregar una categoría peor cobrando lo mismo.
   */
  const precioActual = Number(reserva.precio_total ?? 0);
  const [tocarPrecio, setTocarPrecio] = useState(false);
  const [precioNuevo, setPrecioNuevo] = useState<string>(String(precioActual || ''));
  const [precioMotivo, setPrecioMotivo] = useState('');

  const precioCambia =
    tocarPrecio && precioNuevo !== '' && Number(precioNuevo) !== precioActual;
  // Mismo criterio que el resto de la plata del sistema (regla 1.7): apartarse
  // del precio pactado exige decir por qué. El backend lo revalida.
  const faltaMotivo = precioCambia && !precioMotivo.trim();

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
        // Sólo viaja si se tocó: sin esto el precio queda como estaba.
        precio_total: tocarPrecio && precioNuevo !== '' ? Number(precioNuevo) : null,
        precio_motivo: precioCambia ? precioMotivo.trim() : null,
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
              <strong>
                Upgrade a {vehiculoElegido.categoria_nombre ?? 'otra categoría'}
                {precioCambia ? '' : ', mismo precio'}
              </strong>{' '}
              para el cliente.
            </span>
          </p>
        )
      )}

      {/* El precio, si el acuerdo con el cliente fue otro. Va acá y no en una
          pantalla aparte porque es la misma decisión: qué auto se entrega y a
          cuánto. Separarlos obliga a asignar primero y corregir después, con
          la reserva ya confirmada al precio equivocado. */}
      <div className="rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={tocarPrecio}
            onChange={e => {
              setTocarPrecio(e.target.checked);
              if (!e.target.checked) { setPrecioNuevo(String(precioActual || '')); setPrecioMotivo(''); }
            }}
            className="h-3.5 w-3.5"
          />
          Cobrar otro precio
          <span className="font-normal text-muted-foreground">
            — ahora {formatCurrency(precioActual)}
          </span>
        </label>

        {tocarPrecio && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Nuevo total</span>
              <input
                type="number"
                min={0}
                step={100}
                value={precioNuevo}
                onChange={e => setPrecioNuevo(e.target.value)}
                className="w-36 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
              {precioCambia && (
                <span className={cn(
                  'text-xs font-medium',
                  Number(precioNuevo) > precioActual ? 'text-foreground' : 'text-success',
                )}>
                  {Number(precioNuevo) > precioActual ? '+' : '−'}
                  {formatCurrency(Math.abs(Number(precioNuevo) - precioActual))}
                </span>
              )}
            </div>
            <input
              type="text"
              value={precioMotivo}
              onChange={e => setPrecioMotivo(e.target.value)}
              placeholder="Por qué se cambia el precio (queda registrado)"
              className={cn(
                'w-full rounded-md border bg-background px-2 py-1 text-sm',
                faltaMotivo ? 'border-danger' : 'border-input',
              )}
            />
            {faltaMotivo && (
              <p className="text-xs text-danger">
                El motivo es obligatorio: queda auditado con tu nombre, igual que
                un descuento manual.
              </p>
            )}
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant={vehiculoElegido?.es_downgrade ? 'destructive' : 'default'}
        disabled={elegido === null || asignar.isPending || faltaMotivo}
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
