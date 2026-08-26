"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { solicitudContacto } from "@/lib/analitica";
import { fechaCorta } from "@/lib/api";
import { whatsappLink } from "@/lib/contacto";
import { cn } from "@/lib/utils";
import type { MotivoSolicitud } from "@/lib/types";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";

interface Props {
  motivo: MotivoSolicitud;
  /** Sólo en `sin_cupo`: en los otros dos casos todavía no eligió vehículo. */
  categoriaId?: number | null;
  categoriaNombre?: string;
  fechaInicio?: string | null;
  horaInicio?: string | null;
  fechaFin?: string | null;
  horaFin?: string | null;
  lugarRetiro?: string | null;
  lugarDevolucion?: string | null;
  /** Lo que tipeó en "Otro lugar". */
  lugarTextoLibre?: string | null;
  edad?: string | null;
  /** Para que el "listo" no sea otro callejón: se le ofrece adelantarlo. */
  mensajeWhatsapp?: string;
  onCerrar: () => void;
}

/**
 * "Quiero que me contacten ustedes" — la segunda salida del panel (D-61).
 *
 * Generaliza al viejo `DialogoSinCupo`, que sólo servía para una categoría
 * agotada y **le pegaba a `/public/solicitudes`**: ese endpoint valida la
 * ventana de venta y devolvía 422 justo cuando la persona llegaba acá por
 * tener fechas fuera de la ventana. Ahora usa `/public/contacto`, que no
 * valida nada de eso porque no hay venta que impedir — se anota un teléfono.
 *
 * **El email es opcional.** El pedido es "que me llamen": exigir el mail es un
 * campo más entre la persona y el envío, y el mostrador va a usar el teléfono
 * igual. Si hace falta para una cotización, se pide en la llamada.
 */
export function DialogoContactame({
  motivo, categoriaId, categoriaNombre,
  fechaInicio, horaInicio, fechaFin, horaFin,
  lugarRetiro, lugarDevolucion, lugarTextoLibre, edad,
  mensajeWhatsapp, onCerrar,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Sólo dos campos obligatorios. El mail, si lo escribe, tiene que ser válido
  // — pero no escribirlo no frena nada.
  const emailOk = !email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const valido =
    nombre.trim().length > 1 &&
    telefono.replace(/\D/g, "").length >= 8 &&
    emailOk;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await api.crearSolicitudContacto({
        motivo,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        email: email.trim() || undefined,
        categoria_id: categoriaId ?? undefined,
        fecha_inicio: fechaInicio || undefined,
        fecha_fin: fechaFin || undefined,
        hora_inicio: horaInicio || undefined,
        hora_fin: horaFin || undefined,
        lugar_retiro: lugarRetiro || undefined,
        lugar_devolucion: lugarDevolucion || undefined,
        lugar_texto_libre: lugarTextoLibre || undefined,
        edad_declarada: edad ? Number(edad) : undefined,
      });
      setListo(true);
      solicitudContacto({ motivo, categoria: categoriaNombre });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const cuando = fechaInicio
    ? `Del ${fechaCorta(fechaInicio)}${fechaFin ? ` al ${fechaCorta(fechaFin)}` : ""}. `
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#1B3F6B]">
              {listo ? "Listo — lo tenemos anotado" : "Te llamamos nosotros"}
            </h3>
            {!listo && (
              <p className="mt-1 text-sm text-muted-foreground">
                {cuando}Dejanos cómo ubicarte y un agente te escribe. No te
                compromete a nada y no te pedimos pagar.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {listo ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ubicar-green))]" />
            <p className="mt-3 text-sm text-muted-foreground">
              Un agente de Ubicar te va a escribir. Si querés adelantarlo,
              escribinos por WhatsApp ahora mismo.
            </p>
            {/* El "listo" tampoco puede ser un callejón: quien tiene apuro
                tiene que poder seguir sin esperar la llamada. */}
            {mensajeWhatsapp && (
              <a
                href={whatsappLink(mensajeWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block"
              >
                <Button className="w-full gap-2">
                  <IconoWhatsApp className="h-4 w-4" /> Seguir por WhatsApp
                </Button>
              </a>
            )}
            <Button variant="outline" onClick={onCerrar} className="mt-2 w-full">
              Seguir mirando
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <p className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </p>
            )}

            <Campo etiqueta="Nombre y apellido" valor={nombre} onChange={setNombre} />
            <Campo etiqueta="Teléfono o WhatsApp" valor={telefono} onChange={setTelefono} type="tel" />
            <Campo etiqueta="Email (opcional)" valor={email} onChange={setEmail} type="email" />
            {!emailOk && (
              <p className="text-xs text-destructive">Revisá el email, parece incompleto.</p>
            )}

            <Button onClick={enviar} disabled={!valido || enviando} className="w-full">
              {enviando ? "Enviando…" : "Quiero que me contacten"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({
  etiqueta, valor, onChange, type = "text",
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {etiqueta}
      </label>
      <input
        type={type}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm",
          "outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15",
        )}
      />
    </div>
  );
}
