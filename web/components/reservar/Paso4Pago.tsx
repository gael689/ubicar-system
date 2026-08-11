"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard, MessageCircle, ShieldCheck, Clock, Loader2, Car, User, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError, pesos, fechaCorta } from "@/lib/api";
import { whatsappLink } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Cotizacion, DatosCliente } from "@/lib/types";
import type { RangoBusqueda } from "./BuscadorRango";

/** D-30: el cliente elige cuánto adelanta, con un piso del 30%. */
const OPCIONES_SENA = [
  { pct: 30, label: "30%", bajada: "El mínimo para reservar" },
  { pct: 50, label: "50%", bajada: "Adelantás la mitad" },
  { pct: 100, label: "100%", bajada: "Pagás todo ahora" },
] as const;

interface Props {
  rango: RangoBusqueda;
  categoriaNombre: string;
  cotizacion: Cotizacion;
  cliente: DatosCliente;
  holdToken: string | null;
  adicionales: { adicional_id: number; cantidad: number }[];
  /** Sin credenciales de Mercado Pago se cierra por WhatsApp. Lo dice el backend. */
  cobroOnline: boolean;
  /** D-30: descuento por pagar el 100%. 0 = sin descuento. */
  descuentoPagoTotalPct: number;
  /** Cuánto adelanta. Es estado del flujo y no de esta pantalla porque
   *  **cambia el precio**: el descuento por duración sólo corre con el 100%. */
  pctAnticipo: number;
  onCambiarAnticipo: (pct: number) => void;
}

/**
 * Pago y confirmación.
 *
 * **Dos caminos según haya o no credenciales de Mercado Pago cargadas**, y la
 * decisión la toma el backend (`config.cobro_online`), no una variable del
 * front: la que sabe es la instancia que tiene las credenciales.
 *
 * Con cobro online, `POST /public/reservas` crea la reserva en
 * `pendiente_pago` y devuelve la URL de Checkout Pro. **La reserva no queda
 * confirmada al volver acá**: se confirma en el webhook, que es la fuente de
 * verdad, porque el cliente puede cerrar la pestaña y el pago igual entra.
 *
 * Sin cobro online se cierra por WhatsApp con todo pre-cargado, que es lo que
 * venía funcionando: el negocio recibe una consulta con vehículo, fechas,
 * adicionales y total definidos en vez de un "hola, quiero un auto".
 */
export function Paso4Pago({
  rango,
  categoriaNombre,
  cotizacion,
  cliente,
  holdToken,
  adicionales,
  cobroOnline,
  descuentoPagoTotalPct,
  pctAnticipo,
  onCambiarAnticipo,
}: Props) {
  const router = useRouter();
  // El anticipo vive en `FlujoReserva`: cambia el precio, así que la
  // cotización tiene que rehacerse cuando se toca.
  const pct = pctAnticipo;
  const setPct = onCambiarAnticipo;
  const [yendoAPagar, setYendoAPagar] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  // El descuento aplica sólo al pago total (D-30): una seña parcial no elimina
  // la cobranza en el mostrador, que es lo que se está pagando con el margen.
  const descuento =
    pct === 100 && descuentoPagoTotalPct > 0
      ? Math.round((cotizacion.total * descuentoPagoTotalPct) / 100)
      : 0;
  const totalFinal = cotizacion.total - descuento;
  const senia = pct === 100 ? totalFinal : Math.round((totalFinal * pct) / 100);
  const saldo = totalFinal - senia;

  // El monto que se cobra lo recalcula el backend. Estos números son sólo
  // para mostrar: si difirieran, manda el del servidor.
  const irAPagar = async () => {
    if (!holdToken) {
      setErrorPago("Se venció el tiempo de la reserva. Volvé a elegir el vehículo.");
      return;
    }
    setYendoAPagar(true);
    setErrorPago(null);
    try {
      const r = await api.crearReserva({
        hold_token: holdToken,
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
      // Salida del sitio hacia Checkout Pro.
      window.location.href = r.init_point;
    } catch (e) {
      setYendoAPagar(false);
      setErrorPago(
        e instanceof ApiError
          ? e.message
          : "No pudimos abrir el pago. Probá de nuevo o escribinos por WhatsApp.",
      );
    }
  };

  const mensaje = [
    "Hola! Quiero confirmar esta reserva:",
    "",
    `*Vehículo:* ${categoriaNombre}`,
    `*Retiro:* ${fechaCorta(rango.fechaInicio)} ${rango.horaInicio} — ${rango.lugarRetiro}`,
    `*Devolución:* ${fechaCorta(rango.fechaFin)} ${rango.horaFin} — ${rango.lugarDevolucion}`,
    "",
    // Sólo los adicionales, que son los que el cliente eligió. El recargo por
    // edad ya está dentro del total y no se lista: el mensaje lo escribe el
    // cliente y termina en el WhatsApp del mostrador, no es un comprobante.
    ...cotizacion.adicionales.map(
      (a) => `• ${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ""} — ${pesos(a.subtotal)}`,
    ),
    "",
    `*Total:* ${pesos(cotizacion.total)}`,
    `*Quiero adelantar:* ${pct}% (${pesos(senia)})`,
    "",
    `*Mis datos:* ${cliente.nombre} ${cliente.apellido} — DNI ${cliente.dni}`,
    `${cliente.email} — ${cliente.telefono}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

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
          hoy: el descuento por duración se gana pagando el 100% (D-49), así que
          tocar estos botones vuelve a cotizar. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {OPCIONES_SENA.map((o) => {
          const activa = pct === o.pct;
          const desc =
            o.pct === 100 && descuentoPagoTotalPct > 0
              ? Math.round((cotizacion.total * descuentoPagoTotalPct) / 100)
              : 0;
          const monto =
            o.pct === 100
              ? cotizacion.total - desc
              : Math.round(((cotizacion.total - desc) * o.pct) / 100);
          return (
            <button
              key={o.pct}
              type="button"
              onClick={() => setPct(o.pct)}
              className={cn(
                "rounded-lg border bg-white p-4 text-left transition-all",
                activa
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:shadow-sm",
              )}
            >
              <p className="text-sm font-semibold text-[#1B3F6B]">{o.label}</p>
              <p className="text-lg font-bold text-foreground">{pesos(monto)}</p>
              <p className="text-xs text-muted-foreground">
                {desc > 0 ? `${descuentoPagoTotalPct}% de descuento` : o.bajada}
              </p>
            </button>
          );
        })}
      </div>

      {/* El descuento por duración es la contraprestación por cobrar todo hoy.
          Se explica siempre —no sólo cuando ya lo eligió— porque es justamente
          la información que hace que alguien cambie de opción. */}
      {pct === 100 && cotizacion.descuento_monto > 0 ? (
        <div className="rounded-lg border border-[hsl(var(--ubicar-green))]/30 bg-[hsl(var(--ubicar-green))]/5 px-4 py-3 text-sm">
          <p className="font-semibold text-[hsl(var(--ubicar-green))]">
            Se aplicó tu descuento: {pesos(cotizacion.descuento_monto)} menos
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {cotizacion.descuento_nombre ?? "Descuento por duración"} — lo tenés
            por abonar el total ahora.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">
            Pagando el 100% ahora accedés al descuento por duración del alquiler.
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Con seña parcial se abona el precio de lista, y el saldo al retirar
            el vehículo.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-white p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total de la reserva</span>
            <span className="font-medium text-foreground">{pesos(cotizacion.total)}</span>
          </div>
          {descuento > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Descuento por pago total ({descuentoPagoTotalPct}%)
              </span>
              <span className="font-medium text-[hsl(var(--ubicar-green))]">
                −{pesos(descuento)}
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

      {cobroOnline ? (
        <div className="space-y-3">
          {errorPago && (
            <div className="rounded-lg border border-destructive bg-destructive p-4 text-sm text-destructive-foreground">
              {errorPago}
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={yendoAPagar || !holdToken}
            onClick={irAPagar}
          >
            {yendoAPagar ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Abriendo el pago…
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" /> Pagar {pesos(senia)} con Mercado Pago
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Te llevamos a Mercado Pago para completar el pago de forma segura.
            {saldo > 0 && ` El saldo de ${pesos(saldo)} lo abonás al retirar el vehículo.`}
          </p>

          {/* El WhatsApp no desaparece: si el pago falla, la venta no se
              pierde por no tener a dónde ir. */}
          <button
            type="button"
            className="mx-auto block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => window.open(whatsappLink(mensaje), "_blank", "noopener,noreferrer")}
          >
            ¿Preferís coordinarlo por WhatsApp?
          </button>
        </div>
      ) : (
        /* Honestidad sobre el estado real: no se simula un pago que no existe. */
        <div className="rounded-lg border border-border bg-muted/50 p-5">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground">
                  El pago online se está terminando de habilitar
                </p>
                <p className="text-sm text-muted-foreground">
                  Mientras tanto cerramos la reserva por WhatsApp: te llega todo lo
                  que elegiste ya cargado y coordinamos el pago en el momento.
                </p>
              </div>

              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  window.open(whatsappLink(mensaje), "_blank", "noopener,noreferrer");
                  // Llevarlo a la confirmación: si se queda en el checkout no
                  // sabe si la reserva quedó hecha, y vuelve a escribir.
                  router.push("/reservar/listo");
                }}
              >
                <MessageCircle className="h-4 w-4" /> Confirmar por WhatsApp
              </Button>
            </div>
          </div>
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
    </div>
  );
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
