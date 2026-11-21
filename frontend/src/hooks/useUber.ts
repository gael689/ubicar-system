/**
 * El tablero de Uber: los contratos vigentes con su semana, y lo que se hace
 * sobre ellos sin salir de la pantalla (cobrar, cargar km, renovar).
 *
 * Los tipos son el espejo de lo que arma `services/uber_service.py`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ModalidadUber } from '@/lib/uber';
import type { MetodoPago } from '@/types';

export type EstadoUber = 'al_dia' | 'vence_hoy' | 'atrasado' | 'a_entregar';

export interface CuotaUber {
  numero: number;
  vencimiento: string | null;
  monto: number;
  pagado: number;
  saldo: number;
  estado: 'paga' | 'parcial' | 'pendiente' | 'vence_hoy' | 'vencida';
  fecha_pago: string | null;
  medio_pago: string | null;
}

export interface ConsumoKm {
  recorridos: number;
  permitidos: number | null;
  excedidos: number;
  porcentaje: number | null;
  costo_estimado: number;
}

export interface LecturaKm extends ConsumoKm {
  id: number;
  fecha: string;
  km: number;
}

export interface ContratoUber {
  /** `reserva`: confirmada pero el auto todavía no se entregó (no tiene alquiler). */
  tipo_fila: 'contrato' | 'reserva';
  alquiler_id: number | null;
  reserva_id: number;
  cliente_id: number;
  chofer: string;
  telefono: string | null;
  vehiculo_id: number | null;
  patente: string | null;
  vehiculo: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias_para_terminar: number;
  semana: { numero: number; total: number; desde: string; hasta: string };
  valor_semana: number;
  modalidad: ModalidadUber;
  nota_condicion: string | null;
  estado: EstadoUber;
  dias_atraso: number;
  semanas_adeudadas: number;
  /** Lo vencido impago (de días anteriores). */
  adeudado: number;
  /** Lo que se le puede reclamar hoy: lo vencido más lo que vence hoy. */
  exigible: number;
  proxima_fecha: string | null;
  proximo_monto: number;
  saldo_total: number;
  cuota_a_cobrar: { numero: number; monto: number; vencimiento: string | null } | null;
  km: {
    km_semana: number | null;
    precio_km_extra: number | null;
    km_inicial: number;
    permitidos_hoy: number | null;
    ultima_fecha: string | null;
    ultimo_km: number | null;
    consumo: ConsumoKm | null;
  } | null;
  cuotas: CuotaUber[];
  lecturas: LecturaKm[];
}

export interface AutoLibreUber {
  vehiculo_id: number;
  patente: string;
  vehiculo: string;
  estado: string;
}

export interface TableroUber {
  hoy: string;
  resumen: {
    activos: number;
    al_dia: number;
    vence_hoy: number;
    atrasados: number;
    adeudado: number;
    a_cobrar_semana: number;
    a_entregar: number;
  };
  contratos: ContratoUber[];
  libres: AutoLibreUber[];
  pie: {
    ingreso_semanal: number;
    vencio_mes: number;
    cobrado_mes: number;
    cobranza_mes_pct: number | null;
    autos_ocupados: number;
    autos_libres: number;
  };
}

const KEY = 'uber';

export function useTableroUber() {
  return useQuery({
    queryKey: [KEY, 'tablero'],
    queryFn: async () => (await api.get<{ data: TableroUber }>('/uber/tablero')).data.data,
    // Es una foto del día: se refresca sola cada tanto por si otro cobró.
    refetchInterval: 120_000,
  });
}

/** Todo lo que un cobro o una renovación dejan viejo en otras pantallas. */
function useRefrescar() {
  const qc = useQueryClient();
  return () => {
    for (const k of [KEY, 'pagos', 'caja', 'reportes', 'cuentas-corrientes', 'reservas', 'ocupacion', 'notificaciones']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };
}

export interface CobroSemana {
  alquilerId: number;
  monto: number;
  medio_pago: MetodoPago;
  fecha: string;
  notas?: string | null;
}

export function useCobrarSemanaUber() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async ({ alquilerId, ...body }: CobroSemana) => (
      await api.post<{ data: { pago_id: number; contrato: ContratoUber } }>(
        `/uber/contratos/${alquilerId}/cobrar-semana`, body,
      )
    ).data.data,
    onSuccess: refrescar,
  });
}

export function useCargarKmUber() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async ({ alquilerId, ...body }: { alquilerId: number; fecha: string; km: number }) => (
      await api.post<{ data: LecturaKm }>(`/uber/contratos/${alquilerId}/lecturas-km`, body)
    ).data.data,
    onSuccess: refrescar,
  });
}

export function useRenovarUber() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async ({ alquilerId, ...body }: {
      alquilerId: number; semanas: number; valor_semana?: number | null; permitir_solape?: boolean;
    }) => (
      await api.post<{ data: { contrato: ContratoUber; warnings: unknown[] } }>(
        `/uber/contratos/${alquilerId}/renovar`, body,
      )
    ).data.data,
    onSuccess: refrescar,
  });
}
