import { LANDINGS } from "@/lib/landings";
import { MAQUINAS } from "@/lib/maquinas";
import { CONTACTO } from "@/lib/contacto";
import { SITE } from "@/lib/sitio";

/**
 * `/llms.txt`: la ficha del sitio para los asistentes de IA.
 *
 * Era un archivo estático escrito a mano y se desalineó (la lista de
 * maquinaria y "cómo reservar" vivían aparte del sitio, y una línea decía que
 * se podía reservar sin depósito cuando la reserva online lleva seña). Ahora
 * los servicios salen de `lib/landings.ts`, las máquinas de `lib/maquinas.ts`,
 * el contacto de `lib/contacto.ts` y el dominio de `lib/sitio.ts`.
 *
 * Estático: se arma una vez en el build.
 */
export const dynamic = "force-static";

export function GET() {
  const servicios = LANDINGS.map(
    (l) => `- [${l.nombre}](${SITE}/${l.slug}): ${l.servicio.descripcion}`,
  ).join("\n");

  const maquinaria = MAQUINAS.map(
    (m) => `- [${m.nombre}](${SITE}/maquinaria/${m.slug}): ${m.categoria}.`,
  ).join("\n");

  const texto = `# Ubicar Rent

> Empresa de alquiler de autos, camionetas 4x4 y maquinaria pesada en Bahía Blanca y el sur de la Provincia de Buenos Aires, Argentina.

Ubicar Rent es una rentadora de vehículos y maquinaria con base en Bahía Blanca, Buenos Aires, Argentina. Atiende a particulares y empresas.

## Reserva online

Los autos y camionetas se reservan online, desde el sitio, en cuatro pasos:

1. Elegir lugar de retiro, fechas, horarios y la edad de quien maneja.
2. Ver las categorías disponibles con su precio final y elegir una.
3. Sumar coberturas y extras.
4. Cargar los datos y pagar la seña.

El precio que se muestra es el precio final, con impuestos incluidos. Al reservar se adelanta el 30%, el 50% o el 100% del total, y el saldo se abona al retirar. La reserva es por categoría de vehículo, no por un modelo puntual: se garantiza un vehículo de la categoría elegida o de una superior. Qué incluye el kilometraje queda escrito en el contrato.

URL de reserva: ${SITE}/reservar

## Servicios

${servicios}

## Maquinaria

La maquinaria no se reserva online: se consulta disponibilidad y precio por WhatsApp.

${maquinaria}

## Condiciones

- Seguro de responsabilidad civil incluido, con coberturas adicionales opcionales.
- Edad mínima: 21 años cumplidos al retirar el vehículo. No hay recargos por edad.
- Para retirar hace falta DNI o pasaporte y licencia de conducir vigente. Se puede alquilar con licencia de conducir extranjera, si está vigente y habilita para la categoría del vehículo.
- Los precios están en pesos argentinos, con impuestos incluidos. No incluyen combustible, peajes, multas ni estacionamiento.

## Puntos de retiro y devolución

- Paraguay 241, Bahía Blanca
- Alsina 350, Bahía Blanca
- Aeropuerto Comandante Espora, Bahía Blanca: el vehículo se pide y se entrega a la hora pactada.

## Contacto

- Dirección: Paraguay 241, Bahía Blanca, Buenos Aires, Argentina (CP 8000)
- Zona de servicio: Bahía Blanca y el sur de la Provincia de Buenos Aires
- WhatsApp: ${CONTACTO.whatsappDisplay}
- Email: ${CONTACTO.email}
- Instagram: ${CONTACTO.instagram}

## Documentos

- Preguntas frecuentes: ${SITE}/preguntas-frecuentes
- Términos y condiciones: ${SITE}/terminos
- Política de privacidad: ${SITE}/privacidad
`;

  return new Response(texto, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
