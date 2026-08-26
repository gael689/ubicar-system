import { Check, MapPin, ShieldCheck, Wallet } from "lucide-react";

/**
 * Los diferenciales, con peso visual, debajo del hero.
 *
 * **Estaban escondidos.** "Kilometraje libre" y "Seguro incluido" vivían como
 * dos íconos chiquitos en `text-white/60` bajo los pasos del hero, o sea con el
 * mismo peso que la letra chica. Son las dos cosas que más diferencian el
 * servicio: en la mayoría de las rentadoras el kilometraje libre no es el
 * default, y que el precio ya traiga el seguro es justo lo que la gente
 * desconfía que sea verdad.
 *
 * **Sobre la redacción del seguro.** Dice "de responsabilidad civil" y no
 * "seguro incluido" a secas. Lo que el alquiler incluye es la responsabilidad
 * civil obligatoria; los daños del propio vehículo quedan a cargo del cliente
 * hasta la franquicia, y bajarla es una cobertura que se contrata aparte. Un
 * "seguro incluido" suelto se lee como "estoy cubierto", que es exactamente el
 * malentendido que después termina en un reclamo — el mismo motivo por el que
 * el contrato no dice "cobertura total" en ningún lado.
 *
 * **Los puntos de entrega van sin número.** Hoy son tres y salen de
 * `web.lugares_retiro` (D-56), que se edita desde Configuración: un "4 puntos"
 * pisado acá es una promesa que deja de ser cierta el día que agreguen o saquen
 * uno, y nadie se acuerda de volver a este archivo.
 */

const BENEFICIOS = [
  {
    Icono: Check,
    titulo: "Kilometraje libre",
    detalle: "Sin tope de kilómetros ni cargo por excedente.",
  },
  {
    Icono: ShieldCheck,
    titulo: "Seguro de responsabilidad civil incluido",
    detalle: "Ya viene en el precio. Podés sumar cobertura para bajar la franquicia.",
  },
  {
    Icono: Wallet,
    titulo: "Precio final",
    detalle: "Impuestos incluidos. Lo que ves al reservar es lo que pagás.",
  },
  {
    Icono: MapPin,
    titulo: "Retiro en el centro o en el aeropuerto",
    detalle: "Elegís dónde retirar y dónde devolver.",
  },
];

export default function BeneficiosStrip() {
  return (
    <section className="border-b border-border bg-white py-10 md:py-12">
      <div className="container">
        <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFICIOS.map(({ Icono, titulo, detalle }) => (
            <li key={titulo} className="flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#407EC9]/10"
                aria-hidden="true"
              >
                <Icono className="h-[18px] w-[18px] text-[#407EC9]" />
              </span>
              <div>
                <p className="font-semibold leading-snug text-[#1B3F6B]">{titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {detalle}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
