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
  /**
   * Marca la pregunta cuya respuesta lleva el plazo de anticipación en vivo.
   * Mismo criterio que `conEscalera`: el número sale de `/public/config`.
   */
  conPlazo?: boolean;
  /**
   * Marca la pregunta cuya respuesta lleva lo que se gana pagando el 100 %.
   * También en vivo: el descuento por duración y el extra por pago total se
   * cargan desde el sistema.
   */
  conPagoTotal?: boolean;
  /**
   * Se muestra en el bloque de preguntas de la portada.
   *
   * La marca vive acá y no como una lista de ids en el componente: la portada
   * no tiene por qué saber cuáles son las preguntas que más frenan una
   * reserva, y una lista de ids en otro archivo se desincroniza el día que se
   * renombra una.
   */
  destacada?: boolean;
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
          // **El plazo NO se escribe acá.** Decía "24 horas" y el sistema
          // rechaza por debajo de `web.anticipacion_minima_horas`, que es
          // configurable y hoy vale 240 (10 días): la FAQ prometía diez veces
          // menos de lo que el buscador acepta, y el visitante se enteraba
          // recién cuando el formulario le rebotaba las fechas. Mismo criterio
          // que los porcentajes de descuento — el texto explica el mecanismo,
          // el número lo trae `PlazoFaq` de `/public/config`.
          "Las reservas por el sitio se toman con una anticipación mínima, que ves debajo.",
          "Si lo necesitás para antes, escribinos por WhatsApp y lo coordinamos a mano: casi siempre se puede.",
        ],
        conPlazo: true,
        destacada: true,
      },
      {
        id: "cuanto-adelanto",
        pregunta: "¿Cuánto tengo que pagar para reservar?",
        respuesta: [
          "Elegís cuánto adelantar: el 30%, el 50% o el 100% del total. El mínimo para que la reserva quede tomada es el 30%.",
          "El saldo se abona al retirar el vehículo.",
          // **Los porcentajes no se escriben acá** (D-49 y
          // `descuento_pago_total_pct`, los dos configurables). El texto dice
          // qué se gana; `DescuentoPagoTotalFaq` trae cuánto es hoy.
          "Pagar el 100% por el sitio conviene: es lo que habilita el descuento por cantidad de días. Con el 30% o el 50% se cobra el precio de lista.",
        ],
        conPagoTotal: true,
        destacada: true,
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
        destacada: true,
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
          "Si va a manejar más de una persona, necesitamos el nombre, el documento y el domicilio de cada conductor adicional: sólo pueden manejar los que quedan autorizados por escrito en el contrato.",
        ],
        destacada: true,
      },
      {
        id: "edad",
        pregunta: "¿Hay una edad mínima para alquilar?",
        respuesta: [
          "Sí: el conductor tiene que tener 21 años cumplidos al momento de retirar el vehículo.",
          "No hay recargos por edad: la tarifa es la misma para todos los conductores habilitados. Te pedimos la fecha de nacimiento al reservar para verificar ese requisito.",
        ],
        destacada: true,
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
        destacada: true,
      },
      {
        id: "mas-dias",
        pregunta: "¿Sale más barato si lo alquilo más días?",
        respuesta: [
          // **Decía que el descuento "se aplica solo" y que se ve "apenas
          // elijas las fechas".** En la web eso no es cierto: D-49 lo condiciona
          // a pagar el 100%, así que quien reserva con el 30% de seña elige las
          // fechas, no ve ningún descuento y la FAQ le queda debiendo una
          // explicación. Peor: parece un error del sitio.
          "Sí. El precio por día baja a medida que el alquiler es más largo, y no hay que pedirlo ni usar ningún código.",
          "Reservando por el sitio, el descuento se aplica si abonás el 100% por adelantado; con el 30% o el 50% se cobra el precio de lista. Si arreglás el alquiler en el mostrador, corre siempre.",
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
        destacada: true,
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
        destacada: true,
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

/**
 * Las que van en la portada.
 *
 * **Son las que frenan una reserva**, no las más lindas: qué necesito para
 * retirar, desde qué edad, qué incluye el precio, qué es la franquicia, si el
 * kilometraje es libre, si puedo cancelar, cuánto hay que adelantar y con
 * cuánta anticipación. Cada una de esas dudas sin responder antes del
 * formulario es una reserva que no se hace.
 *
 * Se derivan del propio catálogo y conservan su orden, así que la portada y la
 * página completa no se pueden contradecir: es el mismo texto.
 */
export const PREGUNTAS_DESTACADAS: Pregunta[] = TODAS_LAS_PREGUNTAS.filter(
  (p) => p.destacada,
);
