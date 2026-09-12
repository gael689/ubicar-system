import { Link } from 'react-router-dom';
import { AlertTriangle, Camera } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDanios } from '@/hooks/useDanios';
import {
  TIPO_DANIO_LABEL, SEVERIDAD_DANIO_LABEL, SEVERIDAD_DANIO_COLOR,
  ESTADO_DANIO_LABEL, ESTADO_DANIO_COLOR, RESPONSABLE_DANIO_LABEL,
} from '@/lib/constants';
import { resolveAssetUrl } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Danio } from '@/types';

interface Props {
  /** Los del cliente (ficha del cliente) o los de un alquiler (detalle de la reserva). */
  clienteId?: number;
  alquilerId?: number;
  titulo?: string;
  /** Sin Card exterior, para meterlo adentro de otro panel. */
  compacto?: boolean;
}

const MOMENTO_LABEL: Record<Danio['momento'], string> = {
  checkout: 'Constatado al entregar',
  checkin: 'Detectado en la devolución',
  preexistente: 'Carga manual',
};

/**
 * Los daños vistos desde el cliente o desde un alquiler. **Sólo lectura.**
 *
 * **Es el mismo registro que la ficha del auto, no una copia.** El daño le
 * pertenece al vehículo (`DanioService`) y guarda además en qué alquiler se
 * constató y a qué cliente se le atribuye. Duplicarlo en "el cliente" o "el
 * contrato" haría que imputarlo, cobrarlo o bonificarlo en un lugar dejara el
 * otro diciendo algo distinto. Por eso las acciones viven en un solo lugar —
 * la ficha del auto, en Flota — y acá se enlaza.
 *
 * El contrato no se toca: se congela al emitirse y se firma en la entrega,
 * antes de que el daño exista. La constancia de la devolución es esto.
 */
export function DaniosResumen({ clienteId, alquilerId, titulo = 'Daños', compacto = false }: Props) {
  const { data: danios = [], isLoading } = useDanios(
    alquilerId ? { alquiler_id: alquilerId } : { cliente_id: clienteId },
  );

  const cuerpo = isLoading ? (
    <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
  ) : danios.length === 0 ? (
    <p className="text-sm text-muted-foreground py-2">
      {alquilerId ? 'No se registraron daños en este alquiler.' : 'Este cliente no tiene daños registrados en sus alquileres.'}
    </p>
  ) : (
    <div className="space-y-2">
      {danios.map(d => (
        <div key={d.id} className="rounded-xl border border-border bg-background p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground text-sm">{d.zona}</span>
                <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold', SEVERIDAD_DANIO_COLOR[d.severidad])}>
                  {SEVERIDAD_DANIO_LABEL[d.severidad]}
                </span>
                <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', ESTADO_DANIO_COLOR[d.estado])}>
                  {ESTADO_DANIO_LABEL[d.estado]}
                </span>
                <span className="text-xs text-muted-foreground">{TIPO_DANIO_LABEL[d.tipo]}</span>
              </div>
              {d.descripcion && <p className="text-sm text-muted-foreground">{d.descripcion}</p>}
              <p className="text-xs text-muted-foreground">
                {formatDate(d.fecha_deteccion)} · {MOMENTO_LABEL[d.momento]}
                {d.vehiculo_patente && (
                  <> · <Link to={`/flota/${d.vehiculo_id}`} className="underline hover:text-foreground">{d.vehiculo_patente}</Link></>
                )}
                {!alquilerId && d.alquiler_id ? ` · Alquiler #${d.alquiler_id}` : ''}
                {' · '}Responsable: {RESPONSABLE_DANIO_LABEL[d.responsable]}
              </p>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              {d.costo_estimado && <p className="text-xs text-muted-foreground">Est. {formatCurrency(d.costo_estimado)}</p>}
              {d.monto_imputado && <p className="text-sm font-bold text-warning">Imputado {formatCurrency(d.monto_imputado)}</p>}
            </div>
          </div>
          {d.fotos.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {d.fotos.map(f => (
                <a key={f.id} href={resolveAssetUrl(f.url) ?? '#'} target="_blank" rel="noreferrer">
                  <img
                    src={resolveAssetUrl(f.url) ?? ''}
                    alt={f.descripcion ?? `Foto del daño en ${d.zona}`}
                    className="h-16 w-16 object-cover rounded-lg border border-border"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Camera className="h-3 w-3" /> Sin fotos
            </p>
          )}
        </div>
      ))}
    </div>
  );

  const contenido = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h3 className="font-semibold text-foreground">{titulo}</h3>
        {danios.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 text-xs font-semibold">
            {danios.length}
          </span>
        )}
      </div>
      {cuerpo}
      {danios.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Para imputar, cobrar o bonificar un daño, entrá a la ficha del auto (tocá la patente).
        </p>
      )}
    </div>
  );

  return compacto ? contenido : <Card className="p-5">{contenido}</Card>;
}
