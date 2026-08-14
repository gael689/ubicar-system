"use client";

import { useState } from "react";
import { MessageCircle, ArrowRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { whatsappLink } from "@/lib/constants";
import * as analitica from "@/lib/analitica";

export type MotivoDerivacion =
  | "sin_cupo" | "anticipacion" | "horizonte" | "duracion" | "otro_lugar";
export type BotonDerivacion = "whatsapp" | "seguir_web" | "consulta";

interface Props {
  motivo: MotivoDerivacion;
  /**
   * El número o plazo que completa el copy — "10 días", "4 meses", "90
   * días", el nombre del lugar pedido. **Nunca hardcodeado acá**: viene de
   * `/public/config`, que a su vez lo lee de `configuracion` — es la misma
   * regla que valida el backend, no una copia que puede quedar vieja (§7).
   */
  detalle?: string;
  /** El mensaje completo que se manda por WhatsApp, ya armado por quien
   *  llama — con categoría, fechas, lugar, días, edad, lo que haya. */
  mensajeWhatsapp: string;
  categoriaId?: number | null;
  categoriaNombre?: string;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  /** Ausente = ese camino no se ofrece en este caso. */
  seguirWebLabel?: string;
  onSeguirWeb?: () => void;
  onDejarConsulta?: () => void;
}

const NUMERO_WHATSAPP = "+54 9 291 418-0554";

/**
 * El cartel único de derivación comercial (plan de conexión 13/08, §3.9).
 *
 * Reemplaza cuatro comportamientos que había para el mismo hecho —"la web no
 * puede vender esto"—: un `422` con texto crudo, el formulario de 160 líneas
 * de `DialogoSinCupo`, un cartel propio cuando falta Mercado Pago, y nada
 * para "otro lugar". **No redirige solo**: avisa qué va a pasar y espera el
 * click, porque un salto automático a WhatsApp se lee como que el sitio
 * empuja afuera y además el navegador puede bloquearlo sin un gesto real.
 *
 * La jerarquía es a propósito: WhatsApp es el botón dominante (el trato
 * directo, lo que se pidió privilegiar), "seguir en la web" es secundario
 * pero real —en el caso sin cupo es el único camino que cierra la venta sin
 * ocupar a nadie—, y "dejar consulta" es un link, no un tercer botón: tres
 * cajas del mismo peso le suman fricción justo a quien ya recibió un "no".
 */
export function CartelDerivacion({
  motivo, detalle, mensajeWhatsapp, categoriaId, categoriaNombre,
  fechaInicio, fechaFin, seguirWebLabel, onSeguirWeb, onDejarConsulta,
}: Props) {
  const copy = copiar(motivo, detalle);
  const [copiado, setCopiado] = useState(false);

  const registrar = (boton: BotonDerivacion) => {
    analitica.derivacionComercial({ motivo, boton, categoria: categoriaNombre });
    void api.registrarBusquedaSinResultado({
      motivo, boton_elegido: boton,
      categoria_id: categoriaId ?? null,
      fecha_inicio: fechaInicio ?? null,
      fecha_fin: fechaFin ?? null,
    });
  };

  const copiarNumero = async () => {
    try {
      await navigator.clipboard.writeText(NUMERO_WHATSAPP);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* portapapeles no disponible — no es crítico, el número ya está visible */
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-[#1B3F6B]">{copy.titulo}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{copy.cuerpo}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <a
          href={whatsappLink(mensajeWhatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => registrar("whatsapp")}
        >
          <Button className="gap-2">
            <MessageCircle className="h-4 w-4" /> {copy.botonWhatsapp}
          </Button>
        </a>
        {onSeguirWeb && (
          <Button variant="outline" onClick={() => { registrar("seguir_web"); onSeguirWeb(); }}>
            {seguirWebLabel}
          </Button>
        )}
      </div>

      {/* En computadora, `wa.me` pide sesión de WhatsApp Web — sin ella el
          botón aparenta no hacer nada justo en el momento en que se está
          derivando. El número copiable es la salida. */}
      <button
        type="button"
        onClick={copiarNumero}
        className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copiado ? "Copiado" : `O escribinos directo: ${NUMERO_WHATSAPP}`}
      </button>

      {onDejarConsulta && (
        <button
          type="button"
          onClick={() => { registrar("consulta"); onDejarConsulta(); }}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ¿Preferís que te escribamos? Dejanos tus datos <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function copiar(motivo: MotivoDerivacion, detalle?: string) {
  switch (motivo) {
    case "sin_cupo":
      return {
        titulo: "Esta categoría está completa para esas fechas",
        cuerpo: "Podemos seguir por WhatsApp para ver la posibilidad de ofrecerte este vehículo o uno similar.",
        botonWhatsapp: "Sí, seguir por WhatsApp",
      };
    case "anticipacion":
      return {
        titulo: "Para estas fechas te atiende un agente",
        cuerpo: `Las reservas online se toman con ${detalle ?? "unos días"} de anticipación. Para retirar antes, seguimos por WhatsApp y lo vemos con un agente comercial.`,
        botonWhatsapp: "Sí, seguir por WhatsApp",
      };
    case "horizonte":
      return {
        titulo: "Todavía no tomamos esa fecha por la web",
        cuerpo: `Online reservamos hasta ${detalle ?? "algunos meses"} adelante. Más lejos que eso lo reserva un agente comercial por WhatsApp.`,
        botonWhatsapp: "Sí, seguir por WhatsApp",
      };
    case "duracion":
      return {
        titulo: "Un alquiler largo se cotiza aparte",
        cuerpo: `Para más de ${detalle ?? "unos días"} tenemos condiciones de alquiler prolongado que no salen en el sitio. Te las pasa un agente comercial.`,
        botonWhatsapp: "Pedir cotización por WhatsApp",
      };
    case "otro_lugar":
      return {
        titulo: "Ese punto lo coordinamos con vos",
        cuerpo: `Entregamos en ${detalle ?? "nuestros puntos habituales"}. Para otro lugar, seguimos por WhatsApp y un agente lo coordina.`,
        botonWhatsapp: "Sí, seguir por WhatsApp",
      };
  }
}

export const SEGUIR_WEB_LABEL: Record<MotivoDerivacion, string> = {
  sin_cupo: "Ver los que sí hay",
  anticipacion: "Elegir otras fechas",
  horizonte: "Elegir otras fechas",
  duracion: "Acortar el alquiler",
  otro_lugar: "Elegir uno de nuestros puntos",
};
