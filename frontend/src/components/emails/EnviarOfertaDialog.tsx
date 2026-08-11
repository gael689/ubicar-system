import { useMemo, useState } from 'react';
import { AlertTriangle, Eye, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useDestinatariosEmail, useEnviarOferta, usePrevisualizarOferta } from '@/hooks/useEmails';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  remitenteDePrueba: boolean;
}

/**
 * El único envío que dispara una persona.
 *
 * Tres cosas están puestas a propósito y no son adorno:
 *
 * - **La lista arranca vacía.** Un "seleccionar todos" por defecto convierte
 *   un click distraído en doscientos mails. Elegir a quién es parte del envío.
 * - **La previsualización antes del botón de mandar.** Es la única forma de
 *   darse cuenta de que faltó un renglón, y después no hay vuelta atrás.
 * - **El aviso del remitente de prueba dice qué va a pasar**, no que "puede
 *   haber un problema": los mails se van a registrar y no van a llegar.
 */
export function EnviarOfertaDialog({ abierto, onCerrar, remitenteDePrueba }: Props) {
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [soloClientes, setSoloClientes] = useState(true);
  const [vista, setVista] = useState<string | null>(null);
  const [forzar, setForzar] = useState(false);

  const { data: destinatarios, isLoading } = useDestinatariosEmail(soloClientes);
  const previsualizar = usePrevisualizarOferta();
  const enviar = useEnviarOferta();

  const listos = useMemo(
    () => asunto.trim().length > 0 && cuerpo.trim().length > 0 && seleccionados.length > 0,
    [asunto, cuerpo, seleccionados],
  );

  function alternar(email: string) {
    setSeleccionados(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email],
    );
  }

  function cerrar() {
    setVista(null);
    onCerrar();
  }

  async function handlePrevisualizar() {
    try {
      const res = await previsualizar.mutateAsync({ asunto, cuerpo });
      setVista(res.html);
    } catch {
      toast.error('No se pudo armar la vista previa');
    }
  }

  async function handleEnviar() {
    try {
      const res = await enviar.mutateAsync({
        asunto,
        cuerpo,
        destinatarios: seleccionados,
        forzar,
      });
      toast.success(res.message);
      setAsunto('');
      setCuerpo('');
      setSeleccionados([]);
      setForzar(false);
      cerrar();
    } catch {
      toast.error('No se pudo enviar');
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={a => !a && cerrar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar una oferta o descuento</DialogTitle>
          <DialogDescription>
            Se manda un mail por persona: nadie ve la casilla de los demás, y queda registrado a
            quién le llegó y a quién no.
          </DialogDescription>
        </DialogHeader>

        {remitenteDePrueba && (
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="text-foreground">
                Con el remitente actual (la casilla de prueba de Resend){' '}
                <strong>estos mails no van a llegarles a los clientes</strong>. Se van a registrar
                como "sin enviar" y se pueden reintentar cuando el dominio esté verificado.
              </p>
              <label className="flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={forzar}
                  onChange={e => setForzar(e.target.checked)}
                  className="rounded border-border"
                />
                Intentar el envío igual (para probar contra la casilla de la cuenta)
              </label>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="oferta-asunto" className="text-xs font-medium text-muted-foreground">
            Asunto
          </label>
          <input
            id="oferta-asunto"
            value={asunto}
            onChange={e => setAsunto(e.target.value)}
            maxLength={200}
            placeholder="15% de descuento en agosto"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="oferta-cuerpo" className="text-xs font-medium text-muted-foreground">
            Mensaje
          </label>
          <textarea
            id="oferta-cuerpo"
            value={cuerpo}
            onChange={e => setCuerpo(e.target.value)}
            rows={7}
            placeholder={'Escribí el mensaje como se lo dirías a un cliente.\n\nDejá una línea en blanco para separar párrafos.'}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-normal"
          />
          <p className="text-xs text-muted-foreground">
            Texto común: el sistema le da formato y le agrega el encabezado y el pie.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Destinatarios ({seleccionados.length} de {destinatarios?.length ?? 0})
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={soloClientes}
                  onChange={e => { setSoloClientes(e.target.checked); setSeleccionados([]); }}
                  className="rounded border-border"
                />
                Sólo los que ya alquilaron
              </label>
              <button
                onClick={() => setSeleccionados((destinatarios ?? []).map(d => d.email))}
                className="text-xs text-primary hover:underline"
              >
                Todos
              </button>
              <button
                onClick={() => setSeleccionados([])}
                className="text-xs text-primary hover:underline"
              >
                Ninguno
              </button>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {isLoading && (
              <p className="text-sm text-muted-foreground p-3">Cargando clientes...</p>
            )}
            {!isLoading && (destinatarios?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground p-3">
                Ningún cliente tiene el mail cargado en su ficha.
              </p>
            )}
            {destinatarios?.map(d => (
              <label
                key={d.id}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/30 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={seleccionados.includes(d.email)}
                  onChange={() => alternar(d.email)}
                  className="rounded border-border"
                />
                <span className="font-medium text-foreground">{d.nombre}</span>
                <span className="text-muted-foreground truncate">{d.email}</span>
              </label>
            ))}
          </div>
        </div>

        {vista && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Así lo va a ver</span>
            <iframe
              title="Vista previa de la oferta"
              sandbox=""
              srcDoc={vista}
              className="w-full h-64 border border-border rounded-lg bg-white"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handlePrevisualizar}
            disabled={!asunto.trim() || !cuerpo.trim() || previsualizar.isPending}
          >
            <Eye className="h-4 w-4 mr-2" />
            Ver cómo queda
          </Button>
          <Button onClick={handleEnviar} disabled={!listos || enviar.isPending}>
            <Send className="h-4 w-4 mr-2" />
            {enviar.isPending
              ? 'Enviando...'
              : `Enviar a ${seleccionados.length} ${seleccionados.length === 1 ? 'persona' : 'personas'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
