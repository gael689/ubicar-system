"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { whatsappLinkCABA, WHATSAPP_GENERAL } from "@/lib/constants";
import { MapPin, ChevronDown, Calendar as CalendarIcon, Clock } from "lucide-react";
import { trackLeadEvent } from "@/lib/meta-pixel";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2).toString().padStart(2, "0");
  const minutes = i % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});

const Hero = () => {
  const router = useRouter();
  const [lugarEntrega, setLugarEntrega] = useState("");
  const [devolverOtroLugar, setDevolverOtroLugar] = useState(false);
  const [lugarDevolucion, setLugarDevolucion] = useState("");
  
  const [fechaEntrega, setFechaEntrega] = useState<Date>();
  const [horaEntrega, setHoraEntrega] = useState("08:30");
  const [fechaDevolucion, setFechaDevolucion] = useState<Date>();
  const [horaDevolucion, setHoraDevolucion] = useState("08:30");

  /**
   * El buscador de la portada es el paso 1 de la reserva.
   *
   * **No valida nada acá.** Si falta un dato, el paso 1 se lo pide con el
   * mismo calendario: frenar con un `alert()` a alguien que recién llegó es
   * la peor manera de recibirlo. El Hero sólo transporta lo ya elegido.
   *
   * Capital Federal sigue yendo por WhatsApp: D-39 dejó el flujo online sólo
   * para Bahía Blanca hasta resolver si la flota de CABA es la misma.
   */
  const handleCotizar = () => {
    trackLeadEvent();

    if (lugarEntrega === "Capital Federal, Juan Francisco Segui 3607") {
      const fDesde = fechaEntrega ? format(fechaEntrega, "dd/MM/yyyy") : "No especificada";
      const fHasta = fechaDevolucion ? format(fechaDevolucion, "dd/MM/yyyy") : "No especificada";
      window.open(
        whatsappLinkCABA(
          `Hola! Quiero cotizar un alquiler en Capital Federal.\n` +
          `*Retiro:* ${fDesde} ${horaEntrega}\n` +
          `*Devolución:* ${fHasta} ${horaDevolucion}`,
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
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      <img
        src="https://images.pexels.com/photos/34775710/pexels-photo-34775710.jpeg?auto=compress&cs=tinysrgb&w=1920"
        alt="Vehículos de alquiler en ruta - Ubicar Rent Bahía Blanca"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />

      {/* Capa azul de marca */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(27,63,107,0.88) 0%, rgba(176, 190, 207, 0.62) 55%, rgba(27,63,107,0.85) 100%)",
        }}
      />

      <div className="relative container text-center px-4 pt-28 md:pt-36 flex-grow flex flex-col justify-center">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-white max-w-4xl mx-auto opacity-0 animate-fade-up"
          style={{ lineHeight: 1.08 }}
        >
          Alquiler de vehículos en Bahía Blanca y Capital Federal
        </h1>

        <p
          className="mt-7 text-lg md:text-xl text-white/85 max-w-2xl mx-auto opacity-0 animate-fade-up font-normal"
          style={{ animationDelay: "0.15s" }}
        >
          Soluciones de movilidad para trabajo o viaje, con coordinación clara y sin complicaciones.
        </p>

        <p
          className="mt-3 text-base text-white/60 max-w-xl mx-auto opacity-0 animate-fade-up"
          style={{ animationDelay: "0.25s" }}
        >
          Operamos en Bahía Blanca (y la zona) y Capital Federal.
        </p>

        <div
          className="mt-8 flex flex-col sm:flex-row gap-4 justify-center opacity-0 animate-fade-up"
          style={{ animationDelay: "0.35s" }}
        >
          <Button variant="heroPrimary" size="lg" asChild>
            <a href={WHATSAPP_GENERAL} target="_blank" rel="noopener noreferrer" onClick={() => trackLeadEvent()}>
              Reservar por WhatsApp
            </a>
          </Button>
        </div>
      </div>

      {/* Formulario de Cotización Horizontal */}
      <div
        className="relative container px-4 pb-12 opacity-0 animate-fade-up z-10 w-full mb-8 lg:mb-4 mt-12 md:mt-8 lg:mt-0"
        style={{ animationDelay: "0.45s" }}
      >
        <div className="bg-white rounded-lg shadow-2xl p-4 md:p-3 mx-auto w-full max-w-6xl">
          <div className="flex flex-col md:flex-row items-center border border-gray-200 rounded-md divide-y md:divide-y-0 md:divide-x divide-gray-200">

            {/* Lugar de entrega */}
            <div className="flex-1 w-full p-4 md:px-4 md:py-2 hover:bg-gray-50 transition-colors rounded-l-md lg:min-w-[280px]">
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                Lugar de entrega
              </label>
              <div className="relative">
                <select
                  value={lugarEntrega}
                  onChange={(e) => setLugarEntrega(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-[#1B3F6B] outline-none appearance-none cursor-pointer truncate"
                  required
                >
                  <option value="" disabled>Seleccione una ubicación</option>
                  <option value="Paraguay 241 Bahía Blanca">Paraguay 241 Bahía Blanca</option>
                  <option value="Alsina 350 Bahía Blanca">Alsina 350 Bahía Blanca</option>
                  <option value="Aeropuerto Comandante Espora Bahía Blanca">Aeropuerto Comandante Espora, Bahía Blanca</option>
                  <option value="Capital Federal, Juan Francisco Segui 3607">Capital Federal, Juan Francisco Segui 3607</option>
                  <option value="Otro">Otro</option>
                </select>
                <MapPin className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Fecha y Hora de Entrega */}
            <div className="flex-1 w-full p-4 md:px-4 md:py-2 hover:bg-gray-50 transition-colors">
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                Fecha y hora de retiro
              </label>
              <div className="flex items-center gap-2 h-[28px]">
                <div className="relative flex-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start text-left font-semibold text-[#1B3F6B] px-0 h-auto hover:bg-transparent tracking-tight",
                          !fechaEntrega && "text-gray-400"
                        )}
                      >
                        {fechaEntrega ? format(fechaEntrega, "dd/MM/yyyy") : "DD/MM/AAAA"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fechaEntrega}
                        onSelect={setFechaEntrega}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <span className="text-gray-300">|</span>
                <div className="relative w-24 flex items-center bg-gray-50 hover:bg-gray-100 rounded px-2 py-1 transition-colors">
                  <select
                    value={horaEntrega}
                    onChange={(e) => setHoraEntrega(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#1B3F6B] outline-none appearance-none cursor-pointer pr-4"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={`entrega-${time}`} value={time}>{time}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Fecha y Hora de Devolución */}
            <div className="flex-1 w-full p-4 md:px-4 md:py-2 hover:bg-gray-50 transition-colors">
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                Fecha y hora de devolución
              </label>
              <div className="flex items-center gap-2 h-[28px]">
                <div className="relative flex-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start text-left font-semibold text-[#1B3F6B] px-0 h-auto hover:bg-transparent tracking-tight",
                          !fechaDevolucion && "text-gray-400"
                        )}
                      >
                        {fechaDevolucion ? format(fechaDevolucion, "dd/MM/yyyy") : "DD/MM/AAAA"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fechaDevolucion}
                        onSelect={setFechaDevolucion}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <span className="text-gray-300">|</span>
                <div className="relative w-24 flex items-center bg-gray-50 hover:bg-gray-100 rounded px-2 py-1 transition-colors">
                  <select
                    value={horaDevolucion}
                    onChange={(e) => setHoraDevolucion(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#1B3F6B] outline-none appearance-none cursor-pointer pr-4"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={`devolucion-${time}`} value={time}>{time}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Botón Cotizar */}
            <div className="w-full md:w-auto md:min-w-[150px] h-[76px] md:h-auto self-stretch p-3 md:p-0">
              <Button
                onClick={handleCotizar}
                className="w-full h-full rounded-md md:rounded-l-none md:rounded-r-md bg-[#1B3F6B] hover:bg-[#1B3F6B]/90 text-white font-bold text-sm tracking-wider uppercase"
              >
                Ver disponibilidad
              </Button>
            </div>

          </div>

          <div className="mt-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="devolver-otro-lugar"
                checked={devolverOtroLugar}
                onCheckedChange={(checked) => setDevolverOtroLugar(checked as boolean)}
              />
              <label htmlFor="devolver-otro-lugar" className="text-sm text-gray-600 font-medium cursor-pointer select-none">
                Devolver en otro lugar
              </label>
            </div>

            {devolverOtroLugar && (
              <div className="flex-1 w-full md:max-w-xs animate-fade-up fade-in-0 duration-200">
                <div className="relative border border-gray-200 rounded-md bg-gray-50 px-3 py-2">
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5 uppercase tracking-wider">
                    Lugar de devolución
                  </label>
                  <select
                    value={lugarDevolucion}
                    onChange={(e) => setLugarDevolucion(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#1B3F6B] outline-none appearance-none cursor-pointer"
                    required
                  >
                    <option value="" disabled>Seleccione una ubicación</option>
                    <option value="Paraguay 241 Bahía Blanca">Paraguay 241 Bahía Blanca</option>
                    <option value="Alsina 350 Bahía Blanca">Alsina 350 Bahía Blanca</option>
                    <option value="Aeropuerto Comandante Espora Bahía Blanca">Aeropuerto Comandante Espora</option>
                    <option value="Capital Federal, Juan Francisco Segui 3607">Capital Federal</option>
                    <option value="Otro">Otro</option>
                  </select>
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

export default Hero;
