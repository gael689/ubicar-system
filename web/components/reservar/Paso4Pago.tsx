"use client";

import { useState } from "react";
import {
  CreditCard, Landmark, MessageCircle, ShieldCheck, Loader2, Car, User, MapPin,
  Copy, Check, LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError, pesos, fechaCorta } from "@/lib/api";
import { whatsappLink } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  Cotizacion, DatosCliente, DatosTransferencia, OpcionAnticipo,
  ReservaPorTransferencia,
} from "@/lib/types";
import type { RangoBusqueda } from "./BuscadorRango";

/** D-30: el cliente elige cuánto adelanta, con un piso del 30%. */
const BAJADAS: Record<number, string> = {
  30: "El mínimo para reservar",
  50: "Adelantás la mitad",
  100: "Pagás todo ahora",
};

type MetodoPago = "mercadopago" | "transferencia";

interface Props {
  rango: RangoBusqueda;
  categoriaNombre: string;
  cotizacion: Cotizacion;
  cliente: DatosCliente;
  holdToken: string | null;
  adicionales: { adicional_id: number; cantidad: number }[];
  /** Sin credenciales de Mercado Pago se cierra por WhatsApp. Lo dice el backend. */
  cobroOnline: boolean;
  /** La cuenta a la que transferir, o `null` si no está habilitada. Sale de
   *  `configuracion`, nunca del código de la web. */
  transferencia: DatosTransferencia | null;
  /** Cuánto adelanta. Es estado del flujo y no de esta pantalla porque
   *  **cambia el precio**: el descuento por duración sólo corre con el 100%. */
  pctAnticipo: number;
  onCambiarAnticipo: (pct: number) => void;
}

/**
 * Pago y confirmación.
 *
 * **Dos formas de pagar, y las dos las habilita el backend**, no una variable
 * del front: Mercado Pago cuando hay credenciales cargadas
 * (`config.cobro_online`) y transferencia bancaria cuando hay una cuenta
 * cargada en `configuracion` (`config.transferencia`). La que sabe es la
 * instancia que tiene los datos.
 *
 * Con Mercado Pago, `POST /public/reservas` crea la reserva en
 * `pendiente_pago` y devuelve la URL de Checkout Pro. **La reserva no queda
 * confirmada al volver acá**: se confirma en el webhook, que es la fuente de
 * verdad, porque el cliente puede cerrar la pestaña y el pago igual entra.
 *
 * Con transferencia, `POST /public/reservas/transferencia` crea la misma
 * reserva en `pendiente_pago` y devuelve la cuenta. **Acá no hay webhook**:
 * nadie le avisa al sistema que la plata llegó, así que la reserva no se
 * confirma sola — el cliente manda el comprobante y una persona lo concilia.
 * Por eso esta pantalla no dice "listo" al terminar: dice qué falta.
 *
 * **Los tres montos salen del backend, no de una cuenta local.** Cada opción
 * tiene su propio precio —con el 100% corre el descuento por duración (D-49)—
 * y estimarlos multiplicando el total mostraba el 100% sin descuento: el
 * cliente no veía cuánto se ahorraba justo en la opción que más conviene.
 */
export function Paso4Pago({
  rango,
  categoriaNombre,
  cotizacion,
  cliente,
  holdToken,
  adicionales,
  cobroOnline,
  transferencia,
  pctAnticipo,
  onCambiarAnticipo,
}: Props) {
  // El anticipo vive en `FlujoReserva`: cambia el precio, así que la
  // cotización tiene que rehacerse cuando se toca.
  const pct = pctAnticipo;
  const setPct = onCambiarAnticipo;
  const [metodo, setMetodo] = useState<MetodoPago>(
    cobroOnline ? "mercadopago" : "transferencia",
  );
  const [procesando, setProcesando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [transferenciaHecha, setTransferenciaHecha] =
    useState<ReservaPorTransferencia | null>(null);

  const opciones = cotizacion.anticipos;
  const elegida: OpcionAnticipo | undefined =
    opciones.find((o) => o.porcentaje === pct) ?? opciones[0];

  const senia = elegida?.monto_a_cobrar ?? 0;
  const saldo = elegida?.saldo ?? 0;
  const totalConLaOpcion = elegida?.total ?? cotizacion.total;
  const ahorro = elegida?.ahorro ?? 0;
  // Lo que se ahorraría pagando todo, se haya elegido o no. Es la información
  // que hace cambiar de opción, y por eso se muestra siempre.
  const pagoTotal = opciones.find((o) => o.porcentaje === 100);
  const ahorroPagandoTodo = pagoTotal?.ahorro ?? 0;

  const puedePagar = cobroOnline || Boolean(transferencia);

  const cuerpoReserva = () => ({
    hold_token: holdToken as string,
    nombre: `${cliente.nombre} ${cliente.apellido}`.trim(),
    email: cliente.email,
    telefono: cliente.telefono,
    dni: cliente.dni,
    lugar_entrega: rango.lugarRetiro,
    lugar_devolucion: rango.lugarDevolucion,
    porcentaje_anticipo: pct,
    adicionales,
    fecha_nacimiento: cliente.fechaNacimiento || null,
    condicion_iva: cliente.condicionIva,
    razon_social: cliente.razonSocial || null,
  });

  // El monto que se cobra lo recalcula el backend. Estos números son sólo
  // para mostrar: si difirieran, manda el del servidor.
  const confirmar = async () => {
    if (!holdToken) {
      setErrorPago("Se venció el tiempo de la reserva. Volvé a elegir el vehículo.");
      return;
    }
    setProcesando(true);
    setErrorPago(null);
    try {
      if (metodo === "mercadopago") {
        const r = await api.crearReserva(cuerpoReserva());
        // Salida del sitio hacia Checkout Pro.
        window.location.href = r.init_point;
        return;
      }
      const r = await api.crearReservaTransferencia(cuerpoReserva());
      // No se navega a la pantalla de "listo": la reserva **todavía no está
      // confirmada** y los datos de la cuenta tienen que quedar a la vista.
      setTransferenciaHecha(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErrorPago(
        e instanceof ApiError
          ? e.message
          : "No pudimos tomar la reserva. Probá de nuevo o escribinos.",
      );
    } finally {
      setProcesando(false);
    }
  };

  const mensajeSoporte = [
    "Hola! Estoy reservando por la web y necesito una mano:",
    "",
    `*Vehículo:* ${categoriaNombre}`,
    `*Retiro:* ${fechaCorta(rango.fechaInicio)} ${rango.horaInicio} — ${rango.lugarRetiro}`,
    `*Devolución:* ${fechaCorta(rango.fechaFin)} ${rango.horaFin} — ${rango.lugarDevolucion}`,
    `*Total:* ${pesos(totalConLaOpcion)} — adelanto ${pct}% (${pesos(senia)})`,
    `*Mis datos:* ${cliente.nombre} ${cliente.apellido} — DNI ${cliente.dni}`,
  ].join("\n");

  // Ya reservó y le falta transferir: la pantalla cambia entera. Mostrar los
  // botones de pago abajo de los datos de la cuenta invitaría a reservar dos
  // veces el mismo auto.
  if (transferenciaHecha) {
    return (
      <TransferenciaPendiente
        datos={transferenciaHecha}
        categoriaNombre={categoriaNombre}
        rango={rango}
        cliente={cliente}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2.5">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold text-[#1B3F6B]">Confirmá tu reserva</h2>
          <p className="text-sm text-muted-foreground">
            Elegí cuánto querés adelantar. El resto se abona al retirar el vehículo.
          </p>
        </div>
      </div>

      {/* Vista previa de lo que se está por confirmar.
          El resumen de la derecha es una columna de escritorio y no incluye
          los datos del cliente: en el teléfono, el último paso antes de pagar
          mostraba sólo números y ningún dato para revisar. Un DNI mal tipeado
          se descubría cuando llegaba el contrato. */}
      <div className="rounded-lg border border-border bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Revisá que esté todo bien
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Dato icono={<Car className="h-4 w-4" />} titulo="Vehículo">
            {categoriaNombre}
            <span className="block text-muted-foreground">
              {cotizacion.duracion_dias} {cotizacion.duracion_dias === 1 ? "día" : "días"}
            </span>
          </Dato>

          <Dato icono={<User className="h-4 w-4" />} titulo="A nombre de">
            {cliente.nombre} {cliente.apellido}
            <span className="block text-muted-foreground">DNI {cliente.dni}</span>
            <span className="block break-all text-muted-foreground">{cliente.email}</span>
            <span className="block text-muted-foreground">{cliente.telefono}</span>
          </Dato>

          <Dato icono={<MapPin className="h-4 w-4" />} titulo="Retirás">
            {fechaCorta(rango.fechaInicio)} · {rango.horaInicio}
            <span className="block text-muted-foreground">{rango.lugarRetiro}</span>
          </Dato>

          <Dato icono={<MapPin className="h-4 w-4" />} titulo="Devolvés">
            {fechaCorta(rango.fechaFin)} · {rango.horaFin}
            <span className="block text-muted-foreground">{rango.lugarDevolucion}</span>
          </Dato>
        </div>

        {/* "Sumaste" son los adicionales y nada más. El recargo por edad
            nunca perteneció acá —no es algo que el cliente haya sumado— y
            ahora va dentro del precio del alquiler. */}
        {cotizacion.adicionales.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sumaste</p>
            <ul className="space-y-1 text-sm">
              {cotizacion.adicionales.map((a) => (
                <li key={a.id} className="flex justify-between gap-4">
                  <span className="text-foreground">
                    {a.nombre}
                    {a.cantidad > 1 && ` ×${a.cantidad}`}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{pesos(a.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Cuánto adelanta (D-30). **Cambia el precio**, no sólo cuánto se cobra
          hoy: el descuento por duración se gana pagando el 100% (D-49). Los
          tres montos vienen calculados del backend, cada uno con su precio
          real — el del 100% ya trae el descuento adentro. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {opciones.map((o) => {
          const activa = pct === o.porcentaje;
          return (
            <button
              key={o.porcentaje}
              type="button"
              onClick={() => setPct(o.porcentaje)}
              className={cn(
                "rounded-lg border bg-white p-4 text-left transition-all",
                activa
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:shadow-sm",
              )}
            >
              <p className="text-sm font-semibold text-[#1B3F6B]">{o.porcentaje}%</p>
              <p className="text-lg font-bold text-foreground">{pesos(o.monto_a_cobrar)}</p>
              {/* El ahorro va en plata, no en porcentaje: "ahorrás $25.875" se
                  compara con lo que uno tiene en el bolsillo, "−15%" no. */}
              {o.ahorro > 0 ? (
                <p className="text-xs font-semibold text-[hsl(var(--ubicar-green))]">
                  Ahorrás {pesos(o.ahorro)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {BAJADAS[o.porcentaje] ?? `Adelantás el ${o.porcentaje}%`}
                </p>
              )}
              {o.saldo > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  + {pesos(o.saldo)} al retirar
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* El descuento por duración es la contraprestación por cobrar todo hoy.
          Se explica siempre —no sólo cuando ya lo eligió— porque es justamente
          la información que hace que alguien cambie de opción. */}
      {ahorro > 0 ? (
        <div className="rounded-lg border border-[hsl(var(--ubicar-green))]/30 bg-[hsl(var(--ubicar-green))]/5 px-4 py-3 text-sm">
          <p className="font-semibold text-[hsl(var(--ubicar-green))]">
            Se aplicó tu descuento: {pesos(ahorro)} menos
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {cotizacion.pago_total?.descuento_nombre ?? "Descuento por duración"} —
            lo tenés por abonar el total ahora. El alquiler te queda en{" "}
            {pesos(totalConLaOpcion)} en vez de {pesos(cotizacion.total_lista)}.
          </p>
        </div>
      ) : ahorroPagandoTodo > 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">
            Pagando el 100% ahora te ahorrás {pesos(ahorroPagandoTodo)}.
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {cotizacion.pago_total?.descuento_nombre ?? "Descuento por duración"}:
            el alquiler pasa de {pesos(cotizacion.total_lista)} a{" "}
            {pesos(pagoTotal?.total)}. Con seña parcial se abona el precio de
            lista, y el saldo al retirar el vehículo.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-white p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total de la reserva</span>
            <span className="font-medium text-foreground">
              {pesos(cotizacion.total_lista)}
            </span>
          </div>
          {ahorro > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Descuento por pago total
              </span>
              <span className="font-medium text-[hsl(var(--ubicar-green))]">
                −{pesos(ahorro)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Adelantás ahora</span>
            <span className="font-semibold text-[#1B3F6B]">{pesos(senia)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-muted-foreground">Al retirar el vehículo</span>
            <span className="font-medium text-foreground">{pesos(saldo)}</span>
          </div>
        </div>
      </div>

      {/* Cómo paga. Se muestran las dos formas sólo si las dos están
          habilitadas: un método que no está configurado es un pago que falla. */}
      {puedePagar ? (
        <div className="space-y-3">
          {cobroOnline && transferencia && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetodoTarjeta
                activo={metodo === "mercadopago"}
                onClick={() => setMetodo("mercadopago")}
                icono={<CreditCard className="h-4 w-4" />}
                titulo="Tarjeta o Mercado Pago"
                bajada="Se confirma en el momento"
              />
              <MetodoTarjeta
                activo={metodo === "transferencia"}
                onClick={() => setMetodo("transferencia")}
                icono={<Landmark className="h-4 w-4" />}
                titulo="Transferencia bancaria"
                bajada="Confirmamos al recibir el comprobante"
              />
            </div>
          )}

          {!cobroOnline && transferencia && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">
                Por ahora cobramos por transferencia bancaria
              </p>
              <p className="mt-0.5 text-muted-foreground">
                El pago con tarjeta se está terminando de habilitar. Te pasamos
                los datos de la cuenta al confirmar.
              </p>
            </div>
          )}

          {errorPago && (
            <div className="rounded-lg border border-destructive bg-destructive p-4 text-sm text-destructive-foreground">
              {errorPago}
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={procesando || !holdToken}
            onClick={confirmar}
          >
            {procesando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Un momento…
              </>
            ) : metodo === "mercadopago" ? (
              <>
                <CreditCard className="h-4 w-4" /> Pagar {pesos(senia)} con Mercado Pago
              </>
            ) : (
              <>
                <Landmark className="h-4 w-4" /> Reservar y pagar {pesos(senia)} por
                transferencia
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {metodo === "mercadopago"
              ? "Te llevamos a Mercado Pago para completar el pago de forma segura."
              : "Te mostramos los datos de la cuenta en la pantalla siguiente."}
            {saldo > 0 && ` El saldo de ${pesos(saldo)} lo abonás al retirar el vehículo.`}
          </p>
        </div>
      ) : (
        /* Honestidad sobre el estado real: no se simula un pago que no existe. */
        <div className="rounded-lg border border-border bg-muted/50 p-5 text-sm">
          <p className="font-medium text-foreground">
            El pago online se está terminando de habilitar
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Escribinos y cerramos la reserva con todo lo que ya elegiste cargado.
          </p>
        </div>
      )}

      <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--ubicar-green))]" />
          Kilometraje libre incluido
        </li>
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--ubicar-green))]" />
          Seguro de responsabilidad civil incluido
        </li>
      </ul>

      {/* Soporte, no una vía de pago alternativa. Antes había acá un
          "Confirmar por WhatsApp" que competía con el botón de pagar: el
          cliente que dudaba se iba por ahí y la reserva quedaba a que alguien
          contestara un chat. Esto es para cuando algo no se entiende. */}
      <SoporteWhatsApp mensaje={mensajeSoporte} />
    </div>
  );
}

/**
 * Reservó y le falta transferir. **La reserva no está confirmada todavía.**
 *
 * Lo dice arriba de todo y no en una nota al pie: acá no hay webhook, y quien
 * se va creyendo que ya tiene el auto reservado aparece en el mostrador el día
 * del retiro sin que nadie haya visto la plata.
 */
function TransferenciaPendiente({
  datos, categoriaNombre, rango, cliente,
}: {
  datos: ReservaPorTransferencia;
  categoriaNombre: string;
  rango: RangoBusqueda;
  cliente: DatosCliente;
}) {
  const b = datos.banco;
  const mensaje = [
    "Hola! Acabo de reservar por la web y te mando el comprobante de la transferencia.",
    "",
    `*Reserva:* ${datos.numero}`,
    `*Vehículo:* ${categoriaNombre}`,
    `*Retiro:* ${fechaCorta(rango.fechaInicio)} ${rango.horaInicio} — ${rango.lugarRetiro}`,
    `*Devolución:* ${fechaCorta(rango.fechaFin)} ${rango.horaFin} — ${rango.lugarDevolucion}`,
    `*Transferí:* ${pesos(datos.monto_a_transferir)}`,
    "",
    `*Mis datos:* ${cliente.nombre} ${cliente.apellido} — DNI ${cliente.dni}`,
  ].join("\n");

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#1B3F6B]/30 bg-[#1B3F6B]/5 p-5">
        <h2 className="font-semibold text-[#1B3F6B]">
          Tomamos tu reserva {datos.numero}. Falta un paso.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Transferí <strong className="text-foreground">{pesos(datos.monto_a_transferir)}</strong>{" "}
          a la cuenta de abajo y mandanos el comprobante por WhatsApp.{" "}
          <strong className="text-foreground">
            Recién con el comprobante confirmamos la reserva y te asignamos el
            vehículo.
          </strong>{" "}
          Mientras tanto te guardamos el cupo, pero no está garantizado.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Datos para transferir
        </p>
        <dl className="space-y-3 text-sm">
          <FilaBanco etiqueta="Titular" valor={b.titular} />
          <FilaBanco etiqueta="CUIT" valor={b.cuit} />
          <FilaBanco etiqueta="Alias" valor={b.alias} copiable />
          <FilaBanco etiqueta="CBU" valor={b.cbu} copiable />
          {b.cuenta && <FilaBanco etiqueta="Cuenta" valor={b.cuenta} />}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="text-muted-foreground">Importe a transferir</dt>
            <dd className="text-lg font-bold text-[#1B3F6B]">
              {pesos(datos.monto_a_transferir)}
            </dd>
          </div>
          {datos.saldo > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Saldo al retirar el vehículo</dt>
              <dd className="font-medium text-foreground">{pesos(datos.saldo)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        <Button
          size="lg"
          className="w-full"
          onClick={() =>
            window.open(
              waLink(b.whatsapp_comprobante, mensaje),
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          <MessageCircle className="h-4 w-4" /> Enviar el comprobante por WhatsApp
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Mandalo al {formatearTelefono(b.whatsapp_comprobante)}. Te confirmamos
          la reserva apenas lo recibimos.
        </p>
      </div>
    </div>
  );
}

function FilaBanco({
  etiqueta, valor, copiable,
}: { etiqueta: string; valor: string; copiable?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  // Un CBU de 22 dígitos copiado a mano se tipea mal una de cada tres veces, y
  // el error se descubre cuando la plata no llegó.
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: queda el texto para seleccionar */
    }
  };

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{etiqueta}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right">
        <span className="break-all font-medium text-foreground">{valor}</span>
        {copiable && (
          <button
            type="button"
            onClick={copiar}
            aria-label={`Copiar ${etiqueta}`}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--ubicar-green))]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </dd>
    </div>
  );
}

function MetodoTarjeta({
  activo, onClick, icono, titulo, bajada,
}: {
  activo: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  titulo: string;
  bajada: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border bg-white p-4 text-left transition-all",
        activo
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:shadow-sm",
      )}
    >
      <span className="mt-0.5 shrink-0 text-primary">{icono}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#1B3F6B]">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{bajada}</span>
      </span>
    </button>
  );
}

function SoporteWhatsApp({ mensaje }: { mensaje: string }) {
  return (
    <button
      type="button"
      className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={() => window.open(whatsappLink(mensaje), "_blank", "noopener,noreferrer")}
    >
      <LifeBuoy className="h-3.5 w-3.5" />
      ¿Necesitás ayuda con la reserva? Escribinos
    </button>
  );
}

/** `wa.me` sólo acepta dígitos: un `+54 9 …` con espacios abre un chat vacío. */
function waLink(telefono: string, mensaje: string): string {
  return `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

/** +5492932474791 → +54 9 2932 47-4791 */
function formatearTelefono(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  if (d.length !== 13 || !d.startsWith("549")) return telefono;
  return `+54 9 ${d.slice(3, 7)} ${d.slice(7, 9)}-${d.slice(9)}`;
}

function Dato({
  icono, titulo, children,
}: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 shrink-0 text-primary">{icono}</span>
      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="font-medium text-foreground">{children}</p>
      </div>
    </div>
  );
}
