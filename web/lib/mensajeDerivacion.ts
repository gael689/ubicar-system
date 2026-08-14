import { fechaCorta } from "./api";

/**
 * El mensaje de WhatsApp del cartel de derivación comercial (§3.9).
 *
 * **Lleva todo lo que la persona ya cargó.** Cada campo que falte es una
 * pregunta que el agente va a tener que hacer, y cada pregunta es tiempo en
 * el que la venta se enfría — es el mismo criterio que ya usa el cartel de
 * transferencia, que precarga el comprobante.
 */
export function construirMensajeDerivacion(d: {
  categoria?: string | null;
  fechaInicio?: string | null;
  horaInicio?: string | null;
  fechaFin?: string | null;
  horaFin?: string | null;
  lugarRetiro?: string | null;
  lugarDevolucion?: string | null;
  edad?: string | null;
  motivoTexto: string;
  preguntaFinal: string;
}): string {
  const lineas: string[] = ["Hola! Vengo de la web y quería reservar:", ""];

  if (d.categoria) lineas.push(`• Categoría: ${d.categoria}`);
  if (d.fechaInicio) {
    const hora = d.horaInicio ? ` a las ${d.horaInicio}` : "";
    const lugar = d.lugarRetiro ? ` — ${d.lugarRetiro}` : "";
    lineas.push(`• Retiro: ${fechaCorta(d.fechaInicio)}${hora}${lugar}`);
  }
  if (d.fechaFin) {
    const hora = d.horaFin ? ` a las ${d.horaFin}` : "";
    const lugar = d.lugarDevolucion ? ` — ${d.lugarDevolucion}` : "";
    lineas.push(`• Devolución: ${fechaCorta(d.fechaFin)}${hora}${lugar}`);
  }
  if (d.edad) lineas.push(`• Conductor de ${d.edad} años`);

  lineas.push("", d.motivoTexto, d.preguntaFinal);
  return lineas.join("\n");
}
