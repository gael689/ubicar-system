"use client";

import Image from "next/image";
import BuscadorReserva from "@/components/BuscadorReserva";

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

              {/* Kilometraje libre y seguro se mudaron a `BeneficiosStrip`,
                  justo debajo del hero. Acá eran dos íconos en `text-white/60`,
                  o sea con el peso visual de la letra chica, siendo los dos
                  diferenciales más fuertes del servicio. */}
            </div>

          </div>

          {/* ── Columna derecha: el buscador ── */}
          <div
            className="order-1 opacity-0 animate-fade-up lg:order-2"
            style={{ animationDelay: "0.12s" }}
          >
            <BuscadorReserva />
          </div>
        </div>
      </div>

    </section>
  );
};

export default Hero;
