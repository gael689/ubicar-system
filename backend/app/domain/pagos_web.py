"""
Reglas del cobro online (D-30 y §6 de docs/PLAN_RESERVAS_WEB.md).

Todo lo que decide **cuánto se cobra** y **qué pasa con la reserva según lo
que responde la pasarela** vive acá, en funciones puras. El service de arriba
sólo orquesta: busca en la base, llama a Mercado Pago y persiste.

La razón no es purismo. Es que estas reglas se pueden equivocar de formas que
cuestan plata —cobrar de menos, confirmar sin cupo, acreditar dos veces el
mismo pago— y son exactamente las que no se pueden probar contra la API de
Mercado Pago sin una cuenta. Separadas así, se testean hoy.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

# ─── D-30: cuánto adelanta el cliente ────────────────────────────────────────
# El cliente elige, con un piso del 30%. Los tres botones del paso 3.
PORCENTAJES_ANTICIPO = (30, 50, 100)
PORCENTAJE_MINIMO = 30

# Clave en `configuracion` del descuento por pagar el 100% por adelantado.
# Es una palanca comercial: la mueven los dueños según la temporada y no
# puede requerir un deploy.
CLAVE_DESCUENTO_PAGO_TOTAL = "web.descuento_pago_total_pct"
DESCUENTO_PAGO_TOTAL_DEFAULT = Decimal("0")

CENTAVO = Decimal("0.01")


def _redondear(monto: Decimal) -> Decimal:
    return Decimal(monto).quantize(CENTAVO, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Anticipo:
    """Lo que hay que cobrar ahora y lo que queda para el mostrador."""

    porcentaje: int
    total_lista: Decimal       # lo que sale el alquiler completo, sin descuento
    descuento: Decimal         # sólo si paga el 100% (D-30)
    total_final: Decimal       # total_lista - descuento
    monto_a_cobrar: Decimal    # lo que va a la preferencia de Mercado Pago
    saldo: Decimal             # lo que se cobra al retirar el auto

    @property
    def paga_todo(self) -> bool:
        return self.porcentaje == 100


def validar_porcentaje(porcentaje: int) -> None:
    """
    El piso es del 30% y los saltos son los tres definidos.

    Se valida en el backend y no sólo en el front porque el porcentaje llega
    en el body de un endpoint público: cualquiera puede mandar `1`.
    """
    if porcentaje not in PORCENTAJES_ANTICIPO:
        opciones = " / ".join(f"{p}%" for p in PORCENTAJES_ANTICIPO)
        raise ValueError(f"El anticipo tiene que ser {opciones}")


def calcular_anticipo(
    total_lista: Decimal,
    porcentaje: int,
    descuento_pago_total_pct: Decimal = DESCUENTO_PAGO_TOTAL_DEFAULT,
) -> Anticipo:
    """
    D-30. El descuento se aplica **sólo** si paga el 100%: es lo que se paga a
    cambio de eliminar la cobranza en el mostrador y el incobrable.

    El descuento se calcula sobre el total y no sobre el anticipo, porque para
    el que paga todo son la misma cosa — y expresarlo así evita la tentación de
    aplicarlo a una seña parcial.
    """
    validar_porcentaje(porcentaje)
    total_lista = _redondear(Decimal(total_lista))
    if total_lista <= 0:
        raise ValueError("El total a cobrar tiene que ser mayor a cero")

    if porcentaje == 100 and descuento_pago_total_pct > 0:
        descuento = _redondear(total_lista * Decimal(descuento_pago_total_pct) / Decimal(100))
    else:
        descuento = Decimal("0.00")

    total_final = _redondear(total_lista - descuento)
    if porcentaje == 100:
        monto = total_final
    else:
        monto = _redondear(total_final * Decimal(porcentaje) / Decimal(100))

    return Anticipo(
        porcentaje=porcentaje,
        total_lista=total_lista,
        descuento=descuento,
        total_final=total_final,
        monto_a_cobrar=monto,
        saldo=_redondear(total_final - monto),
    )


def estado_pago_reserva(porcentaje: int) -> str:
    """
    Cómo queda `Reserva.estado_pago` una vez acreditado.

    'pagado' cierra el tema; 'anticipo' deja el saldo para el check-out, que
    se cobra por el camino que ya existe (débito en CC + cobro). No hace falta
    lógica de cobranza nueva.
    """
    return "pagado" if porcentaje == 100 else "anticipo"


# ─── Estados que devuelve Mercado Pago ───────────────────────────────────────
# https://www.mercadopago.com.ar/developers — `payment.status`.
APROBADO = "approved"
PENDIENTES = frozenset({"pending", "in_process", "in_mediation", "authorized"})
RECHAZADOS = frozenset({"rejected", "cancelled"})
DEVUELTOS = frozenset({"refunded", "charged_back"})


@dataclass(frozen=True)
class Resolucion:
    """Qué hacer con la reserva después de mirar el pago."""

    estado_reserva: str
    acreditar: bool          # ¿se genera Pago + asiento en cuenta corriente?
    liberar_hold: bool
    requiere_persona: bool   # alerta crítica: alguien tiene que resolverlo hoy
    motivo: str


def resolver(estado_mp: str, hay_cupo: bool) -> Resolucion:
    """
    La tabla de decisión completa del webhook.

    **`hay_cupo` se re-verifica contra la base en el momento de acreditar**,
    no se confía en el hold: entre que el cliente abrió Checkout Pro y volvió
    el webhook pudieron pasar 40 minutos y el hold pudo vencer (regla 3 de
    §6).

    El caso `approved` sin cupo es la decisión #4, todavía abierta con los
    dueños. El default es el seguro: **no se rechaza la plata ni se devuelve
    sola** — la reserva queda en `revision_sin_cupo` y salta una alerta
    crítica. Devolver automáticamente sería peor: muchas veces hay un auto de
    otra categoría y el cliente prefiere eso a que le devuelvan la plata.
    """
    if estado_mp == APROBADO:
        if hay_cupo:
            return Resolucion(
                estado_reserva="confirmada",
                acreditar=True,
                liberar_hold=False,   # el hold se consume, no se libera
                requiere_persona=False,
                motivo="Pago acreditado y cupo confirmado",
            )
        return Resolucion(
            estado_reserva="revision_sin_cupo",
            acreditar=True,           # la plata entró: el asiento va igual
            liberar_hold=True,
            requiere_persona=True,
            motivo="El pago se acreditó pero ya no queda unidad para esas fechas",
        )

    if estado_mp in PENDIENTES:
        return Resolucion(
            estado_reserva="pendiente_pago",
            acreditar=False,
            liberar_hold=False,
            requiere_persona=False,
            motivo="Mercado Pago todavía no acreditó el pago",
        )

    if estado_mp in RECHAZADOS:
        return Resolucion(
            estado_reserva="cancelada",
            acreditar=False,
            liberar_hold=True,
            requiere_persona=False,
            motivo="El pago no se completó",
        )

    if estado_mp in DEVUELTOS:
        # No se revierte solo. Una devolución o un contracargo tienen
        # consecuencias (contra-asiento, auto que se libera, cliente que
        # reclama) que exceden lo que un webhook puede decidir.
        return Resolucion(
            estado_reserva="revision_sin_cupo",
            acreditar=False,
            liberar_hold=False,
            requiere_persona=True,
            motivo="Devolución o contracargo — hay que revisarlo a mano",
        )

    # Un estado que no conocemos no puede confirmar nada.
    return Resolucion(
        estado_reserva="pendiente_pago",
        acreditar=False,
        liberar_hold=False,
        requiere_persona=True,
        motivo=f"Mercado Pago devolvió un estado desconocido: {estado_mp}",
    )


def ya_procesado(estado_guardado: str | None, estado_nuevo: str) -> bool:
    """
    Idempotencia (regla 2 de §6): Mercado Pago **reintenta el webhook**, y sin
    esto un pago genera dos reservas o dos asientos.

    Un pago ya aprobado no vuelve atrás por un reintento tardío: los webhooks
    pueden llegar desordenados, y un `pending` que aterriza después de un
    `approved` no puede desconfirmar una reserva.
    """
    if estado_guardado is None:
        return False
    if estado_guardado == estado_nuevo:
        return True
    return estado_guardado == APROBADO and estado_nuevo in PENDIENTES


def monto_coincide(esperado: Decimal, recibido: Decimal) -> bool:
    """
    Regla 4 de §6: **nunca confiar en el monto que vuelve del navegador.**

    Se compara lo que devuelve la API de Mercado Pago contra lo que se calculó
    al crear la preferencia. Al centavo: los dos vienen del mismo número, y
    cualquier diferencia significa que algo se manipuló o que la preferencia
    no es la que creímos.
    """
    return _redondear(Decimal(esperado)) == _redondear(Decimal(recibido))


def referencia_externa(reserva_id: int) -> str:
    """
    Lo que viaja como `external_reference` y vuelve en el webhook.

    Con prefijo para que sea legible en el panel de Mercado Pago, donde estos
    identificadores se leen a mano cuando hay que cruzar un pago con una
    reserva.
    """
    return f"ubicar-reserva-{reserva_id}"


def reserva_de_referencia(referencia: str | None) -> int | None:
    """Inverso de `referencia_externa`. Devuelve None si no la reconoce."""
    if not referencia or not referencia.startswith("ubicar-reserva-"):
        return None
    try:
        return int(referencia.rsplit("-", 1)[1])
    except (ValueError, IndexError):
        return None
