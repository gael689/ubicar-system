/**
 * Textos legales de la web — plan en `docs/PLAN_TEXTOS_LEGALES.md`.
 *
 * **Versionados a propósito.** `VERSION_TERMINOS` viaja con la reserva
 * (`terminos_version_aceptada`) el día que las reservas se creen online:
 * guardar sólo un booleano "aceptó" no sirve de nada ante un reclamo, porque
 * la pregunta va a ser **qué** aceptó.
 *
 * Viven en el repo y no en una tabla editable porque cambian poco y necesitan
 * revisión profesional antes de tocarse. Cuando los dueños quieran editarlos
 * solos, el paso siguiente es la tabla `textos_legales` del plan §6 — el
 * `VERSION` de acá se convierte en su número de versión sin romper nada.
 *
 * **D-C1 cerrada.** El locador es FINAR GRUPO FINANCIERO S.R.L., CUIT
 * 30-71756601-3, con domicilio en Paraguay 241, Piso 9, Dpto. A, Bahía Blanca.
 * "Ubicar Rent" es el nombre comercial, no una persona jurídica: el que se
 * obliga en el contrato y el responsable de la base de datos son la sociedad.
 * Los datos salen de la constancia de inscripción de ARCA.
 *
 * ⚠️ **Ingresos Brutos sigue vacío.** No figura en la constancia de ARCA, que
 * es nacional. No se inventa: un dato fiscal de relleno en un documento legal
 * es peor que un espacio en blanco.
 */

export const VERSION_TERMINOS = 1;
export const VERSION_PRIVACIDAD = 1;
export const VIGENTE_DESDE = "2026-07-28";

export interface SeccionLegal {
  id: string;
  titulo: string;
  parrafos: string[];
  items?: string[];
  /** Marca lo que falta definir. Se muestra distinto, no se disimula. */
  pendiente?: string;
}

// ─── Términos y condiciones ──────────────────────────────────────────────────

export const TERMINOS: SeccionLegal[] = [
  {
    id: "quienes-somos",
    titulo: "1. Quiénes somos",
    parrafos: [
      "Ubicar Rent es el nombre comercial de FINAR GRUPO FINANCIERO S.R.L., CUIT 30-71756601-3, con domicilio en Paraguay 241, Piso 9, Dpto. A, Bahía Blanca (8000), Provincia de Buenos Aires. Prestamos servicios de alquiler de vehículos sin chofer en Bahía Blanca y la zona.",
      "Estos términos regulan la reserva de un vehículo a través de este sitio. La relación entre las partes se completa con el contrato de alquiler, que se firma antes de retirar el vehículo. Ante cualquier diferencia entre este texto y el contrato firmado, prevalece el contrato.",
    ],
  },
  {
    id: "reserva",
    titulo: "2. Cómo se reserva",
    parrafos: [
      "La reserva se hace por categoría de vehículo, no por un modelo puntual. Te garantizamos un vehículo de la categoría elegida o de una superior, sin costo adicional para vos.",
      "Las reservas online se toman con un mínimo de 24 horas de anticipación. Para necesidades más urgentes, escribinos por WhatsApp y coordinamos a mano.",
      "Los puntos y horarios de retiro y devolución están sujetos a disponibilidad y se confirman al momento de cerrar la reserva.",
    ],
  },
  {
    id: "pago",
    titulo: "3. Precio y forma de pago",
    parrafos: [
      "Al reservar adelantás un porcentaje del total, que elegís entre el 30%, el 50% o el 100%. El mínimo para tomar la reserva es del 30%.",
      "El saldo se abona al retirar el vehículo. Los precios se expresan en pesos argentinos con impuestos incluidos.",
      "El precio de la reserva no incluye combustible, peajes, multas ni estacionamiento.",
    ],
  },
  {
    id: "cancelacion",
    titulo: "4. Cancelación y devoluciones",
    parrafos: [
      "El monto adelantado al reservar no se reintegra en caso de cancelación por parte del cliente ni si el cliente no se presenta a retirar el vehículo.",
      "Si somos nosotros los que no podemos cumplir con la reserva —por falta de disponibilidad o cualquier otro motivo atribuible a Ubicar Rent—, te ofrecemos un vehículo alternativo sin costo adicional o te devolvemos el 100% de lo abonado.",
      "Cualquier cambio de fechas, horarios o lugar de devolución tiene que avisarse con anticipación: puede generar cargos adicionales o no ser posible según la disponibilidad.",
    ],
  },
  {
    id: "requisitos",
    titulo: "5. Requisitos para retirar el vehículo",
    parrafos: [
      "Para retirar el vehículo, quien vaya a conducir tiene que presentar:",
    ],
    items: [
      "DNI o pasaporte vigente.",
      "Licencia de conducir vigente y habilitante para la categoría del vehículo, válida en las jurisdicciones por donde vaya a circular.",
      "Una tarjeta de crédito a nombre del conductor, para la garantía.",
      "Los datos de todo conductor adicional (nombre, documento y domicilio), que debe ser autorizado expresamente para poder manejar.",
    ],
  },
  {
    id: "edad",
    titulo: "6. Edad del conductor",
    parrafos: [
      "El conductor debe tener 21 años cumplidos al momento de retirar el vehículo. No aplicamos recargos por edad: la tarifa es la misma para todos los conductores habilitados.",
      "Por eso te pedimos la fecha de nacimiento al reservar. Sin ese dato no podemos verificar el requisito.",
    ],
  },
  {
    id: "kilometraje",
    titulo: "7. Kilometraje",
    parrafos: [
      "Todos nuestros alquileres incluyen kilometraje libre, sin límite ni cargo por kilómetro recorrido.",
      "Los kilómetros se registran al entregar y al recibir el vehículo, para el control de mantenimiento de la unidad.",
    ],
  },
  {
    id: "combustible",
    titulo: "8. Combustible y estado del vehículo",
    parrafos: [
      "Te entregamos el vehículo limpio y te pedimos que lo devuelvas en condiciones similares y con el mismo nivel de combustible con el que lo retiraste.",
      "El nivel de combustible y el estado de limpieza se registran al entregar y al recibir el vehículo, y quedan documentados en el contrato.",
    ],
  },
  {
    id: "coberturas",
    titulo: "9. Coberturas y franquicia",
    parrafos: [
      "Todos los alquileres incluyen el seguro de responsabilidad civil exigido por la normativa vigente.",
      "Durante la reserva podés contratar una cobertura adicional. Cada cobertura tiene su franquicia: es el monto máximo que queda a tu cargo ante un siniestro, y se muestra junto a cada opción antes de que elijas.",
      "La franquicia no aplica —y la responsabilidad es total— cuando el daño tiene origen en impericia, culpa, negligencia o dolo del conductor, o cuando se incumplen las condiciones de uso del contrato.",
    ],
  },
  {
    id: "uso",
    titulo: "10. Condiciones de uso del vehículo",
    parrafos: ["Durante el alquiler no está permitido:"],
    items: [
      "Usar el vehículo para transporte de personas o cosas a título oneroso.",
      "Remolcar o empujar otros vehículos.",
      "Participar en carreras, pruebas o competiciones de cualquier tipo.",
      "Conducir bajo los efectos del alcohol, medicación o cualquier sustancia que afecte la capacidad de manejo.",
      "Sacar el vehículo de la República Argentina sin autorización expresa y por escrito.",
      "Ceder el vehículo a conductores no autorizados en el contrato.",
    ],
  },
  {
    id: "responsabilidad",
    titulo: "11. Responsabilidad del cliente",
    parrafos: [
      "El cliente es responsable por las multas e infracciones de tránsito cometidas durante el período de alquiler, por los daños y faltantes que sufra el vehículo, y por el cumplimiento de las obligaciones del contrato.",
      "Todo siniestro debe comunicarse por escrito dentro de las 24 horas de ocurrido, por los medios de contacto indicados, y realizarse la denuncia policial que corresponda.",
      "El detalle completo de las obligaciones y responsabilidades está en el contrato de alquiler que se firma al retirar el vehículo.",
    ],
  },
  {
    id: "jurisdiccion",
    titulo: "12. Legislación y jurisdicción",
    parrafos: [
      "Estos términos se rigen por la ley de la República Argentina. Para cualquier controversia, las partes se someten a los Tribunales Ordinarios de Bahía Blanca.",
    ],
  },
];

// ─── Política de privacidad ──────────────────────────────────────────────────

export const PRIVACIDAD: SeccionLegal[] = [
  {
    id: "intro",
    titulo: "1. Qué cubre esta política",
    parrafos: [
      "Esta política explica qué datos personales recolectamos a través de este sitio, para qué los usamos, con quién los compartimos y qué derechos tenés sobre ellos.",
      "El tratamiento de datos personales se rige por la Ley 25.326 de Protección de los Datos Personales de la República Argentina.",
      "El responsable de la base de datos es FINAR GRUPO FINANCIERO S.R.L. (nombre comercial Ubicar Rent), CUIT 30-71756601-3, con domicilio en Paraguay 241, Piso 9, Dpto. A, Bahía Blanca (8000), Provincia de Buenos Aires.",
    ],
  },
  {
    id: "que-datos",
    titulo: "2. Qué datos recolectamos",
    parrafos: ["Cuando reservás a través del sitio te pedimos:"],
    items: [
      "Nombre y apellido, DNI y fecha de nacimiento.",
      "Correo electrónico y teléfono, para confirmarte la reserva y coordinar la entrega.",
      "Las fechas, el lugar de retiro y la categoría de vehículo que elegís.",
      "Datos de navegación: páginas visitadas y acciones dentro del sitio.",
    ],
  },
  {
    id: "para-que",
    titulo: "3. Para qué los usamos",
    parrafos: ["Usamos tus datos únicamente para:"],
    items: [
      "Gestionar tu reserva y el alquiler.",
      "Contactarte para coordinar la entrega y la devolución del vehículo.",
      "Emitir la documentación comercial y fiscal correspondiente.",
      "Cumplir con las obligaciones legales, contables e impositivas que nos aplican.",
      "Medir el rendimiento del sitio y de nuestras campañas publicitarias.",
    ],
  },
  {
    id: "pagos",
    titulo: "4. Datos de pago",
    parrafos: [
      "No almacenamos los datos de tu tarjeta. Cuando el pago online esté habilitado, se procesará a través de una pasarela de pagos externa, que recibe y trata esos datos bajo su propia política de privacidad.",
    ],
  },
  {
    id: "terceros",
    titulo: "5. Con quién los compartimos",
    parrafos: [
      "No vendemos ni cedemos tus datos personales. Los compartimos únicamente con los proveedores que necesitamos para prestar el servicio:",
    ],
    items: [
      "Meta Platforms, para medir la efectividad de nuestras campañas publicitarias mediante su píxel de seguimiento.",
      "Google, para las estadísticas de uso del sitio (Google Analytics).",
      "El proveedor de envío de correos electrónicos, para mandarte la confirmación de tu reserva.",
      "La pasarela de pagos, cuando el pago online esté habilitado.",
      "Los organismos públicos que lo requieran, cuando exista una obligación legal.",
    ],
  },
  {
    id: "cookies",
    titulo: "6. Cookies y tecnologías de seguimiento",
    parrafos: [
      "Este sitio usa cookies propias, necesarias para que funcione, y cookies de terceros para entender cómo se navega el sitio y medir nuestras campañas publicitarias.",
      "Las cookies de terceros (Meta y Google Analytics) sólo se activan si las aceptás. Si elegís «Sólo necesarias», esos servicios no se cargan y no reciben ningún dato tuyo.",
      "Podés cambiar tu decisión cuando quieras desde el botón de abajo, o bloquear y eliminar las cookies desde la configuración de tu navegador.",
    ],
  },
  {
    id: "conservacion",
    titulo: "7. Cuánto tiempo los conservamos",
    parrafos: [
      "Conservamos tus datos mientras dure la relación comercial y, después, por el plazo que exigen las obligaciones legales, fiscales y contables que nos aplican, o el plazo de prescripción de las acciones que pudieran corresponder.",
      "Cumplidos esos plazos, los datos se eliminan o se anonimizan.",
    ],
  },
  {
    id: "derechos",
    titulo: "8. Tus derechos",
    parrafos: [
      "Podés acceder a tus datos personales, pedir que los rectifiquemos si son inexactos, y solicitar su supresión. Para ejercerlos, escribinos a ubicar.rent@gmail.com desde la casilla que registraste, o por los medios de contacto del sitio.",
      "Tené en cuenta que los datos vinculados a operaciones ya realizadas —contratos, comprobantes y registros contables— tenemos que conservarlos por el plazo legal aunque pidas la baja. En ese caso dejan de usarse con fines comerciales, pero no se eliminan hasta cumplido ese plazo.",
      "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso al mismo en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.",
      "La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
    ],
  },
  {
    id: "cambios",
    titulo: "9. Cambios en esta política",
    parrafos: [
      "Podemos actualizar esta política. Cuando lo hagamos, publicamos la versión nueva en esta misma página con su fecha de vigencia.",
    ],
  },
];
