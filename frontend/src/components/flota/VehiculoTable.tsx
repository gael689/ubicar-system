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
import { cn, formatNumber } from '@/lib/utils';
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
          <TableHead className="w-[68px]"></TableHead>
          <TableHead>Patente</TableHead>
          <TableHead>Vehículo</TableHead>
          <TableHead className="w-[100px]">Tipo</TableHead>
          <TableHead className="w-[150px]">Estado</TableHead>
          <TableHead className="w-[120px] text-right">Km actual</TableHead>
          <TableHead className="w-[60px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehiculos.map((v) => {
          const inactivo = !v.activo;
          return (
            <TableRow
              key={v.id}
              className={cn(
                'cursor-pointer',
                inactivo && 'opacity-60 hover:opacity-80',
              )}
              onClick={() => navigate(`/flota/${v.id}`)}
            >
              <TableCell>
                <VehiculoThumb foto_url={v.foto_url} />
              </TableCell>
              <TableCell>
                <Link
                  to={`/flota/${v.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono font-semibold text-foreground hover:text-primary"
                >
                  {v.patente}
                </Link>
              </TableCell>
              <TableCell>
                <div className="font-medium text-foreground">{v.marca} {v.modelo}</div>
                <div className="text-xs text-muted-foreground">{v.anio} · {v.color}</div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">{TIPO_VEHICULO_LABEL[v.tipo]}</span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
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
                    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Inactivo
                    </span>
                  )}
                  <ServiceBadge kmActual={v.km_actual} kmProximoService={v.km_proximo_service} />
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {formatNumber(v.km_actual)}
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
        className="h-10 w-14 rounded-md object-cover bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <div className="h-10 w-14 rounded-md bg-secondary flex items-center justify-center">
      <Car className="h-4 w-4 text-primary/60" />
    </div>
  );
}
