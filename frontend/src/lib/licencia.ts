export type EstadoLicencia = 'vigente' | 'por_vencer' | 'vencida' | 'sin_datos';

export function estadoLicencia(vencimientoIso?: string | null): EstadoLicencia {
  if (!vencimientoIso) return 'sin_datos';
  
  const venc = new Date(vencimientoIso);
  const hoy = new Date();
  
  // Normalizar a la fecha actual para que no afecten las horas
  venc.setHours(0, 0, 0, 0);
  hoy.setHours(0, 0, 0, 0);
  
  const dias = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  
  if (dias < 0) return 'vencida';
  if (dias <= 30) return 'por_vencer';
  return 'vigente';
}
