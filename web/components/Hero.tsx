"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { WHATSAPP_GENERAL } from "@/lib/constants";
import {
  MapPin, ChevronDown, CalendarDays, Check, ShieldCheck, MessageCircle, UserRound,
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
];

const PASOS = ["Elegí fechas", "Elegí tu vehículo", "Sumá extras", "Reservá"];

// 17 a 80, y un 81 que representa "más de 80": arriba de esa edad ninguna
// franja de recargo distingue, así que pedir el número exacto no cambia el
// precio y sí alarga la lista.
const EDADES = Array.from({ length: 65 }, (_, i) => i + 17);

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
  const [edad, setEdad] = useState("");
  const [faltaEdad, setFaltaEdad] = useState(false);

  /**
   * Recupera lo que ya venía elegido cuando `/reservar` rebota para acá por
   * falta de la fecha de nacimiento. Se lee de `window.location` y no con
   * `useSearchParams` a propósito: ese hook obliga a envolver la portada en un
   * `Suspense` y la saca del renderizado estático, y esto es un caso de borde
   * que no justifica pagar eso en la página principal.
   */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (![...p.keys()].length) return;

    const lugar = p.get("lugar");
    const devolucion = p.get("devolucion");
    const desde = p.get("desde");
    const hasta = p.get("hasta");

    if (lugar) setLugarEntrega(lugar);
    if (devolucion) {
      setDevolverOtroLugar(true);
      setLugarDevolucion(devolucion);
    }
    if (desde) setFechaEntrega(new Date(`${desde}T12:00:00`));
    if (hasta) setFechaDevolucion(new Date(`${hasta}T12:00:00`));
    if (p.get("hora_desde")) setHoraEntrega(p.get("hora_desde")!);
    if (p.get("hora_hasta")) setHoraDevolucion(p.get("hora_hasta")!);
  }, []);

  /**
   * El buscador es el paso 1 de la reserva. **No valida nada acá**: si falta
   * un dato, el paso 1 se lo pide con el mismo calendario. Frenar con un
   * `alert()` a alguien que recién llegó es la peor manera de recibirlo.
   *
   * Ya no hay desvío a WhatsApp por Capital Federal: la operación es Bahía
   * Blanca y la zona, así que los tres puntos de retiro van por el flujo
   * online. El contacto de CABA queda en la sección de Contacto, que es un
   * canal de consulta y no un lugar donde se retira un auto.
   *
   * **La edad es el único campo obligatorio acá**, y es a propósito: es el
   * dato que falta para que el precio del paso 1 sea el definitivo. Sin él
   * habría que cotizar dos veces y corregir el número después de que el
   * cliente eligió.
   *
   * Se pide la edad y no la fecha de nacimiento: en la portada todavía no hay
   * un cliente, hay alguien mirando precios. Un campo de documento de
   * identidad en el primer formulario es fricción pura. La fecha exacta se
   * carga en el paso 3, que es donde ya hay una reserva en juego.
   */
  const handleBuscar = () => {
    if (!edad) {
      setFaltaEdad(true);
      document.getElementById("hero-edad")?.focus();
      return;
    }

    trackLeadEvent();

    const params = new URLSearchParams();
    if (lugarEntrega) params.set("lugar", lugarEntrega);
    if (devolverOtroLugar && lugarDevolucion) params.set("devolucion", lugarDevolucion);
    if (fechaEntrega) params.set("desde", format(fechaEntrega, "yyyy-MM-dd"));
    if (fechaDevolucion) params.set("hasta", format(fechaDevolucion, "yyyy-MM-dd"));
    params.set("hora_desde", horaEntrega);
    params.set("hora_hasta", horaDevolucion);
    params.set("edad", edad);
    router.push(`/reservar?${params.toString()}`);
  };

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden pb-16 pt-32 lg:pb-20 lg:pt-36">
      {/* Foto de fondo. El encuadre se corre a la derecha (65%) para que el
          auto y las luces no queden cortados en pantallas angostas. */}
      <Image
        src="/img/hero.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[65%_center]"
      />
      {/* El velo es **neutro, no azul**: la foto es un atardecer y el degradé
          corporativo que había antes le apagaba el naranja hasta dejarla gris.
          Arranca casi opaco donde va el titular y se abre hacia la derecha,
          que es donde está la luz de la foto. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(8,15,26,0.92) 0%, rgba(11,20,34,0.80) 40%, rgba(16,26,42,0.38) 100%)",
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
              Reservá online, a cualquier hora
            </p>

            {/* El titular es "alquiler de vehículos en Bahía Blanca" y nada
                más: es la búsqueda por la que entra la gente y el h1 de la
                portada. */}
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
              Elegí las fechas, mirá el precio final con el seguro incluido y
              reservá. Cuatro pasos y el auto queda a tu nombre — sin llamar a
              nadie ni esperar respuesta.
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

                {/* Va acá y no en el paso 3 para que la grilla de precios
                    salga bien la primera vez. Es un desplegable y no un campo
                    numérico: no admite un tipeo de más —un "2" en lugar de un
                    "25" cotiza cualquier cosa— y no abre el teclado en el
                    teléfono. Arranca en 17, que es la edad a la que ya se
                    puede tener licencia: D-38 no fija un mínimo, así que la
                    lista tampoco puede inventar uno. */}
                <div>
                  <label
                    htmlFor="hero-edad"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Edad del responsable
                  </label>
                  <div className="relative">
                    <select
                      id="hero-edad"
                      value={edad}
                      onChange={(e) => {
                        setEdad(e.target.value);
                        if (e.target.value) setFaltaEdad(false);
                      }}
                      aria-invalid={faltaEdad}
                      className={cn(
                        "h-[52px] w-full cursor-pointer appearance-none rounded-lg border bg-white pl-11 pr-9 text-base font-semibold text-[#1B3F6B] outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15",
                        faltaEdad ? "border-destructive" : "border-border",
                      )}
                    >
                      <option value="">Elegí la edad</option>
                      {EDADES.map((e) => (
                        <option key={e} value={e}>
                          {e === 81 ? "Más de 80 años" : `${e} años`}
                        </option>
                      ))}
                    </select>
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  {faltaEdad && (
                    <p className="mt-1.5 text-xs font-medium text-destructive">
                      Necesitamos la edad de quien va a alquilar.
                    </p>
                  )}
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

                {/* El plazo se avisa acá, antes de elegir la fecha. Que el
                    formulario te rechace el retiro recién al validar es la
                    peor forma de enterarse de una regla del negocio. */}
                <p className="text-center text-xs text-muted-foreground">
                  Las reservas online se toman con <strong>72 horas</strong> de
                  anticipación. Ver los precios no te compromete a nada.
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
