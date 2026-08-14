"use client";

import { useId, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { nombreLugar } from "@/lib/lugares";
import { es } from "date-fns/locale";
import { MapPin, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { textoPlazo } from "@/lib/api";

export const HORAS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 === 0 ? "00" : "30"}`;
});

export interface RangoBusqueda {
  lugarRetiro: string;
  lugarDevolucion: string;
  fechaInicio: string;
  horaInicio: string;
  fechaFin: string;
  horaFin: string;
  /**
   * D-61: lo que la persona tipeó al elegir "Otro lugar" en el Hero.
   *
   * **Campo aparte y no pegado adentro de `lugarRetiro`.** Meterlo ahí
   * (`"A coordinar: Camino La Carrindanga"`) es exactamente lo que D-56 tuvo
   * que sacar, porque desde `lugarRetiro` se filtraba solo a
   * `reservas.lugar_entrega` y quedaba como si fuera un punto real de la
   * empresa. Separado, se puede mostrar y mandar por WhatsApp sin que llegue
   * nunca a ser el lugar de una reserva.
   */
  lugarRetiroOtro?: string;
  lugarDevolucionOtro?: string;
}

interface Props {
  valor: RangoBusqueda;
  lugares: string[];
  anticipacionHoras: number;
  /** D-52: los mismos bordes que valida el backend, ahora también en el
   *  propio calendario — antes sólo se avisaban después de elegir una fecha
   *  inválida (checklist §3.1, puntos 30/31). `undefined` = sin tope. */
  horizonteMaximoDias?: number;
  duracionMaximaDias?: number;
  onBuscar: (rango: RangoBusqueda) => void;
  compacto?: boolean;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const desdeIso = (s: string) => (s ? new Date(`${s}T00:00:00`) : undefined);

/**
 * El buscador de fechas y lugares.
 *
 * Es el mismo bloque que el Hero de la portada, para que el cliente sienta que
 * el formulario "viajó" con él y no que empezó de cero. En `compacto` se
 * colapsa a una línea con un botón "cambiar": una vez elegidas las fechas, lo
 * que importa es la grilla de autos, no el formulario.
 */
export function BuscadorRango({
  valor, lugares, anticipacionHoras, horizonteMaximoDias, duracionMaximaDias,
  onBuscar, compacto = false,
}: Props) {
  const idRetiro = useId();
  const idDevolucion = useId();
  const [abierto, setAbierto] = useState(!compacto);
  const [form, setForm] = useState<RangoBusqueda>(valor);
  const [devolverEnOtro, setDevolverEnOtro] = useState(
    valor.lugarDevolucion !== "" && valor.lugarDevolucion !== valor.lugarRetiro,
  );
  const [error, setError] = useState<string | null>(null);

  // Los mismos tres bordes que valida `/public/disponibilidad` (D-52).
  //
  // D-60: el de abajo **ya no se deshabilita**. Si la portada deja elegir un
  // día de los próximos {anticipacion} y acá no, el que toca "Cambiar" se topa
  // con la puerta cerrada justo después de que le dijimos que se podía. Se
  // puede elegir, y el cartel de derivación de `Paso1Vehiculo` —que hasta hoy
  // era inalcanzable— lo manda a WhatsApp con todo cargado.
  const minRetiro = startOfDay(new Date());
  const maxRetiro = horizonteMaximoDias ? addDays(new Date(), horizonteMaximoDias) : undefined;
  const inicioElegido = desdeIso(form.fechaInicio);
  const maxDevolucion =
    duracionMaximaDias && inicioElegido ? addDays(inicioElegido, duracionMaximaDias) : undefined;

  const set = <K extends keyof RangoBusqueda>(k: K, v: RangoBusqueda[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.lugarRetiro) return setError("Elegí dónde retirás el vehículo.");
    if (!form.fechaInicio || !form.fechaFin) return setError("Elegí las fechas de retiro y devolución.");
    if (form.fechaFin <= form.fechaInicio)
      return setError("La devolución tiene que ser posterior al retiro.");

    setError(null);
    onBuscar({
      ...form,
      lugarDevolucion: devolverEnOtro ? form.lugarDevolucion : form.lugarRetiro,
    });
    if (compacto) setAbierto(false);
  };

  if (compacto && !abierto) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0 text-sm">
          {/* Nunca el centinela: `__otro__` llegó a verse en pantalla. */}
          <p className="truncate font-semibold text-[#1B3F6B]">
            {nombreLugar(valor.lugarRetiro, valor.lugarRetiroOtro)}
          </p>
          <p className="text-muted-foreground">
            {valor.fechaInicio && format(desdeIso(valor.fechaInicio)!, "d MMM", { locale: es })}{" "}
            {valor.horaInicio} → {valor.fechaFin && format(desdeIso(valor.fechaFin)!, "d MMM", { locale: es })}{" "}
            {valor.horaFin}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm md:p-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {/* Lugar de retiro */}
        <div className="lg:col-span-2">
          <label htmlFor={idRetiro} className="mb-1 block text-xs font-medium text-muted-foreground">
            Lugar de retiro
          </label>
          <div className="relative">
            <select
              id={idRetiro}
              value={form.lugarRetiro}
              onChange={(e) => set("lugarRetiro", e.target.value)}
              className="w-full appearance-none truncate rounded-md border border-border bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-[#1B3F6B] outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Seleccioná una ubicación</option>
              {lugares.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <MapPin className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <CampoFechaHora
          className="lg:col-span-2"
          etiqueta="Retiro"
          fecha={form.fechaInicio}
          hora={form.horaInicio}
          onFecha={(v) => set("fechaInicio", v)}
          onHora={(v) => set("horaInicio", v)}
          desde={minRetiro}
          hasta={maxRetiro}
        />
        <CampoFechaHora
          className="lg:col-span-2"
          etiqueta="Devolución"
          fecha={form.fechaFin}
          hora={form.horaFin}
          onFecha={(v) => set("fechaFin", v)}
          onHora={(v) => set("horaFin", v)}
          desde={inicioElegido ?? minRetiro}
          hasta={maxDevolucion}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={devolverEnOtro}
            onCheckedChange={(c) => setDevolverEnOtro(c === true)}
          />
          Devolver en otro lugar
        </label>

        {devolverEnOtro && (
          <div className="min-w-[220px] flex-1">
            <select
              id={idDevolucion}
              aria-label="Lugar de devolución"
              value={form.lugarDevolucion}
              onChange={(e) => set("lugarDevolucion", e.target.value)}
              className="w-full appearance-none rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-[#1B3F6B] outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Lugar de devolución</option>
              {lugares.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

        <Button onClick={submit} className="ml-auto w-full sm:w-auto">
          Ver vehículos disponibles
        </Button>
      </div>

      {/* Lo pidió explícitamente el negocio: los puntos de retiro y devolución
          se coordinan, no están garantizados por el solo hecho de elegirlos. */}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Los lugares y horarios de retiro y devolución están sujetos a
          disponibilidad. Te confirmamos el punto exacto al reservar. Reservás
          online desde {textoPlazo(anticipacionHoras / 24)} de anticipación
          {horizonteMaximoDias
            ? ` y hasta ${textoPlazo(horizonteMaximoDias, true)} adelante`
            : ""}
          ; fuera de eso lo coordina un agente por WhatsApp.
        </span>
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}

function CampoFechaHora({
  etiqueta, fecha, hora, onFecha, onHora, desde, hasta, className,
}: {
  etiqueta: string;
  fecha: string;
  hora: string;
  onFecha: (v: string) => void;
  onHora: (v: string) => void;
  desde: Date;
  /** Tope superior — horizonte de venta o duración máxima. Sin tope si se omite. */
  hasta?: Date;
  className?: string;
}) {
  const seleccionada = desdeIso(fecha);
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {etiqueta}
      </label>
      <div className="flex items-stretch gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md border border-border bg-white px-3 py-2.5 text-left text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30",
                seleccionada ? "text-[#1B3F6B]" : "text-muted-foreground",
              )}
            >
              {seleccionada
                ? format(seleccionada, "d MMM yyyy", { locale: es })
                : "Elegí la fecha"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={seleccionada}
              onSelect={(d) => d && onFecha(iso(d))}
              disabled={hasta ? [{ before: desde }, { after: hasta }] : { before: desde }}
              locale={es}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <div className="relative w-[86px] shrink-0">
          <select
            value={hora}
            onChange={(e) => onHora(e.target.value)}
            className="h-full w-full appearance-none rounded-md border border-border bg-white pl-2.5 pr-6 text-sm font-semibold text-[#1B3F6B] outline-none focus:ring-2 focus:ring-primary/30"
          >
            {HORAS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
