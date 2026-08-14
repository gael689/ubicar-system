/**
 * Agrupación de los tipos de notificación en familias.
 *
 * Vive acá y no dentro de la campana porque lo usan dos pantallas: el panel
 * desplegable y el módulo de Notificaciones. Cuando estaba duplicado, agregar
 * una regla al backend significaba acordarse de tocar dos archivos — y lo que
 * pasó fue que no se tocó ninguno, así que `vtv_vencimiento` y
 * `poliza_vencimiento` cayeron durante meses en "Otros", que es donde nadie
 * mira.
 *
 * **Si se agrega una regla en `domain/notificaciones_reglas.py`, va acá.**
 */
export const TIPO_GRUPO: Record<string, string> = {
  entrega_hoy: '🚗 Entregas de hoy',
  devolucion_hoy: '🏁 Devoluciones de hoy',
  checkout_pendiente: '🚗 Checkouts pendientes',
  checkin_vencido: '🏁 Devoluciones vencidas',
  contrato_no_firmado: '📝 Contratos',
  contrato_sin_emitir: '📝 Contratos',
  reserva_pendiente_24hs: '📋 Reservas sin confirmar',
  echeq_proximo: '💰 Echeqs',
  echeq_vence_hoy: '💰 Echeqs',
  echeq_sin_acreditar: '💰 Echeqs',
  echeq_rechazado: '💰 Echeqs',
  cc_vencimiento_proximo: '💳 Cuenta corriente',
  cc_vencida: '💳 Cuenta corriente',
  limite_credito_superado: '💳 Cuenta corriente',
  saldo_pendiente_alquiler: '💳 Cuenta corriente',
  garantia_sin_resolver: '🔒 Garantías',
  factura_pendiente_emitir: '🧾 Facturación',
  doc_vehiculo_vencido: '📄 Documentos vehículos',
  doc_vehiculo_por_vencer: '📄 Documentos vehículos',
  vtv_vencimiento: '📄 Documentos vehículos',
  poliza_vencimiento: '📄 Documentos vehículos',
  doc_cliente_vencido: '👤 Documentos clientes',
  doc_cliente_por_vencer: '👤 Documentos clientes',
  service_km_vencido: '🔧 Mantenimiento',
  service_km_proximo: '🔧 Mantenimiento',
  service_fecha_vencido: '🔧 Mantenimiento',
  service_fecha_proximo: '🔧 Mantenimiento',
  licencia_cliente_por_vencer: '🪪 Licencias',
  licencia_vencida_reserva_futura: '🪪 Licencias',
  vehiculo_fuera_servicio_prolongado: '🛠️ Flota',
  multa_pendiente_imputar: '⚠️ Multas',
  multa_imputada_sin_cobrar: '⚠️ Multas',
  multa_por_vencer: '⚠️ Multas',
  multa_vencida: '⚠️ Multas',
  reserva_web_nueva: '🌐 Reservas web',
  reserva_web_sin_atender: '🌐 Reservas web',
  // Huecos de configuración, no hechos: se arreglan en dos minutos y evitan
  // perder plata en silencio.
  fecha_especial_sin_precio: '📌 Falta completar',
  categoria_sin_precio: '📌 Falta completar',
  categoria_precio_generico: '📌 Falta completar',
  vehiculo_sin_categoria: '📌 Falta completar',
  datos_empresa_sin_cargar: '📌 Falta completar',
};

export const GRUPO_OTROS = 'Otros';

export function grupoDe(tipo: string): string {
  return TIPO_GRUPO[tipo] ?? GRUPO_OTROS;
}

/** Las familias que existen, ordenadas, para armar un desplegable. */
export const FAMILIAS = Array.from(new Set(Object.values(TIPO_GRUPO))).sort();

/** Los `tipo` que componen una familia — es lo que espera el backend. */
export function tiposDeFamilia(familia: string): string[] {
  return Object.entries(TIPO_GRUPO)
    .filter(([, g]) => g === familia)
    .map(([t]) => t);
}

export const URGENCIAS = ['critica', 'alta', 'media', 'baja'] as const;
export type Urgencia = (typeof URGENCIAS)[number];

export const URGENCIA_LABEL: Record<Urgencia, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

/** Color sólido, no transparente: lo que reclama atención tiene que verse
 *  como que la reclama. */
export const URGENCIA_COLOR: Record<string, string> = {
  critica: 'bg-danger text-white',
  alta: 'bg-warning text-white',
  media: 'bg-primary text-white',
  baja: 'bg-muted text-muted-foreground',
};
