"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle, ArrowRight, Copy, Check, CalendarClock, Phone, Mail, PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { CONTACTO, whatsappLink, telefonoHref, emailHref } from "@/lib/contacto";
import * as analitica from "@/lib/analitica";
import type { MotivoVentana } from "@/lib/ventanaVenta";

/** Los tres motivos de ventana (`anticipacion`/`horizonte`/`duracion`) salen
 *  de `@/lib/ventanaVenta`, que es donde se calculan — acá se suman los dos
 *  que no dependen de fechas. */
export type MotivoDerivacion = MotivoVentana | "sin_cupo" | "otro_lugar";
export type BotonDerivacion =
  | "whatsapp" | "telefono" | "mail" | "seguir_web" | "consulta";

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
  /**
   * D-60: el cartel ocupa el lugar de la tarjeta del buscador en la portada,
   * así que tiene que pesar lo mismo que ella — tarjeta elevada, título
   * grande, ícono. Sin esto queda igual que siempre: en `/reservar` es un
   * bloque más dentro del flujo y no debe gritar.
   */
  resaltado?: boolean;
  /** Una línea con lo que la persona ya eligió — "Retiro 20 ago · 10:00 —
   *  Aeropuerto". Refuerza que no arranca de cero al pasar a WhatsApp. */
  resumen?: string;
  /** Lleva el foco al título al aparecer. Necesario cuando el cartel sale
   *  solo, sin un click que lo pida: el foco venía del calendario que se
   *  acaba de desmontar y si no se mueve queda en el `<body>`. */
  autoFoco?: boolean;
}


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
  resaltado = false, resumen, autoFoco = false,
}: Props) {
  const copy = copiar(motivo, detalle);
  const [copiado, setCopiado] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (autoFoco) tituloRef.current?.focus();
  }, [autoFoco, motivo]);

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
      await navigator.clipboard.writeText(CONTACTO.whatsappDisplay);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* portapapeles no disponible — no es crítico, el número ya está visible */
    }
  };

  return (
    <div
      // `role="status"` + `aria-live`: en la portada el cartel aparece sin que
      // nadie lo pida —basta elegir una fecha—, así que un lector de pantalla
      // tiene que anunciarlo solo.
      role="status"
      aria-live="polite"
      className={
        resaltado
          ? "rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5 md:p-6"
          : "rounded-lg border border-border bg-white p-5 shadow-sm"
      }
    >
      {resaltado && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <CalendarClock className="h-5 w-5 text-primary" />
        </div>
      )}
      <h3
        ref={tituloRef}
        tabIndex={autoFoco ? -1 : undefined}
        className={
          resaltado
            ? "text-xl font-bold text-[#1B3F6B] outline-none md:text-2xl"
            : "text-base font-semibold text-[#1B3F6B] outline-none"
        }
      >
        {copy.titulo}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{copy.cuerpo}</p>

      {resumen && (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
          {resumen}
        </p>
      )}

      {/* ── A. Hablá con un agente ahora ──────────────────────────────────
          Los tres canales de Ubicar, no sólo WhatsApp: hay gente que llama y
          gente que escribe un mail, y ofrecer un solo camino es volver a
          armar un callejón, más angosto (D-61). */}
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Hablá con un agente ahora
      </p>

      <div className="mt-2 space-y-2">
        <a
          href={whatsappLink(mensajeWhatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => registrar("whatsapp")}
          className="block"
        >
          <Button
            className={
              resaltado
                ? "h-[54px] w-full gap-2 text-base font-bold uppercase tracking-wide"
                : "w-full gap-2"
            }
          >
            <MessageCircle className="h-4 w-4" /> {copy.botonWhatsapp}
          </Button>
        </a>
        <p className="text-center text-[11px] text-muted-foreground">
          Te va con tus datos ya cargados
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a href={telefonoHref} onClick={() => registrar("telefono")} className="block">
            <Button variant="outline" className="w-full gap-2">
              <Phone className="h-4 w-4" /> {CONTACTO.telefonoDisplay}
            </Button>
          </a>
          <a href={emailHref} onClick={() => registrar("mail")} className="block">
            <Button variant="outline" className="w-full gap-2">
              <Mail className="h-4 w-4" /> Escribinos
            </Button>
          </a>
        </div>
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
        {copiado ? "Copiado" : `Copiar el WhatsApp: ${CONTACTO.whatsappDisplay}`}
      </button>

      {/* ── B. O que te contactemos nosotros ───────────────────────────────
          Dejó de ser un link chiquito al pie: es la mitad del pedido —"la
          otra alternativa, que sea 'quiero que ustedes me contacten'"—, no
          una tercera opción de descarte. */}
      {onDejarConsulta && (
        <>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            O que te contactemos nosotros
          </p>
          <Button
            variant="secondary"
            onClick={() => { registrar("consulta"); onDejarConsulta(); }}
            className="mt-2 w-full gap-2"
          >
            <PhoneCall className="h-4 w-4" /> Prefiero que me llamen ustedes
          </Button>
        </>
      )}

      {/* Baja a link: en estos casos "seguir en la web" no resuelve nada por
          sí solo, sólo devuelve al calendario. */}
      {onSeguirWeb && (
        <button
          type="button"
          onClick={() => { registrar("seguir_web"); onSeguirWeb(); }}
          className="mt-4 flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {seguirWebLabel} <ArrowRight className="h-3 w-3" />
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
    // D-60: el copy no dice que no se puede — se puede, sólo que no lo cierra
    // la web sola. El sujeto de la limitación es el sitio, nunca el cliente ni
    // el negocio, y cierra prometiendo lo que la persona vino a buscar
    // (disponibilidad y precio).
    case "anticipacion":
      return {
        titulo: "Para esa fecha te lo arma un agente",
        cuerpo: `Alquilar con menos de ${detalle ?? "unos días"} de anticipación se puede: lo que no lo hace sola es la web, lo confirma una persona. Escribinos y un agente de Ubicar te dice disponibilidad y precio en el momento — el mensaje ya te va con las fechas que elegiste.`,
        botonWhatsapp: "Coordinar por WhatsApp",
      };
    case "horizonte":
      return {
        titulo: "Para tan adelante lo reserva un agente",
        cuerpo: `Online reservamos hasta ${detalle ?? "algunos meses"} adelante. Más lejos que eso lo toma un agente de Ubicar por WhatsApp, con las fechas que ya elegiste.`,
        botonWhatsapp: "Coordinar por WhatsApp",
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
