import { useState } from 'react';
import { Mail, Paperclip, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  useEmailDetalle, useEmails, useEstadoEmails, useReintentarEmail,
} from '@/hooks/useEmails';
import type { EmailEnviado, EstadoEmail } from '@/types';
import { EstadoRemitente } from './EstadoRemitente';
import { EnviarOfertaDialog } from './EnviarOfertaDialog';

const ESTADO_LABEL: Record<EstadoEmail, string> = {
  enviado: 'Enviado',
  fallido: 'No salió',
  omitido: 'Sin enviar',
};

const ESTADO_COLOR: Record<EstadoEmail, string> = {
  enviado: 'bg-success/10 text-success',
  fallido: 'bg-danger/10 text-danger',
  omitido: 'bg-warning/10 text-warning',
};

/** Fecha y hora en una línea: acá "cuándo" siempre incluye la hora — la
 *  pregunta que trae a esta pantalla es "¿le llegó?", y la respuesta útil no
 *  es "el martes" sino "el martes 14:32". */
function fechaHora(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function EmailsTab() {
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [verId, setVerId] = useState<number | null>(null);
  const [ofertaAbierta, setOfertaAbierta] = useState(false);

  const { data: integracion } = useEstadoEmails();
  const { data, isLoading } = useEmails({
    page,
    tipo: tipo || null,
    estado: estado || null,
    destinatario: busqueda || null,
  });
  const detalle = useEmailDetalle(verId);
  const reintentar = useReintentarEmail();

  const tipos = integracion?.tipos ?? {};
  const nombreTipo = (t: string) => tipos[t] ?? t;

  async function handleReintentar(email: EmailEnviado) {
    // Reintentar un mail a un cliente con el remitente de prueba volvería a
    // omitirlo. Se ofrece forzarlo, pero diciendo lo que va a pasar.
    let forzar = false;
    if (email.estado === 'omitido' && integracion?.remitente_de_prueba) {
      forzar = window.confirm(
        'El remitente sigue siendo el de prueba de Resend, así que este mail probablemente ' +
        'no le llegue al cliente (Resend sólo entrega a la casilla de la cuenta).\n\n' +
        '¿Mandarlo igual?',
      );
      if (!forzar) return;
    }
    try {
      const res = await reintentar.mutateAsync({ id: email.id, forzar });
      toast[res.data.estado === 'enviado' ? 'success' : 'error'](res.message);
    } catch {
      toast.error('No se pudo reintentar el envío');
    }
  }

  return (
    <div className="space-y-4">
      <EstadoRemitente estado={integracion} />

      <div className="flex flex-wrap items-end gap-4 bg-card border border-border rounded-xl p-5">
        <div className="space-y-1.5">
          <label htmlFor="f-tipo-email" className="text-xs font-medium text-muted-foreground">
            Tipo de mail
          </label>
          <select
            id="f-tipo-email"
            value={tipo}
            onChange={e => { setTipo(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background block min-w-[220px]"
          >
            <option value="">Todos</option>
            {Object.entries(tipos).map(([clave, nombre]) => (
              <option key={clave} value={clave}>{nombre}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="f-estado-email" className="text-xs font-medium text-muted-foreground">
            Resultado
          </label>
          <select
            id="f-estado-email"
            value={estado}
            onChange={e => { setEstado(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background block"
          >
            <option value="">Todos</option>
            <option value="enviado">Enviados</option>
            <option value="fallido">No salieron</option>
            <option value="omitido">Sin enviar</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="f-casilla" className="text-xs font-medium text-muted-foreground">
            Casilla
          </label>
          <input
            id="f-casilla"
            type="search"
            placeholder="cliente@ejemplo.com"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background block min-w-[220px]"
          />
        </div>

        <div className="ml-auto">
          <Button onClick={() => setOfertaAbierta(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Enviar oferta
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">Cargando...</div>
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && (
          <div className="text-center py-16">
            <Mail className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
            <p className="text-sm text-foreground font-medium">Todavía no se mandó ningún mail</p>
            <p className="text-sm text-muted-foreground mt-1">
              Acá van a aparecer las confirmaciones de reserva, los retiros, las devoluciones y las
              ofertas que mandes a mano.
            </p>
          </div>
        )}

        {data?.data.map(email => (
          <div
            key={email.id}
            className="bg-card border border-border rounded-xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => setVerId(email.id)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{email.asunto}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${ESTADO_COLOR[email.estado]}`}>
                    {ESTADO_LABEL[email.estado]}
                  </span>
                  {email.con_adjunto && (
                    <Paperclip className="h-3 w-3 text-muted-foreground" aria-label="Con adjunto" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 truncate">{email.destinatario}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {nombreTipo(email.tipo)} · {fechaHora(email.created_at)}
                  {!email.automatico && ' · enviado a mano'}
                  {email.intentos > 1 && ` · ${email.intentos} intentos`}
                </p>
              </button>

              {email.estado !== 'enviado' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reintentar.isPending}
                  onClick={() => handleReintentar(email)}
                >
                  <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                  Reintentar
                </Button>
              )}
            </div>

            {email.motivo && email.estado !== 'enviado' && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                {email.motivo}
              </p>
            )}
          </div>
        ))}
      </div>

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="text-sm text-muted-foreground disabled:opacity-40 hover:text-foreground"
          >
            ← Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {data.page} de {Math.ceil(data.total / data.page_size)} ({data.total} en total)
          </span>
          <button
            disabled={page * data.page_size >= data.total}
            onClick={() => setPage(p => p + 1)}
            className="text-sm text-muted-foreground disabled:opacity-40 hover:text-foreground"
          >
            Siguiente →
          </button>
        </div>
      )}

      <Dialog open={verId !== null} onOpenChange={abierto => !abierto && setVerId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalle.data?.asunto ?? 'Mail'}</DialogTitle>
            <DialogDescription>
              A {detalle.data?.destinatario} · desde {detalle.data?.remitente}
              {detalle.data && ` · ${fechaHora(detalle.data.ultimo_intento_at)}`}
            </DialogDescription>
          </DialogHeader>
          {/* El cuerpo tal cual salió. Va en un iframe con `sandbox` vacío: es
              HTML guardado, y renderizarlo dentro de la app le daría acceso a
              la sesión de quien lo está mirando. */}
          <iframe
            title="Contenido del mail"
            sandbox=""
            srcDoc={detalle.data?.cuerpo_html ?? ''}
            className="w-full h-[420px] border border-border rounded-lg bg-white"
          />
        </DialogContent>
      </Dialog>

      <EnviarOfertaDialog
        abierto={ofertaAbierta}
        onCerrar={() => setOfertaAbierta(false)}
        remitenteDePrueba={integracion?.remitente_de_prueba ?? false}
      />
    </div>
  );
}
