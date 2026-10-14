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
  | "personas" | "terreno" | "carnet" | "check" | "buscar" | "tarjeta" | "apreton"
  | "playa" | "sol" | "ancla" | "fabrica" | "ruta" | "mapa";

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

/**
 * El viaje desde Bahía Blanca hasta una localidad de la zona: lo que hace que
 * cada página de destino tenga contenido propio y no sea la misma con otro
 * nombre de pueblo.
 *
 * **Sólo datos verificados**, con la fuente anotada junto a la entrada. Los
 * kilómetros son por ruta desde el centro de Bahía Blanca, redondeados; el
 * tiempo es aproximado. Un dato que no se pudo confirmar no se escribe.
 *
 * El retiro y la devolución siguen siendo en Bahía Blanca: el bloque lo dice
 * siempre, para que nadie entienda que se entrega en el destino.
 */
export interface Viaje {
  /** La localidad, como se escribe en el título. */
  destino: string;
  /** Kilómetros por ruta desde el centro de Bahía Blanca, redondeados. */
  km: number;
  /** Por dónde se va: "RN 3 y RP 78". */
  ruta: string;
  /** Tiempo de manejo aproximado: "1 h 30 min". */
  tiempo: string;
  /** Una o dos frases sobre el camino. */
  nota?: string;
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
  /** Páginas de destino: el bloque "cómo llegar desde Bahía Blanca". */
  viaje?: Viaje;
  /** Slug de la página que la agrupa (migas de pan y JSON-LD). */
  padre?: string;
  /** Página que agrupa destinos: los slugs que muestra como tarjetas. Tienen que tener `viaje`. */
  destinos?: string[];
  /** Título y bajada propios del bloque de categorías ("Qué auto conviene para…"). */
  tituloCategorias?: string;
  subCategorias?: string;
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
      "alquiler-de-autos-bahia-blanca-y-zona",
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

  // ─── Bahía Blanca y la zona ───────────────────────────────────────────────
  // Una página por destino, cada una con su viaje, su vehículo y su motivo.
  // **Todas se plantean como "alquilá en Bahía Blanca y andá a X"**: el retiro y
  // la devolución son en Bahía Blanca (centro o aeropuerto), nunca en el destino.
  //
  // Fuentes de los datos del viaje (verificados el 14/10/2026):
  // - Kilómetros y tiempos: ruteo de OpenStreetMap (OSRM) desde la plaza
  //   Rivadavia, contrastado con la prensa (Monte Hermoso 104–105 km; Sierra de
  //   la Ventana ~110 km; Pehuen Co 81–83 km; Punta Alta 28 km; Ingeniero
  //   White ~10 km).
  // - Rutas: RN 3 y desvío por la RP 78 en el km 605 (Ámbito); RN 3 y RP 113 a
  //   la altura de Bajo Hondo, pavimentada (C5N, Río Negro); RN 229 a Punta Alta
  //   (Vía País); Saldungaray sobre la RP 72, a 8 km de Sierra de la Ventana.
  // - Base Naval Puerto Belgrano: la más grande de la Armada, junto a Punta Alta
  //   (Wikipedia). Reserva paleontológica Pehuen Co–Monte Hermoso: Ley 13.394.
  {
    slug: "alquiler-de-autos-bahia-blanca-y-zona",
    nombre: "Bahía Blanca y zona",
    icono: "mapa",
    titulo: "Alquiler de Autos en Bahía Blanca y la Zona | Ubicar Rent",
    descripcion:
      "Alquilá un auto o una pick-up en Bahía Blanca y viajá a Monte Hermoso, Pehuen Co, Sierra de la Ventana, Punta Alta o Ingeniero White. Reservá online.",
    gancho: "Retirás acá, viajás a donde quieras",
    h1: "Alquiler de autos en Bahía Blanca y la zona",
    bajada:
      "Retirás en Bahía Blanca o en el aeropuerto y viajás a la playa, las sierras o el puerto. Se reserva online, con el precio final.",
    reserva: "buscador",
    puntos: [
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto. Ahí también lo devolvés." },
      { icono: "ruta", titulo: "Sin límite de provincia", detalle: "Dentro del país circulás sin restricciones." },
      { icono: "contrato", titulo: "Kilometraje en el contrato", detalle: "Si el viaje es largo, avisanos antes." },
      { icono: "camion", titulo: "Auto o pick-up 4x4", detalle: "Según el camino y la carga." },
    ],
    destinos: [
      "alquiler-de-camionetas-ingeniero-white",
      "alquiler-de-autos-punta-alta",
      "alquiler-de-autos-pehuen-co",
      "alquiler-de-autos-monte-hermoso",
      "alquiler-de-autos-sierra-de-la-ventana",
    ],
    categorias: [COMPACTO, SEDAN, PICKUP],
    tituloCategorias: "Qué conviene según el viaje",
    subCategorias: "Para la ruta asfaltada alcanza un auto; para tierra, obra o carga, la pick-up.",
    preguntasIds: ["kilometraje", "salir-del-pais", "requisitos", "que-incluye"],
    preguntasPropias: [
      {
        id: "entrega-en-otra-localidad",
        pregunta: "¿Me llevan el auto a Monte Hermoso o a otra localidad?",
        respuesta: [
          "No. El retiro y la devolución son en Bahía Blanca: en nuestros puntos del centro o en el Aeropuerto Comandante Espora. Desde ahí manejás vos hasta tu destino.",
        ],
      },
    ],
    hermanas: [
      "alquiler-de-autos-bahia-blanca",
      "alquiler-camionetas-4x4-bahia-blanca",
      "alquiler-de-autos-aeropuerto-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler de autos en Bahía Blanca para viajar por la zona",
      descripcion:
        "Alquiler de autos y pick-ups con retiro en Bahía Blanca para viajar a Monte Hermoso, Pehuen Co, Sierra de la Ventana, Punta Alta e Ingeniero White.",
    },
    whatsapp: "Hola! Quiero alquilar un auto en Bahía Blanca para viajar por la zona. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-de-autos-monte-hermoso",
    nombre: "Monte Hermoso",
    icono: "playa",
    padre: "alquiler-de-autos-bahia-blanca-y-zona",
    titulo: "Alquiler de Autos para ir a Monte Hermoso | Ubicar Rent",
    descripcion:
      "Alquilá un auto en Bahía Blanca y andá a Monte Hermoso: 105 km por RN 3 y RP 78. Retirás en el centro o en el aeropuerto. Reservá online.",
    gancho: "La playa, a una hora y media",
    h1: "Alquiler de autos para ir a Monte Hermoso",
    bajada:
      "Retirás el auto en Bahía Blanca y en una hora y media estás en la playa. Se reserva online, con el precio final.",
    reserva: "buscador",
    puntos: [
      { icono: "sol", titulo: "Temporada de playa", detalle: "Ida y vuelta en tus horarios, con todo el equipaje." },
      { icono: "personas", titulo: "Toda la familia", detalle: "Cinco pasajeros y lugar para las valijas." },
      { icono: "calendario", titulo: "Por día o por semana", detalle: "Más días, menos por día." },
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto." },
    ],
    viaje: {
      destino: "Monte Hermoso",
      km: 105,
      ruta: "RN 3 y RP 78",
      tiempo: "1 h 30 min",
      nota: "Todo asfalto: el desvío por la RP 78 está en el km 605 de la RN 3. En temporada alta la RP 78 se carga; salir temprano ayuda.",
    },
    categorias: [COMPACTO, SEDAN],
    tituloCategorias: "Qué auto conviene para Monte Hermoso",
    subCategorias: "Es todo asfalto: un compacto alcanza. Si van cinco con valijas, el sedán tiene más baúl.",
    preguntasIds: ["anticipacion", "kilometraje", "combustible", "requisitos"],
    preguntasPropias: [
      {
        id: "retiro-monte-hermoso",
        pregunta: "¿Dónde retiro el auto para ir a Monte Hermoso?",
        respuesta: [
          "En Bahía Blanca: en nuestros puntos del centro o en el Aeropuerto Comandante Espora. No entregamos en Monte Hermoso; desde Bahía Blanca son unos 105 km por la RN 3 y la RP 78.",
        ],
      },
    ],
    hermanas: [
      "alquiler-de-autos-bahia-blanca-y-zona",
      "alquiler-de-autos-pehuen-co",
      "alquiler-de-autos-aeropuerto-bahia-blanca",
    ],
    servicio: {
      nombre: "Alquiler de autos en Bahía Blanca para viajar a Monte Hermoso",
      descripcion:
        "Alquiler de autos con retiro en Bahía Blanca para viajar a Monte Hermoso, a unos 105 km por la RN 3 y la RP 78.",
    },
    whatsapp: "Hola! Quiero alquilar un auto en Bahía Blanca para ir a Monte Hermoso. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-de-autos-sierra-de-la-ventana",
    nombre: "Sierra de la Ventana",
    icono: "terreno",
    padre: "alquiler-de-autos-bahia-blanca-y-zona",
    titulo: "Alquiler de Autos para Sierra de la Ventana | Ubicar Rent",
    descripcion:
      "Alquilá un auto o una pick-up en Bahía Blanca y andá a Sierra de la Ventana, a unos 110 km. Recorré la comarca serrana a tu ritmo. Reservá online.",
    gancho: "Las sierras, sin depender del micro",
    h1: "Alquiler de autos para ir a Sierra de la Ventana",
    bajada:
      "Retirás en Bahía Blanca y en una hora y media llegás a las sierras. Se reserva online, con el precio final.",
    reserva: "buscador",
    puntos: [
      { icono: "terreno", titulo: "Cerros y senderos", detalle: "El Parque Provincial Ernesto Tornquist y el Cerro Tres Picos." },
      { icono: "mapa", titulo: "Toda la comarca", detalle: "Saldungaray, Villa Ventana y Tornquist, a tu ritmo." },
      { icono: "camion", titulo: "Pick-up si hay tierra", detalle: "Para caminos rurales y estancias." },
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto." },
    ],
    viaje: {
      destino: "Sierra de la Ventana",
      km: 110,
      ruta: "RP 51 y RP 72",
      tiempo: "1 h 30 min",
      nota: "El camino más corto pasa por Saldungaray, a 8 km del pueblo. La otra opción es la RN 33 hasta Tornquist y la RP 76, que bordea el parque provincial.",
    },
    categorias: [SEDAN, PICKUP],
    tituloCategorias: "Qué conviene para las sierras",
    subCategorias: "Para la ruta alcanza un sedán. Si vas a meterte en caminos de tierra, la pick-up 4x4.",
    preguntasIds: ["kilometraje", "otro-conductor", "que-incluye", "requisitos"],
    preguntasPropias: [
      {
        id: "sierras-4x4",
        pregunta: "¿Necesito una 4x4 para ir a Sierra de la Ventana?",
        respuesta: [
          "Para llegar al pueblo, no: alcanza un auto. La pick-up 4x4 conviene si pensás andar por caminos de tierra o ir a un campo. Retirás cualquiera de los dos en Bahía Blanca.",
        ],
      },
    ],
    hermanas: [
      "alquiler-de-autos-bahia-blanca-y-zona",
      "alquiler-camionetas-4x4-bahia-blanca",
      "alquiler-de-autos-monte-hermoso",
    ],
    servicio: {
      nombre: "Alquiler de autos en Bahía Blanca para viajar a Sierra de la Ventana",
      descripcion:
        "Alquiler de autos y pick-ups 4x4 con retiro en Bahía Blanca para viajar a Sierra de la Ventana y la comarca serrana, a unos 110 km.",
    },
    whatsapp: "Hola! Quiero alquilar un auto en Bahía Blanca para ir a Sierra de la Ventana. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-de-autos-punta-alta",
    nombre: "Punta Alta",
    icono: "ancla",
    padre: "alquiler-de-autos-bahia-blanca-y-zona",
    titulo: "Alquiler de Autos para ir a Punta Alta | Ubicar Rent",
    descripcion:
      "Alquilá un auto en Bahía Blanca para moverte a Punta Alta y la Base Naval Puerto Belgrano, a 28 km. Por día, por semana o por mes. Reservá online.",
    gancho: "A media hora de Bahía Blanca",
    h1: "Alquiler de autos para ir a Punta Alta",
    bajada:
      "Retirás en Bahía Blanca y en media hora estás en Punta Alta. Por día o por mes, con reserva online y precio final.",
    reserva: "buscador",
    puntos: [
      { icono: "ancla", titulo: "Base Naval Puerto Belgrano", detalle: "La base más grande de la Armada, junto a Punta Alta." },
      { icono: "reloj", titulo: "Ida y vuelta en el día", detalle: "Media hora de ruta para cada lado." },
      { icono: "baja", titulo: "Si te quedás un tiempo", detalle: "Por semana o por mes, el día sale menos." },
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto." },
    ],
    viaje: {
      destino: "Punta Alta",
      km: 28,
      ruta: "RN 3 y RN 229",
      tiempo: "30 min",
      nota: "Por la autovía Bahía Blanca–Punta Alta y la RN 229, que entra a la ciudad por la avenida Colón.",
    },
    categorias: [COMPACTO, SEDAN],
    tituloCategorias: "Qué auto conviene para Punta Alta",
    subCategorias: "Para ir y venir todos los días, un compacto gasta poco. Con familia, el sedán.",
    conEscalera: true,
    preguntasIds: ["mas-dias", "formas-de-pago", "edad", "requisitos"],
    hermanas: [
      "alquiler-de-autos-bahia-blanca-y-zona",
      "alquiler-de-autos-por-mes-bahia-blanca",
      "alquiler-de-autos-pehuen-co",
    ],
    servicio: {
      nombre: "Alquiler de autos en Bahía Blanca para viajar a Punta Alta",
      descripcion:
        "Alquiler de autos por día, semana o mes con retiro en Bahía Blanca, para moverse a Punta Alta y la Base Naval Puerto Belgrano, a 28 km.",
    },
    whatsapp: "Hola! Quiero alquilar un auto en Bahía Blanca para moverme a Punta Alta. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-de-autos-pehuen-co",
    nombre: "Pehuen Co",
    icono: "playa",
    padre: "alquiler-de-autos-bahia-blanca-y-zona",
    titulo: "Alquiler de Autos para ir a Pehuen Co | Ubicar Rent",
    descripcion:
      "Alquilá un auto en Bahía Blanca y andá a Pehuen Co, a unos 80 km por RN 3 y RP 113, todo asfalto. Retirás en el centro o en el aeropuerto.",
    gancho: "La playa más cercana, en auto",
    h1: "Alquiler de autos para ir a Pehuen Co",
    bajada:
      "Retirás en Bahía Blanca y en poco más de una hora estás en Pehuen Co. Se reserva online, con el precio final.",
    reserva: "buscador",
    puntos: [
      { icono: "playa", titulo: "Playa y médanos", detalle: "Una villa chica, con bosque frente al mar." },
      { icono: "buscar", titulo: "Huellas fósiles", detalle: "La reserva paleontológica, sobre la costa." },
      { icono: "ruta", titulo: "Acceso asfaltado", detalle: "RP 113 desde la RN 3, hasta la entrada." },
      { icono: "lugar", titulo: "Retiro en Bahía Blanca", detalle: "En el centro o en el aeropuerto." },
    ],
    viaje: {
      destino: "Pehuen Co",
      km: 80,
      ruta: "RN 3 y RP 113",
      tiempo: "1 h 20 min",
      nota: "Se deja la RN 3 a la altura de Bajo Hondo y la RP 113, pavimentada, lleva hasta la entrada de la villa.",
    },
    categorias: [COMPACTO, SEDAN],
    tituloCategorias: "Qué auto conviene para Pehuen Co",
    subCategorias: "El acceso es asfaltado: con un compacto llegás bien. Para más gente y bolsos, el sedán.",
    preguntasIds: ["combustible", "kilometraje", "que-auto", "cancelar"],
    preguntasPropias: [
      {
        id: "pehuen-co-o-monte-hermoso",
        pregunta: "¿Pehuen Co o Monte Hermoso: cuál queda más cerca?",
        respuesta: [
          "Pehuen Co: unos 80 km desde Bahía Blanca, contra unos 105 km hasta Monte Hermoso. Las dos se toman desde la RN 3 y tienen acceso asfaltado. En los dos casos el auto se retira y se devuelve en Bahía Blanca.",
        ],
      },
    ],
    hermanas: [
      "alquiler-de-autos-bahia-blanca-y-zona",
      "alquiler-de-autos-monte-hermoso",
      "alquiler-de-autos-punta-alta",
    ],
    servicio: {
      nombre: "Alquiler de autos en Bahía Blanca para viajar a Pehuen Co",
      descripcion:
        "Alquiler de autos con retiro en Bahía Blanca para viajar a Pehuen Co, a unos 80 km por la RN 3 y la RP 113.",
    },
    whatsapp: "Hola! Quiero alquilar un auto en Bahía Blanca para ir a Pehuen Co. ¿Me pasan disponibilidad y precio?",
  },
  {
    slug: "alquiler-de-camionetas-ingeniero-white",
    nombre: "Ingeniero White",
    icono: "fabrica",
    padre: "alquiler-de-autos-bahia-blanca-y-zona",
    titulo: "Alquiler de Camionetas para Ingeniero White | Ubicar Rent",
    descripcion:
      "Pick-ups 4x4 doble cabina para trabajar en el puerto y el polo petroquímico de Ingeniero White. Retirás en Bahía Blanca, a 10 km. Reservá online.",
    gancho: "Para el puerto y el polo",
    h1: "Alquiler de camionetas para Ingeniero White",
    bajada:
      "Pick-ups doble cabina para trabajar en el puerto y el polo petroquímico. Retirás en Bahía Blanca; se reservan online o por WhatsApp.",
    reserva: "buscador",
    puntos: [
      { icono: "fabrica", titulo: "Polo petroquímico", detalle: "Para contratistas, cuadrillas y personal de planta." },
      { icono: "ancla", titulo: "Puerto", detalle: "Para el trabajo en el puerto y sus terminales." },
      { icono: "personas", titulo: "Doble cabina", detalle: "Cinco personas y la caja para herramientas." },
      { icono: "edificio", titulo: "Varias camionetas", detalle: "Para empresas: escribinos y armamos la propuesta." },
    ],
    viaje: {
      destino: "Ingeniero White",
      km: 10,
      ruta: "Calles de la ciudad",
      tiempo: "15 a 20 min",
      nota: "Ingeniero White es parte del partido de Bahía Blanca: se llega por calles de la ciudad, sin salir a la ruta.",
    },
    categorias: [PICKUP],
    tituloCategorias: "La camioneta para el puerto",
    subCategorias: "Pick-up doble cabina 4x4: la cuadrilla adelante, las herramientas en la caja.",
    preguntasIds: ["que-no-se-puede", "otro-conductor", "formas-de-pago", "franquicia"],
    preguntasPropias: [
      {
        id: "varias-camionetas-white",
        pregunta: "¿Puedo alquilar varias camionetas para una obra en el polo?",
        respuesta: [
          "Sí. Escribinos con cuántas necesitás y por cuánto tiempo, y armamos la propuesta para tu empresa. Se retiran en Bahía Blanca.",
        ],
      },
    ],
    hermanas: [
      "empresas",
      "alquiler-camionetas-4x4-bahia-blanca",
      "alquiler-de-autos-por-mes-bahia-blanca",
      "alquiler-de-autos-bahia-blanca-y-zona",
    ],
    servicio: {
      nombre: "Alquiler de camionetas en Bahía Blanca para trabajar en Ingeniero White",
      descripcion:
        "Alquiler de pick-ups 4x4 doble cabina con retiro en Bahía Blanca, para trabajar en el puerto y el polo petroquímico de Ingeniero White.",
    },
    whatsapp:
      "Hola! Necesito una camioneta en Bahía Blanca para trabajar en Ingeniero White. ¿Me pasan disponibilidad y precio?",
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
  if (l.padre && !vistos.has(l.padre)) {
    throw new Error(`"${l.slug}" cuelga de "${l.padre}", que no existe.`);
  }
  for (const d of l.destinos ?? []) {
    const destino = LANDINGS.find((x) => x.slug === d);
    if (!destino) throw new Error(`"${l.slug}" lista el destino "${d}", que no existe.`);
    if (!destino.viaje) throw new Error(`"${d}" figura como destino pero no tiene \`viaje\`.`);
  }
}

/** Las páginas de "Bahía Blanca y la zona": la que agrupa y sus destinos. */
export function esDeZona(l: Landing): boolean {
  return !!l.viaje || !!l.destinos;
}

export function landingPorSlug(slug: string): Landing | undefined {
  return LANDINGS.find((l) => l.slug === slug);
}
