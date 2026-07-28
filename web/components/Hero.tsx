"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { whatsappLinkCABA, WHATSAPP_GENERAL } from "@/lib/constants";
import {
  MapPin, ChevronDown, CalendarDays, Check, ShieldCheck, MessageCircle,
} from "lucide-react";
import { trackLeadEvent } from "@/lib/meta-pixel";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 === 0 ? "00" : "30"}`;
});

const LUGARES = [
  "Paraguay 241 Bahía Blanca",
  "Alsina 350 Bahía Blanca",
  "Aeropuerto Comandante Espora Bahía Blanca",
  "Capital Federal, Juan Francisco Segui 3607",
];

const PASOS = ["Elegí fechas", "Elegí tu vehículo", "Sumá extras", "Reservá"];

/**
 * El Hero.
 *
 * **Se rediseñó para que se entienda en un segundo que acá se reserva online.**
 * Antes el botón principal decía "Reservar por WhatsApp" —o sea, exactamente lo
 * contrario— y el buscador quedaba apretado contra el borde inferior, donde se
 * lee como un accesorio.
 *
 * Ahora el buscador **es** el héroe: ocupa su propia columna, elevado y en
 * blanco sobre el fondo oscuro, que es el mayor contraste de la pantalla. El
 * texto lo acompaña, no compite. WhatsApp pasa a ser la salida secundaria, para
 * el que prefiere hablar con alguien.
 */
const Hero = () => {
  const router = useRouter();
  const [lugarEntrega, setLugarEntrega] = useState("");
  const [devolverOtroLugar, setDevolverOtroLugar] = useState(false);
  const [lugarDevolucion, setLugarDevolucion] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState<Date>();
  const [horaEntrega, setHoraEntrega] = useState("10:00");
  const [fechaDevolucion, setFechaDevolucion] = useState<Date>();
  const [horaDevolucion, setHoraDevolucion] = useState("10:00");

  /**
   * El buscador es el paso 1 de la reserva. **No valida nada acá**: si falta
   * un dato, el paso 1 se lo pide con el mismo calendario. Frenar con un
   * `alert()` a alguien que recién llegó es la peor manera de recibirlo.
   *
   * Capital Federal sigue yendo por WhatsApp (D-39): el flujo online es sólo
   * Bahía Blanca hasta resolver si la flota de CABA es la misma.
   */
  const handleBuscar = () => {
    trackLeadEvent();

    if (lugarEntrega === "Capital Federal, Juan Francisco Segui 3607") {
      const f = (d?: Date) => (d ? format(d, "dd/MM/yyyy") : "No especificada");
      window.open(
        whatsappLinkCABA(
          `Hola! Quiero cotizar un alquiler en Capital Federal.\n` +
          `*Retiro:* ${f(fechaEntrega)} ${horaEntrega}\n` +
          `*Devolución:* ${f(fechaDevolucion)} ${horaDevolucion}`,
        ),
        "_blank",
      );
      return;
    }

    const params = new URLSearchParams();
    if (lugarEntrega) params.set("lugar", lugarEntrega);
    if (devolverOtroLugar && lugarDevolucion) params.set("devolucion", lugarDevolucion);
    if (fechaEntrega) params.set("desde", format(fechaEntrega, "yyyy-MM-dd"));
    if (fechaDevolucion) params.set("hasta", format(fechaDevolucion, "yyyy-MM-dd"));
    params.set("hora_desde", horaEntrega);
    params.set("hora_hasta", horaDevolucion);
    router.push(`/reservar?${params.toString()}`);
  };

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden pb-16 pt-32 lg:pb-20 lg:pt-36">
      {/* Foto de fondo */}
      <Image
        src="https://images.pexels.com/photos/34775710/pexels-photo-34775710.jpeg?auto=compress&cs=tinysrgb&w=1920"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Un solo degradé, de oscuro a menos oscuro. El buscador blanco es lo
          único que tiene que llamar la atención: cualquier textura detrás le
          compite. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(13,30,53,0.93) 0%, rgba(19,45,79,0.85) 42%, rgba(27,63,107,0.60) 100%)",
        }}
      />

      <div className="container relative z-10 px-4">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)] lg:gap-14">
          {/* ── Columna izquierda: el mensaje ── */}
          <div className="order-2 lg:order-1">
            {/* Una línea sobria en lugar de una píldora: dice lo mismo y no
                compite con el titular. */}
            <p
              className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7FB3E8] opacity-0 animate-fade-up"
              style={{ animationDelay: "0.08s" }}
            >
              Reservá online
            </p>

            <h1
              className="text-[2.2rem] font-bold leading-[1.08] tracking-tight text-white opacity-0 animate-fade-up sm:text-[3rem] lg:text-[3.5rem]"
              style={{ animationDelay: "0.14s" }}
            >
              Alquiler de vehículos
              <br />
              en Bahía Blanca
            </h1>

            <p
              className="mt-6 max-w-md text-base leading-relaxed text-white/75 opacity-0 animate-fade-up md:text-lg"
              style={{ animationDelay: "0.2s" }}
            >
              Consultá disponibilidad, mirá el precio final y reservá tu vehículo
              en cuatro pasos.
            </p>

            {/* Los cuatro pasos, como una línea de texto sobria: hace visible
                que hay un sistema detrás sin convertirse en un gráfico. */}
            <div
              className="mt-8 border-t border-white/15 pt-6 opacity-0 animate-fade-up"
              style={{ animationDelay: "0.28s" }}
            >
              <ol className="flex flex-wrap gap-x-7 gap-y-2.5">
                {PASOS.map((paso, i) => (
                  <li key={paso} className="text-sm text-white/70">
                    <span className="mr-1.5 font-semibold text-white/40 tabular-nums">
                      0{i + 1}
                    </span>
                    {paso}
                  </li>
                ))}
              </ol>

              <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-2 text-sm text-white/60">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#7FB3E8]" /> Kilometraje libre
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#7FB3E8]" /> Seguro incluido
                </li>
              </ul>
            </div>

          </div>

          {/* ── Columna derecha: el buscador ── */}
          <div
            className="order-1 opacity-0 animate-fade-up lg:order-2"
            style={{ animationDelay: "0.12s" }}
          >
            <div className="rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5 md:p-6">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-[#1B3F6B] md:text-2xl">
                  Reservá tu vehículo
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Elegí dónde y cuándo. Te mostramos todo lo disponible con su precio.
                </p>
              </div>

              <div className="space-y-4">
                {/* Lugar */}
                <div>
                  <label
                    htmlFor="hero-lugar"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Lugar de retiro
                  </label>
                  <div className="relative">
                    <select
                      id="hero-lugar"
                      value={lugarEntrega}
                      onChange={(e) => setLugarEntrega(e.target.value)}
                      className="h-[52px] w-full cursor-pointer appearance-none truncate rounded-lg border border-border bg-white pl-11 pr-9 text-base font-semibold text-[#1B3F6B] outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
                    >
                      <option value="">Elegí una ubicación</option>
                      {LUGARES.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {/* Fechas */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoFecha
                    etiqueta="Retiro"
                    fecha={fechaEntrega}
                    hora={horaEntrega}
                    onFecha={setFechaEntrega}
                    onHora={setHoraEntrega}
                    desde={new Date()}
                  />
                  <CampoFecha
                    etiqueta="Devolución"
                    fecha={fechaDevolucion}
                    hora={horaDevolucion}
                    onFecha={setFechaDevolucion}
                    onHora={setHoraDevolucion}
                    desde={fechaEntrega ?? new Date()}
                  />
                </div>

                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={devolverOtroLugar}
                    onCheckedChange={(c) => setDevolverOtroLugar(c === true)}
                  />
                  Devolver en otro lugar
                </label>

                {devolverOtroLugar && (
                  <select
                    aria-label="Lugar de devolución"
                    value={lugarDevolucion}
                    onChange={(e) => setLugarDevolucion(e.target.value)}
                    className="h-[52px] w-full cursor-pointer appearance-none rounded-lg border border-border bg-white px-3.5 text-base font-semibold text-[#1B3F6B] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                  >
                    <option value="">Lugar de devolución</option>
                    {LUGARES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                )}

                <Button
                  onClick={handleBuscar}
                  className="h-[54px] w-full text-base font-bold uppercase tracking-wide"
                >
                  Ver vehículos disponibles
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Ver los precios no te compromete a nada.
                </p>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <a
                  href={WHATSAPP_GENERAL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackLeadEvent()}
                  className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  <MessageCircle className="h-4 w-4" />
                  ¿Preferís hablar con alguien? Escribinos por WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function CampoFecha({
  etiqueta, fecha, hora, onFecha, onHora, desde,
}: {
  etiqueta: string;
  fecha?: Date;
  hora: string;
  onFecha: (d?: Date) => void;
  onHora: (h: string) => void;
  desde: Date;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-[52px] flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 text-left text-sm font-semibold outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15",
                fecha ? "text-[#1B3F6B]" : "text-muted-foreground",
              )}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">
                {fecha ? format(fecha, "d MMM", { locale: es }) : "Fecha"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fecha}
              onSelect={onFecha}
              disabled={{ before: desde }}
              locale={es}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <div className="relative w-[92px] shrink-0">
          <select
            aria-label={`Hora de ${etiqueta.toLowerCase()}`}
            value={hora}
            onChange={(e) => onHora(e.target.value)}
            className="h-[52px] w-full cursor-pointer appearance-none rounded-lg border border-border bg-white pl-3 pr-7 text-sm font-semibold text-[#1B3F6B] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            {TIME_OPTIONS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

export default Hero;
