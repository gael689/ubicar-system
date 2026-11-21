"use client";

import { useId, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { solicitudSinCupo } from "@/lib/analitica";
import { fechaCorta } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CategoriaDisponible } from "@/lib/types";
import type { RangoBusqueda } from "./BuscadorRango";

interface Props {
  categoria: CategoriaDisponible;
  rango: RangoBusqueda;
  onCerrar: () => void;
}

/**
 * "Dejanos tus datos" para una categoría sin disponibilidad (D-04).
 *
 * **Es lo que convierte un "no" en un contacto.** Hoy, quien busca fechas
 * agotadas se va del sitio y ese contacto se pierde. Con esto la solicitud
 * entra al sistema, el equipo la ve en su bandeja y le llega un aviso en el
 * momento para ofrecerle otra categoría u otras fechas.
 *
 * No pide pago ni compromete nada: es exactamente por eso que funciona hoy,
 * sin depender de la pasarela.
 */
export function DialogoSinCupo({ categoria, rango, onCerrar }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const valido =
    nombre.trim().length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    telefono.replace(/\D/g, "").length >= 8;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await api.crearSolicitud({
        categoria_id: categoria.categoria_id,
        fecha_inicio: rango.fechaInicio,
        hora_inicio: rango.horaInicio,
        fecha_fin: rango.fechaFin,
        hora_fin: rango.horaFin,
        lugar_entrega: rango.lugarRetiro,
        lugar_devolucion: rango.lugarDevolucion || undefined,
        nombre: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim(),
      });
      setListo(true);
      // Una solicitud sin cupo es un contacto real: la persona dejo sus
      // datos. Se mide aparte de la reserva porque el negocio la
      // recupera de otra forma -- llamando cuando se libera un auto.
      solicitudSinCupo({ categoriaId: categoria.categoria_id, nombre: categoria.nombre });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" className="max-h-full w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#1B3F6B]">
              {listo ? "¡Listo!" : `${categoria.nombre}: lo confirma un agente`}
            </h3>
            {!listo && (
              <p className="mt-1 text-sm text-muted-foreground">
                Del {fechaCorta(rango.fechaInicio)} al {fechaCorta(rango.fechaFin)}.
                Dejanos tus datos y te contactamos para confirmarte este vehículo
                o uno similar.
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
              Tu pedido quedó tomado. Te contactamos para confirmarte si se
              libera una unidad, o para ofrecerte otra categoría u otras fechas.
            </p>
            <Button onClick={onCerrar} className="mt-5 w-full">
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

            <Campo etiqueta="Nombre y apellido" valor={nombre} onChange={setNombre} name="name" autoComplete="name" autoCapitalize="words" />
            <Campo etiqueta="Email" valor={email} onChange={setEmail} type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
            <Campo etiqueta="Teléfono" valor={telefono} onChange={setTelefono} type="tel" name="tel" autoComplete="tel" inputMode="tel" />

            <Button
              onClick={enviar}
              disabled={!valido || enviando}
              className="w-full"
            >
              {/* **No es una lista de espera.** El pedido entra al sistema
                  como una reserva real —estado `sin_disponibilidad`, sin
                  ocupar calendario y sin cobrar— y dispara un aviso en el
                  acto. "Avisarme cuando haya" prometía menos de lo que
                  realmente pasa: alguien lee eso y se va a buscar a otro lado,
                  cuando en los hechos ya tiene un pedido tomado y va a recibir
                  un llamado. */}
              {enviando ? "Enviando…" : "Pedirlo igual y que me contacten"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No te compromete a nada ni te pedimos pagar ahora.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({
  etiqueta, valor, onChange, type = "text", ...rest
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  // `htmlFor` + `id`: tocar la etiqueta enfoca el campo y el lector de
  // pantalla sabe qué se pide. `autoComplete` deja que el teléfono complete
  // nombre, teléfono y mail de un toque — son tres campos menos que tipear.
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {etiqueta}
      </label>
      <input
        {...rest}
        id={id}
        type={type}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-white px-3 py-2.5 text-base sm:text-sm",
          "outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15",
        )}
      />
    </div>
  );
}
