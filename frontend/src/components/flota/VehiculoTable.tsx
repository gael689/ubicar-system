import { Link, useNavigate } from 'react-router-dom';
import { Car, MoreHorizontal, Pencil, ArchiveRestore, ArchiveX, History, Wrench, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { TIPO_VEHICULO_LABEL } from '@/lib/constants';
import { resolveAssetUrl } from '@/lib/api';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import type { Vehiculo } from '@/types';

interface Props {
  vehiculos: Vehiculo[];
  onEdit: (v: Vehiculo) => void;
  onDeactivate: (v: Vehiculo) => void;
  onReactivate: (v: Vehiculo) => void;
}

export function VehiculoTable({ vehiculos, onEdit, onDeactivate, onReactivate }: Props) {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-[96px]"></TableHead>
          <TableHead>Vehículo</TableHead>
          <TableHead className="w-[150px]">Categoría</TableHead>
          <TableHead className="w-[210px]">Estado</TableHead>
          <TableHead className="w-[190px]">Papeles</TableHead>
          <TableHead className="w-[150px] text-right">Kilometraje</TableHead>
          <TableHead className="w-[60px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehiculos.map((v) => {
          const inactivo = !v.activo;
          const enUber = v.destino === 'uber';
          const restanteService = v.km_proximo_service > 0 ? v.km_proximo_service - v.km_actual : null;
          return (
            <TableRow
              key={v.id}
              className={cn(
                'cursor-pointer',
                inactivo && 'opacity-60 hover:opacity-80',
              )}
              onClick={() => navigate(`/flota/${v.id}`)}
            >
              <TableCell className="py-3">
                <VehiculoThumb foto_url={v.foto_url} />
              </TableCell>
              <TableCell className="py-3">
                {/* La patente y el nombre, **grandes**: es lo que se busca con
                    la vista de reojo. La patente va como chapa. */}
                <Link
                  to={`/flota/${v.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block rounded-md border-2 border-slate-800 bg-white px-2.5 py-0.5 font-mono text-xl font-extrabold tracking-wider text-slate-900 shadow-sm hover:border-primary hover:text-primary"
                >
                  {v.patente}
                </Link>
                <div className="mt-1 text-lg font-semibold leading-tight text-foreground">
                  {v.marca} {v.modelo}
                </div>
                <div className="text-sm text-muted-foreground">
                  {v.anio} · {v.color}
                  {v.tipo && ` · ${TIPO_VEHICULO_LABEL[v.tipo]}`}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium text-foreground">
                  {v.categoria?.nombre ?? <span className="text-muted-foreground">Sin categoría</span>}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {/* El destino es **el uso de hoy**, no una prohibición: los
                      autos rotan entre Uber y alquiler y lo decide el contrato
                      (04/10/2026). Un auto en Uber se puede reservar. */}
                  {enUber && (
                    <span className="inline-flex items-center rounded-md border border-ubicar-primary/40 bg-ubicar-primary/10 px-2 py-0.5 text-xs font-semibold text-ubicar-dark">
                      Hoy en Uber
                    </span>
                  )}
                  {v.estado === 'alquilado' ? (
                    <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      En uso
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-success/30 bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                      Disponible
                    </span>
                  )}
                  {inactivo && (
                    <span
                      className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      title={v.motivo_baja ? `Baja: ${v.motivo_baja}` : undefined}
                    >
                      {/* El motivo a la vista: "inactivo" solo no decía si se
                          vendió, se chocó o se lo robaron. */}
                      Baja{v.motivo_baja ? `: ${v.motivo_baja}` : ''}
                      {v.fecha_baja ? ` · ${formatDate(v.fecha_baja)}` : ''}
                    </span>
                  )}
                  <ServiceBadge kmActual={v.km_actual} kmProximoService={v.km_proximo_service} />
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-sm">
                  <Papel label="VTV" fecha={v.vtv_vencimiento} />
                  <Papel label="Póliza" fecha={v.poliza_vencimiento} detalle={v.compania_seguro} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {formatNumber(v.km_actual)} <span className="text-xs font-normal text-muted-foreground">km</span>
                </div>
                {restanteService !== null && (
                  <div className={cn(
                    'text-xs tabular-nums',
                    restanteService <= 0 ? 'font-semibold text-red-700'
                      : restanteService < 1000 ? 'font-medium text-amber-700' : 'text-muted-foreground',
                  )}>
                    {restanteService <= 0
                      ? 'Service vencido'
                      : `Service en ${formatNumber(restanteService)} km`}
                  </div>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Acciones</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/flota/${v.id}`)}>
                      <History className="h-4 w-4" />
                      Ver detalle / historial
                    </DropdownMenuItem>
                    {!inactivo && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(v)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onClick={() => onDeactivate(v)}>
                          <ArchiveX className="h-4 w-4" />
                          Dar de baja
                        </DropdownMenuItem>
                      </>
                    )}
                    {inactivo && (
                      <DropdownMenuItem onClick={() => onReactivate(v)}>
                        <ArchiveRestore className="h-4 w-4" />
                        Reactivar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Un papel del auto (VTV, póliza) **con su fecha siempre a la vista**: antes
 * sólo se veía un cartel cuando estaba por vencer, y nunca se sabía hasta
 * cuándo valía. Rojo si venció, ámbar si vence en 30 días.
 */
function Papel({ label, fecha, detalle }: { label: string; fecha: string | null; detalle?: string | null }) {
  if (!fecha) {
    return <div className="text-muted-foreground">{label}: <span className="text-xs">sin cargar</span></div>;
  }
  const dias = Math.floor((new Date(fecha).getTime() - Date.now()) / 86400000);
  return (
    <div className={cn(
      dias < 0 ? 'font-semibold text-red-700' : dias <= 30 ? 'font-medium text-amber-700' : 'text-foreground',
    )}>
      {dias < 0 && <AlertTriangle className="mr-1 inline h-3 w-3" />}
      {label} <span className="tabular-nums">{formatDate(fecha)}</span>
      {dias < 0 ? ' · vencida' : dias <= 30 ? ' · por vencer' : ''}
      {detalle && <span className="block text-xs font-normal text-muted-foreground">{detalle}</span>}
    </div>
  );
}

function ServiceBadge({ kmActual, kmProximoService }: { kmActual: number; kmProximoService: number }) {
  if (kmProximoService <= 0) return null;
  const restantes = kmProximoService - kmActual;
  if (restantes <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Mant. vencido
      </span>
    );
  }
  if (restantes < 1000) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Wrench className="h-3 w-3" />
        Service próximo
      </span>
    );
  }
  return null;
}

function VehiculoThumb({ foto_url }: { foto_url: string | null }) {
  const url = resolveAssetUrl(foto_url);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-16 w-24 rounded-lg object-cover bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <div className="h-16 w-24 rounded-lg bg-secondary flex items-center justify-center">
      <Car className="h-6 w-6 text-primary/60" />
    </div>
  );
}
