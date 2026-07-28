"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, pesos } from "@/lib/api";
import type {
  CategoriaDisponible, ConfigPublica, Cotizacion, DatosCliente,
} from "@/lib/types";
import { Stepper, PASOS } from "./Stepper";
import { ContadorHold } from "./ContadorHold";
import { Paso1Vehiculo } from "./Paso1Vehiculo";
import { Paso2Adicionales } from "./Paso2Adicionales";
import { Paso3Datos } from "./Paso3Datos";
import { Paso4Pago } from "./Paso4Pago";
import { ResumenReserva } from "./ResumenReserva";
import type { RangoBusqueda } from "./BuscadorRango";

const CLIENTE_VACIO: DatosCliente = {
  nombre: "", apellido: "", dni: "", email: "", telefono: "",
  fechaNacimiento: "", aceptaTerminos: false,
};

const LUGARES_FALLBACK = ["Paraguay 241", "Alsina 350", "Aeropuerto Comandante Espora"];

/**
 * Los 4 pasos viven en **una sola ruta**, no en cuatro páginas.
 *
 * Una navegación real entre páginas perdería el hold, recargaría todo y
 * rompería la sensación de flujo. Con una sola ruta, "volver" es instantáneo
 * y el cupo reservado sobrevive.
 */
export function FlujoReserva() {
  const params = useSearchParams();

  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const [paso, setPaso] = useState(1);

  // El Hero de la portada no valida nada: sólo transporta lo que el cliente
  // ya eligió. Si viene incompleto, el paso 1 se lo pide.
  const [rango, setRango] = useState<RangoBusqueda>(() => ({
    lugarRetiro: params.get("lugar") ?? "",
    lugarDevolucion: params.get("devolucion") ?? params.get("lugar") ?? "",
    fechaInicio: params.get("desde") ?? "",
    horaInicio: params.get("hora_desde") ?? "10:00",
    fechaFin: params.get("hasta") ?? "",
    horaFin: params.get("hora_hasta") ?? "10:00",
  }));

  const [categoria, setCategoria] = useState<CategoriaDisponible | null>(null);
  const [adicionales, setAdicionales] = useState<Record<number, number>>({});
  const [cliente, setCliente] = useState<DatosCliente>(CLIENTE_VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof DatosCliente, string>>>({});

  const [hold, setHold] = useState<{ token: string; segundos: number } | null>(null);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cotizando, setCotizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avanzando, setAvanzando] = useState(false);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  // Liberar el hold si el visitante cierra la pestaña: el cupo vuelve al
  // instante en vez de esperar los 20 minutos.
  useEffect(() => {
    if (!hold) return;
    const liberar = () => {
      navigator.sendBeacon?.(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"}/public/holds/${hold.token}`,
      );
    };
    window.addEventListener("pagehide", liberar);
    return () => window.removeEventListener("pagehide", liberar);
  }, [hold]);

  const dias = cotizacion?.duracion_dias ?? categoria?.precio?.dias ?? 0;

  /** Recotiza contra el mismo endpoint que usa el mostrador. */
  const recotizar = useCallback(async () => {
    if (!categoria) return;
    setCotizando(true);
    try {
      const c = await api.calcularPrecio({
        fecha_inicio: rango.fechaInicio,
        fecha_fin: rango.fechaFin,
        categoria_id: categoria.categoria_id,
        canal: "web",
        adicionales: Object.entries(adicionales).map(([id, cantidad]) => ({
          adicional_id: Number(id),
          cantidad,
        })),
        fecha_nacimiento: cliente.fechaNacimiento || null,
      });
      setCotizacion(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCotizando(false);
    }
  }, [categoria, rango.fechaInicio, rango.fechaFin, adicionales, cliente.fechaNacimiento]);

  useEffect(() => {
    if (categoria) void recotizar();
  }, [categoria, recotizar]);

  // ── Navegación ────────────────────────────────────────────────────────────

  const elegirCategoria = async (c: CategoriaDisponible) => {
    setError(null);
    setAvanzando(true);
    try {
      // Tomar el cupo ANTES de seguir: entre elegir y pagar pasan minutos, y
      // sin el hold dos personas compran la última unidad.
      if (hold) await api.liberarHold(hold.token).catch(() => {});
      const h = await api.crearHold({
        categoria_id: c.categoria_id,
        fecha_inicio: rango.fechaInicio,
        hora_inicio: rango.horaInicio,
        fecha_fin: rango.fechaFin,
        hora_fin: rango.horaFin,
      });
      setHold({ token: h.token, segundos: h.segundos_restantes });
      setCategoria(c);
      setPaso(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAvanzando(false);
    }
  };

  const validarDatos = (): boolean => {
    const e: Partial<Record<keyof DatosCliente, string>> = {};
    if (!cliente.nombre.trim()) e.nombre = "Necesitamos tu nombre";
    if (!cliente.apellido.trim()) e.apellido = "Necesitamos tu apellido";
    if (!/^\d{7,9}$/.test(cliente.dni.replace(/\D/g, ""))) e.dni = "Ingresá un DNI válido";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cliente.email)) e.email = "Ingresá un email válido";
    if (cliente.telefono.replace(/\D/g, "").length < 8) e.telefono = "Ingresá un teléfono válido";
    if (!cliente.fechaNacimiento) e.fechaNacimiento = "La necesitamos para calcular la tarifa";
    if (!cliente.aceptaTerminos) e.aceptaTerminos = "Tenés que aceptar los términos para continuar";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const siguiente = () => {
    setError(null);
    if (paso === 3 && !validarDatos()) return;
    if (paso === 3) void recotizar(); // la edad puede haber cambiado el precio
    setPaso((p) => Math.min(PASOS.length, p + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const anterior = () => {
    setError(null);
    setPaso((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const holdExpirado = useCallback(() => {
    setHold(null);
    setCategoria(null);
    setCotizacion(null);
    setPaso(1);
    setError("Se venció el tiempo para completar la reserva. Elegí el vehículo de nuevo.");
  }, []);

  const puedeAvanzar = useMemo(() => {
    if (paso === 1) return Boolean(categoria);
    if (paso === 4) return false;
    return true;
  }, [paso, categoria]);

  const lugares = config?.lugares_retiro?.length ? config.lugares_retiro : LUGARES_FALLBACK;

  return (
    <div className="min-h-screen bg-muted/30 pb-28 lg:pb-12">
      {/* Cabecera del flujo */}
      <header className="border-b border-border bg-white">
        <div className="container flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
          <Stepper actual={paso} />
        </div>
      </header>

      <main className="container py-6 md:py-10">
        {hold && paso > 1 && (
          <div className="mb-5">
            <ContadorHold
              token={hold.token}
              segundosIniciales={hold.segundos}
              onExpirar={holdExpirado}
            />
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-lg bg-destructive px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            {paso === 1 && (
              <Paso1Vehiculo
                rango={rango}
                lugares={lugares}
                anticipacionHoras={config?.anticipacion_minima_horas ?? 24}
                seleccionada={categoria}
                onCambiarRango={(r) => {
                  setRango(r);
                  setCategoria(null);
                  setCotizacion(null);
                }}
                onElegir={elegirCategoria}
              />
            )}

            {paso === 2 && (
              <Paso2Adicionales
                seleccion={adicionales}
                dias={dias}
                onCambiar={setAdicionales}
              />
            )}

            {paso === 3 && (
              <Paso3Datos datos={cliente} errores={errores} onCambiar={setCliente} />
            )}

            {paso === 4 && cotizacion && categoria && (
              <Paso4Pago
                rango={rango}
                categoriaNombre={categoria.nombre}
                cotizacion={cotizacion}
                cliente={cliente}
              />
            )}

            {/* Navegación de escritorio. En el paso 1 no se muestra: el botón
                "Elegir" de cada tarjeta ya es la acción de avanzar, y un
                "Continuar" deshabilitado a media pantalla sólo confunde. */}
            {paso > 1 && (
              <div className="mt-8 hidden items-center justify-between lg:flex">
                <Button variant="ghost" onClick={anterior}>
                  <ArrowLeft className="h-4 w-4" /> Atrás
                </Button>
                {paso < PASOS.length && (
                  <Button onClick={siguiente} disabled={!puedeAvanzar || avanzando}>
                    {avanzando && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Resumen: columna pegajosa en desktop */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <ResumenReserva
                rango={rango}
                categoriaNombre={categoria?.nombre ?? null}
                cotizacion={cotizacion}
                cargando={cotizando}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Barra inferior en mobile: el total nunca se pierde de vista */}
      {categoria && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            {paso > 1 && (
              <Button variant="ghost" size="sm" onClick={anterior} aria-label="Atrás">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">
                {categoria.nombre} · {dias} {dias === 1 ? "día" : "días"}
              </p>
              <p className="text-lg font-bold leading-tight text-[#1B3F6B]">
                {cotizando ? "…" : pesos(cotizacion?.total)}
              </p>
            </div>
            {paso < PASOS.length && (
              <Button onClick={siguiente} disabled={!puedeAvanzar || avanzando}>
                {avanzando && <Loader2 className="h-4 w-4 animate-spin" />}
                Continuar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
