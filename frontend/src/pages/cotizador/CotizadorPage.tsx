import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { FileDown, RefreshCw, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CotizacionPreview3 } from '@/components/cotizador/CotizacionPreview3';
import { SelectorCliente } from '@/components/cotizador/SelectorCliente';
import { exportCotizacionPDF } from '@/lib/pdfExport';
import type { CotizacionData, CategoriaVehiculo, ModalidadItem, ModoCotizacion, ItemCotizacion, UnidadNombre } from '@/types/cotizacion';
import { UNIDADES_CAMIONETA, UNIDADES_VEHICULO, UNIDADES_UTILITARIO } from '@/types/cotizacion';
import { fmtPesos } from '@/components/cotizador/cotizacionUtils';

const UNIDADES_TODAS: UnidadNombre[] = [
  ...UNIDADES_CAMIONETA, ...UNIDADES_VEHICULO, ...UNIDADES_UTILITARIO,
];
function categoriaDeUnidad(unidad: UnidadNombre): CategoriaVehiculo {
  if ((UNIDADES_CAMIONETA as readonly string[]).includes(unidad)) return 'camioneta';
  if ((UNIDADES_UTILITARIO as readonly string[]).includes(unidad)) return 'furgon';
  return 'sedan';
}

// ─── Estado de formulario por ítem ────────────────────────────────────────────
interface FormItem {
  id: string;
  categoria: CategoriaVehiculo;
  unidad: string;        // solo relevante en modo "unidad"
  modalidad: ModalidadItem;
  dias: string;         // "30" para mensual por defecto
  precio: string;       // mensual=precio/mes, dias=precio/día, libre=total
  fecha_desde: string;  // opcional
  fecha_hasta: string;  // opcional
}

let _itemCounter = 0;
function makeFormItem(modo: ModoCotizacion): FormItem {
  return {
    id: `item-${++_itemCounter}`,
    categoria: modo === 'unidad' ? categoriaDeUnidad(UNIDADES_TODAS[0]) : 'sedan',
    unidad: modo === 'unidad' ? UNIDADES_TODAS[0] : '',
    modalidad: 'mensual',
    dias: '30',
    precio: '',
    fecha_desde: '',
    fecha_hasta: '',
  };
}

function formItemToData(f: FormItem): ItemCotizacion {
  const prec = parseFloat(f.precio) || 0;
  const ds   = parseInt(f.dias)    || 0;
  const dates = {
    fecha_desde: f.fecha_desde || undefined,
    fecha_hasta: f.fecha_hasta || undefined,
  };
  const unidad = f.unidad ? (f.unidad as UnidadNombre) : undefined;
  const categoria = unidad ? categoriaDeUnidad(unidad) : f.categoria;
  if (f.modalidad === 'mensual') {
    const meses = ds > 0 ? ds / 30 : 1;
    return { id: f.id, categoria, unidad, modalidad: 'mensual', dias: ds > 0 ? ds : 30, precio_total: prec * meses, ...dates };
  }
  if (f.modalidad === 'dias') {
    return { id: f.id, categoria, unidad, modalidad: 'dias', dias: ds, precio_total: prec * ds, ...dates };
  }
  return { id: f.id, categoria, unidad, modalidad: 'libre', dias: 0, precio_total: prec, ...dates };
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────────
function today(): string { return new Date().toISOString().split('T')[0]; }
function plusDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
/**
 * El número de cotización: cinco dígitos, correlativo.
 *
 * Antes era `COT-202608-473`, con las últimas tres cifras **al azar**: largo de
 * dictar por teléfono y, peor, capaz de repetirse. Ahora es `00001`, `00002`…
 *
 * El contador vive en `localStorage`, o sea **en la máquina de quien cotiza**.
 * Alcanza porque el cotizador es una herramienta de escritorio de una persona,
 * pero tiene dos límites que conviene conocer: si cotizan desde dos máquinas
 * los números se pisan, y si alguien limpia los datos del navegador vuelve a
 * empezar de cero. El campo es editable justamente para poder corregirlo a
 * mano cuando pase. El día que haga falta de verdad, esto se resuelve
 * moviendo el contador al backend.
 */
const CLAVE_CONTADOR = 'ubicar.cotizador.ultimoNumero';

function generateNumero(): string {
  let ultimo = 0;
  try {
    ultimo = parseInt(localStorage.getItem(CLAVE_CONTADOR) || '0', 10) || 0;
  } catch {
    // Navegador con el almacenamiento bloqueado: se arranca de cero y el
    // usuario corrige a mano. No es motivo para romper la pantalla.
  }
  const siguiente = ultimo + 1;
  try {
    localStorage.setItem(CLAVE_CONTADOR, String(siguiente));
  } catch { /* idem */ }
  return String(siguiente).padStart(5, '0');
}

// ─── Subtotal inline en el formulario ─────────────────────────────────────────
function calcSubtotalLabel(f: FormItem): string | null {
  const prec = parseFloat(f.precio) || 0;
  const ds   = parseInt(f.dias)    || 0;
  if (!prec) return null;
  if (f.modalidad === 'mensual') {
    const meses = ds > 0 ? ds / 30 : 1;
    const total = prec * meses;
    const perDia = ds > 0 ? total / ds : prec / 30;
    return `Total: $ ${fmtPesos(total)}  ·  $ ${fmtPesos(perDia)}/día`;
  }
  if (f.modalidad === 'dias' && ds > 0) {
    return `Total: $ ${fmtPesos(prec * ds)}  ·  $ ${fmtPesos(prec)}/día`;
  }
  if (f.modalidad === 'libre') {
    return `Total: $ ${fmtPesos(prec)}`;
  }
  return null;
}

// ─── Sub-componentes UI ───────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-primary uppercase tracking-widest pb-1 border-b border-border mb-3">
      {children}
    </h3>
  );
}
function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div className={half ? '' : 'col-span-2'}>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function CotizadorPage() {
  const [numero,       setNumero]      = useState(generateNumero);
  const [fecha,        setFecha]       = useState(today);
  const [validezHasta, setValidezHasta]= useState(() => plusDays(7));
  const [agente,       setAgente]      = useState('Martín González');
  const [empresa,      setEmpresa]     = useState('');
  const [contacto,     setContacto]    = useState('');
  const [email,        setEmail]       = useState('');
  const [notas,        setNotas]       = useState('');
  // Id del cliente al que queda asociada la cotizacion. `null` = suelta.
  const [clienteId,    setClienteId]   = useState<number | null>(null);
  const [modo,         setModo]        = useState<ModoCotizacion>('categoria');
  const [formItems,    setFormItems]   = useState<FormItem[]>(() => [makeFormItem('categoria')]);
  const [exporting,    setExporting]   = useState(false);
  // Arranca en true: sumar es lo que se espera de un presupuesto. Se apaga
  // cuando la cotización es un abanico de opciones y no una flota.
  const [mostrarTotal, setMostrarTotal] = useState(true);

  // Derivar CotizacionData para el preview en tiempo real
  const data: CotizacionData = useMemo(() => ({
    numero, fecha, validez_hasta: validezHasta, agente,
    empresa, contacto, email, notas,
    items: formItems.map(formItemToData),
    mostrar_total: mostrarTotal,
  }), [numero, fecha, validezHasta, agente, empresa, contacto, email, notas, formItems, mostrarTotal]);

  // ── Manejo de ítems ──────────────────────────────────────────────────────
  const addItem = useCallback(() => setFormItems(prev => [...prev, makeFormItem(modo)]), [modo]);

  const removeItem = useCallback((idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /**
   * Cambiar entre "por categoría" y "por unidad" **ya no borra lo cargado**.
   *
   * Antes reemplazaba la lista entera por un ítem vacío: quien tenía tres
   * vehículos cotizados y quería agregar uno por unidad, perdía los tres y
   * tenía que rehacerlos. Ahora el modo sólo decide **de qué tipo nace el
   * próximo ítem** — cada uno guarda el suyo, así que una misma cotización
   * puede combinar los dos.
   */
  const changeModo = useCallback((m: ModoCotizacion) => setModo(m), []);

  const updateItem = useCallback((idx: number, key: keyof FormItem, value: string) => {
    setFormItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [key]: value };
      if (key === 'modalidad') {
        if (value === 'mensual') updated.dias = '30';
        if (value === 'dias')   updated.dias = '';
        if (value === 'libre')  updated.dias = '0';
      }
      return updated;
    }));
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setNumero(generateNumero());
    setFecha(today());
    setValidezHasta(plusDays(7));
    setEmpresa(''); setContacto(''); setEmail(''); setNotas('');
    setClienteId(null);
    setFormItems([makeFormItem(modo)]);
    toast.info('Formulario reiniciado');
  };

  // ── Exportar ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!empresa.trim()) {
      toast.error('Completá el nombre de la empresa antes de exportar');
      return;
    }
    if (data.items.every(it => !it.precio_total)) {
      toast.error('Completá el precio en al menos un ítem');
      return;
    }
    setExporting(true);
    try {
      const empresaSlug = empresa
        .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita tildes
        .replace(/[^a-zA-Z0-9\s]/g, '')                    // quita puntos, comas, etc.
        .trim().replace(/\s+/g, '-');
      const filename = `Cotizacion-${empresaSlug}-${numero}.pdf`;
      const result = await exportCotizacionPDF('cotizacion-preview', filename);
      if (result === 'shared') toast.success('PDF listo para compartir');
      else if (result === 'downloaded') toast.success('PDF descargado correctamente');
    } catch {
      toast.error('Error al generar el PDF. Intentá de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full gap-0 overflow-hidden">

      {/* ── FORMULARIO ────────────────────────────────────────────────────── */}
      <div className="w-[420px] shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Nueva cotización</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Completá los datos y descargá el PDF</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleReset} title="Reiniciar formulario">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Campos */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* ── Datos de la cotización ──────────────────────────────── */}
          <section>
            <SectionTitle>Datos de la cotización</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número" half>
                <Input value={numero} onChange={e => setNumero(e.target.value)} className="h-8 text-sm" />
              </Field>
              <Field label="Agente" half>
                <Input value={agente} onChange={e => setAgente(e.target.value)} className="h-8 text-sm" />
              </Field>
              <Field label="Fecha de emisión" half>
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-8 text-sm" />
              </Field>
              <Field label="Válida hasta" half>
                <Input type="date" value={validezHasta} onChange={e => setValidezHasta(e.target.value)} className="h-8 text-sm" />
              </Field>
            </div>
          </section>

          {/* ── Empresa cliente ─────────────────────────────────────── */}
          <section>
            <SectionTitle>Empresa cliente</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <SelectorCliente
                valor={{ id: clienteId, empresa, contacto, email }}
                onCambiar={v => {
                  setClienteId(v.id);
                  setEmpresa(v.empresa);
                  setContacto(v.contacto);
                  setEmail(v.email);
                }}
              />
              <Field label="Razón social *">
                <Input
                  placeholder="Gulf Agency Company S.A."
                  value={empresa}
                  onChange={e => { setEmpresa(e.target.value); setClienteId(null); }}
                  className="h-8 text-sm"
                />
              </Field>
              <Field label="Contacto" half>
                <Input placeholder="Nombre del interlocutor" value={contacto} onChange={e => setContacto(e.target.value)} className="h-8 text-sm" />
              </Field>
              <Field label="Email" half>
                <Input type="email" placeholder="contacto@empresa.com" value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-sm" />
              </Field>
            </div>
          </section>

          {/* ── Ítems a cotizar ─────────────────────────────────────── */}
          <section>
            <SectionTitle>Vehículos a cotizar</SectionTitle>

            {/* Toggle de modo */}
            <div className="flex gap-1 mb-3">
              {([
                { value: 'categoria' as ModoCotizacion, label: 'Por categoría' },
                { value: 'unidad' as ModoCotizacion, label: 'Por unidad' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => changeModo(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded font-semibold transition-colors border flex-1 ${
                    modo === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {formItems.map((item, idx) => (
                <div key={item.id} className="border border-border rounded-lg p-3 bg-background">

                  {/* Fila 1: Categoría/Unidad + Modalidad */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      {/* **El tipo lo define el ítem, no el modo global.** Antes
                          cambiar el selector de arriba redibujaba TODOS los ítems
                          como si fueran del tipo nuevo, y por eso habia que
                          borrarlos. Un item con `unidad` cargada es "por unidad";
                          el resto, por categoria. Asi conviven los dos en la misma
                          cotizacion. */}
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        {item.unidad ? 'Unidad' : 'Categoría'}
                      </Label>
                      {item.unidad ? (
                        <Select
                          value={item.unidad}
                          onValueChange={v => updateItem(idx, 'unidad', v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNIDADES_CAMIONETA.map(u => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                            {UNIDADES_VEHICULO.map(u => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                            {UNIDADES_UTILITARIO.map(u => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={item.categoria}
                          onValueChange={v => updateItem(idx, 'categoria', v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="compacto">Compacto</SelectItem>
                            <SelectItem value="sedan">Sedán</SelectItem>
                            <SelectItem value="sedan_sup">Sedán Superior</SelectItem>
                            <SelectItem value="suv">SUV</SelectItem>
                            <SelectItem value="camioneta">Pick up</SelectItem>
                            <SelectItem value="furgon">Furgón</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Modalidad</Label>
                      <div className="flex gap-1">
                        {(['mensual', 'dias', 'libre'] as ModalidadItem[]).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateItem(idx, 'modalidad', m)}
                            className={`text-xs px-2 py-1 rounded font-semibold transition-colors border flex-1 ${
                              item.modalidad === m
                                ? 'bg-primary text-white border-primary'
                                : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'
                            }`}
                          >
                            {m === 'mensual' ? 'Mensual' : m === 'dias' ? 'x días' : 'Libre'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Fila 2: Días + Precio + Eliminar */}
                  <div className="flex gap-2 items-end">
                    {item.modalidad !== 'libre' && (
                      <div className="w-[72px] shrink-0">
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          {item.modalidad === 'mensual' ? 'Días' : 'Cant. días'}
                        </Label>
                        <Input
                          type="number"
                          value={item.dias}
                          onChange={e => updateItem(idx, 'dias', e.target.value)}
                          className="h-8 text-sm"
                          min={1}
                          placeholder={item.modalidad === 'mensual' ? '30' : ''}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        {item.modalidad === 'mensual' ? 'Precio mensual ($)' :
                         item.modalidad === 'dias'    ? 'Precio por día ($)' :
                                                        'Inversión total ($)'}
                      </Label>
                      <Input
                        type="number"
                        value={item.precio}
                        onChange={e => updateItem(idx, 'precio', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="0"
                        min={0}
                      />
                    </div>
                    {formItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="h-8 w-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-destructive border border-border rounded hover:border-destructive transition-colors"
                        title="Eliminar ítem"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Fechas opcionales */}
                  {item.modalidad !== 'libre' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Desde (opcional)</Label>
                        <Input
                          type="date"
                          value={item.fecha_desde}
                          onChange={e => updateItem(idx, 'fecha_desde', e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Hasta</Label>
                        <Input
                          type="date"
                          value={item.fecha_hasta}
                          onChange={e => updateItem(idx, 'fecha_hasta', e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Subtotal calculado */}
                  {calcSubtotalLabel(item) && (
                    <p className="text-xs text-muted-foreground mt-2 font-medium">
                      {calcSubtotalLabel(item)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-3 w-full text-sm text-primary border border-dashed border-primary/40 hover:border-primary rounded-lg py-2 px-3 font-medium transition-colors hover:bg-primary/5 flex items-center justify-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar vehículo
            </button>

            {/* Sumar o no sumar. Sólo tiene sentido con más de un vehículo:
                con uno solo, el total y el ítem son el mismo número. */}
            {formItems.length > 1 && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <input
                  type="checkbox"
                  checked={mostrarTotal}
                  onChange={e => setMostrarTotal(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                />
                <span className="text-xs leading-relaxed">
                  <span className="font-medium text-foreground">
                    Sumar todos los vehículos en un total
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Dejalo tildado si el cliente se lleva todos (una flota).
                    Destildalo si son <strong>opciones para que elija una</strong>:
                    ahí el total sería una suma que nadie va a pagar.
                  </span>
                </span>
              </label>
            )}
          </section>

          {/* ── Nota ────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Nota</SectionTitle>
            <Field label="Nota visible en la propuesta (aparece destacada)">
              <Textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={3}
                className="text-sm resize-none"
                placeholder="Ej: precio incluye IVA, disponibilidad sujeta a confirmación..."
              />
            </Field>
            <p className="text-xs text-muted-foreground mt-2">
              El contenido comercial se genera automáticamente.
            </p>
          </section>
        </div>

        {/* Botón exportar */}
        <div className="p-4 border-t border-border shrink-0">
          <Button className="w-full gap-2" onClick={handleExport} disabled={exporting} size="lg">
            <FileDown className="h-4 w-4" />
            {exporting ? 'Generando PDF...' : 'Descargar PDF'}
          </Button>
        </div>
      </div>

      {/* ── PREVIEW ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-gray-100 overflow-auto flex flex-col">
        <div className="px-4 py-2 bg-white border-b border-border flex items-center gap-3 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">Modelo:</span>
          <span className="text-xs px-3 py-1 rounded font-semibold bg-primary text-white border border-primary">
            Bloques Modernos
          </span>
          <span className="text-xs px-3 py-1 rounded font-semibold bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed" title="En revisión">
            Blanco Premium (en revisión)
          </span>
          {/* Descarga rápida, al lado del número. El botón grande vive al pie
              de la columna izquierda, que en pantallas chicas queda fuera de
              vista justo cuando terminaste de revisar el preview: había que
              scrollear el formulario para bajar el PDF que estabas mirando. */}
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            N° {numero}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7"
            onClick={handleExport}
            disabled={exporting}
            title="Descargar el PDF de esta cotización"
          >
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? 'Generando…' : 'Descargar'}
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto" style={{ width: 794 }}>
            <div className="shadow-xl rounded overflow-hidden">
              <CotizacionPreview3 data={data} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
