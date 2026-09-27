import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Plus, UserRound, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAddConductor, useConductores } from '@/hooks/useClientes';
import api from '@/lib/api';
import { cn, formatDate, irAlError } from '@/lib/utils';
import type { ApiResponse, ConductorAdicional, ConductorAdicionalCreate } from '@/types';

/**
 * Conductores de una reserva: elegir de 1 a 3, dar de alta uno en el momento y
 * avisar si alguno ya tiene otro auto esas fechas (plan 27/09, A3).
 *
 * Vive acá y no dentro de cada pantalla porque lo usan tres: el wizard de
 * nueva reserva, el contrato rápido y el panel del contrato (para cambiar el
 * conductor antes de regenerarlo). Tres copias ya se habrían desalineado.
 */

export const MAX_CONDUCTORES = 3;

export interface BorradorConductor {
  nombre_completo: string;
  dni: string;
  licencia_numero: string;
  licencia_vencimiento: string;
  fecha_nacimiento: string;
}

export const BORRADOR_VACIO: BorradorConductor = {
  nombre_completo: '', dni: '', licencia_numero: '', licencia_vencimiento: '', fecha_nacimiento: '',
};

/** Lo que viaja a la API: los vacíos van como `null`, nunca como `''`. */
export function borradorAPayload(b: BorradorConductor): ConductorAdicionalCreate {
  return {
    nombre_completo: b.nombre_completo.trim(),
    dni: b.dni.trim() || null,
    licencia_numero: b.licencia_numero.trim() || null,
    // El vencimiento es opcional. Mandarlo como '' era lo que daba 422 y dejaba
    // al conductor sin guardar (la causa raíz de "no llegó al contrato").
    licencia_vencimiento: b.licencia_vencimiento || null,
    fecha_nacimiento: b.fecha_nacimiento || null,
  };
}

/** Los campos de un conductor. `prefijo` arma los `data-campo` para `irAlError`. */
export function CamposConductor({
  valor, onChange, prefijo, errorNombre,
}: {
  valor: BorradorConductor;
  onChange: (v: BorradorConductor) => void;
  prefijo: string;
  errorNombre?: string | null;
}) {
  const set = (k: keyof BorradorConductor) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...valor, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Nombre y apellido<span className="ml-0.5 text-danger">*</span>
        </span>
        <input
          data-campo={`${prefijo}-nombre`}
          value={valor.nombre_completo}
          onChange={set('nombre_completo')}
          placeholder="María García"
          className="input-base"
        />
        {errorNombre && <span className="text-xs text-danger">{errorNombre}</span>}
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">DNI</span>
        <input value={valor.dni} onChange={set('dni')} placeholder="30123456" className="input-base" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">N° de licencia</span>
        <input value={valor.licencia_numero} onChange={set('licencia_numero')} placeholder="B98765432" className="input-base" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Vencimiento de la licencia</span>
        <input type="date" value={valor.licencia_vencimiento} onChange={set('licencia_vencimiento')} className="input-base" />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Fecha de nacimiento</span>
        <input type="date" value={valor.fecha_nacimiento} onChange={set('fecha_nacimiento')} className="input-base" />
      </label>
    </div>
  );
}

/** Alta de un conductor del cliente en el momento, sin salir de la pantalla. */
export function NuevoConductorForm({
  clienteId, onCreado, onCancelar,
}: {
  clienteId: number;
  onCreado: (c: ConductorAdicional) => void;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState<BorradorConductor>(BORRADOR_VACIO);
  const [error, setError] = useState<string | null>(null);
  const alta = useAddConductor(clienteId);

  const guardar = async () => {
    // Doble clic: el segundo no hace nada mientras el primero viaja.
    if (alta.isPending) return;
    if (valor.nombre_completo.trim().length < 2) {
      setError('Escribí el nombre del conductor');
      irAlError('nuevo-conductor-nombre');
      return;
    }
    setError(null);
    try {
      const creado = await alta.mutateAsync(borradorAPayload(valor));
      setValor(BORRADOR_VACIO);
      onCreado(creado);
    } catch {
      // El toast ya lo muestra el hook; el formulario queda como estaba.
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-foreground">Nuevo conductor</p>
      <CamposConductor valor={valor} onChange={setValor} prefijo="nuevo-conductor" errorNombre={error} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={guardar} disabled={alta.isPending}>
          {alta.isPending ? 'Guardando…' : 'Agregar y elegir'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}

export interface ConductorOcupado {
  conductor_id: number;
  conductor_nombre: string;
  reserva_id: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
  patente: string | null;
  cliente: string | null;
}

/** Los conductores elegidos que ya figuran en otra reserva/alquiler esas fechas. */
export function useConductoresOcupados(
  ids: number[], fechaInicio?: string, fechaFin?: string, excluirReservaId?: number | null,
) {
  return useQuery({
    queryKey: ['conductores-ocupados', ids.join(','), fechaInicio, fechaFin, excluirReservaId ?? null],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ConductorOcupado[]>>('/reservas/conductores-ocupados', {
        params: {
          conductor_ids: ids.join(','),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          ...(excluirReservaId ? { excluir_reserva_id: excluirReservaId } : {}),
        },
      });
      return data.data;
    },
    enabled: ids.length > 0 && !!fechaInicio && !!fechaFin && fechaFin >= fechaInicio,
    staleTime: 30_000,
  });
}

/**
 * El aviso ámbar. **No bloquea**: una empresa puede mandar al mismo chofer a
 * retirar dos autos, y el mostrador sabe cosas que el sistema no.
 */
export function AvisoConductoresOcupados({
  ids, fechaInicio, fechaFin, excluirReservaId,
}: {
  ids: number[];
  fechaInicio?: string;
  fechaFin?: string;
  excluirReservaId?: number | null;
}) {
  const { data: ocupados } = useConductoresOcupados(ids, fechaInicio, fechaFin, excluirReservaId);
  if (!ocupados || ocupados.length === 0) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        {ocupados.map(o => (
          <p key={`${o.conductor_id}-${o.reserva_id}`}>
            <strong>{o.conductor_nombre}</strong> ya figura en la reserva #{o.reserva_id}
            {o.patente ? ` (${o.patente})` : ''} del {formatDate(o.fecha_inicio)} al {formatDate(o.fecha_fin)}.
          </p>
        ))}
        <p className="text-amber-800">Podés seguir igual; revisalo si no es lo que esperabas.</p>
      </div>
    </div>
  );
}

interface SelectorProps {
  clienteId: number;
  seleccionados: number[];
  onChange: (ids: number[]) => void;
  esEmpresa?: boolean;
  /** Para el aviso de conductor ocupado. Sin fechas, no se consulta. */
  fechaInicio?: string;
  fechaFin?: string;
  excluirReservaId?: number | null;
  /** Si el cliente tiene un solo conductor y no hay nada elegido, se elige solo. */
  preseleccionarUnico?: boolean;
}

/**
 * Chips para elegir de 1 a 3 conductores. El orden importa: el primero es el
 * principal (el que decide la edad mínima), y se marca con "1°".
 */
export function SelectorConductores({
  clienteId, seleccionados, onChange, esEmpresa = false,
  fechaInicio, fechaFin, excluirReservaId, preseleccionarUnico = true,
}: SelectorProps) {
  const { data: todos, isLoading } = useConductores(clienteId);
  const activos = (todos ?? []).filter(c => c.activo);
  const [creando, setCreando] = useState(false);

  // Preselección del único conductor, **una sola vez por cliente**: si la
  // persona lo saca a propósito, no se lo vuelve a poner.
  const preseleccionadoPara = useRef<number | null>(null);
  useEffect(() => {
    if (!preseleccionarUnico || !clienteId || isLoading) return;
    if (preseleccionadoPara.current === clienteId) return;
    preseleccionadoPara.current = clienteId;
    if (activos.length === 1 && seleccionados.length === 0) onChange([activos[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, isLoading, activos.length, preseleccionarUnico]);

  const alternar = (id: number) => {
    if (seleccionados.includes(id)) {
      onChange(seleccionados.filter(x => x !== id));
    } else if (seleccionados.length < MAX_CONDUCTORES) {
      onChange([...seleccionados, id]);
    }
  };

  const lleno = seleccionados.length >= MAX_CONDUCTORES;

  return (
    <div className="space-y-2" data-campo="conductores">
      <div className="flex flex-wrap items-center gap-2">
        {activos.map(c => {
          const pos = seleccionados.indexOf(c.id);
          const elegido = pos >= 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => alternar(c.id)}
              disabled={!elegido && lleno}
              aria-pressed={elegido}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                elegido
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary/60',
                !elegido && lleno && 'cursor-not-allowed opacity-50',
              )}
              title={c.dni ? `DNI ${c.dni}` : 'Sin DNI cargado'}
            >
              {elegido ? <Check className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
              {elegido && seleccionados.length > 1 && <span className="text-xs font-bold">{pos + 1}°</span>}
              {c.nombre_completo}
              {!c.dni && <span className="text-[10px] opacity-80">(sin DNI)</span>}
            </button>
          );
        })}
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            disabled={lleno}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo conductor
          </button>
        )}
        {seleccionados.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> {esEmpresa ? 'Sacar todos' : 'Maneja el titular'}
          </button>
        )}
      </div>

      {seleccionados.length === 0 && (
        <p className={cn('text-xs', esEmpresa ? 'font-medium text-amber-700' : 'text-muted-foreground')}>
          {esEmpresa
            ? 'Elegí quién va a manejar: la empresa no maneja, y el contrato sale con el conductor en blanco.'
            : activos.length > 0
              ? 'Sin elegir, maneja el titular.'
              : 'Maneja el titular. Si maneja otra persona, cargala con "Nuevo conductor".'}
        </p>
      )}
      {lleno && <p className="text-xs text-muted-foreground">Hasta {MAX_CONDUCTORES} conductores por reserva.</p>}

      {creando && (
        <NuevoConductorForm
          clienteId={clienteId}
          onCancelar={() => setCreando(false)}
          onCreado={c => {
            setCreando(false);
            if (seleccionados.length < MAX_CONDUCTORES) onChange([...seleccionados, c.id]);
          }}
        />
      )}

      <AvisoConductoresOcupados
        ids={seleccionados}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        excluirReservaId={excluirReservaId}
      />
    </div>
  );
}
