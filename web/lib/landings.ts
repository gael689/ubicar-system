/**
 * Las páginas de servicio: una por cada cosa que alguien busca en Google
 * ("alquiler de camionetas 4x4 bahía blanca", "alquiler de autos aeropuerto
 * bahía blanca"…). Hasta ahora todas competían por la portada.
 *
 * **Agregar una página es agregar una entrada acá.** La ruta
 * (`app/[landing]/page.tsx`), el sitemap, el `llms.txt` y los enlaces del
 * footer salen de esta lista, así no se desalinean.
 *
 * Reglas de contenido (plan `docs/PLAN_SEO.md`):
 *
 * - **Una página existe sólo si responde una búsqueda real y tiene contenido
 *   propio.** Nada de páginas en serie que cambian el nombre del pueblo: Google
 *   las castiga y hunde al sitio entero.
 * - **Poco texto y mucho diseño.** Un gancho corto, una bajada de una línea y
 *   bloques visuales (puntos con ícono, categorías con foto, pasos). El
 *   detalle largo vive en las preguntas frecuentes.
 * - **Ninguna afirma lo que Ubicar no cumple.** Lo confirmado: se alquila con
 *   licencia extranjera, y en el aeropuerto el vehículo se pide y se entrega a
 *   la hora pactada. No se escribe nada sobre entregas fuera de Bahía Blanca,
 *   maquinaria con operario, atención 24 h, "cobertura total" ni "sin franquicia".
 * - **Ningún precio ni porcentaje a mano.** Lo que tiene número lo trae el
 *   componente que lee `/public/config`.
 * - **Las respuestas de política se toman de `lib/faq.ts` por `id`.**
 * - La bajada responde sola —qué, dónde, cómo se reserva—: es lo que citan los
 *   buscadores de IA.
 */
import type { Pregunta } from "@/lib/faq";

/** Nombres de los íconos que puede pedir una página (se resuelven en `landing/Iconos.tsx`). */
export type NombreIcono =
  | "seguro" | "precio" | "lugar" | "avion" | "reloj" | "calendario" | "contrato"
  | "whatsapp" | "baja" | "camion" | "llave" | "documento" | "auto" | "edificio"
  | "personas" | "terreno" | "carnet" | "check" | "buscar" | "tarjeta" | "apreton";

export interface Punto {
  icono: NombreIcono;
  titulo: string;
  detalle: string;
}

export interface Categoria {
  titulo: string;
  imagen: string;
  alt: string;
  /** Datos cortos: "5 pasajeros", "2 valijas"… */
  datos: string[];
  /** Un modelo de referencia ("o similar"). */
  ejemplo: string;
}

export interface Paso {
  icono: NombreIcono;
  titulo: string;
  detalle?: string;
}

export interface Landing {
  /** Sin barra. Es la URL: `/${slug}`. */
  slug: string;
  /** Nombre corto: migas de pan y enlaces entre páginas. */
  nombre: string;
  icono: NombreIcono;
  /** `<title>` completo, hasta 60 caracteres. */
  titulo: string;
  /** Meta description, hasta 155 caracteres. */
  descripcion: string;
  /** El gancho: una línea corta sobre el título. Distinto en cada página. */
  gancho: string;
  /** El título con la búsqueda por la que se entra. */
  h1: string;
  /** Una sola frase que responde la búsqueda. */
  bajada: string;
  /**
   * A la derecha del título: el buscador de reserva, o una tarjeta de contacto
   * cuando la página no se reserva online (Uber y empresas).
   */
  reserva: "buscador" | "whatsapp";
  /** Texto de la tarjeta de contacto, si `reserva` es "whatsapp". */
  tarjetaWhatsapp?: { titulo: string; detalle: string };
  puntos: Punto[];
  /** Categorías con foto (`public/img`), si la página las muestra. */
  categorias?: Categoria[];
  /** Pasos "cómo funciona", si la página los muestra. */
  pasos?: Paso[];
  /** Muestra la escalera de descuentos en vivo (sale de `/public/config`). */
  conEscalera?: boolean;
  /** Ids de `lib/faq.ts`, en el orden en que se muestran. */
  preguntasIds: string[];
  /** Preguntas que sólo tienen sentido en esta página. Van primero. */
  preguntasPropias?: Pregunta[];
  /** Texto para precargar el lugar de retiro del buscador. */
  lugarInicial?: string;
  /** Slugs de otras páginas para enlazar. */
  hermanas: string[];
  /** Para el JSON-LD `Service`. */
  servicio: { nombre: string; descripcion: string };
  /** Mensaje con el que abre el WhatsApp de la página. */
  whatsapp: string;
}

/**
 * Las rutas fijas de `app/`. Una landing con uno de estos slugs quedaría tapada
 * por la ruta fija sin ningún aviso, y la página no se vería nunca.
 */
export const SLUGS_RESERVADOS = [
  "reservar",
  "maquinaria",
  "preguntas-frecuentes",
  "terminos",
  "privacidad",
  "contrato",
  "api",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
];

// Las categorías de auto. Los modelos son de referencia ("o similar"): se
// reserva la categoría y el modelo exacto se confirma al retirar.
const COMPACTO: Categoria = {
  titulo: "Compacto",
  imagen: "/img/compacto.png",
  alt: "Auto compacto de 5 puertas para alquilar en Bahía Blanca",
  datos: ["5 pasajeros", "2 valijas"],
  ejemplo: "Fiat Argo, Chevrolet Onix o similar",
};
const SEDAN: Categoria = {
  titulo: "Sedán",
  imagen: "/img/sedan-intermedio.png",
  alt: "Sedán intermedio para alquilar en Bahía Blanca",
  datos: ["5 pasajeros", "3 valijas"],
  ejemplo: "Fiat Cronos, Toyota Etios o similar",
};
const SEDAN_SUPERIOR: Categoria = {
  titulo: "Sedán superior",
  imagen: "/img/sedan-superior.png",
  alt: "Sedán superior automático para alquilar en Bahía Blanca",
  datos: ["5 pasajeros", "3 valijas", "Automático"],
  ejemplo: "VW Virtus o similar",
};
const PICKUP: Categoria = {
  titulo: "Pick-up 4x4",
  imagen: "/img/pickup.png",
  alt: "Pick-up doble cabina 4x4 para alquilar en Bahía Blanca",
  datos: ["5 pasajeros", "4 valijas", "Tracción 4x4"],
  ejemplo: "Toyota Hilux, VW Amarok, Foton Tunland o similar",
};

const PASOS_RESERVA: Paso[] = [
  { icono: "buscar", titulo: "Elegí lugar y fechas", detalle: "En el buscador, con la edad de quien maneja." },
  { icono: "precio", titulo: "Mirá el precio final", detalle: "Con impuestos y seguro de responsabilidad civil." },
  { icono: "check", titulo: "Reservá y retirá", detalle: "Seña online; el saldo, al retirar." },
];

export const LANDINGS: Landing[] = [
  {
    slug: "alquiler-de-autos-bahia-blanca",
    nombre: "Alquiler de autos",
    icono: "auto",
    titulo: "Alquiler de Autos por Día en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá un auto en Bahía Blanca: compacto, sedán o sedán superior. Reservá online con el precio final y el seguro incluido, y retirá en Bahía Blanca.",
    gancho: "Reservá online con el precio final",
    h1: "Alquiler de autos en Bahía Blanca",
    bajada: "Compacto, sedán o sedán superior, con el seguro de responsabilidad civil incluido.",
    reserva: "buscador",
    puntos: [
      { icono: "seguro", titulo: "Seguro incluido", detalle: "Responsabilidad civil, ya en el precio." },
      { icono: "precio", titulo: "Precio final", detalle: "Impuestos incluidos." },
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto." },
      { icono: "carnet", titulo: "Licencia extranjera", detalle: "Si está vigente, te sirve." },
    ],
    categorias: [COMPACTO, SEDAN, SEDAN_SUPERIOR],
    pasos: PASOS_RESERVA,
    preguntasIds: ["requisitos", "licencia-extranjera", "edad", "que-incluye", "franquicia"],
    hermanas: [
      "alquiler-camionetas-4x4-bahia-blanca",
      "alquiler-de-autos-aeropuerto-bahia-blanca",
      "alquiler-de-autos-por-mes-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler de autos sin chofer en Bahía Blanca",
      descripcion:
        "Alquiler de automóviles sin conductor en Bahía Blanca, con reserva online y precio final.",
    },
    whatsapp: "Hola! Quiero alquilar un auto en Bahía Blanca. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-camionetas-4x4-bahia-blanca",
    nombre: "Camionetas 4x4",
    icono: "camion",
    titulo: "Alquiler de Camionetas 4x4 en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá una pick-up 4x4 doble cabina en Bahía Blanca para campo, obra o trabajo. Reservá online con el precio final y el seguro de responsabilidad civil.",
    gancho: "Hecha para el campo y la obra",
    h1: "Alquiler de camionetas 4x4 en Bahía Blanca",
    bajada: "Pick-ups doble cabina con tracción 4x4, para trabajo y caminos de tierra.",
    reserva: "buscador",
    puntos: [
      { icono: "terreno", titulo: "Tracción 4x4", detalle: "Para tierra, campo y obra." },
      { icono: "personas", titulo: "Cinco pasajeros", detalle: "Doble cabina y lugar para equipaje." },
      { icono: "seguro", titulo: "Seguro incluido", detalle: "Responsabilidad civil, ya en el precio." },
      { icono: "edificio", titulo: "Para empresas", detalle: "Varias camionetas o alquiler largo: escribinos." },
    ],
    categorias: [PICKUP],
    pasos: PASOS_RESERVA,
    preguntasIds: ["requisitos", "licencia-extranjera", "kilometraje", "que-no-se-puede", "franquicia"],
    hermanas: [
      "alquiler-de-autos-bahia-blanca",
      "empresas",
      "alquiler-de-autos-por-mes-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler de camionetas 4x4 en Bahía Blanca",
      descripcion:
        "Alquiler de camionetas doble cabina con tracción 4x4 en Bahía Blanca para campo, obra y uso corporativo.",
    },
    whatsapp: "Hola! Necesito una pick up 4x4 en Bahía Blanca. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-de-autos-aeropuerto-bahia-blanca",
    nombre: "Autos en el aeropuerto",
    icono: "avion",
    titulo: "Alquiler de Autos en Aeropuerto Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá un auto y retiralo en el Aeropuerto Comandante Espora de Bahía Blanca. Lo pedís online y te lo entregamos en el aeropuerto a la hora pactada.",
    gancho: "Pedilo online, retiralo en el aeropuerto",
    h1: "Alquiler de autos en el Aeropuerto de Bahía Blanca",
    bajada: "Te lo entregamos en el Aeropuerto Comandante Espora a la hora pactada.",
    reserva: "buscador",
    lugarInicial: "aeropuerto",
    puntos: [
      { icono: "avion", titulo: "Entrega en el aeropuerto", detalle: "A la hora que pactes." },
      { icono: "reloj", titulo: "Elegís el horario", detalle: "Lo indicás al reservar." },
      { icono: "lugar", titulo: "Devolvé donde te sirva", detalle: "En el aeropuerto o en otro de nuestros puntos." },
      { icono: "carnet", titulo: "Licencia extranjera", detalle: "Si está vigente, te sirve." },
    ],
    pasos: [
      { icono: "lugar", titulo: "Elegí el aeropuerto", detalle: "«Aeropuerto Comandante Espora» como lugar de retiro, y tu horario." },
      { icono: "check", titulo: "Reservá online", detalle: "Precio final con seguro de responsabilidad civil." },
      { icono: "avion", titulo: "Te lo entregamos ahí", detalle: "A la hora pactada. Si tu vuelo cambia, avisanos por WhatsApp." },
    ],
    preguntasIds: ["requisitos", "licencia-extranjera", "anticipacion", "combustible"],
    preguntasPropias: [
      {
        id: "entrega-aeropuerto",
        pregunta: "¿Me entregan el auto en el aeropuerto?",
        respuesta: [
          "Sí. Elegís el Aeropuerto Comandante Espora como lugar de retiro al reservar, indicás el horario, y el auto se entrega ahí a la hora pactada.",
        ],
      },
    ],
    hermanas: [
      "alquiler-de-autos-bahia-blanca",
      "alquiler-camionetas-4x4-bahia-blanca",
      "alquiler-de-autos-por-mes-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler de autos con entrega en el Aeropuerto de Bahía Blanca",
      descripcion:
        "Alquiler de autos con retiro en el Aeropuerto Comandante Espora de Bahía Blanca: se pide el vehículo y se entrega a la hora pactada.",
    },
    whatsapp:
      "Hola! Quiero alquilar un auto y retirarlo en el Aeropuerto de Bahía Blanca. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-auto-para-uber-bahia-blanca",
    nombre: "Autos para Uber",
    icono: "contrato",
    titulo: "Alquiler de Autos para Uber en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquiler semanal de autos para trabajar con aplicaciones de viaje como Uber en Bahía Blanca. Contrato específico; las condiciones se acuerdan por WhatsApp.",
    gancho: "Para trabajar con aplicaciones de viaje",
    h1: "Alquiler de autos para Uber en Bahía Blanca",
    bajada: "Alquiler semanal con un contrato pensado para ese uso. Lo coordinamos por WhatsApp.",
    reserva: "whatsapp",
    tarjetaWhatsapp: {
      titulo: "Arrancá por WhatsApp",
      detalle: "Te contamos qué autos hay y cómo se arma el contrato.",
    },
    puntos: [
      { icono: "calendario", titulo: "Alquiler semanal", detalle: "Se cotiza por semana." },
      { icono: "contrato", titulo: "Contrato específico", detalle: "Valor semanal, km incluidos, km extra y fechas de pago." },
      { icono: "whatsapp", titulo: "Se acuerda con vos", detalle: "Condiciones y requisitos, por WhatsApp." },
      { icono: "seguro", titulo: "Aparte del alquiler común", detalle: "Ese uso no está permitido en el alquiler común." },
    ],
    pasos: [
      { icono: "whatsapp", titulo: "Escribinos", detalle: "Contanos que es para trabajar con una app." },
      { icono: "auto", titulo: "Elegimos el auto", detalle: "Te decimos qué hay disponible." },
      { icono: "contrato", titulo: "Armamos el contrato", detalle: "Con las condiciones que acordamos." },
    ],
    preguntasIds: ["requisitos", "edad", "que-no-se-puede", "franquicia"],
    hermanas: [
      "alquiler-de-autos-bahia-blanca",
      "alquiler-de-autos-por-mes-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler semanal de autos para aplicaciones de viaje en Bahía Blanca",
      descripcion:
        "Alquiler semanal de autos para trabajar con aplicaciones de viaje como Uber, con contrato específico.",
    },
    whatsapp:
      "Hola! Quiero alquilar un auto para trabajar con Uber en Bahía Blanca. ¿Cómo es el contrato?",
  },
  {
    slug: "alquiler-de-autos-por-mes-bahia-blanca",
    nombre: "Alquiler por mes",
    icono: "calendario",
    titulo: "Alquiler de Autos por Mes en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá un auto por mes o por varios días en Bahía Blanca: cuanto más largo el alquiler, menos pagás por día. Reservá online con el precio final.",
    gancho: "Más días, menos por día",
    h1: "Alquiler de autos por mes en Bahía Blanca",
    bajada: "El precio por día baja a medida que el alquiler es más largo, sin pedirlo ni usar códigos.",
    reserva: "buscador",
    puntos: [
      { icono: "baja", titulo: "Menos por día", detalle: "Cuanto más largo, mejor precio." },
      { icono: "precio", titulo: "Precio final", detalle: "Impuestos y seguro incluidos." },
      { icono: "apreton", titulo: "Alquiler a medida", detalle: "Si es largo, escribinos y lo armamos." },
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto." },
    ],
    conEscalera: true,
    preguntasIds: ["mas-dias", "formas-de-pago", "cuanto-adelanto", "kilometraje"],
    hermanas: [
      "alquiler-de-autos-bahia-blanca",
      "alquiler-camionetas-4x4-bahia-blanca",
      "empresas",
    ],
    servicio: {
      nombre: "Alquiler de autos por mes en Bahía Blanca",
      descripcion:
        "Alquiler de autos por períodos largos en Bahía Blanca, con precio por día decreciente.",
    },
    whatsapp: "Hola! Quiero alquilar un auto por un mes en Bahía Blanca. ¿Me pasan precio?",
  },
  {
    slug: "empresas",
    nombre: "Empresas",
    icono: "edificio",
    titulo: "Vehículos para Empresas en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquiler de vehículos para empresas en Bahía Blanca: sumá vehículos según lo que necesitás, con mantenimiento, seguros y patente incluidos.",
    gancho: "Flota a la medida de tu empresa",
    h1: "Alquiler de vehículos para empresas en Bahía Blanca",
    bajada: "Sumás vehículos según lo que necesitás, con mantenimiento, seguros y patente incluidos.",
    reserva: "whatsapp",
    tarjetaWhatsapp: {
      titulo: "Contanos qué necesitás",
      detalle: "Cuántos vehículos, para qué y por cuánto tiempo. Armamos la propuesta.",
    },
    puntos: [
      { icono: "camion", titulo: "Sumá vehículos", detalle: "Según lo que necesites." },
      { icono: "llave", titulo: "Todo incluido", detalle: "Mantenimiento, seguros y patente." },
      { icono: "documento", titulo: "Documentación al día", detalle: "Vehículos revisados, con cobertura según contrato." },
      { icono: "whatsapp", titulo: "Sin intermediarios", detalle: "Por WhatsApp, teléfono o en persona." },
    ],
    categorias: [PICKUP, SEDAN],
    preguntasIds: ["formas-de-pago", "otro-conductor", "franquicia"],
    hermanas: [
      "alquiler-camionetas-4x4-bahia-blanca",
      "alquiler-de-autos-por-mes-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler de vehículos para empresas en Bahía Blanca",
      descripcion:
        "Alquiler de autos y camionetas para empresas en Bahía Blanca, con mantenimiento, seguros y patente incluidos.",
    },
    whatsapp:
      "Hola! Somos una empresa y queremos alquilar vehículos en Bahía Blanca. ¿Podemos coordinar una propuesta?",
  },
];

// ─── Validaciones de build ──────────────────────────────────────────────────
// Un error acá rompe el build: es preferible a publicar una página tapada,
// duplicada o con un título que Google va a cortar.
const vistos = new Set<string>();
for (const l of LANDINGS) {
  if (SLUGS_RESERVADOS.includes(l.slug)) {
    throw new Error(`La landing "${l.slug}" usa un slug reservado: la ruta fija la taparía.`);
  }
  if (vistos.has(l.slug)) throw new Error(`Slug de landing repetido: "${l.slug}".`);
  vistos.add(l.slug);
  if (l.titulo.length > 60) {
    throw new Error(`El título de "${l.slug}" tiene ${l.titulo.length} caracteres (máximo 60).`);
  }
  if (l.descripcion.length > 155) {
    throw new Error(
      `La descripción de "${l.slug}" tiene ${l.descripcion.length} caracteres (máximo 155).`,
    );
  }
  if (l.reserva === "whatsapp" && !l.tarjetaWhatsapp) {
    throw new Error(`"${l.slug}" se coordina por WhatsApp pero no tiene \`tarjetaWhatsapp\`.`);
  }
}
for (const l of LANDINGS) {
  for (const h of l.hermanas) {
    if (!vistos.has(h)) throw new Error(`"${l.slug}" enlaza a "${h}", que no existe.`);
  }
}

export function landingPorSlug(slug: string): Landing | undefined {
  return LANDINGS.find((l) => l.slug === slug);
}
