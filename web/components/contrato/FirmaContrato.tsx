"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { api, ApiError, pesos } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ContratoParaFirmar } from "@/lib/types";
import { LienzoFirma } from "./LienzoFirma";

/**
 * La pantalla que abre el cliente cuando le llega el link del contrato.
 *
 * **El orden importa y no es casual**: primero lee de qué se trata (el
 * resumen), después el contrato completo, después declara que lo leyó, y
 * recién al final firma. Poner el recuadro de firma arriba invitaría a firmar
 * sin leer, que es exactamente lo que un contrato no puede permitirse: la
 * defensa de "no me dieron a leer nada" es la que este flujo tiene que cerrar.
 *
 * Todo sale del **snapshot congelado** que devuelve el backend. Esta pantalla
 * no calcula ni un peso: si mostrara un total recalculado, la firma valdría
 * sobre un número distinto al que se emitió.
 */
export function FirmaContrato({ token }: { token: string }) {
  const [contrato, setContrato] = useState<ContratoParaFirmar | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [tildadas, setTildadas] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    api
      .contratoParaFirmar(token)
      .then((c) => {
        setContrato(c);
        setListo(c.firmado);
        // El nombre viene precargado del contrato: es el del titular. Queda
        // editable porque quien firma puede no ser el mismo (una empresa manda
        // a otra persona a retirar).
        const cli = (c.snapshot?.cliente ?? {}) as Record<string, string>;
        setNombre(cli.nombre ?? "");
        setDni(cli.dni_cuit ?? "");
      })
      .catch((e) => setErrorCarga((e as ApiError).message))
      .finally(() => setCargando(false));
  }, [token]);

  if (cargando) {
    return (
      <Estado icono={<Loader2 className="h-6 w-6 animate-spin" />} titulo="Abriendo el contrato…" />
    );
  }

  if (errorCarga || !contrato) {
    return (
      <Estado
        icono={<AlertTriangle className="h-6 w-6 text-destructive" />}
        titulo="No pudimos abrir el contrato"
        detalle={errorCarga ?? "Este link no es válido."}
      />
    );
  }

  const urlPdf = api.urlContratoPdf(token);

  if (listo) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ubicar-green))]" />
        <h1 className="mt-4 text-2xl font-bold text-[#1B3F6B]">Listo, quedó firmado</h1>
        <p className="mt-2 text-muted-foreground">
          Contrato <strong className="text-foreground">{contrato.numero}</strong>. Te
          mandamos una copia por mail.
        </p>

        {/* Botón y no descarga automática: los navegadores de teléfono bloquean
            la descarga que no sale de un gesto, y cuando funciona el archivo
            cae en una carpeta que mucha gente no encuentra. */}
        <Button asChild className="mt-6 w-full sm:w-auto">
          <a href={urlPdf} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4" /> Ver y descargar el contrato firmado
          </a>
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          Podés volver a este link cuando quieras para bajarlo de nuevo.
        </p>
      </div>
    );
  }

  if (contrato.vencido) {
    return (
      <Estado
        icono={<AlertTriangle className="h-6 w-6 text-warning" />}
        titulo="Este link venció"
        detalle="Escribinos y te mandamos uno nuevo en el momento."
      />
    );
  }

  const faltanTildes = contrato.aceptaciones.filter((a) => !tildadas[a.clave]);
  const puedeFirmar =
    nombre.trim().length > 2 && dni.trim().length > 4 && !!firma && faltanTildes.length === 0;

  async function confirmar() {
    if (!puedeFirmar || !firma) return;
    setEnviando(true);
    setError(null);
    try {
      await api.firmarContrato(token, {
        nombre: nombre.trim(),
        dni: dni.trim(),
        firma_base64: firma,
        aceptaciones: contrato!.aceptaciones.map((a) => a.clave),
      });
      setListo(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setEnviando(false);
    }
  }

  const snap = contrato.snapshot ?? {};
  const empresa = (snap.empresa ?? {}) as Record<string, string>;
  const servicio = (snap.servicio ?? {}) as Record<string, string>;
  const vehiculo = (snap.vehiculo ?? {}) as Record<string, string>;
  const cargos = (snap.cargos ?? {}) as Record<string, any>;
  const coberturas = (snap.coberturas ?? {}) as Record<string, any>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Contrato de alquiler {contrato.numero}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#1B3F6B]">
          Leelo y firmalo desde acá
        </h1>
        {empresa.razon_social && (
          <p className="mt-1 text-xs text-muted-foreground">
            {empresa.nombre_comercial ?? "Ubicar Rent"} es el nombre comercial de{" "}
            {empresa.razon_social}
            {empresa.cuit ? ` — CUIT ${empresa.cuit}` : ""}
          </p>
        )}
      </header>

      {/* 1 · De qué se trata */}
      <Bloque titulo="Tu alquiler">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Dato t="Vehículo" v={vehiculo.descripcion || vehiculo.categoria} />
          <Dato t="Patente" v={vehiculo.patente} />
          <Dato
            t="Retiro"
            v={`${fecha(servicio.check_out_fecha)} ${servicio.check_out_hora ?? ""} · ${servicio.check_out_lugar ?? ""}`}
          />
          <Dato
            t="Devolución"
            v={`${fecha(servicio.check_in_fecha)} ${servicio.check_in_hora ?? ""} · ${servicio.check_in_lugar ?? ""}`}
          />
        </dl>

        {Array.isArray(cargos.lineas) && cargos.lineas.length > 0 && (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            {cargos.lineas.map((l: any, i: number) => (
              <div key={i} className="flex justify-between gap-3 py-0.5">
                <span className="min-w-0 text-muted-foreground">
                  {l.concepto}
                  {l.cantidad > 1 ? ` × ${l.cantidad}` : ""}
                </span>
                <span className="shrink-0 tabular-nums">{pesos(l.total)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
              {/* "Valor estimado" y no "Total": al firmar el auto todavía no
                  volvió, y el combustible, los daños y el excedente se
                  liquidan al devolverlo. */}
              <span>Valor estimado</span>
              <span className="tabular-nums">{pesos(cargos.valor_estimado)}</span>
            </div>
          </div>
        )}

        {coberturas.franquicia != null && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
            <strong>Franquicia a tu cargo: {pesos(coberturas.franquicia)}</strong>
            {Array.isArray(coberturas.contratadas) && coberturas.contratadas.length > 0
              ? ` — con ${coberturas.contratadas.map((c: any) => c.nombre).join(", ")}`
              : " — sin cobertura adicional contratada"}
          </p>
        )}
      </Bloque>

      {/* 2 · El contrato completo */}
      <Bloque titulo={contrato.clausulado.titulo}>
        <div className="max-h-96 space-y-4 overflow-y-auto rounded-lg border border-border bg-white p-4 text-[13px] leading-relaxed">
          {contrato.clausulado.clausulas.map((c) => (
            <section key={c.numero}>
              <h3 className="font-semibold text-foreground">
                {c.numero}. {resolver(c.titulo, empresa)}
              </h3>
              {c.parrafos.map((p, i) => (
                <p key={i} className="mt-1 text-muted-foreground">
                  {resolver(p.texto, empresa)}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Condiciones generales v{contrato.clausulado.version}.{" "}
          <a href={urlPdf} target="_blank" rel="noopener noreferrer" className="underline">
            Ver el contrato completo en PDF
          </a>
        </p>
      </Bloque>

      {/* 3 · Las declaraciones */}
      <Bloque titulo="Antes de firmar">
        <ul className="space-y-3">
          {contrato.aceptaciones.map((a) => (
            <li key={a.clave}>
              <label className="flex cursor-pointer select-none items-start gap-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={!!tildadas[a.clave]}
                  onCheckedChange={(c) =>
                    setTildadas((t) => ({ ...t, [a.clave]: c === true }))
                  }
                />
                <span>
                  <strong className="block text-foreground">{a.titulo}</strong>
                  <span className="text-muted-foreground">{a.texto}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Bloque>

      {/* 4 · La firma */}
      <Bloque titulo="Tu firma">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre y apellido de quien firma" valor={nombre} onCambiar={setNombre} />
          <Campo etiqueta="DNI" valor={dni} onCambiar={setDni} />
        </div>
        <div className="mt-4">
          <LienzoFirma onCambiar={setFirma} />
        </div>
      </Bloque>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive px-4 py-3 text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {/* El botón se deshabilita, pero el motivo se dice: un botón gris sin
          explicación deja a la persona buscando qué le falta. */}
      {!puedeFirmar && (
        <p className="mb-3 text-sm text-muted-foreground">
          Falta{" "}
          {[
            nombre.trim().length > 2 ? null : "tu nombre",
            dni.trim().length > 4 ? null : "tu DNI",
            faltanTildes.length ? `tildar ${faltanTildes.length} declaración(es)` : null,
            firma ? null : "tu firma",
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}

      <Button onClick={confirmar} disabled={!puedeFirmar || enviando} className="w-full" size="lg">
        {enviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Firmando…
          </>
        ) : (
          <>
            <FileText className="h-4 w-4" /> Firmar el contrato
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Al firmar queda registrada la fecha, la hora y el dispositivo desde el que
        firmaste. Te mandamos la copia por mail.
      </p>
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

/**
 * El clausulado guardado usa `{{LOCADOR}}` y `{{JURISDICCION}}` como
 * marcadores, igual que el PDF. Se resuelven acá contra los datos de empresa
 * del snapshot — que son los que estaban vigentes al emitir, no los de hoy.
 */
function resolver(texto: string, empresa: Record<string, string>): string {
  return texto
    .replace(/\{\{LOCADOR\}\}/g, (empresa.locador_nombre ?? "").toUpperCase())
    .replace(/\{\{JURISDICCION\}\}/g, empresa.jurisdiccion ?? "Bahía Blanca");
}

function fecha(iso?: string): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-border bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-[#1B3F6B]">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ t, v }: { t: string; v?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{t}</dt>
      <dd className="font-medium text-foreground">{v?.trim() || "—"}</dd>
    </div>
  );
}

function Campo({
  etiqueta, valor, onCambiar,
}: { etiqueta: string; valor: string; onCambiar: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <input
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}

function Estado({
  icono, titulo, detalle,
}: { icono: React.ReactNode; titulo: string; detalle?: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="flex justify-center">{icono}</div>
      <h1 className="mt-4 text-xl font-semibold text-[#1B3F6B]">{titulo}</h1>
      {detalle && <p className="mt-2 text-sm text-muted-foreground">{detalle}</p>}
    </div>
  );
}
