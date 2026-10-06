/**
 * Las páginas de servicio: una por cada cosa que alguien busca en Google
 * ("alquiler de camionetas 4x4 bahía blanca", "alquiler de autos aeropuerto
 * bahía blanca"…). Hasta ahora todas competían por la portada.
 *
 * **Agregar una página es agregar una entrada acá y escribir su texto.** La ruta
 * (`app/[landing]/page.tsx`), el sitemap, el `llms.txt` y los enlaces del
 * footer salen de esta lista, así no se desalinean.
 *
 * Reglas de contenido (plan `docs/PLAN_SEO.md`):
 *
 * - **Una página existe sólo si responde una búsqueda real y tiene texto
 *   propio.** Nada de páginas en serie que cambian el nombre del pueblo: Google
 *   las castiga y hunde al sitio entero.
 * - **Ninguna afirma lo que Ubicar no cumple.** Lo confirmado: se alquila con
 *   licencia extranjera, y en el aeropuerto el vehículo se pide y se entrega a
 *   la hora pactada. No se escribe nada sobre entregas fuera de Bahía Blanca,
 *   maquinaria con operario, atención 24 h, "cobertura total" ni "sin franquicia".
 * - **Ningún precio ni porcentaje a mano.** Lo que tiene número lo trae el
 *   componente que lee `/public/config`.
 * - **Las respuestas de política se toman de `lib/faq.ts` por `id`.** Una
 *   pregunta propia sólo va si es específica de la página.
 * - El primer párrafo responde solo —qué, dónde, cómo se reserva—: es el que
 *   citan los buscadores de IA.
 */
import type { Pregunta } from "@/lib/faq";

export interface Landing {
  /** Sin barra. Es la URL: `/${slug}`. */
  slug: string;
  /** Nombre corto: migas de pan y enlaces entre páginas. */
  nombre: string;
  /** `<title>` completo, hasta 60 caracteres. */
  titulo: string;
  /** Meta description, hasta 155 caracteres. */
  descripcion: string;
  h1: string;
  /** El primero responde la búsqueda por sí solo. */
  intro: string[];
  secciones: { titulo: string; parrafos: string[] }[];
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

export const LANDINGS: Landing[] = [
  {
    slug: "alquiler-de-autos-bahia-blanca",
    nombre: "Alquiler de autos",
    titulo: "Alquiler de Autos por Día en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá un auto en Bahía Blanca: compacto, sedán o sedán superior. Reservá online con el precio final y el seguro incluido, y retirá en Bahía Blanca.",
    h1: "Alquiler de autos en Bahía Blanca",
    intro: [
      "En Ubicar Rent alquilás un auto en Bahía Blanca reservando online: elegís el lugar de retiro, las fechas y la edad de quien maneja, y ves el precio final con impuestos y seguro de responsabilidad civil incluidos.",
      "Tenemos tres categorías de auto —compacto, sedán y sedán superior— y tres puntos de retiro en Bahía Blanca: Paraguay 241, Alsina 350 y el Aeropuerto Comandante Espora.",
    ],
    secciones: [
      {
        titulo: "Las categorías de auto",
        parrafos: [
          "Compacto: para moverte por la ciudad y hacer viajes cortos. Cinco pasajeros y dos valijas, como un Fiat Argo o un Chevrolet Onix.",
          "Sedán: más baúl y más comodidad para rutas y viajes de trabajo. Cinco pasajeros y tres valijas, como un Fiat Cronos o un Toyota Etios.",
          "Sedán superior: transmisión automática y mayor equipamiento. Cinco pasajeros y tres valijas, como un VW Virtus.",
          "Reservás una categoría, no un modelo: te garantizamos un vehículo de la categoría que elegiste o de una superior, y el modelo exacto se confirma al retirar.",
        ],
      },
      {
        titulo: "Cómo reservar",
        parrafos: [
          "Elegís dónde y cuándo en el buscador, ves lo disponible con su precio, sumás los extras que quieras y pagás la seña online. El saldo se abona al retirar el vehículo.",
          "Si lo necesitás con poco tiempo o preferís hablar con alguien, escribinos por WhatsApp y lo coordinamos.",
        ],
      },
    ],
    preguntasIds: ["requisitos", "licencia-extranjera", "edad", "que-incluye", "franquicia", "cancelar"],
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
    titulo: "Alquiler de Camionetas 4x4 en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá una pick-up 4x4 doble cabina en Bahía Blanca para campo, obra o trabajo. Reservá online con el precio final y el seguro de responsabilidad civil.",
    h1: "Alquiler de camionetas 4x4 en Bahía Blanca",
    intro: [
      "Alquilamos pick-ups doble cabina con tracción 4x4 en Bahía Blanca, para trabajo en campo, obra o caminos rurales. Reservás online, ves el precio final con el seguro de responsabilidad civil incluido y retirás en Bahía Blanca.",
      "La categoría Pick-up lleva cinco pasajeros y cuatro valijas, con modelos como la Toyota Hilux, la VW Amarok o la Foton Tunland.",
    ],
    secciones: [
      {
        titulo: "Para qué se usa",
        parrafos: [
          "La pick-up 4x4 es la elección para quien trabaja en el campo, en una obra o en caminos de tierra, y para empresas que necesitan mover equipos y personal con un vehículo que aguante el uso exigente.",
          "Reservás la categoría, no un modelo: te garantizamos una pick-up de la categoría o una superior, y el modelo exacto se confirma al retirar según la disponibilidad del día.",
        ],
      },
      {
        titulo: "Si es para tu empresa",
        parrafos: [
          "Si necesitás varias camionetas, o alquilar por un tiempo largo, escribinos y armamos la propuesta. También alquilamos maquinaria pesada para obra.",
        ],
      },
    ],
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
    titulo: "Alquiler de Autos en Aeropuerto Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá un auto y retiralo en el Aeropuerto Comandante Espora de Bahía Blanca. Lo pedís online y te lo entregamos en el aeropuerto a la hora pactada.",
    h1: "Alquiler de autos en el Aeropuerto de Bahía Blanca",
    intro: [
      "Si llegás en avión a Bahía Blanca, pedís el auto online y te lo entregamos en el Aeropuerto Comandante Espora a la hora pactada.",
      "En el buscador elegís el aeropuerto como lugar de retiro y el horario en que lo necesitás. Ves el precio final con el seguro de responsabilidad civil incluido y reservás.",
    ],
    secciones: [
      {
        titulo: "Cómo funciona la entrega en el aeropuerto",
        parrafos: [
          "Reservás el auto eligiendo «Aeropuerto Comandante Espora» como lugar de retiro y poniendo el horario al que querés recibirlo. A esa hora te lo entregamos ahí.",
          "Para devolverlo, podés elegir el aeropuerto u otro de nuestros puntos: Paraguay 241 o Alsina 350, en Bahía Blanca. Lo indicás al reservar, tildando «Devolver en otro lugar».",
          "Si tu vuelo se demora o cambia de horario, avisanos por WhatsApp.",
        ],
      },
      {
        titulo: "Qué llevar",
        parrafos: [
          "Documento de identidad o pasaporte y licencia de conducir vigente. Si viajás desde el exterior, también podés alquilar con licencia extranjera.",
        ],
      },
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
    lugarInicial: "aeropuerto",
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
    titulo: "Alquiler de Autos para Uber en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquiler semanal de autos para trabajar con aplicaciones de viaje como Uber en Bahía Blanca. Contrato específico; las condiciones se acuerdan por WhatsApp.",
    h1: "Alquiler de autos para Uber en Bahía Blanca",
    intro: [
      "Alquilamos autos por semana para trabajar con aplicaciones de viaje como Uber en Bahía Blanca, con un contrato pensado para ese uso.",
      "Las condiciones y el valor se cotizan por semana y se acuerdan con vos por WhatsApp.",
    ],
    secciones: [
      {
        titulo: "Un contrato distinto al alquiler común",
        parrafos: [
          "El alquiler común no permite usar el auto para transportar personas a título oneroso. Por eso, para trabajar con una app de viajes no se reserva por el buscador: se arma un contrato específico.",
          "En ese contrato queda escrito el valor por semana, los kilómetros incluidos, el precio del kilómetro extra y las fechas de pago.",
        ],
      },
      {
        titulo: "Cómo empezar",
        parrafos: [
          "Escribinos por WhatsApp y te contamos qué autos hay disponibles y cómo se arma el contrato.",
        ],
      },
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
    titulo: "Alquiler de Autos por Mes en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquilá un auto por mes o por varios días en Bahía Blanca: cuanto más largo el alquiler, menos pagás por día. Reservá online con el precio final.",
    h1: "Alquiler de autos por mes en Bahía Blanca",
    intro: [
      "Si necesitás un auto por un mes o más, en Ubicar Rent el precio por día baja a medida que el alquiler es más largo, y no hay que pedirlo ni usar ningún código.",
      "Reservás online, ves el precio final con el seguro de responsabilidad civil incluido y retirás en Bahía Blanca.",
    ],
    secciones: [
      {
        titulo: "Para quién conviene",
        parrafos: [
          "Para quien trabaja unas semanas en la ciudad, necesita un auto mientras arregla el suyo o prefiere no comprar uno para un período largo.",
          "Si tu caso es un alquiler largo y querés armarlo a medida, escribinos por WhatsApp: casi siempre se puede coordinar.",
        ],
      },
    ],
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
    titulo: "Vehículos para Empresas en Bahía Blanca | Ubicar Rent",
    descripcion:
      "Alquiler de vehículos para empresas en Bahía Blanca: sumá vehículos según lo que necesitás, con mantenimiento, seguros y patente incluidos.",
    h1: "Alquiler de vehículos para empresas en Bahía Blanca",
    intro: [
      "Ubicar Rent alquila vehículos a empresas en Bahía Blanca y la zona: sumás vehículos según lo que necesitás, con mantenimiento general, seguros y patente incluidos.",
      "Lo coordinamos por WhatsApp, por teléfono o en persona, sin intermediarios ni demoras.",
    ],
    secciones: [
      {
        titulo: "Qué ofrecemos",
        parrafos: [
          "Autos y camionetas 4x4 para el equipo, con alquileres por el tiempo que haga falta, incluso a largo plazo.",
          "Vehículos revisados, con la documentación al día y cobertura de seguro según contrato.",
          "Si además necesitás maquinaria para una obra, también la alquilamos.",
        ],
      },
      {
        titulo: "Cómo empezar",
        parrafos: [
          "Contanos qué necesitás —cuántos vehículos, para qué y por cuánto tiempo— y armamos la propuesta.",
        ],
      },
    ],
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
}
for (const l of LANDINGS) {
  for (const h of l.hermanas) {
    if (!vistos.has(h)) throw new Error(`"${l.slug}" enlaza a "${h}", que no existe.`);
  }
}

export function landingPorSlug(slug: string): Landing | undefined {
  return LANDINGS.find((l) => l.slug === slug);
}
