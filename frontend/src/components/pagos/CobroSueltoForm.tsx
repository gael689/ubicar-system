import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useClientes } from '@/hooks/useClientes';
import { useCobrablesDeCliente, useCrearPago } from '@/hooks/usePagos';
import { useRegistrarCobro } from '@/hooks/useResolverReserva';
import { MEDIOS_COBRO_MANUAL, opcionesDeMedio } from '@/lib/mediosPago';
import { extractError, formatCurrency, formatDate, hoyLocal, irAlError } from '@/lib/utils';
import type { Cliente, MetodoPago, PagoPendiente } from '@/types';

const MEDIOS = opcionesDeMedio(MEDIOS_COBRO_MANUAL);

/** A cuenta: plata del cliente que no se imputa a ningún alquiler ni reserva. */
const A_CUENTA = 'a_cuenta';

interface Props {
  /** La fecha de la caja que se está mirando: el cobro nace ahí. */
  fecha: string;
  onListo: () => void;
}

/**
 * Registrar un cobro desde la caja.
 *
 * Antes pedía **tipear el número de alquiler**, un dato que nadie sabe de
 * memoria y que invitaba a cobrarle al alquiler equivocado. Ahora se busca el
 * cliente y se elige entre lo que tiene abierto —sus alquileres con el auto
 * afuera y sus reservas sin retirar—, cada uno con lo que falta cobrar.
 *
 * Cada opción va por el camino que corresponde:
 * - alquiler → `POST /pagos` con el alquiler;
 * - reserva → `registrar-cobro` (la seña: `Pago` + crédito de anticipo);
 * - a cuenta → `POST /pagos` sólo con el cliente.
 *
 * Sin echeq ni cuenta corriente entre los medios: ver `MEDIOS_COBRO_MANUAL`.
 */
export function CobroSueltoForm({ fecha, onListo }: Props) {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState<MetodoPago>('efectivo');
  const [fechaCobro, setFechaCobro] = useState(fecha);
  const [notas, setNotas] = useState('');
  const [conFactura, setConFactura] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = busqueda.trim();
  const { data: clientes, isFetching: buscando } = useClientes(
    { q: q.length >= 2 ? q : undefined, page_size: 8 },
  );
  const { data: cobrables, isLoading: cargandoCobrables } = useCobrablesDeCliente(cliente?.id ?? null);
  const crearPago = useCrearPago();
  const registrarCobro = useRegistrarCobro();
  const guardando = crearPago.isPending || registrarCobro.isPending;

  useEffect(() => setFechaCobro(fecha), [fecha]);

  const claveDe = (c: PagoPendiente) => `${c.tipo}-${c.id_origen}`;
  const elegido = cobrables?.find(c => claveDe(c) === destino) ?? null;

  function elegirCliente(c: Cliente) {
    setCliente(c);
    setBusqueda('');
    setDestino(null);
    setMonto('');
    setError(null);
  }

  function elegirDestino(clave: string, saldo?: number) {
    setDestino(clave);
    if (saldo != null) setMonto(String(saldo));
    setError(null);
  }

  function fallar(mensaje: string, campo: string) {
    setError(mensaje);
    // Después del render, para que el banner ya exista cuando se busca el campo.
    setTimeout(() => irAlError(campo), 0);
  }

  async function guardar() {
    if (!cliente) return fallar('Buscá y elegí el cliente que paga.', 'cliente');
    if (!destino) return fallar('Elegí qué está pagando.', 'destino');
    const valor = parseFloat(monto);
    if (!valor || valor <= 0) return fallar('Poné un monto mayor a cero.', 'monto');
    if (!fechaCobro) return fallar('Poné la fecha del cobro.', 'fecha');
    setError(null);

    try {
      if (elegido?.tipo === 'reserva') {
        // Seña de una reserva que todavía no salió. No la confirma: eso lo
        // decide quien le asigna el auto.
        await registrarCobro.mutateAsync({
          id: elegido.id_origen,
          monto: valor,
          medio_pago: medio,
          fecha: fechaCobro,
          referencia: notas.trim() || undefined,
          confirmar: false,
        });
        qc.invalidateQueries({ queryKey: ['caja'] });
        qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
      } else {
        await crearPago.mutateAsync({
          alquiler_id: elegido?.tipo === 'alquiler_checkout' ? elegido.id_origen : null,
          cliente_id: cliente.id,
          monto: valor,
          medio_pago: medio,
          fecha: fechaCobro,
          con_factura: conFactura,
          notas: notas.trim() || null,
        });
      }
      toast.success('Cobro registrado');
      onListo();
    } catch (e) {
      setError(extractError(e));
    }
  }

  const input = 'w-full mt-0.5 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-background';

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Registrar un cobro</p>

      {error && (
        <div data-error-banner className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* 1. Quién paga */}
      <div data-campo="cliente">
        <label className="text-xs text-muted-foreground">Cliente</label>
        {cliente ? (
          <div className="mt-0.5 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-sm">
            <span className="font-medium">{cliente.nombre_completo}</span>
            <button
              type="button"
              onClick={() => { setCliente(null); setDestino(null); }}
              className="text-muted-foreground hover:text-foreground"
              title="Elegir otro cliente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Nombre, DNI o CUIT"
                className={`${input} pl-8`}
                autoFocus
              />
            </div>
            {q.length >= 2 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border">
                {clientes?.data?.length ? (
                  clientes.data.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => elegirCliente(c)}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span>{c.nombre_completo}</span>
                      <span className="text-xs text-muted-foreground">{c.dni_cuit}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    {buscando ? 'Buscando…' : 'No hay clientes con ese nombre o documento.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. Qué paga */}
      {cliente && (
        <div data-campo="destino" className="space-y-1">
          <label className="text-xs text-muted-foreground">Qué está pagando</label>
          {cargandoCobrables ? (
            <p className="text-xs text-muted-foreground">Buscando lo que tiene abierto…</p>
          ) : (
            <div className="space-y-1">
              {cobrables?.map(c => (
                <label
                  key={claveDe(c)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                    destino === claveDe(c) ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="destino"
                    checked={destino === claveDe(c)}
                    onChange={() => elegirDestino(claveDe(c), c.saldo_pendiente)}
                  />
                  <span className="flex-1">
                    {c.tipo === 'reserva'
                      ? `Seña de la reserva #${c.id_origen}`
                      : `Alquiler #${c.id_origen} (auto afuera)`}
                    {c.fecha_referencia && (
                      <span className="text-xs text-muted-foreground">
                        {' '}· {c.tipo === 'reserva' ? 'retira' : 'salió'} el {formatDate(c.fecha_referencia)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    falta {formatCurrency(c.saldo_pendiente)}
                  </span>
                </label>
              ))}
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                  destino === A_CUENTA ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="destino"
                  checked={destino === A_CUENTA}
                  onChange={() => elegirDestino(A_CUENTA)}
                />
                <span className="flex-1">A cuenta del cliente (deuda anterior u otro concepto)</span>
              </label>
              {!cobrables?.length && (
                <p className="text-xs text-muted-foreground">
                  No tiene alquileres abiertos ni reservas sin retirar.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Cuánto y cómo */}
      {cliente && destino && (
        <div className="grid grid-cols-2 gap-3">
          <div data-campo="monto">
            <label className="text-xs text-muted-foreground">Monto</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={monto}
              onChange={e => setMonto(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cómo pagó</label>
            <select value={medio} onChange={e => setMedio(e.target.value as MetodoPago)} className={input}>
              {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div data-campo="fecha">
            <label className="text-xs text-muted-foreground">Fecha</label>
            <input
              type="date"
              value={fechaCobro}
              max={hoyLocal()}
              onChange={e => setFechaCobro(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              {elegido?.tipo === 'reserva' ? 'N° de operación (opcional)' : 'Notas (opcional)'}
            </label>
            <input value={notas} onChange={e => setNotas(e.target.value)} className={input} />
          </div>
          {elegido?.tipo !== 'reserva' && (
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="cobro-factura"
                checked={conFactura}
                onChange={e => setConFactura(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="cobro-factura" className="text-sm text-muted-foreground">Con factura</label>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onListo}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Registrar cobro'}
        </button>
      </div>
    </div>
  );
}
