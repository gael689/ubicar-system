import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Clock, Copy, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAccionCasilla, useCasillas, useDominio, useGuardarCasilla,
  type AccionDeCasilla, type Casilla, type FichaDeDominio, type RegistroDNS,
} from '@/hooks/useProspectos';
import { cn, extractError } from '@/lib/utils';

const ESTADO: Record<Casilla['estado'], { texto: string; clase: string }> = {
  activa: { texto: 'Mandando', clase: 'bg-emerald-100 text-emerald-800' },
  pausada: { texto: 'Pausada', clase: 'bg-amber-100 text-amber-800' },
  inactiva: { texto: 'Falta verificar', clase: 'bg-slate-100 text-slate-700' },
};

/**
 * **Casillas**: desde dónde salen las campañas.
 *
 * Las casillas viven en un **subdominio** de Ubicar (`franco@empresas.…`), nunca
 * en el dominio principal: de ahí salen las confirmaciones de reserva, y un
 * mail en frío marcado como spam le pegaría a todo. Esta pantalla hace de
 * asistente: crea el subdominio en Resend, muestra los registros que hay que
 * cargar en el DNS (con su estado, uno por uno) y verifica.
 */
export function CasillasTab() {
  const { data, isLoading } = useCasillas();
  const accion = useAccionCasilla();
  const dominio = useDominio();
  const [editando, setEditando] = useState<Casilla | 'nueva' | null>(null);
  const [aBorrar, setABorrar] = useState<Casilla | null>(null);

  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;

  const hacer = (id: number, que: AccionDeCasilla, listo: string) =>
    accion.mutate({ id, accion: que }, {
      onSuccess: () => toast.success(listo),
      onError: e => toast.error(extractError(e)),
    });
  const conDominio = (nombre: string, que: 'crear' | 'verificar') =>
    dominio.mutate({ nombre, accion: que }, {
      onSuccess: f => toast.success(f.estado === 'verificado'
        ? `${nombre} está verificado`
        : que === 'crear' ? 'Subdominio creado: cargá los registros de abajo' : 'Todavía faltan registros'),
      onError: e => toast.error(extractError(e)),
    });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <p className="min-w-[220px] flex-1 text-sm text-muted-foreground">
          Las campañas salen de casillas en un subdominio (por ejemplo{' '}
          <strong className="text-foreground">franco@empresas.{data.raiz}</strong>), nunca de {data.raiz}:
          así, si un mail cae en spam, no afecta a las confirmaciones de reserva.
        </p>
        <Button onClick={() => setEditando('nueva')}><Plus className="h-4 w-4" /> Agregar casilla</Button>
      </Card>

      {data.casillas.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Todavía no hay ninguna casilla. Agregá la primera para poder mandar campañas.
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {data.casillas.map(c => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{c.nombre_visible}</p>
                <p className="truncate text-xs text-muted-foreground">{c.direccion}</p>
              </div>
              <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-semibold', ESTADO[c.estado].clase)}>
                {ESTADO[c.estado].texto}
              </span>
            </div>
            {c.motivo_estado && (
              <p className={cn('mt-2 rounded-lg p-2 text-xs',
                c.estado === 'pausada' ? 'bg-amber-50 text-amber-900' : 'bg-muted text-muted-foreground')}>
                {c.motivo_estado}
              </p>
            )}
            <p className="mt-2 text-sm text-foreground">
              Hoy: <strong>{c.enviados_hoy}</strong> de {c.cupo_hoy}
              {c.en_rampa && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (arranca de a poco; después sube a {c.limite_dia} por día)
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Las respuestas llegan a {c.responder_a ?? c.direccion}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.estado === 'activa' && (
                <Button size="sm" variant="outline" disabled={accion.isPending}
                  onClick={() => hacer(c.id, 'pausar', 'Casilla pausada')}>
                  <Pause className="h-4 w-4" /> Pausar
                </Button>
              )}
              {c.estado === 'pausada' && (
                <Button size="sm" disabled={accion.isPending}
                  onClick={() => hacer(c.id, 'reactivar', 'Casilla reactivada')}>
                  <Play className="h-4 w-4" /> Reactivar
                </Button>
              )}
              {c.estado === 'inactiva' && data.modo === 'manual' && (
                <Button size="sm" disabled={accion.isPending}
                  onClick={() => hacer(c.id, 'confirmar', 'Casilla activada')}>
                  <Check className="h-4 w-4" /> Ya está verificado
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>Editar</Button>
              <Button size="sm" variant="ghost" className="ml-auto" aria-label={`Borrar ${c.direccion}`}
                onClick={() => setABorrar(c)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {data.aviso && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {data.modo === 'manual' && <strong>Modo manual: el sistema no puede tocar Resend. </strong>}
          {data.aviso}
        </p>
      )}

      {data.modo !== 'simulado' && data.dominios.map(d => (
        <Dominio key={d.dominio} ficha={d} ocupado={dominio.isPending}
          onCrear={() => conDominio(d.dominio, 'crear')} onVerificar={() => conDominio(d.dominio, 'verificar')} />
      ))}

      {editando && (
        <FormularioCasilla casilla={editando === 'nueva' ? null : editando} raiz={data.raiz}
          onClose={() => setEditando(null)} />
      )}
      <ConfirmDialog
        open={aBorrar !== null} onOpenChange={o => { if (!o) setABorrar(null); }}
        title="¿Borrar la casilla?"
        description={`${aBorrar?.direccion ?? ''} deja de mandar. Lo que ya envió queda registrado.`}
        confirmLabel="Sí, borrar" destructive
        onConfirm={() => { if (aBorrar) hacer(aBorrar.id, 'borrar', 'Casilla borrada'); setABorrar(null); }}
      />
    </div>
  );
}

const ESTADO_DOMINIO: Record<FichaDeDominio['estado'], string> = {
  verificado: 'Verificado', pendiente: 'Faltan registros', fallido: 'Hay registros mal cargados',
  sin_crear: 'Todavía no está creado', sin_comprobar: 'Hay que hacerlo a mano',
};

function Dominio({ ficha, ocupado, onCrear, onVerificar }: {
  ficha: FichaDeDominio; ocupado: boolean; onCrear: () => void; onVerificar: () => void;
}) {
  const registros = [...ficha.registros, ficha.dmarc];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{ficha.dominio}</p>
          <p className={cn('text-xs', ficha.estado === 'verificado' ? 'text-emerald-700' : 'text-amber-700')}>
            {ESTADO_DOMINIO[ficha.estado]}
          </p>
        </div>
        {ficha.modo === 'api' && ficha.estado === 'sin_crear' && (
          <Button size="sm" disabled={ocupado} onClick={onCrear}><Plus className="h-4 w-4" /> Crear el subdominio</Button>
        )}
        {ficha.modo === 'api' && ficha.estado !== 'sin_crear' && ficha.estado !== 'verificado' && (
          <Button size="sm" disabled={ocupado} onClick={onVerificar}>
            <RefreshCw className={cn('h-4 w-4', ocupado && 'animate-spin')} /> Verificar ahora
          </Button>
        )}
      </div>
      {ficha.estado !== 'verificado' && ficha.registros.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Cargá estos registros donde está registrado el dominio (NIC / el proveedor del DNS). Pueden tardar
          unas horas en verse.
        </p>
      )}
      {ficha.registros.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {registros.map(r => <Registro key={`${r.tipo}-${r.nombre}-${r.proposito}`} r={r} />)}
        </ul>
      )}
    </Card>
  );
}

function Registro({ r }: { r: RegistroDNS }) {
  const copiar = (texto: string) => {
    void navigator.clipboard?.writeText(texto);
    toast.success('Copiado');
  };
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3 text-xs">
      <span className="mt-0.5 w-5 shrink-0" title={r.estado}>
        {r.estado === 'verificado'
          ? <Check className="h-4 w-4 text-emerald-600" aria-label="Verificado" />
          : <Clock className="h-4 w-4 text-amber-600" aria-label={r.estado === 'recomendado' ? 'Recomendado' : 'Pendiente'} />}
      </span>
      <span className="w-20 shrink-0 font-semibold text-foreground">
        {r.tipo}{r.prioridad != null ? ` (${r.prioridad})` : ''}
        <span className="block font-normal text-muted-foreground">
          {r.proposito}{r.estado === 'recomendado' ? ' · recomendado' : ''}
        </span>
      </span>
      <span className="min-w-[180px] flex-1 space-y-1">
        <Copiable etiqueta="Nombre" valor={r.nombre} onCopiar={copiar} ayuda={r.nombre_completo} />
        <Copiable etiqueta="Valor" valor={r.valor} onCopiar={copiar} />
      </span>
    </li>
  );
}

function Copiable({ etiqueta, valor, ayuda, onCopiar }: {
  etiqueta: string; valor: string; ayuda?: string; onCopiar: (v: string) => void;
}) {
  return (
    <span className="flex items-start gap-2">
      <span className="w-12 shrink-0 text-muted-foreground">{etiqueta}</span>
      <code className="min-w-0 flex-1 break-all text-foreground" title={ayuda}>{valor}</code>
      <button type="button" onClick={() => onCopiar(valor)} aria-label={`Copiar ${etiqueta.toLowerCase()}`}
        className="shrink-0 text-ubicar-primary hover:text-ubicar-dark">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function FormularioCasilla({ casilla, raiz, onClose }: { casilla: Casilla | null; raiz: string; onClose: () => void }) {
  const guardar = useGuardarCasilla();
  const [direccion, setDireccion] = useState(casilla?.direccion ?? '');
  const [nombre, setNombre] = useState(casilla?.nombre_visible ?? '');
  const [responderA, setResponderA] = useState(casilla?.responder_a ?? '');
  const [limite, setLimite] = useState(String(casilla?.limite_dia ?? 30));
  // El servidor también lo rechaza; acá se avisa antes, con el porqué, para
  // que no parezca un capricho del sistema.
  const enLaRaiz = direccion.trim().toLowerCase().endsWith(`@${raiz.toLowerCase()}`);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{casilla ? 'Editar casilla' : 'Agregar casilla'}</DialogTitle>
          <DialogDescription>
            Tiene que ser de un subdominio de {raiz}, por ejemplo franco@empresas.{raiz}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Dirección</span>
            <input value={direccion} onChange={e => setDireccion(e.target.value)} disabled={!!casilla} autoFocus
              placeholder={`franco@empresas.${raiz}`} className="input-base" aria-label="Dirección" />
            {enLaRaiz && !casilla && (
              <span role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
                No puede ser @{raiz}: de ahí salen las confirmaciones de reserva y los mails a clientes. Si una
                campaña cae en spam, se llevaría a todos esos mails con ella. Usá un subdominio, como
                empresas.{raiz}.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre que ve quien recibe</span>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Franco de Ubicar Rent"
              className="input-base" aria-label="Nombre visible" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Adónde llegan las respuestas</span>
            <input value={responderA} onChange={e => setResponderA(e.target.value)}
              placeholder="Un mail que alguien lea todos los días" className="input-base" aria-label="Responder a" />
            <span className="text-xs text-muted-foreground">Si lo dejás vacío, llegan a la misma casilla.</span>
          </label>
          <label className="flex max-w-[160px] flex-col gap-1">
            <span className="text-sm font-medium">Máximo por día</span>
            <input type="number" min={1} max={200} value={limite} onChange={e => setLimite(e.target.value)}
              className="input-base" aria-label="Máximo por día" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!nombre.trim() || (!casilla && (!direccion.trim() || enLaRaiz)) || guardar.isPending}
            onClick={() => guardar.mutate({
              id: casilla?.id, direccion, nombre_visible: nombre, responder_a: responderA,
              limite_dia: Number(limite) || 30,
            }, {
              onSuccess: c => {
                toast.success(c.estado === 'activa' ? 'Casilla lista para mandar'
                  : 'Casilla guardada. Falta verificar su subdominio.');
                onClose();
              },
              onError: e => toast.error(extractError(e)),
            })}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
