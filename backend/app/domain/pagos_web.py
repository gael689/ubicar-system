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
from datetime import datetime, timedelta
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

# ─── Cómo se arma la preferencia de Mercado Pago ─────────────────────────────

# Tope de cuotas. Las cuotas las paga el vendedor, así que es una palanca
# comercial y no técnica: se mueve desde Configuración, sin deploy. Seis es un
# default prudente hasta que Franco y Martín definan el suyo.
CLAVE_CUOTAS_MAXIMAS = "web.mp_cuotas_maximas"
CUOTAS_MAXIMAS_DEFAULT = 6

# Lo que ve el cliente en el resumen de la tarjeta. Un cargo que no se
# reconoce termina en un contracargo, y un contracargo cuesta más que la venta.
DESCRIPTOR_TARJETA = "UBICAR RENT"

# Cuánto sobrevive la preferencia al hold.
#
# La preferencia tiene que morir, o alguien paga mañana un auto cuyo hold
# venció hoy. Pero no puede morir **exactamente** con el hold: el cliente que
# apretó "pagar" en el minuto 19 está tipeando la tarjeta cuando se vence, y
# ese pago —que iba a entrar— se cae en la cara del cliente.
#
# Diez minutos es lo que tarda una persona en completar el formulario de MP.
# Un pago que llegue en esa ventana ya no tiene hold, así que el webhook lo
# manda a `revision_sin_cupo` y lo resuelve una persona: eso es correcto, y es
# muchísimo mejor que perder la venta.
MARGEN_PAGO_EN_CURSO = timedelta(minutes=10)

# Vida mínima que le tiene que quedar a una preferencia para reusarla en vez de
# emitir una nueva. Ver `preferencia_sigue_viva`.
MARGEN_REUSO = timedelta(minutes=2)

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
        # **Sí se revierte solo, y desde la Fase 3 del `PLAN_DINERO.md`.**
        #
        # Este comentario decía antes que no, con el argumento de que las
        # consecuencias exceden lo que un webhook puede decidir. Ese argumento
        # confundía dos cosas. **El hecho económico ya ocurrió afuera**: la
        # plata volvió al cliente, la decidió él o la decidió el banco, y no
        # hay nada que decidir acá. Lo que quedaba era el libro diciendo que
        # esa plata entró.
        #
        # Lo que sí excede al webhook —qué hacer con el auto, cómo contestarle
        # al cliente— sigue necesitando una persona, y por eso
        # `requiere_persona` queda en `True`: el asiento se corrige solo y
        # **además** dispara un aviso. Ver `PagoWebService._revertir_cobro`.
        return Resolucion(
            estado_reserva="revision_sin_cupo",
            acreditar=False,
            liberar_hold=False,
            requiere_persona=True,
            motivo="Devolución o contracargo — la plata volvió al cliente",
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


def vencimiento_preferencia(hold_expira_en: datetime | None) -> datetime | None:
    """Hasta cuándo Mercado Pago acepta que se pague. Ver `MARGEN_PAGO_EN_CURSO`."""
    if hold_expira_en is None:
        return None
    return hold_expira_en + MARGEN_PAGO_EN_CURSO


def preferencia_sigue_viva(vence_en: datetime | None, ahora: datetime | None = None) -> bool:
    """
    ¿Vale la pena devolverle al cliente la preferencia que ya tenía?

    Existe por el botón **"Darme más tiempo"** (`ContadorHold`): extender el
    hold alarga el cupo, pero **no alarga una preferencia ya emitida**. Sin
    este chequeo se le devolvía la vieja, Mercado Pago la rechazaba por
    vencida, y el cliente veía fallar el pago con el auto todavía reservado a
    su nombre.

    `None` cuenta como viva: son las preferencias emitidas antes de que
    empezaran a vencer (migración 071), y ésas efectivamente no vencen.

    El margen es para no entregar una preferencia que muere mientras el
    cliente todavía está leyendo la pantalla de Mercado Pago.
    """
    if vence_en is None:
        return True
    return vence_en - MARGEN_REUSO > (ahora or datetime.utcnow())


def partir_nombre(nombre: str | None) -> tuple[str, str]:
    """
    El nombre completo partido en nombre y apellido, como lo pide Mercado Pago.

    La web pide **un solo campo** —"Nombre y apellido"— porque pedir dos
    espanta gente en un formulario de compra. MP quiere `name` y `surname`
    separados y los usa para el scoring de la operación.

    Se corta en el **primer** espacio y todo lo demás es apellido: "Juan Carlos
    Pérez" da ("Juan", "Carlos Pérez"). Es una heurística y a veces se
    equivoca; equivocarse acá no rompe nada —MP no valida el nombre contra la
    tarjeta— y mandar los dos campos aprueba más que mandar ninguno.
    """
    limpio = (nombre or "").strip()
    if not limpio:
        return "", ""
    partes = limpio.split(None, 1)
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], partes[1].strip()
