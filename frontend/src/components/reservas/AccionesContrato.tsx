import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Link2, Loader2 } from 'lucide-react';
import { useGenerarLinkFirma } from '@/hooks/useContratos';
import { api } from '@/lib/api';

interface Props {
  reservaId: number;
  /** 'sin_emitir' | 'emitido' | 'firmado' — lo que devuelve el listado. */
  estado: string | null | undefined;
  /** Se llama después de emitir, para que el listado se refresque. */
  onCambio?: () => void;
}

/**
 * El estado del contrato, pero **accionable desde el listado**.
 *
 * Antes era un cartel y nada más: decía "Sin contrato" y para hacer algo al
 * respecto había que entrar a la reserva, encontrar el panel y recién ahí
 * emitirlo. El cartel señalaba un problema y no ofrecía la solución, que es
 * la peor combinación posible en una pantalla que se mira con el cliente
 * enfrente.
 *
 * Ahora cada estado ofrece lo único que tiene sentido hacer:
 *
 * - **sin emitir** → emitirlo, ahí mismo
 * - **emitido** → copiar el link de firma para volver a mandárselo
 *
 * El link se **reusa mientras siga vigente** (D-C6): regenerarlo dejaría muerto
 * el que el cliente ya tiene en su WhatsApp.
 */
export function AccionesContrato({ reservaId, estado, onCambio }: Props) {
  const generarLink = useGenerarLinkFirma();
  const [emitiendo, setEmitiendo] = useState(false);
  const [copiando, setCopiando] = useState(false);

  const emitir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setEmitiendo(true);
    try {
      // Sin `snapshot`: el backend arma el anverso con `preparar()`. Desde el
      // listado no hay nada que corregir a mano — para eso esta el panel de la
      // reserva, que es donde se edita antes de emitir.
      await api.post('/contratos', { reserva_id: reservaId });
      toast.success('Contrato emitido. Ya podes mandarlo a firmar.');
      onCambio?.();
    } catch {
      toast.error('No pudimos emitir el contrato. Revisa los datos de la reserva.');
    } finally {
      setEmitiendo(false);
    }
  };

  const copiarLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCopiando(true);
    try {
      // El contrato de la reserva primero: el listado sabe el estado pero no
      // el id del contrato, y pedirlo acá evita cargarlo para las 40 filas.
      const { data } = await api.get('/contratos', { params: { reserva_id: reservaId } });
      const lista = data?.data ?? [];
      const contrato = lista.find((c: { anulado?: boolean }) => !c.anulado);
      if (!contrato) throw new Error('sin contrato');
      const res = await generarLink.mutateAsync(contrato.id);
      const url = (res as { url?: string })?.url ?? contrato.url_firma;
      if (!url) throw new Error('sin url');
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado. Vence a las 72 horas.');
    } catch {
      toast.error('No pudimos generar el link. Abrí la reserva y probá desde ahí.');
    } finally {
      setCopiando(false);
    }
  };

  if (estado === 'sin_emitir' || !estado) {
    return (
      <button
        onClick={emitir}
        disabled={emitiendo}
        title="Emitir el contrato de esta reserva ahora"
        className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning px-2 py-1 text-xs font-bold uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        {emitiendo
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <FileText className="h-3 w-3" />}
        {emitiendo ? 'Emitiendo…' : 'Generar contrato'}
      </button>
    );
  }

  if (estado === 'emitido') {
    return (
      <button
        onClick={copiarLink}
        disabled={copiando}
        title="Copiar el link de firma para mandárselo al cliente"
        className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-bold uppercase text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        {copiando
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Link2 className="h-3 w-3" />}
        {copiando ? 'Generando…' : 'Sin firmar · copiar link'}
      </button>
    );
  }

  return null;
}
