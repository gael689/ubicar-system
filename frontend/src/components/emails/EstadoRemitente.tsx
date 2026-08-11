import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { EstadoIntegracionEmail } from '@/types';

/**
 * El cartel que explica por qué los mails a clientes no están saliendo.
 *
 * **No es decorativo.** Mientras el remitente sea `onboarding@resend.dev`, el
 * sistema registra los mails a clientes como "omitido" — y un estado sin
 * explicación se lee como un error del sistema. Este cartel es la diferencia
 * entre "esto está roto" y "falta un paso, y es este".
 */
export function EstadoRemitente({ estado }: { estado: EstadoIntegracionEmail | undefined }) {
  if (!estado) return null;

  if (!estado.configurado) {
    return (
      <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">No hay ninguna cuenta de mail conectada</p>
          <p className="text-sm text-muted-foreground">
            Falta cargar <code className="font-mono text-xs">RESEND_API_KEY</code> en el servidor.
            Hasta entonces no sale ningún mail: los envíos quedan registrados acá como fallidos.
          </p>
        </div>
      </div>
    );
  }

  if (estado.remitente_de_prueba) {
    return (
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Los mails a clientes todavía no salen
          </p>
          <p className="text-sm text-muted-foreground">
            El remitente configurado es{' '}
            <code className="font-mono text-xs">{estado.remitente}</code>, la casilla de prueba de
            Resend: sólo entrega mails a la cuenta dueña de Resend, no a un cliente real. Por eso los
            envíos al cliente quedan como <strong>omitidos</strong> en vez de mandarse a la nada.
          </p>
          <p className="text-sm text-muted-foreground">
            Para activarlos hay que verificar el dominio propio en Resend y cambiar{' '}
            <code className="font-mono text-xs">FROM_EMAIL</code>. Los avisos internos al equipo sí
            se intentan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
      <p className="text-sm text-foreground">
        Los mails salen desde{' '}
        <span className="font-medium">{estado.remitente}</span>.
        {estado.destinatarios_equipo.length > 0 && (
          <span className="text-muted-foreground">
            {' '}
            Los avisos internos van a {estado.destinatarios_equipo.join(', ')}.
          </span>
        )}
      </p>
    </div>
  );
}
