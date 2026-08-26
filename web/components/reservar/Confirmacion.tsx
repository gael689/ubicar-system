"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, Clock, XCircle, IdCard, CreditCard, CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WHATSAPP_GENERAL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";

type Estado = "recibida" | "aprobado" | "pendiente" | "rechazado";

/**
 * Confirmación de la reserva.
 *
 * Sirve para dos caminos y por eso lee el estado de la URL:
 *
 * - **Hoy**, sin Mercado Pago, se llega acá tras cerrar por WhatsApp →
 *   `recibida`.
 * - **Cuando entre la pasarela** (ítem 62), Mercado Pago redirige acá con
 *   `?status=approved|pending|rejected` y la página ya sabe qué decir. Es lo
 *   que evita tener que rehacerla al integrar el pago.
 *
 * Cada estado dice **qué pasa ahora y qué tenés que hacer vos**: una pantalla
 * de "gracias" que no aclara si el auto está reservado o no genera más
 * llamados de los que evita.
 */
export function Confirmacion() {
  const params = useSearchParams();
  const estado = normalizar(params.get("status"));
  const referencia = params.get("reserva") ?? params.get("external_reference");

  const info = CONTENIDO[estado];
  const Icono = info.icono;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="rounded-lg border border-border bg-white p-6 text-center md:p-9">
          <span
            className={cn(
              "mx-auto grid h-14 w-14 place-items-center rounded-full",
              info.fondo,
            )}
          >
            <Icono className="h-7 w-7 text-white" />
          </span>

          <h1 className="mt-5 text-xl font-bold text-[#1B3F6B] md:text-2xl">
            {info.titulo}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {info.bajada}
          </p>

          {referencia && (
            <p className="mt-4 inline-block rounded-md bg-muted px-3 py-1.5 text-sm">
              N° de reserva{" "}
              <strong className="font-semibold text-foreground">{referencia}</strong>
            </p>
          )}

          {estado !== "rechazado" && (
            <div className="mt-7 space-y-3 border-t border-border pt-6 text-left">
              <p className="text-sm font-semibold text-[#1B3F6B]">
                Qué llevar el día del retiro
              </p>
              <ul className="space-y-2.5">
                <Requisito icono={IdCard} texto="DNI y licencia de conducir vigente" />
                <Requisito
                  icono={CalendarCheck}
                  texto="Si hay conductor adicional, sus datos y su licencia"
                />
              </ul>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild variant={estado === "rechazado" ? "default" : "outline"}>
              <a href={WHATSAPP_GENERAL} target="_blank" rel="noopener noreferrer">
                <IconoWhatsApp className="h-4 w-4" /> Escribinos por WhatsApp
              </a>
            </Button>
            <Button asChild variant={estado === "rechazado" ? "outline" : "default"}>
              <Link href={estado === "rechazado" ? "/reservar" : "/"}>
                {estado === "rechazado" ? "Volver a intentar" : "Volver al inicio"}
              </Link>
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Podés consultar las{" "}
          <Link href="/terminos" className="text-primary underline underline-offset-2">
            condiciones de tu reserva
          </Link>{" "}
          cuando quieras.
        </p>
      </div>
    </main>
  );
}

function Requisito({ icono: Icono, texto }: { icono: typeof IdCard; texto: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      {texto}
    </li>
  );
}

function normalizar(status: string | null): Estado {
  if (status === "approved" || status === "success") return "aprobado";
  if (status === "pending" || status === "in_process") return "pendiente";
  if (status === "rejected" || status === "failure") return "rechazado";
  return "recibida";
}

const CONTENIDO: Record<
  Estado,
  { icono: typeof CheckCircle2; fondo: string; titulo: string; bajada: string }
> = {
  recibida: {
    icono: CheckCircle2,
    fondo: "bg-[hsl(var(--ubicar-green))]",
    titulo: "¡Listo! Recibimos tu solicitud",
    bajada:
      "Te vamos a contactar para confirmarte la reserva y coordinar el pago. Si es urgente, escribinos directo por WhatsApp.",
  },
  aprobado: {
    icono: CheckCircle2,
    fondo: "bg-[hsl(var(--ubicar-green))]",
    titulo: "¡Reserva confirmada!",
    bajada:
      "Recibimos tu pago y tu vehículo ya está reservado. Te mandamos la confirmación por correo con todos los detalles.",
  },
  pendiente: {
    icono: Clock,
    fondo: "bg-[#1B3F6B]",
    titulo: "Estamos esperando tu pago",
    bajada:
      "Tu reserva queda guardada mientras se acredita el pago. Apenas se confirme te avisamos por correo; suele tardar unos minutos.",
  },
  rechazado: {
    icono: XCircle,
    fondo: "bg-destructive",
    titulo: "No pudimos procesar el pago",
    bajada:
      "El pago no se completó, así que la reserva no quedó tomada. Podés intentar de nuevo con otro medio de pago o escribirnos y lo resolvemos juntos.",
  },
};
