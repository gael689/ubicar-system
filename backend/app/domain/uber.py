"""
Contrato de Uber: valor por semana, pagos semanales y kilometraje (04/10/2026).

Pedido de Franco (01/10): *"Valor Semana · Condición de pago · Fechas de pago ·
Kilometraje (los km permitidos) · Precio del km extra. Lo de la franquicia queda
igual."* Y sobre el valor: *"es valor semana o valor total del alquiler y
seleccionar los pagos semanales — creo que para mí es mejor como te lo pasé,
entonces queda todo registrado."*

Por eso el dato que se carga es **el valor de la semana**, y todo lo demás
sale de ahí. Son funciones puras: no tocan la base y se prueban solas.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

DIAS_POR_SEMANA = 7
_CENTAVOS = Decimal("0.01")


def _dec(v) -> Decimal:
    return Decimal(str(v))


def cantidad_de_semanas(dias: int) -> int:
    """Cuántas semanas (enteras o empezadas) cubre un alquiler. Mínimo 1."""
    return max(1, math.ceil(max(dias, 1) / DIAS_POR_SEMANA))


def total_del_alquiler(valor_semana, dias: int) -> Decimal:
    """
    `valor_semana × días / 7`.

    Prorrateado y no redondeado a la semana siguiente: un alquiler de 10 días
    no cuesta dos semanas enteras. Con semanas completas da exactamente el
    valor de la semana por la cantidad.
    """
    return (_dec(valor_semana) * max(dias, 1) / DIAS_POR_SEMANA).quantize(
        _CENTAVOS, rounding=ROUND_HALF_UP
    )


def fechas_de_pago(fecha_inicio: date, dias: int) -> list[date]:
    """
    Una fecha por semana, **empezando el día del retiro** (se paga la semana
    por adelantado). Es sólo la propuesta: el operador las edita.
    """
    return [fecha_inicio + timedelta(days=DIAS_POR_SEMANA * i) for i in range(cantidad_de_semanas(dias))]


def repartir_en_cuotas(total, cantidad: int) -> list[Decimal]:
    """
    El total en `cantidad` cuotas iguales; **el resto de los centavos va a la
    última**, así la suma da siempre el total exacto.
    """
    cantidad = max(cantidad, 1)
    total = _dec(total)
    base = (total / cantidad).quantize(_CENTAVOS, rounding=ROUND_HALF_UP)
    cuotas = [base] * (cantidad - 1)
    cuotas.append(total - base * (cantidad - 1))
    return cuotas


def km_permitidos(km_semana, dias: int) -> Decimal:
    """Los km incluidos en el alquiler: `km por semana × días / 7`."""
    return (_dec(km_semana) * max(dias, 1) / DIAS_POR_SEMANA).quantize(_CENTAVOS)


def km_excedidos(km_recorridos, km_semana, dias: int) -> Decimal:
    """Los km que pasan del tope. Nunca negativo."""
    exceso = _dec(km_recorridos) - km_permitidos(km_semana, dias)
    return exceso if exceso > 0 else Decimal("0")


def cargo_por_km_extra(km_recorridos, km_semana, precio_km_extra, dias: int) -> Decimal:
    """Lo que se cobra por pasarse del kilometraje. 0 si falta algún dato."""
    if not km_semana or not precio_km_extra:
        return Decimal("0")
    return (km_excedidos(km_recorridos, km_semana, dias) * _dec(precio_km_extra)).quantize(
        _CENTAVOS, rounding=ROUND_HALF_UP
    )


# ═════════════════════════════════════════════════════════════════════════════
# Tablero de Uber (21/11/2026)
#
# Pedido de Gael: *"la parte de Uber bien funcional, fácil de usar todo"*. Quien
# atiende tiene que ver de un vistazo qué chofer pagó la semana y cuál debe. Lo
# de abajo son las cuentas de esa pantalla: en qué semana va un contrato, qué
# cuotas están pagas, cuántos km lleva permitidos a una fecha. Siguen siendo
# funciones puras; la base la toca `services/uber_service.py`.
# ═════════════════════════════════════════════════════════════════════════════

ADELANTADO = "adelantado"
VENCIDO = "vencido"

# Cómo se guarda la modalidad en `reservas.condicion_pago_texto`. Es el mismo
# campo de texto de siempre (no hay columna nueva): un contrato viejo con texto
# libre se sigue leyendo, y uno nuevo sale en el PDF con una frase prolija.
ETIQUETA_MODALIDAD = {
    ADELANTADO: "Semanal por adelantado",
    VENCIDO: "Semanal vencido",
}


def realinear_fechas(
    fecha_inicio: date, dias: int, dia_semana: int, modalidad: str = ADELANTADO
) -> list[date]:
    """
    Una fecha de pago por semana, **todas el mismo día** ("paga los lunes").

    `dia_semana` es el de Python: 0 = lunes … 6 = domingo.

    - **Por adelantado**: cada semana se paga el último `dia_semana` que cae en
      o antes de su comienzo, y nunca antes del retiro — la primera se paga al
      llevarse el auto.
    - **Vencido**: cada semana se paga el primer `dia_semana` en o después de
      su final, y nunca después de la devolución — nadie se va debiendo.

    Con el día del retiro como `dia_semana` y por adelantado da exactamente lo
    mismo que `fechas_de_pago`.
    """
    dias = max(dias, 1)
    fin = fecha_inicio + timedelta(days=dias)
    fechas: list[date] = []
    for i in range(cantidad_de_semanas(dias)):
        comienzo = fecha_inicio + timedelta(days=DIAS_POR_SEMANA * i)
        if modalidad == VENCIDO:
            cierre = comienzo + timedelta(days=DIAS_POR_SEMANA)
            f = cierre + timedelta(days=(dia_semana - cierre.weekday()) % DIAS_POR_SEMANA)
            f = min(f, fin)
        else:
            f = comienzo - timedelta(days=(comienzo.weekday() - dia_semana) % DIAS_POR_SEMANA)
            f = max(f, fecha_inicio)
        # Los topes (el retiro, la devolución) pueden hacer coincidir dos
        # semanas en el mismo día: se corre un día para que cada una tenga el
        # suyo y el orden de las cuotas no se pierda.
        if fechas and f <= fechas[-1]:
            f = fechas[-1] + timedelta(days=1)
        fechas.append(f)
    return fechas


def validar_fechas_de_pago(fechas: list[date], dias: int) -> str | None:
    """
    `None` si las fechas sirven; si no, **el mensaje para mostrar**.

    Lo que se frena es el desalineo: cada fecha es una cuota en la cuenta
    corriente (`AlquilerService.checkout` reparte el total entre las fechas que
    haya), así que con una fecha de menos las cuotas salen más caras que el
    valor de la semana pactado, y con una de más, más baratas. Mover una fecha
    puntual sí se puede.
    """
    semanas = cantidad_de_semanas(dias)
    if len(fechas) != semanas:
        return (
            f"El contrato dura {semanas} {'semana' if semanas == 1 else 'semanas'} "
            f"y tiene {len(fechas)} {'fecha' if len(fechas) == 1 else 'fechas'} de pago: "
            "tiene que haber una por semana."
        )
    for anterior, siguiente in zip(fechas, fechas[1:]):
        if siguiente <= anterior:
            return (
                "Las fechas de pago tienen que ir en orden y no repetirse: "
                "cada semana se paga en una fecha distinta."
            )
    return None


def fechas_de_renovacion(
    fecha_inicio: date,
    fecha_fin_actual: date,
    fechas_existentes: list[date],
    semanas_nuevas: int,
) -> list[date]:
    """
    Las fechas de pago de las semanas que se agregan al renovar.

    **Siguen el mismo ritmo que venía pagando el chofer**: se mira a cuántos
    días del comienzo de su semana caía la última fecha pactada, y las nuevas
    guardan esa misma distancia. Quien pagaba los lunes por adelantado sigue
    pagando los lunes. Sin fechas previas, se paga al empezar cada semana nueva.
    """
    semanas_nuevas = max(semanas_nuevas, 1)
    corrimiento = 0
    if fechas_existentes:
        ultima = len(fechas_existentes) - 1
        comienzo_ultima = fecha_inicio + timedelta(days=DIAS_POR_SEMANA * ultima)
        corrimiento = (fechas_existentes[-1] - comienzo_ultima).days
        # Una fecha movida a mano muy lejos de su semana no es un ritmo: no se
        # propaga a todas las semanas nuevas.
        if abs(corrimiento) > DIAS_POR_SEMANA:
            corrimiento = 0
    nuevas = [
        fecha_fin_actual + timedelta(days=DIAS_POR_SEMANA * i + corrimiento)
        for i in range(semanas_nuevas)
    ]
    # Nunca antes (ni el mismo día) que la última que ya existía: quedarían dos
    # cuotas con el mismo vencimiento y el orden de las semanas se perdería.
    if fechas_existentes:
        piso = fechas_existentes[-1]
        for i, f in enumerate(nuevas):
            if f <= piso:
                nuevas[i] = piso + timedelta(days=1)
            piso = nuevas[i]
    return nuevas


@dataclass(frozen=True)
class SemanaEnCurso:
    numero: int
    total: int
    desde: date
    hasta: date


def semana_en_curso(fecha_inicio: date, dias: int, hoy: date) -> SemanaEnCurso:
    """
    En qué semana del contrato cae `hoy` ("semana 3 de 8, del 19/10 al 25/10").

    Antes del retiro es la 1; pasado el final, la última: un contrato vencido
    con el auto todavía afuera sigue mostrándose, y es cuando más importa.
    """
    dias = max(dias, 1)
    total = cantidad_de_semanas(dias)
    transcurridos = (hoy - fecha_inicio).days
    numero = min(max(transcurridos // DIAS_POR_SEMANA + 1, 1), total)
    desde = fecha_inicio + timedelta(days=DIAS_POR_SEMANA * (numero - 1))
    fin_contrato = fecha_inicio + timedelta(days=dias)
    # "Hasta" es el último día que cubre la semana, no el primero de la que sigue.
    hasta = min(desde + timedelta(days=DIAS_POR_SEMANA - 1), fin_contrato)
    return SemanaEnCurso(numero=numero, total=total, desde=desde, hasta=hasta)


@dataclass
class Cuota:
    """Una semana a pagar: lo que vale, cuándo vence y cuánto se le imputó."""
    numero: int
    vencimiento: date | None
    monto: Decimal
    pagado: Decimal = Decimal("0")
    # El pago que la terminó de cubrir (el último que le entró, si es parcial).
    fecha_pago: date | None = None
    medio_pago: str | None = None
    concepto: str | None = None
    movimiento_id: int | None = None

    @property
    def saldo(self) -> Decimal:
        return self.monto - self.pagado

    @property
    def paga(self) -> bool:
        return self.saldo <= 0

    def estado(self, hoy: date) -> str:
        """`paga` | `parcial` (algo entró y no venció) | `pendiente` | `vence_hoy` | `vencida`."""
        if self.paga:
            return "paga"
        if self.vencimiento is not None and self.vencimiento < hoy:
            return "vencida"
        if self.vencimiento == hoy:
            return "vence_hoy"
        return "parcial" if self.pagado > 0 else "pendiente"


def imputar_pagos(cuotas: list[Cuota], pagos: list[tuple[date, str | None, Decimal]]) -> list[Cuota]:
    """
    Reparte lo cobrado entre las cuotas, **de la más vieja a la más nueva**.

    El sistema no imputa un crédito contra un débito puntual y no lo va a hacer
    (`PLAN_DINERO.md` §4.3): sabe cuánto entró por el alquiler, no qué asiento
    canceló cada pago. Para saber qué semana está paga se hace lo que haría
    cualquiera con el cuaderno: la plata cubre primero lo más viejo. Un pago
    parcial deja la semana a medias, y lo que sobra de una pasa a la siguiente.

    `cuotas` tiene que venir ordenada por vencimiento; `pagos` son
    `(fecha, medio, monto)`. Modifica y devuelve las mismas cuotas.
    """
    i = 0
    for fecha, medio, monto in sorted(pagos, key=lambda p: p[0]):
        resto = _dec(monto)
        while resto > 0 and i < len(cuotas):
            cuota = cuotas[i]
            aplicado = min(resto, cuota.saldo)
            if aplicado > 0:
                cuota.pagado += aplicado
                cuota.fecha_pago = fecha
                cuota.medio_pago = medio
                resto -= aplicado
            if cuota.paga:
                i += 1
            else:
                break
    return cuotas


@dataclass(frozen=True)
class EstadoDeCuenta:
    # `al_dia` | `vence_hoy` | `atrasado`
    estado: str
    dias_atraso: int = 0
    semanas_adeudadas: int = 0
    # Lo vencido impago (vencimiento anterior a hoy).
    adeudado: Decimal = Decimal("0")
    # Lo que se le puede reclamar hoy: lo vencido más lo que vence hoy.
    exigible: Decimal = Decimal("0")
    proxima_fecha: date | None = None
    proximo_monto: Decimal = Decimal("0")
    # La primera cuota con saldo, que es la que cobra "Cobrar semana".
    cuota_a_cobrar: Cuota | None = field(default=None, compare=False)


def estado_de_cuenta(cuotas: list[Cuota], hoy: date) -> EstadoDeCuenta:
    """
    Cómo viene el chofer con los pagos.

    - `atrasado`: tiene al menos una cuota vencida (de un día anterior) sin
      cubrir del todo. Los días de atraso se cuentan desde la más vieja.
    - `vence_hoy`: no debe nada viejo, pero hoy le vence una.
    - `al_dia`: todo lo demás.

    Un pago parcial no pone al día: la semana sigue adeudada por lo que falta.
    """
    vencidas = [c for c in cuotas if not c.paga and c.vencimiento is not None and c.vencimiento < hoy]
    de_hoy = [c for c in cuotas if not c.paga and c.vencimiento == hoy]
    impagas = [c for c in cuotas if not c.paga]
    futuras = [c for c in impagas if c.vencimiento is not None and c.vencimiento >= hoy]

    adeudado = sum((c.saldo for c in vencidas), Decimal("0"))
    exigible = adeudado + sum((c.saldo for c in de_hoy), Decimal("0"))
    proxima = futuras[0] if futuras else None
    comunes = dict(
        adeudado=adeudado,
        exigible=exigible,
        proxima_fecha=proxima.vencimiento if proxima else None,
        proximo_monto=proxima.saldo if proxima else Decimal("0"),
        cuota_a_cobrar=impagas[0] if impagas else None,
    )
    if vencidas:
        return EstadoDeCuenta(
            estado="atrasado",
            dias_atraso=(hoy - min(c.vencimiento for c in vencidas)).days,
            semanas_adeudadas=len(vencidas),
            **comunes,
        )
    if de_hoy:
        return EstadoDeCuenta(estado="vence_hoy", **comunes)
    return EstadoDeCuenta(estado="al_dia", **comunes)


def km_permitidos_a_fecha(km_semana, fecha_inicio: date, fecha: date, dias_contrato: int) -> Decimal:
    """
    Los km que el chofer **podía** llevar recorridos a una fecha: el tope
    semanal prorrateado por los días que pasaron desde el retiro.

    Mínimo un día (una lectura el mismo día del retiro no puede dar tope cero)
    y máximo los días del contrato: pasado el final, el tope es el de todo el
    contrato, que es contra lo que se cobra el excedente en el check-in.
    """
    transcurridos = min(max((fecha - fecha_inicio).days, 1), max(dias_contrato, 1))
    return km_permitidos(km_semana, transcurridos)


def consumo_de_km(
    km_lectura: int,
    km_inicial: int,
    km_semana,
    precio_km_extra,
    fecha_inicio: date,
    fecha: date,
    dias_contrato: int,
) -> dict:
    """
    Una lectura del odómetro contra el tope prorrateado a ese día.

    **Sólo informa.** El excedente se cobra una vez, al cierre, contra el tope
    del contrato entero (`AlquilerService.checkin`): un chofer que se pasó en la
    semana 2 puede compensar en la 3. `costo_estimado` es lo que saldría *si
    devolviera el auto con este ritmo*, para poder avisarle a tiempo.
    """
    recorridos = max(int(km_lectura) - int(km_inicial), 0)
    if not km_semana:
        return {
            "recorridos": recorridos, "permitidos": None, "excedidos": Decimal("0"),
            "porcentaje": None, "costo_estimado": Decimal("0"),
        }
    permitidos = km_permitidos_a_fecha(km_semana, fecha_inicio, fecha, dias_contrato)
    exceso = _dec(recorridos) - permitidos
    excedidos = exceso if exceso > 0 else Decimal("0")
    costo = (
        (excedidos * _dec(precio_km_extra)).quantize(_CENTAVOS, rounding=ROUND_HALF_UP)
        if precio_km_extra else Decimal("0")
    )
    porcentaje = (
        int((_dec(recorridos) * 100 / permitidos).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if permitidos > 0 else None
    )
    return {
        "recorridos": recorridos,
        "permitidos": permitidos,
        "excedidos": excedidos,
        "porcentaje": porcentaje,
        "costo_estimado": costo,
    }


def separar_condicion(texto: str | None) -> tuple[str, str]:
    """
    `condicion_pago_texto` → `(modalidad, nota)`.

    Un contrato nuevo guarda "Semanal por adelantado — por transferencia". Uno
    anterior tiene texto libre ("paga los viernes en efectivo"): ése no se
    migra, se lee entero como nota y la modalidad queda en la de siempre.
    """
    limpio = (texto or "").strip()
    for modalidad, etiqueta in ETIQUETA_MODALIDAD.items():
        if limpio.lower().startswith(etiqueta.lower()):
            return modalidad, limpio[len(etiqueta):].lstrip(" —-·:,.").strip()
    return ADELANTADO, limpio
