import { useEffect, useRef, useState } from 'react';

/**
 * El borrador de una reserva a medio cargar.
 *
 * **El caso es el mostrador con alguien enfrente.** Se está cargando una
 * reserva, suena el teléfono, se cierra el modal sin querer o se recarga la
 * pestaña, y se pierden cinco minutos de tipeo con el cliente esperando. Es el
 * principio 6 de `PLAN_FRONTEND_UX.md`, el último que quedaba de su §2.
 *
 * Tres decisiones que conviene entender antes de tocar esto:
 *
 * **1. Los datos de la tarjeta NO se guardan.** Ni el número, ni el
 * vencimiento, ni el titular. El resto del sistema ya tiene un problema abierto
 * por guardar datos de tarjeta (ver `ALTERNATIVAS_COBRO.md`), y meterlos además
 * en el `localStorage` del navegador —sin PIN, sin expiración del lado del
 * servidor, y en una máquina que comparten tres personas— sería empeorarlo por
 * comodidad. Quien retoma un borrador vuelve a tipear esos tres campos.
 *
 * **2. Vence a las 24 horas.** Un borrador de anteayer no es trabajo a medio
 * hacer, es basura: ofrecerlo hace que la gente aprenda a descartar sin leer, y
 * el día que el borrador importa también lo descarta.
 *
 * **3. Es uno solo, y sólo al crear.** Editar una reserva existente es corregir
 * un dato puntual: no hay nada que recuperar, y un borrador de edición que se
 * aplique sobre otra reserva sería pisar datos buenos con datos viejos.
 */
const CLAVE = 'ubicar:borrador-reserva';
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

interface Sobre<T> {
  guardadoEn: number;
  datos: T;
}

function leer<T>(): { datos: T; guardadoEn: number } | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const sobre = JSON.parse(crudo) as Sobre<T>;
    if (!sobre?.guardadoEn || Date.now() - sobre.guardadoEn > VIGENCIA_MS) {
      localStorage.removeItem(CLAVE);
      return null;
    }
    return { datos: sobre.datos, guardadoEn: sobre.guardadoEn };
  } catch {
    // Un `localStorage` bloqueado (modo privado, política del navegador) o un
    // JSON corrupto no pueden impedir cargar una reserva: se sigue sin
    // borrador, que es exactamente como funcionaba antes.
    return null;
  }
}

/** "hace 3 minutos", en la forma en que uno lo diría. */
export function haceCuanto(ms: number): string {
  const minutos = Math.floor((Date.now() - ms) / 60000);
  if (minutos < 1) return 'recién';
  if (minutos === 1) return 'hace un minuto';
  if (minutos < 60) return `hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  return horas === 1 ? 'hace una hora' : `hace ${horas} horas`;
}

export function useBorradorReserva<T extends object>(
  valores: T,
  { activo }: { activo: boolean },
) {
  /**
   * El borrador que había al abrir, leído **una sola vez**.
   *
   * Si se releyera en cada render, el guardado automático de abajo lo pisaría
   * con lo que se está tipeando y el cartel de "retomar" nunca se iría.
   */
  const [pendiente, setPendiente] = useState(() =>
    activo ? leer<T>() : null
  );

  // El primer render no guarda: son los valores iniciales del formulario, y
  // guardarlos pisaría el borrador que justo se está por ofrecer.
  const montado = useRef(false);
  // Los últimos valores, para poder guardarlos al desmontar sin volver a
  // suscribir el efecto de cierre en cada tecla.
  const ultimos = useRef(valores);
  ultimos.current = valores;
  // Una vez descartado —porque la reserva se creó, o porque alguien apretó
  // "empezar de cero"— no se vuelve a guardar. Sin esto, el guardado al
  // desmontar repondría el borrador que se acaba de borrar.
  const descartado = useRef(false);

  function guardar(datos: T) {
    if (descartado.current) return;
    try {
      const sobre: Sobre<T> = { guardadoEn: Date.now(), datos };
      localStorage.setItem(CLAVE, JSON.stringify(sobre));
    } catch {
      // Sin espacio o sin permiso: se sigue sin borrador.
    }
  }

  useEffect(() => {
    if (!activo) return;
    if (!montado.current) {
      montado.current = true;
      return;
    }
    const t = setTimeout(() => guardar(valores), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, valores]);

  /**
   * Guardar al cerrar.
   *
   * **Sin esto el borrador no servía para el caso que lo motiva.** El guardado
   * va con 800 ms de espera para no escribir en cada tecla, y cerrar el modal
   * cancela ese temporizador: cerrar justo después de tipear —que es
   * exactamente cuando uno cierra sin querer— perdía el último tramo, o el
   * borrador entero si nunca se llegó a los 800 ms.
   */
  useEffect(() => {
    if (!activo) return;
    return () => {
      if (montado.current) guardar(ultimos.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  const descartar = () => {
    descartado.current = true;
    setPendiente(null);
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      /* ver arriba */
    }
  };

  return {
    /** Lo que había guardado al abrir, o `null`. */
    pendiente,
    /** Lo toma quien ya aplicó el borrador, para bajar el cartel. */
    marcarRetomado: () => setPendiente(null),
    descartar,
  };
}
