/**
 * Preguntas frecuentes del sitio.
 *
 * **Ninguna respuesta inventa una política.** Todo lo que se afirma acá sale de
 * los `TERMINOS` o de una decisión ya tomada y documentada. La FAQ es la
 * versión legible de lo mismo, no una segunda fuente: cuando cambie una
 * política hay que tocar los dos lugares, y por eso cada respuesta anota de
 * qué sección de los términos sale.
 *
 * Es además la página que mejor funciona en buscadores de todo el sitio: la
 * gente busca "hasta qué edad se puede alquilar un auto" y "necesito tarjeta
 * de crédito para alquilar", no "alquiler de autos Bahía Blanca". Por eso va
 * con `FAQPage` en JSON-LD y las preguntas están redactadas como las escribe
 * alguien en Google, no como las escribiría un abogado.
 *
 * Los porcentajes de descuento por duración **no se escriben acá**: se cargan
 * desde el sistema y cambian. La respuesta explica el mecanismo y la tabla con
 * los números vivos la arma `EscaleraFaq` contra `/public/config`. Un
 * porcentaje pisado en el código es una promesa que un día deja de ser cierta.
 */

export interface Pregunta {
  /** Sirve de ancla: `/preguntas-frecuentes#requisitos`. */
  id: string;
  pregunta: string;
  /** Un párrafo por elemento. Texto plano: va tal cual al JSON-LD. */
  respuesta: string[];
  /** Marca la pregunta cuya respuesta lleva la escalera de precios en vivo. */
  conEscalera?: boolean;
}

export interface GrupoFaq {
  titulo: string;
  preguntas: Pregunta[];
}

export const FAQ: GrupoFaq[] = [
  {
    titulo: "Reservar",
    preguntas: [
      {
        id: "anticipacion",
        pregunta: "¿Con cuánta anticipación tengo que reservar?",
        respuesta: [
          "Las reservas por el sitio se toman con un mínimo de 24 horas de anticipación.",
          "Si lo necesitás para hoy o para mañana temprano, escribinos por WhatsApp y lo coordinamos a mano: casi siempre se puede.",
        ],
      },
      {
        id: "cuanto-adelanto",
        pregunta: "¿Cuánto tengo que pagar para reservar?",
        respuesta: [
          "Elegís cuánto adelantar: el 30%, el 50% o el 100% del total. El mínimo para que la reserva quede tomada es el 30%.",
          "El saldo se abona al retirar el vehículo.",
        ],
      },
      {
        id: "que-auto",
        pregunta: "¿Reservo un modelo puntual o una categoría?",
        respuesta: [
          "Reservás una categoría, no un modelo. Te garantizamos un vehículo de la categoría que elegiste o de una superior, sin costo adicional para vos.",
          "El modelo exacto se confirma al retirar, según la disponibilidad del día.",
        ],
      },
      {
        id: "cancelar",
        pregunta: "¿Puedo cancelar? ¿Me devuelven lo que adelanté?",
        respuesta: [
          "Podés cancelar cuando quieras, pero el monto adelantado al reservar no se reintegra: ni por cancelación tuya, ni si no te presentás a retirar el vehículo.",
          "La única excepción es que el que no pueda cumplir seamos nosotros. En ese caso te ofrecemos otro vehículo sin costo adicional o te devolvemos el 100% de lo abonado.",
          "Cambiar fechas, horarios o el lugar de devolución hay que avisarlo con anticipación: puede generar cargos o no ser posible según la disponibilidad.",
        ],
      },
    ],
  },
  {
    titulo: "Requisitos",
    preguntas: [
      {
        id: "requisitos",
        pregunta: "¿Qué necesito para retirar el vehículo?",
        respuesta: [
          "Quien vaya a conducir tiene que presentar DNI o pasaporte vigente y licencia de conducir vigente, habilitante para la categoría del vehículo y válida en las jurisdicciones por donde vaya a circular.",
          "Además pedimos una tarjeta de crédito a nombre del conductor, para la garantía.",
          "Si va a manejar más de una persona, necesitamos el nombre, el documento y el domicilio de cada conductor adicional: sólo pueden manejar los que quedan autorizados por escrito en el contrato.",
        ],
      },
      {
        id: "edad",
        pregunta: "¿Hay una edad mínima para alquilar?",
        respuesta: [
          "No exigimos una edad mínima. Según la edad del conductor puede corresponder un recargo sobre la tarifa.",
          "Ese recargo se calcula y se muestra durante la reserva, antes de que confirmes nada: nunca aparece después. Por eso te pedimos la fecha de nacimiento al reservar.",
        ],
      },
      {
        id: "otro-conductor",
        pregunta: "¿Puede manejar otra persona además de mí?",
        respuesta: [
          "Sí, siempre que quede autorizada expresamente en el contrato. Necesitamos su nombre, documento y domicilio, y tiene que tener licencia vigente.",
          "Si maneja alguien que no está autorizado en el contrato, la cobertura no responde y la responsabilidad es total.",
        ],
      },
    ],
  },
  {
    titulo: "Precio y pago",
    preguntas: [
      {
        id: "que-incluye",
        pregunta: "¿Qué incluye el precio?",
        respuesta: [
          "Los precios están en pesos argentinos, con impuestos incluidos, e incluyen el kilometraje libre y el seguro de responsabilidad civil que exige la normativa.",
          "No incluye combustible, peajes, multas ni estacionamiento: eso corre por tu cuenta.",
        ],
      },
      {
        id: "mas-dias",
        pregunta: "¿Sale más barato si lo alquilo más días?",
        respuesta: [
          "Sí. El precio por día baja a medida que el alquiler es más largo, y el descuento se aplica solo: no hay que pedirlo ni usar ningún código.",
          "Lo vas a ver reflejado en el total apenas elijas las fechas.",
        ],
        conEscalera: true,
      },
      {
        id: "formas-de-pago",
        pregunta: "¿Cómo puedo pagar?",
        respuesta: [
          "Podés pagar con tarjeta de débito o crédito, por transferencia, con QR o en efectivo en el mostrador.",
          "La seña de una reserva hecha por el sitio se paga online al confirmarla.",
        ],
      },
      {
        id: "franquicia",
        pregunta: "¿Qué es la franquicia y cuánto es?",
        respuesta: [
          "La franquicia es el monto máximo que queda a tu cargo ante un siniestro. Todos los alquileres incluyen el seguro de responsabilidad civil obligatorio, y durante la reserva podés contratar una cobertura adicional que baja ese monto.",
          "Cada cobertura muestra su franquicia junto a la opción, antes de que elijas.",
          "Ojo: la franquicia no aplica —y la responsabilidad pasa a ser total— cuando el daño tiene origen en impericia, culpa, negligencia o dolo del conductor, o cuando se incumplen las condiciones de uso del contrato.",
        ],
      },
    ],
  },
  {
    titulo: "Durante el alquiler",
    preguntas: [
      {
        id: "kilometraje",
        pregunta: "¿El kilometraje es libre?",
        respuesta: [
          "Sí. Todos nuestros alquileres incluyen kilometraje libre, sin límite ni cargo por kilómetro recorrido.",
          "Registramos los kilómetros al entregar y al recibir el vehículo, pero es para el control de mantenimiento de la unidad, no para cobrarte.",
        ],
      },
      {
        id: "combustible",
        pregunta: "¿Con cuánto combustible tengo que devolverlo?",
        respuesta: [
          "Con el mismo nivel con el que lo retiraste. El nivel se registra al entregar y al recibir, y queda escrito en el contrato.",
          "Si vuelve con menos, se cobra la diferencia. Te lo entregamos limpio y te pedimos que lo devuelvas en condiciones similares.",
        ],
      },
      {
        id: "salir-del-pais",
        pregunta: "¿Puedo salir de la provincia o del país?",
        respuesta: [
          "Dentro de la Argentina podés circular sin restricciones, con el kilometraje libre incluido.",
          "Para salir del país hace falta autorización expresa y por escrito, que hay que pedir con anticipación porque requiere documentación adicional del vehículo.",
        ],
      },
      {
        id: "que-no-se-puede",
        pregunta: "¿Hay usos que no están permitidos?",
        respuesta: [
          "Sí. No se puede usar el vehículo para transportar personas o cosas a título oneroso, remolcar o empujar otros vehículos, participar en carreras o competiciones, ni conducir bajo los efectos del alcohol, medicación o cualquier sustancia que afecte el manejo.",
          "Tampoco se puede ceder el vehículo a conductores que no estén autorizados en el contrato.",
        ],
      },
      {
        id: "choque",
        pregunta: "¿Qué hago si tengo un accidente o me hacen una multa?",
        respuesta: [
          "Avisanos por escrito dentro de las 24 horas de ocurrido y hacé la denuncia policial que corresponda.",
          "Las multas e infracciones cometidas durante el alquiler quedan a cargo del cliente, aunque lleguen después de devolver el vehículo.",
        ],
      },
    ],
  },
  {
    titulo: "El contrato",
    preguntas: [
      {
        id: "firmar",
        pregunta: "¿Cómo se firma el contrato?",
        respuesta: [
          "Te mandamos un link por WhatsApp o por mail. Desde ahí leés el contrato completo, aceptás las condiciones y firmás con el dedo desde el celular, sin imprimir nada.",
          "Apenas firmás te llega una copia en PDF por mail, y el mismo link te sirve para volver a descargarla.",
          "Si preferís firmarlo en papel o en el mostrador al retirar el vehículo, también se puede.",
        ],
      },
      {
        id: "que-firmo",
        pregunta: "¿Qué es exactamente lo que firmo?",
        respuesta: [
          "El contrato tiene dos partes: el detalle de tu alquiler —vehículo, fechas, lugares, cargos, cobertura y franquicia— y las condiciones generales de uso del vehículo.",
          "Las dos están completas en el link antes de que firmes. Ante cualquier diferencia entre estas preguntas frecuentes o los términos del sitio y el contrato firmado, prevalece el contrato.",
        ],
      },
    ],
  },
];

/** Aplanado, para el JSON-LD y para el buscador interno de la página. */
export const TODAS_LAS_PREGUNTAS: Pregunta[] = FAQ.flatMap((g) => g.preguntas);
