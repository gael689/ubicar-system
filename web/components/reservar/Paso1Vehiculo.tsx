"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Users, Briefcase, Snowflake, Cog, Car, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, pesos, urlFoto } from "@/lib/api";
import { whatsappLink } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CategoriaDisponible } from "@/lib/types";
import { BuscadorRango, type RangoBusqueda } from "./BuscadorRango";

interface Props {
  rango: RangoBusqueda;
  lugares: string[];
  anticipacionHoras: number;
  seleccionada: CategoriaDisponible | null;
  onCambiarRango: (r: RangoBusqueda) => void;
  onElegir: (c: CategoriaDisponible) => void;
}

export function Paso1Vehiculo({
  rango, lugares, anticipacionHoras, seleccionada, onCambiarRango, onElegir,
}: Props) {
  const [categorias, setCategorias] = useState<CategoriaDisponible[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscado = Boolean(rango.fechaInicio && rango.fechaFin && rango.lugarRetiro);

  useEffect(() => {
    if (!buscado) return;
    let cancelado = false;
    setCargando(true);
    setError(null);

    api
      .disponibilidad({
        fecha_inicio: rango.fechaInicio,
        fecha_fin: rango.fechaFin,
        hora_inicio: rango.horaInicio,
        hora_fin: rango.horaFin,
      })
      .then((data) => !cancelado && setCategorias(data))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));

    return () => { cancelado = true; };
  }, [buscado, rango.fechaInicio, rango.fechaFin, rango.horaInicio, rango.horaFin]);

  return (
    <div className="space-y-6">
      <BuscadorRango
        valor={rango}
        lugares={lugares}
        anticipacionHoras={anticipacionHoras}
        onBuscar={onCambiarRango}
        compacto={buscado}
      />

      {!buscado && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Elegí dónde y cuándo, y te mostramos qué hay disponible.
        </p>
      )}

      {error && (
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
            <p className="text-xs text-muted-foreground">
              {categorias.filter((c) => c.hay_cupo).length} de {categorias.length} categorías
              con disponibilidad
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.map((c, i) => (
              <TarjetaCategoria
                key={c.categoria_id}
                categoria={c}
                elegida={seleccionada?.categoria_id === c.categoria_id}
                onElegir={() => onElegir(c)}
                indice={i}
                rango={rango}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TarjetaCategoria({
  categoria: c, elegida, onElegir, indice, rango,
}: {
  categoria: CategoriaDisponible;
  elegida: boolean;
  onElegir: () => void;
  indice: number;
  rango: RangoBusqueda;
}) {
  const foto = urlFoto(c.foto_key);
  const disponible = c.hay_cupo;

  return (
    <article
      className={cn(
        "group flex animate-fade-up flex-col overflow-hidden rounded-lg border bg-white opacity-0 shadow-sm transition-all",
        elegida
          ? "border-primary ring-2 ring-primary/25"
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
            className={cn(
              "object-cover transition-transform duration-500 group-hover:scale-105",
              !disponible && "grayscale",
            )}
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
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {c.precio.dias} {c.precio.dias === 1 ? "día" : "días"} · total
                  </p>
                  <p className="text-xl font-bold leading-tight text-[#1B3F6B]">
                    {pesos(c.precio.total)}
                  </p>
                </div>
                <div className="text-right">
                  {c.precio.total_referencia &&
                    c.precio.total_referencia > c.precio.total && (
                      <p className="text-xs text-muted-foreground line-through">
                        {pesos(c.precio.total_referencia)}
                      </p>
                    )}
                  <p className="text-xs text-muted-foreground">
                    {pesos(c.precio.precio_dia_promedio)} por día
                  </p>
                </div>
              </div>
              <Button onClick={onElegir} className="mt-3 w-full">
                {elegida ? "Seleccionado" : "Elegir"}
              </Button>
            </>
          ) : (
            /* Sin cupo NO es un cartel de "no": es un desvío. Con una sola
               unidad en varias categorías, esto va a aparecer seguido, y la
               diferencia entre perder el contacto y recuperarlo está acá. */
            <>
              <p className="text-sm font-medium text-foreground">
                Sin disponibilidad para estas fechas
              </p>
              {c.precio && (
                <p className="text-xs text-muted-foreground">
                  Normalmente desde {pesos(c.precio.precio_dia_promedio)} por día
                </p>
              )}
              <Button variant="outline" asChild className="mt-3 w-full">
                <a
                  href={whatsappLink(
                    `Hola! Quería consultar por un ${c.nombre} del ${rango.fechaInicio} al ${rango.fechaFin}. ¿Tienen alguna alternativa?`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" /> Consultar alternativas
                </a>
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
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
