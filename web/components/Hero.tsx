"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { whatsappLinkCABA, WHATSAPP_GENERAL } from "@/lib/constants";
import {
  MapPin, ChevronDown, CalendarDays, Check, ShieldCheck, Zap, MessageCircle,
} from "lucide-react";
import { trackLeadEvent } from "@/lib/meta-pixel";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { HeroFondo } from "@/components/HeroFondo";

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
    <section className="relative flex min-h-screen items-center overflow-hidden pb-16 pt-28 lg:pb-20 lg:pt-32">
      {/* Foto de fondo */}
      <Image
        src="https://images.pexels.com/photos/34775710/pexels-photo-34775710.jpeg?auto=compress&cs=tinysrgb&w=1920"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* La capa es bastante más oscura que antes: el buscador blanco necesita
          contraste real para leerse como el elemento principal. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(13,32,56,0.94) 0%, rgba(20,48,84,0.86) 38%, rgba(27,63,107,0.62) 70%, rgba(40,84,133,0.45) 100%)",
        }}
      />
      <HeroFondo />

      <div className="container relative z-10 px-4">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)] lg:gap-14">
          {/* ── Columna izquierda: el mensaje ── */}
          <div className="order-2 lg:order-1">
            <div className="mb-7 opacity-0 animate-fade-up">
              <Image
                src="/img/logo.png"
                alt="Ubicar Rent"
                width={190}
                height={62}
                priority
                className="h-auto w-[150px] brightness-0 invert md:w-[185px]"
              />
            </div>

            {/* Lo primero que se lee: acá se reserva online. */}
            <span
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-white opacity-0 animate-fade-up backdrop-blur-sm md:text-sm"
              style={{ animationDelay: "0.08s" }}
            >
              <Zap className="h-3.5 w-3.5" />
              Reservá online en 4 pasos
            </span>

            <h1
              className="text-[2.1rem] font-bold leading-[1.06] text-white opacity-0 animate-fade-up sm:text-5xl lg:text-[3.4rem]"
              style={{ animationDelay: "0.15s" }}
            >
              Alquiler de vehículos
              <br />
              en Bahía Blanca
            </h1>

            <p
              className="mt-5 max-w-lg text-base text-white/80 opacity-0 animate-fade-up md:text-lg"
              style={{ animationDelay: "0.22s" }}
            >
              Mirá qué autos hay disponibles con su precio final y reservá el
              tuyo ahora. Sin llamar, sin esperar respuesta.
            </p>

            {/* Los 4 pasos: hace visible que hay un sistema detrás */}
            <ol
              className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-2 opacity-0 animate-fade-up"
              style={{ animationDelay: "0.3s" }}
            >
              {PASOS.map((paso, i) => (
                <li key={paso} className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-white/85">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    {paso}
                  </span>
                  {i < PASOS.length - 1 && (
                    <span className="hidden h-px w-4 bg-white/25 sm:block" />
                  )}
                </li>
              ))}
            </ol>

            <ul
              className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70 opacity-0 animate-fade-up"
              style={{ animationDelay: "0.38s" }}
            >
              <li className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[#7FB3E8]" /> Kilometraje libre
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#7FB3E8]" /> Seguro incluido
              </li>
            </ul>

            {/* La dirección, pedida explícitamente */}
            <address
              className="mt-7 flex items-start gap-2 text-sm not-italic text-white/65 opacity-0 animate-fade-up"
              style={{ animationDelay: "0.45s" }}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#7FB3E8]" />
              <span>
                <strong className="font-semibold text-white/85">Paraguay 241</strong>
                {" · "}Alsina 350{" · "}Aeropuerto Comandante Espora
                <br />
                Bahía Blanca, Provincia de Buenos Aires
              </span>
            </address>
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
