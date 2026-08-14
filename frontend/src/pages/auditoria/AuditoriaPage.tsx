import { useState } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditoria, useOpcionesAuditoria, type RegistroAuditoria } from '@/hooks/useAuditoria';
import { cn, formatCurrency } from '@/lib/utils';

const PAGE_SIZE = 50;

// Etiquetas en castellano. La clave es lo que graba el backend; si mañana
// aparece una acción nueva sin traducir, se muestra tal cual en vez de
// desaparecer del filtro.
const ACCION_LABEL: Record<string, string> = {
  crear: 'Creó',
  editar: 'Editó',
  eliminar: 'Eliminó',
  anular: 'Anuló',
  cancelar: 'Canceló',
  dar_de_baja: 'Dio de baja',
  reactivar: 'Reactivó',
  debitar: 'Débito',
  acreditar: 'Crédito',
  bonificar: 'Bonificó',
  autorizar_descuento: 'Autorizó descuento',
  asignar_vehiculo: 'Asignó vehículo',
  reasignar_vehiculo: 'Cambió el vehículo',
  anular_contrato: 'Anuló contrato',
  anular_contrato_firmado: 'Anuló un contrato FIRMADO',
};

const ENTIDAD_LABEL: Record<string, string> = {
  cuenta_corriente: 'Cuenta corriente',
  reserva: 'Reserva',
  alquiler: 'Alquiler',
  pago: 'Cobro',
  regla_precio: 'Regla de precio',
  descuento_duracion: 'Descuento por duración',
  contrato: 'Contrato',
};

// Rojo para lo que saca plata o borra; verde para lo que entra; neutro para
// el resto. Colores sólidos, no transparencias: acá el color es información,
// no decoración.
const ACCION_COLOR: Record<string, string> = {
  eliminar: 'bg-red-600 text-white',
  anular: 'bg-red-600 text-white',
  anular_contrato: 'bg-red-600 text-white',
  // El más grave de la lista: alguien invalidó un papel que el cliente ya
  // había firmado. Es la línea que se va a buscar dentro de seis meses.
  anular_contrato_firmado: 'bg-red-800 text-white',
  cancelar: 'bg-red-600 text-white',
  bonificar: 'bg-amber-600 text-white',
  autorizar_descuento: 'bg-amber-600 text-white',
  dar_de_baja: 'bg-amber-600 text-white',
  reasignar_vehiculo: 'bg-amber-600 text-white',
  acreditar: 'bg-emerald-600 text-white',
  debitar: 'bg-slate-600 text-white',
  asignar_vehiculo: 'bg-slate-600 text-white',
};

function etiqueta(mapa: Record<string, string>, clave: string) {
  return mapa[clave] ?? clave;
}

function fechaHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** El detalle sólo se arma si alguien lo abre — son la mayoría de las filas. */
function Detalle({ registro }: { registro: RegistroAuditoria }) {
  const { datos_antes, datos_despues } = registro;
  if (!datos_antes && !datos_despues) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-[11px]">
      {datos_antes && (
        <div className="rounded-lg border border-border bg-muted/40 p-2">
          <p className="font-semibold text-muted-foreground mb-1">Antes</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-slate-700">
            {JSON.stringify(datos_antes, null, 2)}
          </pre>
        </div>
      )}
      {datos_despues && (
        <div className="rounded-lg border border-border bg-muted/40 p-2">
          <p className="font-semibold text-muted-foreground mb-1">Después</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-slate-700">
            {JSON.stringify(datos_despues, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Libro de auditoría: quién hizo qué, cuándo y sobre qué registro.
 *
 * **No es el historial de una reserva.** Es la lista de las acciones que no
 * dejan rastro en ninguna otra tabla: anular un movimiento, borrar un cobro,
 * perdonar un excedente, bajarle el precio a una reserva. Todo eso modifica
 * filas que ya existían, así que el `creado_por` de cada tabla no las ve.
 *
 * Sólo lectura, y desde acá no se puede editar ni borrar nada: un libro que
 * se puede corregir no sirve para auditar.
 */
export function AuditoriaPage() {
  const [page, setPage] = useState(1);
  const [accion, setAccion] = useState('');
  const [entidadTipo, setEntidadTipo] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [buscar, setBuscar] = useState('');
  const [expandido, setExpandido] = useState<number | null>(null);

  const { data: opciones } = useOpcionesAuditoria();
  const { data, isLoading } = useAuditoria({
    page,
    page_size: PAGE_SIZE,
    accion: accion || undefined,
    entidad_tipo: entidadTipo || undefined,
    usuario_id: usuarioId ? Number(usuarioId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    buscar: buscar.trim() || undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Cualquier cambio de filtro vuelve a la primera página: quedarse en la 7
  // de un resultado que ahora tiene 2 muestra una tabla vacía sin explicación.
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const selectCls =
    'px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs text-foreground';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué. Sólo lectura: los registros no se editan ni se borran."
      />

      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={buscar}
            onChange={e => cambiar(setBuscar)(e.target.value)}
            placeholder="Buscar en la descripción…"
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-input bg-background text-xs"
          />
          <select value={accion} onChange={e => cambiar(setAccion)(e.target.value)} className={selectCls}>
            <option value="">Toda acción</option>
            {opciones?.acciones.map(a => (
              <option key={a} value={a}>{etiqueta(ACCION_LABEL, a)}</option>
            ))}
          </select>
          <select value={entidadTipo} onChange={e => cambiar(setEntidadTipo)(e.target.value)} className={selectCls}>
            <option value="">Todo el sistema</option>
            {opciones?.entidades.map(e => (
              <option key={e} value={e}>{etiqueta(ENTIDAD_LABEL, e)}</option>
            ))}
          </select>
          <select value={usuarioId} onChange={e => cambiar(setUsuarioId)(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {opciones?.usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
          <input type="date" value={desde} onChange={e => cambiar(setDesde)(e.target.value)} className={selectCls} />
          <input type="date" value={hasta} onChange={e => cambiar(setHasta)(e.target.value)} className={selectCls} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Info className="h-5 w-5" />
            <p>
              No hay registros que coincidan.
              {total === 0 && !accion && !entidadTipo && !usuarioId && !buscar && (
                <>
                  {' '}El libro empieza a llenarse solo, a medida que se opera:
                  cobros eliminados, movimientos anulados, precios cambiados,
                  reservas canceladas y excedentes bonificados.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map(r => (
              <div
                key={r.id}
                className="px-4 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => setExpandido(expandido === r.id ? null : r.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-[11px] text-muted-foreground font-mono shrink-0 w-32 pt-0.5">
                    {fechaHora(r.created_at)}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold',
                      ACCION_COLOR[r.accion] ?? 'bg-slate-100 text-slate-700'
                    )}
                  >
                    {etiqueta(ACCION_LABEL, r.accion)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground leading-snug">{r.descripcion}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {r.usuario_nombre ?? 'Sistema'}
                      {' · '}
                      {etiqueta(ENTIDAD_LABEL, r.entidad_tipo)}
                      {r.entidad_id != null && ` #${r.entidad_id}`}
                      {r.ip && ` · ${r.ip}`}
                    </p>
                    {expandido === r.id && <Detalle registro={r} />}
                  </div>
                  {r.monto != null && (
                    <span className="shrink-0 text-xs font-semibold text-foreground pt-0.5">
                      {formatCurrency(r.monto)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {paginas > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} registros</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>{page} de {paginas}</span>
            <Button variant="outline" size="sm" disabled={page >= paginas} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
