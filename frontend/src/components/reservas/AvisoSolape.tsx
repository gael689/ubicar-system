import { AlertTriangle } from 'lucide-react';
import type { AvisosDeSolape, SolapeWarning } from '@/types';

/** `2026-10-05` → `05/10`. */
function diaMes(iso: string | undefined): string {
  if (!iso) return '';
  const [, mes, dia] = iso.split('T')[0].split('-');
  return `${dia}/${mes}`;
}

function conHora(fecha: string | undefined, hora: string | undefined): string {
  return hora ? `${diaMes(fecha)} ${hora}` : diaMes(fecha);
}

/** Una línea por solape, tal como se lee en pantalla y en el aviso al guardar. */
export function textoAvisoSolape(w: SolapeWarning): string {
  const rango = `del ${conHora(w.fecha_inicio, w.hora_inicio)} al ${conHora(w.fecha_fin, w.hora_fin)}`;
  const quien = w.cliente ? ` de ${w.cliente}` : '';
  if (w.tipo === 'solape_con_pendiente') {
    return `Hay una reserva pendiente (#${w.reserva_id}${w.cliente ? `, ${w.cliente}` : ''}) ${rango}.`;
  }
  const estado = w.estado ? ` (${w.estado})` : '';
  return `Se pisa con la reserva #${w.reserva_id}${quien}${estado}, ${rango}.`;
}

/** "Vuelve a las 09:00: queda 1 h para prepararlo." */
export function textoVuelve(vuelveA: string, minutos: number | null): string {
  const m = Math.max(0, minutos ?? 0);
  if (m === 0) return `Vuelve a las ${vuelveA}: no queda tiempo para prepararlo.`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  const partes = [h > 0 ? `${h} h` : '', resto > 0 ? `${resto} min` : ''].filter(Boolean).join(' ');
  const verbo = h === 1 && resto === 0 ? 'queda' : 'quedan';
  return `Vuelve a las ${vuelveA}: ${verbo} ${partes} para prepararlo.`;
}

/** ¿Hay algo que mostrar? Lo usan los botones para decir "Crear igual". */
export function hayAvisos(avisos?: AvisosDeSolape | null): boolean {
  return !!avisos && (avisos.solapes.length > 0 || !!avisos.vuelve_a);
}

/**
 * Lo que se pisa o lo justo que viene el auto, **antes de guardar**.
 *
 * Es un aviso, no un freno: el mostrador decide. Salvo el bloqueo (taller o
 * uso interno), que se muestra en rojo porque ese auto no está.
 */
export function AvisoSolape({ avisos }: { avisos?: AvisosDeSolape | null }) {
  if (!avisos) return null;
  const { solapes, vuelve_a, minutos_para_prepararlo, bloqueo } = avisos;
  if (!bloqueo && solapes.length === 0 && !vuelve_a) return null;

  return (
    <div data-aviso="solape" className="space-y-2">
      {bloqueo && (
        <p data-aviso="bloqueo" className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este auto no está disponible ({bloqueo.motivo}) del {diaMes(bloqueo.fecha_desde)} al{' '}
          {diaMes(bloqueo.fecha_hasta)}. Elegí otro auto o cambiá las fechas.
        </p>
      )}
      {solapes.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800 space-y-1">
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Podés cargarla igual, pero el auto queda pisado:
          </p>
          <ul className="list-disc pl-6">
            {solapes.map(w => <li key={`${w.reserva_id}`}>{textoAvisoSolape(w)}</li>)}
          </ul>
        </div>
      )}
      {vuelve_a && (
        <p data-aviso="vuelve-justo" className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {textoVuelve(vuelve_a, minutos_para_prepararlo)}
        </p>
      )}
    </div>
  );
}
