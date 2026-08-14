"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { WHATSAPP_GENERAL } from "@/lib/constants";
import {
  MapPin, ChevronDown, CalendarDays, Check, ShieldCheck, MessageCircle, UserRound,
} from "lucide-react";
import { intencionDeReserva, contactoIniciado } from "@/lib/analitica";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { addDays, format, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { api, textoPlazo } from "@/lib/api";
import type { ConfigPublica } from "@/lib/types";
import { motivoVentanaVenta } from "@/lib/ventanaVenta";
import { LUGAR_OTRO } from "@/lib/lugares";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 === 0 ? "00" : "30"}`;
});

// El valor que dispara el campo libre. No es un lugar: es un pedido.
// Vive en `@/lib/lugares` desde D-61, porque el flujo y el buscador también
// lo necesitan — tenerlo suelto acá era el primer paso a tres copias
// desalineadas, que es lo que D-56 tuvo que arreglar con los lugares.
const OTRO = LUGAR_OTRO;

const PASOS = ["Elegí fechas", "Elegí tu vehículo", "Sumá extras", "Reservá"];

// D-53 (13/08): 21 es el mínimo para alquilar (`alquiler.edad_minima`, hoy
// fijo en 21 vía configuración) — por debajo de eso el backend rechaza la
// reserva, así que no tiene sentido ofrecerlo en la lista. Sube hasta 80, y
// un 81 que representa "más de 80": arriba de esa edad ninguna franja de
// recargo distingue, así que pedir el número exacto no cambia el precio y sí
// alarga la lista.
const EDADES = Array.from({ length: 61 }, (_, i) => i + 21);

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
  const [otroRetiro, setOtroRetiro] = useState("");
  const [otraDevolucion, setOtraDevolucion] = useState("");
  const [edad, setEdad] = useState("");
  const [faltaEdad, setFaltaEdad] = useState(false);
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  // D-56: "Otro lugar" ya no entra al flujo con "A coordinar: ..." pegado al
  // lugar — deriva directo, mismo patrón que sin cupo y la ventana de fechas.

  // D-56: los lugares y los bordes de la ventana salen de `/public/config`,
  // no de una lista propia — la portada tenía su propia copia con "Bahía
  // Blanca" pegado al nombre, desalineada con la del flujo (§7).
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);
  const lugares = config?.lugares_retiro ?? [];

  /**
   * D-60: el calendario ya **no** deshabilita los días de la ventana chica —
   * sólo el pasado. Antes `disabled={{ before: minFecha }}` hacía que los
   * próximos {anticipacion} fueran literalmente intocables, y el caso
   * `anticipacion` del cartel de derivación era código inalcanzable: nadie
   * podía llegar a dispararlo desde la portada.
   *
   * Ahora se puede elegir cualquier día futuro; si cae adentro de la ventana,
   * el cuestionario se reemplaza por el cartel que deriva a WhatsApp. El borde
   * de arriba (horizonte) sí se sigue deshabilitando: desbloquearlo obligaría
   * a navegar meses sin ganancia — la demanda a más de {horizonte} es marginal
   * y la de menos de {anticipacion} es diaria.
   */
  const minCalendario = startOfDay(new Date());
  /** El borde real de la venta online. Ya no deshabilita nada: sólo pinta en
   *  ámbar los días que van a derivar, y alimenta el chequeo de abajo. */
  const minVenta = config
    ? new Date(Date.now() + config.anticipacion_minima_horas * 3_600_000)
    : undefined;
  const maxFecha = config?.horizonte_maximo_dias
    ? addDays(new Date(), config.horizonte_maximo_dias)
    : undefined;

  const limitesVentana = useMemo(
    () => ({
      anticipacionHoras: config?.anticipacion_minima_horas ?? 240,
      horizonteMaximoDias: config?.horizonte_maximo_dias,
      duracionMaximaDias: config?.duracion_maxima_dias,
    }),
    [config],
  );

  /**
   * Derivado, no un `setState` adentro de un efecto: así no parpadea mientras
   * `/public/config` viaja (sin config es `null` y no se muestra nada) y el
   * cartel desaparece solo apenas la fecha vuelve a entrar en la ventana.
   */
  const motivoVentana = useMemo(
    () =>
      config
        ? motivoVentanaVenta(
            {
              fechaInicio: fechaEntrega ? format(fechaEntrega, "yyyy-MM-dd") : null,
              horaInicio: horaEntrega,
              fechaFin: fechaDevolucion ? format(fechaDevolucion, "yyyy-MM-dd") : null,
              horaFin: horaDevolucion,
            },
            limitesVentana,
          )
        : null,
    [config, limitesVentana, fechaEntrega, horaEntrega, fechaDevolucion, horaDevolucion],
  );


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

    // D-61: acá **ya no se frena nada**. Antes había dos `return` —uno por
    // "Otro lugar" (D-56) y otro por la ventana de fechas (D-60)— que abrían
    // un cartel y dejaban a la persona parada en la portada. La regla ahora es
    // que siempre se puede avanzar: el desvío existe igual, pero vive en el
    // paso 1, donde hay lugar para los tres canales de contacto y para el
    // formulario de "que me llamen ustedes".

    intencionDeReserva("hero:buscador");

    const retiro = lugarEntrega;
    const devolucion = lugarDevolucion;

    const params = new URLSearchParams();
    if (retiro) params.set("lugar", retiro);
    if (devolverOtroLugar && devolucion) params.set("devolucion", devolucion);
    // D-61: el texto libre viaja **en su propio parámetro**, no pegado adentro
    // de `lugar`. Meterlo ahí (`lugar=A coordinar: Camino...`) es exactamente
    // lo que D-56 tuvo que sacar, porque desde ahí se filtraba solo a
    // `reservas.lugar_entrega`. Separado, el flujo lo puede mostrar y mandar
    // por WhatsApp sin que nunca llegue a ser el lugar de una reserva.
    if (lugarEntrega === OTRO && otroRetiro.trim()) {
      params.set("retiro_otro", otroRetiro.trim());
    }
    if (devolverOtroLugar && lugarDevolucion === OTRO && otraDevolucion.trim()) {
      params.set("devolucion_otro", otraDevolucion.trim());
    }
    if (fechaEntrega) params.set("desde", format(fechaEntrega, "yyyy-MM-dd"));
    if (fechaDevolucion) params.set("hasta", format(fechaDevolucion, "yyyy-MM-dd"));
    params.set("hora_desde", horaEntrega);
    params.set("hora_hasta", horaDevolucion);
    params.set("edad", edad);
    router.push(`/reservar?${params.toString()}`);
  };

  return (
    // El `id` es el destino de "Ver disponibilidad y precio" de la grilla de
    // vehículos: desde D-44 el buscador es el único lugar donde se pide la
    // edad, así que todo camino a cotizar tiene que pasar por acá.
    <section id="reservar" className="relative flex min-h-screen items-center overflow-hidden pb-16 pt-32 lg:pb-20 lg:pt-36">
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
                      {lugares.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                      <option value={OTRO}>Otro lugar (a coordinar)</option>
                    </select>
                    <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>

                  {lugarEntrega === OTRO && (
                    <div className="mt-2">
                      <input
                        value={otroRetiro}
                        onChange={(e) => setOtroRetiro(e.target.value)}
                        placeholder="¿Dónde querés retirarlo?"
                        className="h-[46px] w-full rounded-lg border border-border bg-white px-3.5 text-sm text-[#1B3F6B] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                      />
                      {/* D-56: ya no queda como un pedido pendiente dentro de
                          la reserva — al tocar "Ver vehículos disponibles" va
                          derecho a WhatsApp con esto ya cargado. */}
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Este punto lo coordina un vendedor por WhatsApp, puede
                        tener un costo extra.
                      </p>
                    </div>
                  )}
                </div>

                {/* Fechas */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoFecha
                    etiqueta="Retiro"
                    fecha={fechaEntrega}
                    hora={horaEntrega}
                    onFecha={setFechaEntrega}
                    onHora={setHoraEntrega}
                    desde={minCalendario}
                    hasta={maxFecha}
                    aCoordinarAntesDe={minVenta}
                  />
                  <CampoFecha
                    etiqueta="Devolución"
                    fecha={fechaDevolucion}
                    hora={horaDevolucion}
                    onFecha={setFechaDevolucion}
                    onHora={setHoraDevolucion}
                    desde={fechaEntrega ?? minCalendario}
                  />
                </div>

                {/* D-61: avisa, **no frena**. El calendario pinta esos días en
                    ámbar; sin esta línea el color no se explica. El panel
                    completo —los tres canales y el formulario— vive una sola
                    vez, en el paso 1: repetirlo acá sería decirle dos veces lo
                    mismo a alguien que ya lo escuchó. */}
                {motivoVentana === "anticipacion" && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Esas fechas las cierra un agente, no la web. Seguí igual y
                    te lo resolvemos en el paso siguiente.
                  </p>
                )}

                {/* Va acá y no en el paso 3 para que la grilla de precios
                    salga bien la primera vez. Es un desplegable y no un campo
                    numérico: no admite un tipeo de más —un "2" en lugar de un
                    "25" cotiza cualquier cosa— y no abre el teclado en el
                    teléfono. Arranca en 21 (D-53): por debajo de eso no se
                    puede alquilar, así que ya no tiene sentido ofrecerlo ni
                    mostrar el viejo recargo por "conductor joven". */}
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
                    {lugares.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                    <option value={OTRO}>Otro lugar (a coordinar)</option>
                  </select>
                )}

                {devolverOtroLugar && lugarDevolucion === OTRO && (
                  <div>
                    <input
                      value={otraDevolucion}
                      onChange={(e) => setOtraDevolucion(e.target.value)}
                      placeholder="¿Dónde querés devolverlo?"
                      className="h-[46px] w-full rounded-lg border border-border bg-white px-3.5 text-sm text-[#1B3F6B] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Lo coordinamos con vos. <strong>Queda confirmado cuando
                      Ubicar lo confirma</strong>, puede tener un costo extra.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleBuscar}
                  className="h-[54px] w-full text-base font-bold uppercase tracking-wide"
                >
                  Ver vehículos disponibles
                </Button>

                {/* El plazo se avisa acá, antes de elegir la fecha. Que el
                    formulario te rechace el retiro recién al validar es la
                    peor forma de enterarse de una regla del negocio.
                    D-52: el número sale de `/public/config`, no queda
                    hardcodeado — antes decía "72 horas" fijo aunque la
                    regla real ya era de 10 días. */}
                {/* D-60: antes decía "se toman con 10 días de anticipación",
                    que ahora que el calendario deja elegir antes se lee como
                    una prohibición que el propio calendario desmiente. Dice lo
                    mismo sin cerrar la puerta: adentro reservás solo, afuera
                    lo coordina un agente. */}
                <p className="text-center text-xs text-muted-foreground">
                  Reservás online desde{" "}
                  <strong>
                    {textoPlazo((config?.anticipacion_minima_horas ?? 240) / 24)}
                  </strong>{" "}
                  de anticipación. Para antes de eso lo coordina un agente por
                  WhatsApp. Ver los precios no te compromete a nada.
                </p>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <a
                  href={WHATSAPP_GENERAL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => contactoIniciado("hero:whatsapp")}
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
  etiqueta, fecha, hora, onFecha, onHora, desde, hasta, aCoordinarAntesDe,
}: {
  etiqueta: string;
  fecha?: Date;
  hora: string;
  onFecha: (d?: Date) => void;
  onHora: (h: string) => void;
  desde: Date;
  hasta?: Date;
  /** D-60: los días entre `desde` y esta fecha se pueden elegir, pero salen
   *  por WhatsApp. Van en ámbar para que se lea "esto se puede, pero es por
   *  otro camino" **antes** de tocarlos, y el cartel no sea una sorpresa. */
  aCoordinarAntesDe?: Date;
}) {
  // Controlado a propósito: sin esto el calendario queda abierto después de
  // elegir el día, y en la portada eso tapa el cartel que acaba de aparecer.
  const [abierto, setAbierto] = useState(false);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <Popover open={abierto} onOpenChange={setAbierto}>
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
              onSelect={(d) => { onFecha(d); setAbierto(false); }}
              disabled={hasta ? [{ before: desde }, { after: hasta }] : { before: desde }}
              modifiers={
                aCoordinarAntesDe
                  ? { aCoordinar: { after: addDays(desde, -1), before: aCoordinarAntesDe } }
                  : undefined
              }
              modifiersClassNames={{
                aCoordinar: "bg-amber-50 text-amber-700 font-medium aria-selected:bg-primary aria-selected:text-primary-foreground",
              }}
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
