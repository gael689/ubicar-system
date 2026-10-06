/**
 * La maquinaria que se alquila: los datos de cada equipo, en un solo lugar.
 *
 * Vivían escritos adentro de `MaquinariaContent.tsx`. Ahora los leen la página
 * `/maquinaria` (la lista), una página por equipo (`/maquinaria/[equipo]`), el
 * sitemap y el `llms.txt`.
 *
 * **Lo que dice cada texto sale de la ficha que ya estaba publicada.** No se
 * afirma nada sobre operario, entrega en obra ni precios: la maquinaria no se
 * reserva online, se consulta por WhatsApp.
 */
export interface Maquina {
  slug: string;
  /** Para migas de pan y enlaces: "Retroexcavadora". */
  nombreCorto: string;
  /** El nombre completo del equipo. */
  nombre: string;
  /** Qué hace, en pocas palabras. */
  categoria: string;
  descripcion: string;
  specs: { label: string; value: string }[];
  /** Para qué se usa; todo sale de la descripción de la ficha. */
  usos: string[];
  imagen: string;
  imagenAlt: string;
  /** `<title>` completo, hasta 60 caracteres. */
  titulo: string;
  /** Meta description, hasta 155 caracteres. */
  metaDescripcion: string;
  waMsg: string;
}

export const MAQUINAS: Maquina[] = [
  {
    slug: "pala-cargadora",
    nombreCorto: "Pala cargadora",
    nombre: "Pala Cargadora 924 HZ",
    categoria: "Carga y movimiento de suelo",
    descripcion:
      "Motor Cat C6.6 Acert de alto rendimiento. Ideal para movimiento de tierra y carga de camiones en obras a gran escala. Sistema hidráulico con detección de carga automática.",
    specs: [
      { label: "Motor", value: "Cat C6.6 Acert" },
      { label: "Cuchara", value: "2,1 m³" },
      { label: "Fuerza arranque", value: "9.900 kg" },
      { label: "Combustible", value: "195 litros" },
      { label: "Hidráulico", value: "160 litros" },
      { label: "Transmisión", value: "Cambios suaves" },
    ],
    usos: ["Movimiento de tierra", "Carga de camiones", "Obras a gran escala"],
    imagen: "/img/maquinas/palaCargadora.png",
    imagenAlt: "Pala Cargadora 924 HZ",
    titulo: "Alquiler de Pala Cargadora en Bahía Blanca | Ubicar Rent",
    metaDescripcion:
      "Alquiler de pala cargadora 924 HZ en Bahía Blanca: motor Cat C6.6, cuchara de 2,1 m³. Para movimiento de tierra y carga de camiones. Consultá por WhatsApp.",
    waMsg: "Hola! Necesito alquilar la Pala Cargadora 924 HZ. ¿Disponibilidad y precio?",
  },
  {
    slug: "retroexcavadora",
    nombreCorto: "Retroexcavadora",
    nombre: "Retroexcavadora Caterpillar 416D",
    categoria: "Excavación y carga",
    descripcion:
      "Potencia diésel Caterpillar con tracción 4x4. Alta versatilidad con compatibilidad para martillos hidráulicos y compactadores. Cabina ergonómica con excelente visibilidad.",
    specs: [
      { label: "Motor", value: "Caterpillar diésel" },
      { label: "Potencia", value: "74–80 HP" },
      { label: "Tracción", value: "4x4 estándar" },
      { label: "Prof. excav.", value: "4.390–5.510 mm" },
      { label: "Transmisión", value: "Servomecánica" },
      { label: "Aditamentos", value: "Martillos / compactadores" },
    ],
    usos: ["Excavación", "Carga", "Trabajos con martillo hidráulico o compactador"],
    imagen: "/img/maquinas/retroExcavadora.png",
    imagenAlt: "Retroexcavadora Caterpillar 416D",
    titulo: "Alquiler de Retroexcavadora en Bahía Blanca | Ubicar Rent",
    metaDescripcion:
      "Alquiler de retroexcavadora Caterpillar 416D en Bahía Blanca: 74–80 HP, tracción 4x4, excavación de hasta 5.510 mm. Consultá disponibilidad por WhatsApp.",
    waMsg: "Hola! Necesito alquilar la Retroexcavadora Caterpillar 416D. ¿Disponibilidad y precio?",
  },
  {
    slug: "camion-volcador",
    nombreCorto: "Camión volcador",
    nombre: "Ford Cargo 1722 Volcador",
    categoria: "Transporte y volcado",
    descripcion:
      "Camión con batea volcadora de alta capacidad. Motor Cummins 6BT 5.9L de 220 CV. Ideal para transporte y descarga de áridos, tierra y materiales de construcción.",
    specs: [
      { label: "Motor", value: "Cummins 6BT 5.9L" },
      { label: "Potencia", value: "220 CV" },
      { label: "Tracción", value: "4x2" },
      { label: "Carga útil", value: "~17 toneladas" },
      { label: "Tolva", value: "7–8 m³" },
      { label: "Transmisión", value: "Eaton Fuller 6v" },
    ],
    usos: ["Transporte de áridos y tierra", "Descarga de materiales de construcción"],
    imagen: "/img/maquinas/fordCargo.png",
    imagenAlt: "Ford Cargo 1722 Volcador",
    titulo: "Alquiler de Camión Volcador en Bahía Blanca | Ubicar Rent",
    metaDescripcion:
      "Alquiler de camión volcador Ford Cargo 1722 en Bahía Blanca: 220 CV, unas 17 toneladas de carga útil y tolva de 7–8 m³. Consultá por WhatsApp.",
    waMsg: "Hola! Necesito alquilar el Ford Cargo volcador. ¿Disponibilidad y precio?",
  },
  {
    slug: "minicargadora",
    nombreCorto: "Minicargadora",
    nombre: "Minicargadora New Holland L318",
    categoria: "Espacios reducidos",
    descripcion:
      'Equipo compacto con sistema "Super Boom" que carga volquetas doble troque sin reposicionarse. Cabina panorámica ROPS/FOPS y ciclos hidráulicos ultrarrápidos.',
    specs: [
      { label: "Motor", value: "60 HP · 4 cilindros" },
      { label: "Capacidad operativa", value: "818 kg" },
      { label: "Altura descarga", value: "3.048 mm" },
      { label: "Velocidad", value: "Hasta 17,4 kph" },
      { label: "Peso operativo", value: "2.832 kg" },
      { label: "Caudal hidráulico", value: "72 L/min" },
    ],
    usos: ["Trabajo en espacios reducidos", "Carga de volquetas doble troque"],
    imagen: "/img/maquinas/miniCargadora.png",
    imagenAlt: "Minicargadora New Holland L318",
    titulo: "Alquiler de Minicargadora en Bahía Blanca | Ubicar Rent",
    metaDescripcion:
      "Alquiler de minicargadora New Holland L318 en Bahía Blanca: 60 HP, 818 kg de capacidad operativa, ideal para espacios reducidos. Consultá por WhatsApp.",
    waMsg: "Hola! Necesito alquilar la Minicargadora New Holland L318. ¿Disponibilidad y precio?",
  },
  {
    slug: "tanque-de-agua",
    nombreCorto: "Tanque de agua",
    nombre: "Tanque de agua",
    categoria: "Provisión de agua",
    descripcion:
      "Solución de provisión continua de agua para obras, compactación de suelo y riego. Capacidad adecuada para mantener la operación sin interrupciones.",
    specs: [
      { label: "Uso ideal", value: "Obras · compactación" },
      { label: "Aplicaciones", value: "Riego · suelo · construcción" },
    ],
    usos: ["Provisión continua de agua en obra", "Compactación de suelo", "Riego"],
    imagen: "/img/tanque-agua.jpg",
    imagenAlt: "Tanque de agua para obra",
    titulo: "Alquiler de Tanque de Agua en Bahía Blanca | Ubicar Rent",
    metaDescripcion:
      "Alquiler de tanque de agua para obra en Bahía Blanca: provisión continua para compactación de suelo, riego y construcción. Consultá por WhatsApp.",
    waMsg: "Hola! Necesito el tanque de agua para una obra. ¿Disponibilidad y precio?",
  },
];

for (const m of MAQUINAS) {
  if (m.titulo.length > 60) {
    throw new Error(`El título de la máquina "${m.slug}" tiene ${m.titulo.length} caracteres (máximo 60).`);
  }
  if (m.metaDescripcion.length > 155) {
    throw new Error(
      `La descripción de la máquina "${m.slug}" tiene ${m.metaDescripcion.length} caracteres (máximo 155).`,
    );
  }
}

export function maquinaPorSlug(slug: string): Maquina | undefined {
  return MAQUINAS.find((m) => m.slug === slug);
}
