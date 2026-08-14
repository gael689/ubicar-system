"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Users, Briefcase, Snowflake, Cog, Car, Clock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, pesos, urlFoto } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CategoriaDisponible, EscalonDuracion } from "@/lib/types";
import { AhorroPorDuracion } from "./AhorroPorDuracion";
import { BuscadorRango, type RangoBusqueda } from "./BuscadorRango";
import { DialogoSinCupo } from "./DialogoSinCupo";
import { CartelDerivacion, SEGUIR_WEB_LABEL } from "./CartelDerivacion";
import { CartelDerivacionModal } from "./CartelDerivacionModal";
import { construirMensajeDerivacion } from "@/lib/mensajeDerivacion";
import {
  motivoVentanaVenta, detalleVentana, motivoTextoVentana, type MotivoVentana,
} from "@/lib/ventanaVenta";

interface Props {
  rango: RangoBusqueda;
  lugares: string[];
  anticipacionHoras: number;
  /** D-52: 0 = sin tope. Junto con `anticipacionHoras` son los tres bordes
   *  de la ventana de venta online — antes sólo se respetaba el primero. */
  horizonteMaximoDias?: number;
  duracionMaximaDias?: number;
  seleccionada: CategoriaDisponible | null;
  escalones?: EscalonDuracion[];
  /** La declarada en el Hero. El precio de las tarjetas sale con el recargo
   *  por edad ya adentro, así no cambia más adelante. */
  edad: string;
  onCambiarRango: (r: RangoBusqueda) => void;
  onEstirarDuracion?: (dias: number) => void;
  onElegir: (c: CategoriaDisponible) => void;
  /** El cliente acepta retirar más tarde ese mismo día, sobre la unidad que
   *  vuelve. Corre la hora de retiro y sigue el flujo normal. */
  onElegirConRotacion?: (c: CategoriaDisponible, horaEntrega: string) => void;
}

export function Paso1Vehiculo({
  rango, lugares, anticipacionHoras, horizonteMaximoDias, duracionMaximaDias,
  seleccionada, escalones = [], edad, onCambiarRango, onEstirarDuracion,
  onElegir, onElegirConRotacion,
}: Props) {
  const [categorias, setCategorias] = useState<CategoriaDisponible[] | null>(null);
  const [sinCupo, setSinCupo] = useState<CategoriaDisponible | null>(null);
  const [formularioSinCupo, setFormularioSinCupo] = useState<CategoriaDisponible | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Plan de conexión (13/08), §3.1 + §3.9: los tres bordes de la ventana se
   * chequean **en el navegador**, con los mismos números que valida el
   * servidor — no se descubre al fallar un fetch. Cuando el rango elegido
   * cae afuera, el cartel de derivación reemplaza directamente a la grilla:
   * no tiene sentido pedirle disponibilidad al backend para un rango que ya
   * se sabe que va a rechazar.
   */
  const limitesVentana = useMemo(
    () => ({ anticipacionHoras, horizonteMaximoDias, duracionMaximaDias }),
    [anticipacionHoras, horizonteMaximoDias, duracionMaximaDias],
  );
  const motivoVentana = useMemo(
    () => motivoVentanaVenta(rango, limitesVentana),
    [rango, limitesVentana],
  );

  const buscado = Boolean(rango.fechaInicio && rango.fechaFin && rango.lugarRetiro);

  // Los mismos días que cobra el backend: el de devolución no se cuenta.
  const dias =
    rango.fechaInicio && rango.fechaFin
      ? Math.max(
          0,
          Math.round(
            (new Date(`${rango.fechaFin}T12:00:00`).getTime() -
              new Date(`${rango.fechaInicio}T12:00:00`).getTime()) /
              86_400_000,
          ),
        )
      : 0;

  useEffect(() => {
    // Rango fuera de la ventana: no tiene sentido pedirle disponibilidad al
    // backend para algo que ya se sabe que va a rechazar (§3.1 + §3.9). El
    // cartel de derivación reemplaza a la grilla más abajo.
    if (!buscado || motivoVentana) {
      setCategorias(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);

    api
      .disponibilidad({
        fecha_inicio: rango.fechaInicio,
        fecha_fin: rango.fechaFin,
        hora_inicio: rango.horaInicio,
        hora_fin: rango.horaFin,
        edad: edad || undefined,
      })
      .then((data) => !cancelado && setCategorias(data))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));

    return () => { cancelado = true; };
  }, [
    buscado, motivoVentana, rango.fechaInicio, rango.fechaFin,
    rango.horaInicio, rango.horaFin, edad,
  ]);

  const mensajeVentana = (motivo: MotivoVentana) =>
    construirMensajeDerivacion({
      fechaInicio: rango.fechaInicio,
      horaInicio: rango.horaInicio,
      fechaFin: rango.fechaFin,
      horaFin: rango.horaFin,
      lugarRetiro: rango.lugarRetiro,
      lugarDevolucion: rango.lugarDevolucion,
      edad,
      motivoTexto: motivoTextoVentana(motivo, limitesVentana),
      preguntaFinal: "¿Me pueden ayudar?",
    });

  return (
    <div className="space-y-6">
      <BuscadorRango
        valor={rango}
        lugares={lugares}
        anticipacionHoras={anticipacionHoras}
        horizonteMaximoDias={horizonteMaximoDias}
        duracionMaximaDias={duracionMaximaDias}
        onBuscar={onCambiarRango}
        compacto={buscado}
      />

      {buscado && (
        <AhorroPorDuracion
          escalones={escalones}
          dias={dias}
          onEstirar={onEstirarDuracion}
        />
      )}

      {!buscado && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Elegí dónde y cuándo, y te mostramos qué hay disponible.
        </p>
      )}

      {/* §3.1 + §3.9: rango fuera de la ventana de venta online. Reemplaza a
          la grilla entera — no tiene sentido mostrar "elegí tu vehículo"
          para un rango que ya se sabe que no se puede vender. */}
      {buscado && motivoVentana && (
        <CartelDerivacion
          motivo={motivoVentana}
          detalle={detalleVentana(motivoVentana, limitesVentana)}
          mensajeWhatsapp={mensajeVentana(motivoVentana)}
          fechaInicio={rango.fechaInicio}
          fechaFin={rango.fechaFin}
          seguirWebLabel={SEGUIR_WEB_LABEL[motivoVentana]}
          onSeguirWeb={() => {
            // "Elegir otras fechas" / "acortar el alquiler": el buscador ya
            // está arriba, abierto — sólo hace falta que quede visible y sin
            // el cartel tapándolo.
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {/* Errores de verdad (red caída, 500) — no la ventana, que ya se
          resuelve arriba antes de llegar a pedirle nada al backend. */}
      {error && !motivoVentana && (
        <div className="rounded-lg bg-destructive px-4 py-3 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      {cargando && <GrillaEsqueleto />}

      {!cargando && categorias && (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-[#1B3F6B]">
              Elegí tu vehículo
            </h2>
            {/* D-61: nunca un cero. "0 de 6 categorías con disponibilidad"
                era el titular del callejón sin salida — y encima falso, porque
                el mostrador puede vender una equivalente. Ahora reparte, y de
                paso adelanta la distinción antes de mirar una sola tarjeta. */}
            <p className="text-xs text-muted-foreground">
              {repartoCategorias(categorias)}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.map((c, i) => (
              <TarjetaCategoria
                key={c.categoria_id}
                categoria={c}
                elegida={seleccionada?.categoria_id === c.categoria_id}
                onElegir={() => onElegir(c)}
                onElegirConRotacion={
                  onElegirConRotacion && c.rotacion
                    ? () => onElegirConRotacion(c, c.rotacion!.hora_entrega)
                    : undefined
                }
                onAvisarme={() => setSinCupo(c)}
                indice={i}
              />
            ))}
          </div>
        </>
      )}

      {/* §3.9: "Avisarme cuando haya" abre el cartel de derivación —
          WhatsApp primero, "ver los que sí hay" como segundo camino— y no
          directo el formulario. `DialogoSinCupo` sigue existiendo, ahora
          como tercera opción ("Dejanos tus datos"), reachable desde el link
          del cartel. No se retira nada: D-04 sigue midiendo demanda
          insatisfecha para quien lo completa. */}
      {sinCupo && (
        <CartelDerivacionModal
          motivo="sin_cupo"
          categoriaId={sinCupo.categoria_id}
          categoriaNombre={sinCupo.nombre}
          fechaInicio={rango.fechaInicio}
          fechaFin={rango.fechaFin}
          mensajeWhatsapp={construirMensajeDerivacion({
            categoria: sinCupo.nombre,
            fechaInicio: rango.fechaInicio,
            horaInicio: rango.horaInicio,
            fechaFin: rango.fechaFin,
            horaFin: rango.horaFin,
            lugarRetiro: rango.lugarRetiro,
            lugarDevolucion: rango.lugarDevolucion,
            edad,
            motivoTexto: "Me apareció que esa categoría está completa para esas fechas.",
            preguntaFinal: "¿Tienen ese vehículo o alguno similar?",
          })}
          seguirWebLabel={SEGUIR_WEB_LABEL.sin_cupo}
          onSeguirWeb={() => setSinCupo(null)}
          onDejarConsulta={() => { setFormularioSinCupo(sinCupo); setSinCupo(null); }}
          onCerrar={() => setSinCupo(null)}
        />
      )}

      {formularioSinCupo && (
        <DialogoSinCupo
          categoria={formularioSinCupo}
          rango={rango}
          onCerrar={() => setFormularioSinCupo(null)}
        />
      )}
    </div>
  );
}

/**
 * El encabezado de la grilla, en sus tres formas. **Nunca muestra un cero**
 * (D-61): una categoría sin cupo no es una categoría perdida, es una que
 * cierra un agente. Las tres frases dicen lo mismo que las tarjetas, para que
 * la distinción se lea antes de bajar la vista.
 */
function repartoCategorias(categorias: CategoriaDisponible[]): string {
  const online = categorias.filter((c) => c.hay_cupo).length;
  const total = categorias.length;
  if (total === 0) return "";
  if (online === total) {
    return total === 1
      ? "Se reserva online, ahora mismo"
      : `Las ${total} se reservan online, ahora mismo`;
  }
  if (online === 0) {
    return total === 1
      ? "Esta la coordina un agente en el momento"
      : `Estas ${total} las coordina un agente en el momento`;
  }
  const conAgente = total - online;
  return `${online} se ${online === 1 ? "reserva" : "reservan"} online · ${conAgente} ${
    conAgente === 1 ? "la coordina" : "las coordina"
  } un agente`;
}

function TarjetaCategoria({
  categoria: c, elegida, onElegir, onElegirConRotacion, onAvisarme, indice,
}: {
  categoria: CategoriaDisponible;
  elegida: boolean;
  onElegir: () => void;
  onElegirConRotacion?: () => void;
  onAvisarme: () => void;
  indice: number;
}) {
  // `foto_url` la resuelve el backend y contempla el bucket; `urlFoto` arma la
  // ruta vieja contra `/static`, que sólo sirve con storage local. Queda de
  // respaldo por si la API todavía no devuelve la URL resuelta.
  const foto = c.foto_url ?? urlFoto(c.foto_key);
  const disponible = c.hay_cupo;
  // Sin cupo a la hora pedida, pero hay una unidad que vuelve ese mismo día y
  // se puede entregar más tarde. **No es "sin disponibilidad"**: el auto está,
  // y por eso la tarjeta se ve como una que se puede alquilar y no como un
  // cartel de "no".
  const rotacion = !disponible && c.precio ? c.rotacion : null;
  const ofreceRotacion = Boolean(rotacion && onElegirConRotacion);

  return (
    <article
      className={cn(
        "group flex animate-fade-up flex-col overflow-hidden rounded-lg border bg-white opacity-0 shadow-sm transition-all",
        elegida
          ? "border-primary ring-2 ring-primary/25"
          : !disponible && !ofreceRotacion
          // D-61: la distinción "se reserva online" vs "la coordina un agente"
          // es **redundante a propósito** — borde, badge y verbo del botón.
          // Quien no distingue colores lee el texto igual.
          ? "border-2 border-amber-500 hover:-translate-y-0.5 hover:shadow-md"
          : "border-border hover:-translate-y-0.5 hover:shadow-md",
        !disponible && "opacity-100",
      )}
      style={{ animationDelay: `${indice * 60}ms` }}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {foto ? (
          <Image
            src={foto}
            alt={c.nombre}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            /* D-61: **sin `grayscale`**. Despintar la foto dice "este auto
               está muerto", y el auto existe — sólo lo confirma una persona
               en vez del sitio. */
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Car className="h-10 w-10" />
          </div>
        )}

        {c.precio?.tiene_promocion && disponible && (
          <span className="absolute left-3 top-3 rounded-sm bg-[hsl(var(--ubicar-green))] px-2 py-1 text-xs font-semibold text-white shadow">
            {c.precio.promociones[0] ?? "Promo"}
          </span>
        )}
        {/* La última unidad es información honesta y además convierte. */}
        {disponible && c.ultima_unidad && (
          <span className="absolute right-3 top-3 rounded-sm bg-[#1B3F6B] px-2 py-1 text-xs font-semibold text-white shadow">
            Última unidad
          </span>
        )}
        {!disponible && !ofreceRotacion && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-sm bg-amber-600 px-2 py-1 text-xs font-semibold text-white shadow">
            <UserRound className="h-3 w-3" /> Con un agente
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold text-[#1B3F6B]">{c.nombre}</h3>
          {c.ejemplo_modelos && (
            <p className="text-xs text-muted-foreground">{c.ejemplo_modelos}</p>
          )}
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {c.pasajeros && <Spec icon={Users} texto={`${c.pasajeros} pasajeros`} />}
          {c.valijas && <Spec icon={Briefcase} texto={`${c.valijas} valijas`} />}
          {c.transmision && (
            <Spec icon={Cog} texto={c.transmision === "automatica" ? "Automática" : "Manual"} />
          )}
          {c.aire_acondicionado && <Spec icon={Snowflake} texto="Aire" />}
        </ul>

        <div className="mt-auto border-t border-border pt-3">
          {disponible && c.precio ? (
            <>
              <PrecioTarjeta precio={c.precio} />
              <Button onClick={onElegir} className="mt-3 w-full">
                {elegida ? "Seleccionado" : "Elegir"}
              </Button>
            </>
          ) : rotacion && c.precio && onElegirConRotacion ? (
            /* Se libera uno ese mismo día. **El precio es el mismo**: cambia
               la hora de retiro, no los días que se cobran. */
            <>
              <PrecioTarjeta precio={c.precio} />
              <div className="mt-2 rounded-md border border-[#1B3F6B]/25 bg-[#1B3F6B]/5 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1B3F6B]">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Te lo entregamos {rotacion.hora_entrega}
                </p>
                {/* El porqué, siempre. Un horario corrido sin explicación se
                    lee como un error del sitio, no como una solución. */}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Es la última unidad y se devuelve a las{" "}
                  {rotacion.hora_devolucion_unidad}. La preparamos y te la
                  entregamos {rotacion.hora_entrega} del mismo día.
                </p>
              </div>
              <Button onClick={onElegirConRotacion} className="mt-3 w-full">
                {elegida ? "Seleccionado" : `Reservar · retirás ${rotacion.hora_entrega}`}
              </Button>
            </>
          ) : (
            /* D-61: sin cupo **no** es "no hay", y no se dice que no hay.
               El precio va con el mismo peso, tamaño y color que el de una
               categoría libre —el backend lo cotiza siempre, aunque no quede
               unidad (`disponibilidad_service`: "el precio se cotiza siempre,
               aunque no haya cupo")— y el botón deriva a un agente.

               El porqué es comercial, no técnico: el stock puede estar
               desactualizado, y el mostrador sabe qué unidades vuelven y qué
               se puede reemplazar por una equivalente o un upgrade. Un "sin
               disponibilidad" mata una venta que todavía estaba viva. */
            <>
              {c.precio ? (
                <PrecioTarjeta precio={c.precio} />
              ) : (
                <p className="text-sm font-medium text-[#1B3F6B]">
                  Te pasamos el precio en el momento
                </p>
              )}
              <Button
                variant="outline"
                onClick={onAvisarme}
                className="mt-3 w-full border-amber-600 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                <UserRound className="h-4 w-4" /> Coordinar con un agente
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * El precio de la tarjeta.
 *
 * **Dos números, y los dos son reales**: el tachado es lo que paga quien seña
 * parcialmente, y el grande lo que paga quien abona el total (D-49). Por eso el
 * tachado es legítimo y no un ancla inventada — pero si algún día se muestra un
 * "antes" que nadie paga, deja de serlo.
 */
function PrecioTarjeta({ precio }: { precio: NonNullable<CategoriaDisponible["precio"]> }) {
  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            {precio.dias} {precio.dias === 1 ? "día" : "días"} · total
          </p>
          {precio.pago_total ? (
            <>
              <p className="text-xs text-muted-foreground line-through">
                {pesos(precio.total)}
              </p>
              <p className="text-xl font-bold leading-tight text-[#1B3F6B]">
                {pesos(precio.pago_total.total)}
              </p>
            </>
          ) : (
            <p className="text-xl font-bold leading-tight text-[#1B3F6B]">
              {pesos(precio.total)}
            </p>
          )}
        </div>
        <div className="text-right">
          {!precio.pago_total &&
            precio.total_referencia &&
            precio.total_referencia > precio.total && (
              <p className="text-xs text-muted-foreground line-through">
                {pesos(precio.total_referencia)}
              </p>
            )}
          <p className="text-xs text-muted-foreground">
            {pesos(precio.pago_total?.precio_dia_promedio ?? precio.precio_dia_promedio)}{" "}
            por día
          </p>
        </div>
      </div>

      {/* La condición va acá, corta. La explicación completa está en el paso 4:
          si el descuento apareciera recién en el checkout, el que ya decidió
          señar el 30% siente que le escondieron una opción mejor. */}
      {precio.pago_total && (
        <p className="mt-1.5 text-xs font-semibold text-[hsl(var(--ubicar-green))]">
          −{Math.round(precio.pago_total.descuento_porcentaje)}% pagando el total
        </p>
      )}
    </>
  );
}

function Spec({ icon: Icon, texto }: { icon: typeof Users; texto: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {texto}
    </li>
  );
}

function GrillaEsqueleto() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="aspect-[16/10] animate-pulse bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-9 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
