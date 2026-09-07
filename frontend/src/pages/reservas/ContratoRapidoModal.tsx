import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Car, FileSignature, MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { InputMoneda } from '@/components/shared/InputMoneda';
import { ContratoPanel } from '@/components/alquileres/ContratoPanel';
import { useReservas } from '@/hooks/useReservas';
import { useVehiculos } from '@/hooks/useVehiculos';
import { useClientes } from '@/hooks/useClientes';
import { useAdicionales } from '@/hooks/useAdicionales';
import { useConfiguracion } from '@/hooks/useConfiguracion';
import { useCalcularPrecio } from '@/hooks/usePrecios';
import api from '@/lib/api';
import { extractError, formatDocumento, formatMiles, redondear2 } from '@/lib/utils';
import type { ApiResponse, Cliente, ReservaCreate } from '@/types';

interface Props {
  initialVehiculoId?: number;
  initialFecha?: string;
  onClose: () => void;
  /** Se llama cuando ya existe la reserva, para refrescar el calendario. */
  onCreada: () => void;
}

const LUGARES_FALLBACK = ['Paraguay 241', 'Alsina 350', 'Aeropuerto Comandante Espora'];

function hoy() { return new Date().toISOString().split('T')[0]; }
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

/**
 * El camino corto: cargar lo mínimo y salir con el contrato en la mano.
 *
 * **Por qué existe**, con las palabras del dueño:
 *
 * > *"A veces el admin del sistema no tiene tiempo de hacer toda la nueva
 * > reserva. […] Hay veces que les ocurre que hay una reserva rápida, de último
 * > momento, y se tiene que poder generar el contrato lo más rápido posible
 * > para enviárselo, imprimir, o firmar en el mostrador."*
 *
 * **No es un atajo que se saltea el sistema.** Crea la misma `Reserva` que el
 * wizard —así el calendario, el cupo y la cuenta corriente se enteran— y después
 * emite el contrato por el mismo `POST /contratos` de siempre. Lo que se saltea
 * son las preguntas que se pueden contestar después: garantía, factura,
 * condición de pago, conductor adicional, adicionales sueltos. Todo eso se
 * completa editando la reserva, que sigue estando ahí.
 *
 * Lo único que **no** se puede omitir es lo que el contrato necesita para
 * decir algo cierto: quién, qué auto, cuándo, dónde y cuánto.
 *
 * Una vez creada, se muestra el `ContratoPanel` que ya existía — el mismo de la
 * ficha de la reserva, con descargar PDF, copiar link de firma, firmar en
 * pantalla y subir el escaneo. No hay una segunda implementación de contratos.
 */
export function ContratoRapidoModal({ initialVehiculoId, initialFecha, onClose, onCreada }: Props) {
  const { createReserva, loading } = useReservas();
  const { data: vehiculosData } = useVehiculos({ incluir_inactivos: false, page_size: 100 });
  const { data: configItems } = useConfiguracion();
  const { data: catalogoAdicionales = [] } = useAdicionales();

  const [busqueda, setBusqueda] = useState('');
  const { data: clientesData } = useClientes({ q: busqueda || undefined, page_size: 20 });

  const [clienteId, setClienteId] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  // Alta rápida en la misma pantalla: si el cliente no existe, se carga acá.
  const [nuevoDni, setNuevoDni] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');

  const [vehiculoId, setVehiculoId] = useState(initialVehiculoId?.toString() ?? '');
  const [fechaInicio, setFechaInicio] = useState(initialFecha ?? hoy());
  const [horaInicio, setHoraInicio] = useState('10:00');
  const [fechaFin, setFechaFin] = useState(sumarDias(initialFecha ?? hoy(), 1));

  const lugares = useMemo(() => {
    const item = configItems?.find(c => c.clave === 'web.lugares_retiro');
    const valores = (item?.valor ?? '').split(',').map(s => s.trim()).filter(Boolean);
    return valores.length ? valores : LUGARES_FALLBACK;
  }, [configItems]);
  const [lugar, setLugar] = useState('');
  const lugarElegido = lugar || lugares[0] || '';

  const [precioTotal, setPrecioTotal] = useState<number | ''>('');
  const [cobertura, setCobertura] = useState<number | ''>('');
  const [error, setError] = useState('');

  /** La reserva creada. Mientras es `null`, se está cargando el formulario. */
  const [reservaId, setReservaId] = useState<number | null>(null);

  const clienteElegido = clientesData?.data?.find(c => String(c.id) === clienteId);
  const vehiculos = vehiculosData?.data ?? [];
  const coberturas = catalogoAdicionales.filter(a => a.grupo === 'cobertura' && a.activo);

  const duracionDias = useMemo(() => {
    if (!fechaInicio || !fechaFin || fechaFin <= fechaInicio) return 0;
    return Math.round(
      (new Date(`${fechaFin}T12:00:00`).getTime() - new Date(`${fechaInicio}T12:00:00`).getTime())
      / 86400000,
    );
  }, [fechaInicio, fechaFin]);

  // El precio lo sugiere el mismo motor que usa el wizard y el backend al
  // grabar: sin esto, el camino rápido daría precios distintos que el largo.
  const { data: cotizacion } = useCalcularPrecio(
    vehiculoId && duracionDias > 0
      ? {
          fecha_inicio: fechaInicio, fecha_fin: fechaFin,
          vehiculo_id: Number(vehiculoId), categoria_id: null,
          canal: 'mostrador', adicionales: [], fecha_nacimiento: null,
        }
      : null,
  );
  const sugerido = cotizacion ? Number(cotizacion.subtotal_vehiculo ?? cotizacion.total ?? 0) : null;

  async function crear() {
    setError('');
    if (!clienteId && busqueda.trim().length < 3) {
      setError('Elegí un cliente de la lista, o escribí su nombre para darlo de alta.');
      return;
    }
    if (!vehiculoId) { setError('Elegí el auto: el contrato tiene que decir cuál se entrega.'); return; }
    if (duracionDias <= 0) { setError('La devolución tiene que ser posterior al retiro.'); return; }
    if (!precioTotal || Number(precioTotal) <= 0) { setError('Falta el precio.'); return; }

    try {
      let idCliente = clienteId ? Number(clienteId) : 0;
      if (!idCliente) {
        // Alta mínima, igual que la del wizard: alcanza el nombre, y la campana
        // reclama después lo que falte. Acá se aprovecha para pedir DNI y
        // teléfono, que es lo que el contrato quiere y la persona tiene enfrente.
        const { data } = await api.post<ApiResponse<Cliente>>('/clientes', {
          nombre_completo: busqueda.trim(),
          dni_cuit: nuevoDni.trim() || 'A COMPLETAR',
          telefono: nuevoTelefono.trim() || 'A COMPLETAR',
          tipo: 'particular',
          notas: 'Alta rápida desde un contrato de mostrador.',
        });
        idCliente = (data.data as Cliente).id;
      }

      const payload: ReservaCreate = {
        vehiculo_id: Number(vehiculoId),
        cliente_id: idCliente,
        fecha_inicio: fechaInicio,
        hora_inicio: `${horaInicio}:00`,
        fecha_fin: fechaFin,
        hora_fin: `${horaInicio}:00`,
        lugar_entrega: lugarElegido,
        lugar_devolucion: lugarElegido,
        precio_total: Number(precioTotal),
        adicionales: cobertura === '' ? [] : [{ adicional_id: Number(cobertura), cantidad: 1 }],
        // Contado al entregar: es lo que pasa en un contrato de mostrador. Si
        // fuera otra cosa, se corrige editando la reserva.
        condicion_pago: 'contado',
        condicion_pago_ancla: 'checkout',
        estado_pago: 'pendiente',
        notas: 'Contrato rápido desde el mostrador.',
      };

      const { reserva } = await createReserva(payload);
      setReservaId(reserva.id);
      onCreada();
      toast.success('Reserva creada. Generá el contrato acá abajo.');
    } catch (err) {
      setError(extractError(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="px-6 pt-4 pb-3 border-b border-slate-200 bg-slate-50 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" /> Contrato rápido
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lo mínimo para tener el papel listo. El resto se completa después,
              editando la reserva.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {reservaId === null ? (
            <>
              {/* Cliente */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Cliente *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setClienteId(''); setListaAbierta(true); }}
                    onFocus={() => setListaAbierta(true)}
                    placeholder="Buscar por nombre o DNI, o escribir uno nuevo"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {listaAbierta && busqueda && !clienteId && (clientesData?.data?.length ?? 0) > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                      {clientesData!.data.map(c => (
                        <div
                          key={c.id}
                          onClick={() => { setClienteId(String(c.id)); setBusqueda(c.nombre_completo); setListaAbierta(false); }}
                          className="px-3 py-2 text-sm text-slate-700 hover:bg-primary/10 cursor-pointer"
                        >
                          {c.nombre_completo}
                          {c.dni_cuit && <div className="text-xs text-slate-500">DNI/CUIT: {formatDocumento(c.dni_cuit)}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Cliente conocido: se muestran sus datos ya cargados, que es
                    lo que el dueño pidió — *"si ya es un cliente que se
                    auto-llenen con todos los datos"*. */}
                {clienteElegido ? (
                  <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900">
                    Cliente ya cargado: <strong>{clienteElegido.nombre_completo}</strong>
                    {clienteElegido.dni_cuit ? ` · ${formatDocumento(clienteElegido.dni_cuit)}` : ''}
                    {clienteElegido.telefono ? ` · ${clienteElegido.telefono}` : ''}.
                    El contrato se llena solo con sus datos.
                  </p>
                ) : busqueda.trim().length >= 3 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <p className="text-xs text-slate-600">
                      No está en la base. Se da de alta como <strong>{busqueda.trim()}</strong>.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={nuevoDni} onChange={e => setNuevoDni(e.target.value)}
                        onBlur={e => setNuevoDni(formatDocumento(e.target.value))}
                        placeholder="DNI / CUIT"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      <input value={nuevoTelefono} onChange={e => setNuevoTelefono(e.target.value)}
                        placeholder="Teléfono"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Auto */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Car className="w-4 h-4 text-slate-400" /> Auto *
                </label>
                <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Elegí el auto que se entrega</option>
                  {vehiculos.filter(v => v.destino !== 'uber').map(v => (
                    <option key={v.id} value={v.id}>{v.patente} · {v.marca} {v.modelo}</option>
                  ))}
                </select>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" /> Retiro *
                  </label>
                  <div className="flex gap-2">
                    <input type="date" value={fechaInicio}
                      onChange={e => {
                        setFechaInicio(e.target.value);
                        if (e.target.value && fechaFin <= e.target.value) setFechaFin(sumarDias(e.target.value, 1));
                      }}
                      className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                      className="w-24 px-2 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" /> Devolución *
                    {duracionDias > 0 && <span className="text-primary font-normal">({duracionDias} días)</span>}
                  </label>
                  <input type="date" value={fechaFin} min={fechaInicio}
                    onChange={e => setFechaFin(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {/* Lugar */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" /> Retiro y devolución *
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {lugares.map(l => (
                    <button key={l} type="button" onClick={() => setLugar(l)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        lugarElegido === l
                          ? 'bg-primary/15 border-primary/35 text-primary'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-primary/10'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Precio y cobertura */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Precio total *</label>
                  <InputMoneda value={precioTotal} onChange={setPrecioTotal} placeholder="140.000"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  {sugerido !== null && sugerido > 0 && (
                    <button type="button"
                      onClick={() => setPrecioTotal(redondear2(sugerido))}
                      className="text-[11px] text-primary underline">
                      Usar el sugerido: ${formatMiles(sugerido)}
                      {duracionDias > 0 && ` (${formatMiles(sugerido / duracionDias)}/día)`}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Cobertura</label>
                  <select value={cobertura} onChange={e => setCobertura(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">Sólo el seguro obligatorio</option>
                    {coberturas.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {c.porcentaje_sobre_alquiler != null && Number(c.porcentaje_sobre_alquiler) > 0
                          ? ` (+${Number(c.porcentaje_sobre_alquiler)}%)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Reserva <strong>#{reservaId}</strong> creada. Generá el contrato acá abajo:
                se descarga en PDF, se manda por link para firmar, o se firma en pantalla.
              </div>
              {/* El panel que ya existe. Cero lógica de contratos duplicada. */}
              <ContratoPanel reservaId={reservaId} antesDeEntregar />
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
            {reservaId === null ? 'Cancelar' : 'Listo'}
          </button>
          {reservaId === null && (
            <button type="button" onClick={crear} disabled={loading}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm">
              {loading && <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
              Crear y generar contrato
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
