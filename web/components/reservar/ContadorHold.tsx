"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  token: string;
  segundosIniciales: number;
  onExpirar: () => void;
}

/**
 * Cuenta regresiva del cupo reservado.
 *
 * **Se muestra a propósito, no se esconde.** Genera urgencia honesta —el auto
 * está realmente tomado— y explica por qué la cosa se vence. Un checkout que
 * caduca sin avisar se siente como un error del sitio.
 *
 * Cuando quedan menos de 3 minutos ofrece extender: es preferible darle más
 * tiempo a alguien que está cargando la tarjeta que perder la venta.
 */
export function ContadorHold({ token, segundosIniciales, onExpirar }: Props) {
  const [restantes, setRestantes] = useState(segundosIniciales);
  const [extendiendo, setExtendiendo] = useState(false);

  useEffect(() => setRestantes(segundosIniciales), [segundosIniciales]);

  useEffect(() => {
    if (restantes <= 0) {
      onExpirar();
      return;
    }
    const id = setInterval(() => setRestantes((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [restantes, onExpirar]);

  const mm = String(Math.floor(restantes / 60)).padStart(2, "0");
  const ss = String(restantes % 60).padStart(2, "0");
  const porVencer = restantes <= 180;

  const extender = async () => {
    setExtendiendo(true);
    try {
      const hold = await api.extenderHold(token);
      setRestantes(hold.segundos_restantes);
    } catch {
      /* si falla, el contador sigue: el onExpirar se encarga */
    } finally {
      setExtendiendo(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-sm transition-colors",
        porVencer
          ? "bg-destructive text-destructive-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Timer className="h-4 w-4 shrink-0" />
      <span>
        Te guardamos el vehículo{" "}
        <strong className={cn("tabular-nums", !porVencer && "text-foreground")}>
          {mm}:{ss}
        </strong>
      </span>
      {porVencer && (
        <button
          type="button"
          onClick={extender}
          disabled={extendiendo}
          className="ml-auto rounded-sm bg-white/20 px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:bg-white/30 disabled:opacity-60"
        >
          {extendiendo ? "Extendiendo…" : "Darme más tiempo"}
        </button>
      )}
    </div>
  );
}
