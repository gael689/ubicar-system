/**
 * Los tres diálogos del tablero de Uber: cobrar la semana, cargar el km y
 * renovar. Son chicos y vienen precargados a propósito: el pedido fue *"cobre
 * en dos clics"*, así que lo normal es abrir y confirmar.
 */
import { useState } from 'react';
import axios from 'axios';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { InputMoneda } from '@/components/shared/InputMoneda';
import {
  useCargarKmUber, useCobrarSemanaUber, useRenovarUber, type ContratoUber,
} from '@/hooks/useUber';
import { MEDIOS_COBRO_MANUAL, opcionesDeMedio } from '@/lib/mediosPago';
import { consumoKm, fechaCorta } from '@/lib/uber';
import { extractError, formatMiles, hoyLocal } from '@/lib/utils';
import type { MetodoPago } from '@/types';

const campo = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50';
const etiqueta = 'text-sm font-semibold text-slate-700';

const pesos = (n: number) => `$${formatMiles(n, 0)}`;
const km = (n: number) => formatMiles(Math.round(n), 0);

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Fallo({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {texto}
    </p>
  );
}

interface Props {
  contrato: ContratoUber;
  onClose: () => void;
}

// ─── Cobrar la semana ────────────────────────────────────────────────────────

/**
 * Registra el pago de la semana. **Es un cobro común**: el servidor lo asienta
 * por el mismo camino que uno cargado desde Caja, así que aparece igual en
 * Caja, en Cobros y en la cuenta corriente.
 */
export function CobrarSemanaDialog({ contrato, onClose }: Props) {
  const cuota = contrato.cuota_a_cobrar;
  const [monto, setMonto] = useState<number | ''>(cuota?.monto ?? '');
  const [medio, setMedio] = useState<MetodoPago>('efectivo');
  const [fecha, setFecha] = useState(hoyLocal());
  const [error, setError] = useState('');
  const cobrar = useCobrarSemanaUber();

  // "Todo lo atrasado" es lo que se le puede reclamar hoy: lo vencido más lo
  // que vence hoy. Se ofrece sólo si es más que la cuota que ya viene cargada.
  const hayMasAtrasado = cuota != null && contrato.exigible > cuota.monto;

  function confirmar() {
    setError('');
    if (!monto || Number(monto) <= 0) { setError('Poné cuánto pagó.'); return; }
    if (Number(monto) > contrato.saldo_total) {
      setError(`Le quedan ${pesos(contrato.saldo_total)} por pagar de todo el contrato: no se puede cobrar más que eso.`);
      return;
    }
    cobrar.mutate(
      { alquilerId: contrato.alquiler_id!, monto: Number(monto), medio_pago: medio, fecha },
      {
        onSuccess: () => { toast.success(`Cobro de ${pesos(Number(monto))} registrado a ${contrato.chofer}`); onClose(); },
        onError: e => setError(extractError(e, 'No se pudo registrar el cobro.')),
      },
    );
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar semana {cuota?.numero ?? ''}</DialogTitle>
          <DialogDescription>
            {contrato.chofer} · {contrato.vehiculo} {contrato.patente}
            {cuota?.vencimiento ? ` · vence ${fechaCorta(cuota.vencimiento)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="cobro-monto" className={etiqueta}>Monto</label>
            <InputMoneda id="cobro-monto" value={monto} onChange={setMonto} className={campo} autoFocus />
            <p className="text-xs text-slate-500">
              Si paga una parte, cambiá el monto: la semana queda con el resto pendiente.
            </p>
            {hayMasAtrasado && (
              <button type="button" onClick={() => setMonto(contrato.exigible)}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                Cobrar todo lo atrasado ({pesos(contrato.exigible)})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="cobro-medio" className={etiqueta}>Medio de pago</label>
              <select id="cobro-medio" value={medio} onChange={e => setMedio(e.target.value as MetodoPago)} className={campo}>
                {opcionesDeMedio(MEDIOS_COBRO_MANUAL).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cobro-fecha" className={etiqueta}>Fecha</label>
              <input id="cobro-fecha" type="date" value={fecha} max={hoyLocal()}
                onChange={e => setFecha(e.target.value)} className={campo} />
            </div>
          </div>
          <Fallo texto={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={cobrar.isPending}>
            {cobrar.isPending ? 'Registrando…' : 'Registrar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cargar km ───────────────────────────────────────────────────────────────

/** Anota una lectura del odómetro y muestra cómo viene contra el tope. No cobra nada. */
export function CargarKmDialog({ contrato, onClose }: Props) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [lectura, setLectura] = useState<number | ''>('');
  const [error, setError] = useState('');
  const cargar = useCargarKmUber();
  const datos = contrato.km;
  const kmInicial = datos?.km_inicial ?? 0;

  const consumo = lectura !== '' && Number(lectura) >= kmInicial
    ? consumoKm({
      kmLectura: Number(lectura), kmInicial,
      kmSemana: datos?.km_semana ?? null, precioKmExtra: datos?.precio_km_extra ?? null,
      fechaInicio: contrato.fecha_inicio, fecha, fechaFin: contrato.fecha_fin,
    })
    : null;

  function confirmar() {
    setError('');
    if (lectura === '') { setError('Poné los km que marca el tablero del auto.'); return; }
    if (Number(lectura) < kmInicial) {
      setError(`El auto salió con ${km(kmInicial)} km: la lectura no puede ser menor.`);
      return;
    }
    cargar.mutate(
      { alquilerId: contrato.alquiler_id!, fecha, km: Number(lectura) },
      {
        onSuccess: r => {
          if (r.excedidos > 0) toast.warning(`${contrato.chofer} viene pasado ${km(r.excedidos)} km del tope a la fecha.`);
          else toast.success('Lectura de km registrada');
          onClose();
        },
        onError: e => setError(extractError(e, 'No se pudo registrar la lectura.')),
      },
    );
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar km</DialogTitle>
          <DialogDescription>
            {contrato.chofer} · {contrato.vehiculo} {contrato.patente} · salió con {km(kmInicial)} km
            {datos?.ultimo_km ? ` · última lectura ${km(datos.ultimo_km)} km (${fechaCorta(datos.ultima_fecha)})` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="km-lectura" className={etiqueta}>Km del odómetro</label>
              <input id="km-lectura" type="number" min={kmInicial} value={lectura} autoFocus
                onChange={e => setLectura(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={String(datos?.ultimo_km ?? kmInicial)} className={campo} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="km-fecha" className={etiqueta}>Fecha</label>
              <input id="km-fecha" type="date" value={fecha} max={hoyLocal()}
                onChange={e => setFecha(e.target.value)} className={campo} />
            </div>
          </div>

          {consumo && consumo.permitidos === null && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              Lleva {km(consumo.recorridos)} km. Este contrato no tiene tope de km cargado.
            </p>
          )}
          {consumo && consumo.permitidos !== null && consumo.excedidos > 0 && (
            <p data-testid="consumo-km" className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
              Lleva <strong>{km(consumo.recorridos)}</strong> de {km(consumo.permitidos)} km permitidos a esa
              fecha: se está pasando ~{km(consumo.excedidos)} km
              {consumo.costoEstimado > 0 ? <> ≈ <strong>{pesos(consumo.costoEstimado)}</strong> al cierre</> : null}.
            </p>
          )}
          {consumo && consumo.permitidos !== null && consumo.excedidos === 0 && (
            <p data-testid="consumo-km" className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success">
              Lleva <strong>{km(consumo.recorridos)}</strong> de {km(consumo.permitidos)} km permitidos a esa
              fecha: viene bien.
            </p>
          )}
          <p className="text-xs text-slate-500">
            No se cobra nada ahora: los km de más se cobran al devolver el auto, contra todo el contrato.
          </p>
          <Fallo texto={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={cargar.isPending}>
            {cargar.isPending ? 'Guardando…' : 'Guardar lectura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Renovar ─────────────────────────────────────────────────────────────────

const SEMANAS_RAPIDAS = [1, 2, 4, 8];

/** Agrega semanas al contrato, al mismo valor (editable), con una cuota por cada una. */
export function RenovarDialog({ contrato, onClose }: Props) {
  const [semanas, setSemanas] = useState<number | ''>(4);
  const [valor, setValor] = useState<number | ''>(contrato.valor_semana || '');
  const [error, setError] = useState('');
  // El servidor avisó que la renovación pisa otra reserva del auto: se ofrece
  // renovar igual, que es lo que hace el sistema interno en todo lo demás.
  const [pisaOtra, setPisaOtra] = useState(false);
  const renovar = useRenovarUber();

  const n = Number(semanas) || 0;
  const nuevoFin = n > 0 ? sumarDias(contrato.fecha_fin, n * 7) : null;

  function confirmar(permitirSolape = false) {
    setError('');
    if (n < 1 || n > 52) { setError('Se puede renovar entre 1 y 52 semanas.'); return; }
    if (!valor || Number(valor) <= 0) { setError('Falta el valor de la semana.'); return; }
    renovar.mutate(
      { alquilerId: contrato.alquiler_id!, semanas: n, valor_semana: Number(valor), permitir_solape: permitirSolape },
      {
        onSuccess: () => {
          toast.success(`Contrato de ${contrato.chofer} renovado ${n} ${n === 1 ? 'semana' : 'semanas'}`);
          onClose();
        },
        onError: e => {
          setPisaOtra(axios.isAxiosError(e) && e.response?.status === 409);
          setError(extractError(e, 'No se pudo renovar el contrato.'));
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renovar semanas</DialogTitle>
          <DialogDescription>
            {contrato.chofer} · {contrato.vehiculo} {contrato.patente} · hoy termina el {fechaCorta(contrato.fecha_fin)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="renovar-semanas" className={etiqueta}>Semanas que se agregan</label>
            <div className="flex flex-wrap items-center gap-2">
              {SEMANAS_RAPIDAS.map(s => (
                <button key={s} type="button" onClick={() => { setSemanas(s); setPisaOtra(false); }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    semanas === s ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-primary/10'
                  }`}>
                  {s}
                </button>
              ))}
              <input id="renovar-semanas" type="number" min={1} max={52} value={semanas}
                onChange={e => { setSemanas(e.target.value === '' ? '' : Number(e.target.value)); setPisaOtra(false); }}
                className={`${campo} w-24`} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="renovar-valor" className={etiqueta}>Valor de la semana</label>
            <InputMoneda id="renovar-valor" value={valor} onChange={setValor} className={campo} />
          </div>

          {nuevoFin && Number(valor) > 0 && (
            <p data-testid="resumen-renovacion" className="rounded-lg bg-muted px-3 py-2 text-sm">
              Termina el <strong>{fechaCorta(nuevoFin)}</strong>. Se {n === 1 ? 'agrega 1 cuota' : `agregan ${n} cuotas`} de{' '}
              <strong>{pesos(Number(valor))}</strong>, una por semana ({pesos(Number(valor) * n)} en total).
            </p>
          )}
          <Fallo texto={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {pisaOtra ? (
            <Button onClick={() => confirmar(true)} disabled={renovar.isPending}>Renovar igual</Button>
          ) : (
            <Button onClick={() => confirmar()} disabled={renovar.isPending}>
              {renovar.isPending ? 'Renovando…' : 'Renovar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
