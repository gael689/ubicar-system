"use client";

import { useId } from "react";
import { UserRound, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { DatosCliente } from "@/lib/types";

interface Props {
  datos: DatosCliente;
  errores: Partial<Record<keyof DatosCliente, string>>;
  onCambiar: (datos: DatosCliente) => void;
}

/**
 * Datos del conductor.
 *
 * **Se pide lo mínimo, y en el momento de mayor fricción del flujo.** Cada
 * campo extra acá baja la conversión, así que el resto (número de licencia,
 * domicilio) se completa al retirar el auto.
 *
 * La **fecha de nacimiento** sigue siendo obligatoria acá, pero ya no es la
 * que fija el precio de entrada: eso lo resuelve la edad declarada en el Hero,
 * así que para cuando el cliente llega a esta pantalla el total ya es el que
 * vio en la grilla. Esta fecha es el dato exacto —el que va al contrato— y
 * **manda sobre la declarada** si no coinciden.
 *
 * Todos los datos de esta pantalla son los del **titular**, que es quien firma
 * y quien responde por el vehículo. No hay un "otro conductor" que completar.
 */
export function Paso3Datos({ datos, errores, onCambiar }: Props) {
  const set = <K extends keyof DatosCliente>(k: K, v: DatosCliente[K]) =>
    onCambiar({ ...datos, [k]: v });

  const esConsumidorFinal = datos.condicionIva === "consumidor_final";
  const idCondicion = useId();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2.5">
        <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold text-[#1B3F6B]">Tus datos</h2>
          <p className="text-sm text-muted-foreground">
            Sólo lo necesario para reservar. El resto lo completamos al entregarte el vehículo.
          </p>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-white p-5 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          valor={datos.nombre}
          error={errores.nombre}
          onChange={(v) => set("nombre", v)}
          autoComplete="given-name"
        />
        <Campo
          etiqueta="Apellido"
          valor={datos.apellido}
          error={errores.apellido}
          onChange={(v) => set("apellido", v)}
          autoComplete="family-name"
        />
        <Campo
          etiqueta={esConsumidorFinal ? "DNI" : "CUIT"}
          valor={datos.dni}
          error={errores.dni}
          onChange={(v) => set("dni", v)}
          inputMode="numeric"
        />
        <Campo
          etiqueta="Teléfono"
          valor={datos.telefono}
          error={errores.telefono}
          onChange={(v) => set("telefono", v)}
          type="tel"
          autoComplete="tel"
          ayuda="Para coordinar la entrega"
        />
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Email"
            valor={datos.email}
            error={errores.email}
            onChange={(v) => set("email", v)}
            type="email"
            autoComplete="email"
            ayuda="Te mandamos la confirmación acá"
          />
        </div>
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Fecha de nacimiento"
            valor={datos.fechaNacimiento}
            error={errores.fechaNacimiento}
            onChange={(v) => set("fechaNacimiento", v)}
            type="date"
          />
        </div>

        {/* Condición fiscal. Arranca en consumidor final, que es la enorme
            mayoría: quien no lo es, lo sabe y lo busca. El CUIT y la razón
            social aparecen recién al elegir otra cosa — pedírselos a alguien
            que alquila para irse de vacaciones es fricción sin retorno. */}
        <div className="sm:col-span-2">
          <label
            htmlFor={idCondicion}
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Condición frente al IVA
          </label>
          <select
            id={idCondicion}
            value={datos.condicionIva}
            onChange={(e) =>
              onCambiar({
                ...datos,
                condicionIva: e.target.value as DatosCliente["condicionIva"],
                // Volver a consumidor final limpia la razón social: dejarla
                // colgada mandaría al backend una empresa que el cliente ya
                // dijo que no era.
                razonSocial:
                  e.target.value === "consumidor_final" ? "" : datos.razonSocial,
              })
            }
            className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="consumidor_final">Consumidor final</option>
            <option value="responsable_inscripto">Responsable inscripto</option>
            <option value="monotributo">Monotributo</option>
            <option value="exento">Exento</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            El precio es el mismo en todos los casos. Nos sirve para el comprobante.
          </p>
        </div>

        {!esConsumidorFinal && (
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Razón social"
              valor={datos.razonSocial}
              error={errores.razonSocial}
              onChange={(v) => set("razonSocial", v)}
              ayuda="Como figura en ARCA"
            />
          </div>
        )}
      </div>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-4 transition-colors",
          errores.aceptaTerminos ? "border-destructive" : "border-border",
        )}
      >
        <Checkbox
          checked={datos.aceptaTerminos}
          onCheckedChange={(c) => set("aceptaTerminos", c === true)}
          className="mt-0.5"
        />
        <span className="text-sm text-muted-foreground">
          Acepto los{" "}
          <a href="/terminos" target="_blank" className="font-medium text-primary underline underline-offset-2">
            términos y condiciones
          </a>{" "}
          y la{" "}
          <a href="/privacidad" target="_blank" className="font-medium text-primary underline underline-offset-2">
            política de privacidad
          </a>
          , incluida la política de cancelación.
        </span>
      </label>
      {errores.aceptaTerminos && (
        <p className="-mt-4 text-sm text-destructive">{errores.aceptaTerminos}</p>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Para retirar el vehículo vas a necesitar tu DNI, licencia de conducir
          vigente y una tarjeta de crédito a tu nombre para la garantía.
        </span>
      </p>
    </div>
  );
}

function Campo({
  etiqueta, valor, error, onChange, ayuda, type = "text", ...rest
}: {
  etiqueta: string;
  valor: string;
  error?: string;
  onChange: (v: string) => void;
  ayuda?: string;
  type?: string;
  // Se omite `onChange` del tipo nativo: acá el handler recibe el valor ya
  // desenvuelto, no el evento.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  // `useId` asocia label e input de verdad: sin `htmlFor`, tocar la etiqueta
  // no enfoca el campo y un lector de pantalla no sabe qué se está pidiendo.
  const id = useId();
  const idAyuda = `${id}-ayuda`;

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
        aria-invalid={Boolean(error)}
        aria-describedby={error || ayuda ? idAyuda : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30",
          error ? "border-destructive" : "border-border",
        )}
      />
      {error ? (
        <p id={idAyuda} className="mt-1 text-xs text-destructive">{error}</p>
      ) : ayuda ? (
        <p id={idAyuda} className="mt-1 text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  );
}
