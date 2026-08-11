import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Link2, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  reservaId: number;
  /** 'sin_emitir' | 'emitido' | 'firmado' — lo que devuelve el listado. */
  estado: string | null | undefined;
  /** D-34: el auto salió sin contrato firmado. Es lo más grave del listado. */
  entregadoSinContrato?: boolean;
  /** Se llama después de emitir o regenerar, para refrescar el listado. */
  onCambio?: () => void;
  /** Abre la reserva, que es donde se edita el anverso antes de emitir. */
  onAbrir?: () => void;
}

interface ContratoMinimo {
  id: number;
  anulado?: boolean;
  firmado?: boolean;
  numero_formateado?: string;
  url_firma?: string;
}

/**
 * El estado del contrato, **accionable desde el listado**.
 *
 * Antes era un cartel y nada más: decía "Sin contrato" y para hacer algo había
 * que entrar a la reserva, encontrar el panel y recién ahí emitirlo. Un cartel
 * que señala un problema sin ofrecer la solución es lo peor que puede hacer
 * una pantalla que se mira con el cliente enfrente.
 *
 * **"Entregado sin contrato" sigue siendo un cartel rojo**, y eso no se
 * negocia: es el aviso de D-34 y tiene que doler a la vista. Lo que cambia es
 * que ahora, debajo del cartel, están las acciones para resolverlo — antes
 * había que irse a otra pantalla justo cuando más apurado estás.
 */
export function AccionesContrato({
  reservaId, estado, entregadoSinContrato, onCambio, onAbrir,
}: Props) {
  const [ocupado, setOcupado] = useState<'emitir' | 'link' | 'regenerar' | null>(null);

  /** El contrato vigente de la reserva. El listado sabe el estado, no el id. */
  const buscarContrato = async (): Promise<ContratoMinimo | null> => {
    const { data } = await api.get('/contratos', { params: { reserva_id: reservaId } });
    const lista: ContratoMinimo[] = data?.data ?? [];
    return lista.find(c => !c.anulado) ?? null;
  };

  const emitir = async () => {
    setOcupado('emitir');
    try {
      // Sin `snapshot`: el backend arma el anverso con `preparar()`. Desde el
      // listado no hay nada que corregir a mano — para eso está el panel de la
      // reserva, al que se llega con "Abrir".
      await api.post('/contratos', { reserva_id: reservaId });
      toast.success('Contrato emitido. Ya podés mandarlo a firmar.');
      onCambio?.();
    } catch {
      toast.error('No pudimos emitir el contrato. Revisá los datos de la reserva.');
    } finally {
      setOcupado(null);
    }
  };

  const copiarLink = async () => {
    setOcupado('link');
    try {
      const contrato = await buscarContrato();
      if (!contrato) throw new Error('sin contrato');
      const { data } = await api.post(`/contratos/${contrato.id}/link`);
      const url = (data?.data ?? data)?.url ?? contrato.url_firma;
      if (!url) throw new Error('sin url');
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado. Vence a las 72 horas.');
    } catch {
      toast.error('No pudimos generar el link. Abrí la reserva y probá desde ahí.');
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Anula el contrato vigente y emite uno nuevo.
   *
   * Es lo que corresponde cuando cambió algo del anverso —el auto, las fechas,
   * los datos del cliente— después de emitir. **No se edita el contrato
   * existente**: el snapshot está congelado a propósito, porque es lo que hace
   * oponible lo que el cliente firmó. Se anula, queda el rastro con su motivo,
   * y se emite otro.
   */
  const regenerar = async () => {
    const contrato = await buscarContrato().catch(() => null);
    if (contrato?.firmado) {
      const ok = window.confirm(
        `El contrato ${contrato.numero_formateado ?? ''} ya está FIRMADO.\n\n` +
        'Regenerarlo lo anula y el cliente va a tener que firmar de nuevo.\n\n' +
        '¿Seguís?',
      );
      if (!ok) return;
    }
    setOcupado('regenerar');
    try {
      if (contrato) {
        await api.post(`/contratos/${contrato.id}/anular`, {
          motivo: 'Regenerado desde el listado de reservas',
        });
      }
      await api.post('/contratos', { reserva_id: reservaId });
      toast.success('Contrato regenerado con los datos actuales.');
      onCambio?.();
    } catch {
      toast.error('No pudimos regenerar el contrato. Abrí la reserva y probá desde ahí.');
    } finally {
      setOcupado(null);
    }
  };

  const sinEmitir = !estado || estado === 'sin_emitir';

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      {/* El aviso de D-34 se conserva tal cual: el auto ya salió sin papel
          firmado y eso tiene que verse de lejos. Las acciones van abajo. */}
      {entregadoSinContrato && (
        <span
          title="El vehículo se entregó sin contrato firmado"
          className="inline-flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-xs font-bold uppercase text-white"
        >
          <AlertTriangle className="h-3 w-3" />
          Sin contrato
        </span>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {sinEmitir ? (
          <Boton
            onClick={emitir}
            cargando={ocupado === 'emitir'}
            icono={<FileText className="h-3 w-3" />}
            titulo="Emitir el contrato de esta reserva ahora"
            destacado={!entregadoSinContrato}
          >
            Generar contrato
          </Boton>
        ) : (
          <>
            <Boton
              onClick={copiarLink}
              cargando={ocupado === 'link'}
              icono={<Link2 className="h-3 w-3" />}
              titulo="Copiar el link de firma para mandárselo al cliente"
            >
              {estado === 'firmado' ? 'Ver link' : 'Sin firmar · copiar link'}
            </Boton>
            <Boton
              onClick={regenerar}
              cargando={ocupado === 'regenerar'}
              icono={<RefreshCw className="h-3 w-3" />}
              titulo="Anular el actual y emitir uno nuevo con los datos de hoy"
            >
              Regenerar
            </Boton>
          </>
        )}

        {onAbrir && (
          <Boton
            onClick={onAbrir}
            icono={<FileText className="h-3 w-3" />}
            titulo="Abrir la reserva para editar el contrato antes de emitirlo"
          >
            Editar
          </Boton>
        )}
      </div>
    </div>
  );
}

function Boton({
  children, onClick, cargando, icono, titulo, destacado,
}: {
  children: React.ReactNode;
  onClick: () => void;
  cargando?: boolean;
  icono: React.ReactNode;
  titulo: string;
  destacado?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      disabled={cargando}
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold uppercase transition-colors disabled:opacity-60 ' +
        (destacado
          ? 'bg-warning text-white hover:opacity-85'
          : 'border border-border text-muted-foreground hover:bg-muted')
      }
    >
      {cargando ? <Loader2 className="h-3 w-3 animate-spin" /> : icono}
      {cargando ? 'Un momento…' : children}
    </button>
  );
}
