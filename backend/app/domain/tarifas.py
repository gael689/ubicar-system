from __future__ import annotations
"""
Lógica pura de tarifas y duración.
Sin dependencias externas — testeable de forma aislada.

Decisiones de diseño:
- La duración se calcula en días enteros (ignorando horas).
- Las bandas son diaria (1 día), semanal (7 días) y mensual (30 días).
- Si hay tarifa específica del vehículo → prioridad sobre la de categoría, y
  ésta sobre la general (D-08).
- Si hay múltiples activas del mismo tipo → la de mayor id (la más reciente).

**D-35 · El precio se arma por bloques, con prorrateo.** Un alquiler se
descompone consumiendo primero los bloques más grandes:

    10 días  →  1 semana (a precio semanal) + 3 días (a precio diario)
    40 días  →  1 mes + 1 semana + 3 días

Esto **invierte** el modelo anterior, donde `monto` era siempre un precio por
día y la banda sólo decidía cuál aplicaba. Ahora **`monto` es el precio del
bloque completo**: una tarifa semanal de $150.000 es el precio de la semana,
que es lo que cualquiera espera al cargar "Semanal: $150.000". El modelo viejo
invitaba al error de cargar ahí el total del período y cobrar 7 veces de más.

**Los alquileres existentes no cambian de precio.** Con sólo tarifas diarias
cargadas —que es el estado de la base hoy— la descomposición da N bloques de
1 día, o sea exactamente `días × monto`, igual que antes.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.domain.enums import TipoTarifa
from app.core.exceptions import BusinessRuleError


# Bandas ordenadas de mayor a menor: se consumen en este orden.
BLOQUES: list[tuple[TipoTarifa, int]] = [
    (TipoTarifa.MENSUAL, 30),
    (TipoTarifa.SEMANAL, 7),
    (TipoTarifa.DIARIA, 1),
]

_CENTAVO = Decimal("0.01")


def _redondear(valor: Decimal) -> Decimal:
    return valor.quantize(_CENTAVO, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class TarifaInfo:
    id: int
    tipo: TipoTarifa
    monto: Decimal
    vehiculo_id: int | None  # None = no es específica de un vehículo
    categoria_id: int | None = None  # None = no es de categoría (ver D-08)
    # `ambos` | `web` | `mostrador` (migración 074). Ver `_elegir_de_tipo`.
    canal: str = "ambos"


@dataclass(frozen=True)
class BloqueCobrado:
    """Un tramo del alquiler cobrado a una banda: "1 semana", "3 días"."""
    tipo: TipoTarifa
    dias_por_bloque: int
    cantidad: int
    precio_bloque: Decimal  # precio de UN bloque completo
    tarifa_id: int

    @property
    def dias(self) -> int:
        return self.dias_por_bloque * self.cantidad

    @property
    def subtotal(self) -> Decimal:
        return _redondear(self.precio_bloque * Decimal(self.cantidad))


@dataclass(frozen=True)
class CotizacionPorBandas:
    dias: int
    bloques: list[BloqueCobrado]
    total: Decimal
    tarifa_principal: TarifaInfo
    # Un precio por cada día del alquiler. Es lo que consume el motor de
    # calendario, que razona día por día: así el modelo de bloques y el de
    # calendario conviven sin ser dos motores distintos.
    precios_por_dia: list[Decimal]


def calcular_duracion_dias(fecha_inicio: date, fecha_fin: date) -> int:
    """
    Calcula la duración en días enteros (ignora horas).
    Ejemplo: 21/05 → 23/05 = 2 días.
    """
    return (fecha_fin - fecha_inicio).days


def canal_de_origen(origen: str | None) -> str:
    """
    El canal de tarifas que le corresponde a una reserva según su `origen`.

    Existe porque `Reserva.origen` y `Tarifa.canal` son el mismo concepto con
    dos vocabularios: la reserva dice de dónde vino (`web` | `mostrador`) y la
    tarifa dice dónde rige (`ambos` | `web` | `mostrador`). Traducir a mano en
    cada llamador es cómo se cuelan los que se olvidan de traducir — y
    olvidarse acá no da error: cae a `ambos` y cobra el precio del otro canal.

    Cualquier origen desconocido cae a `mostrador`: es el canal donde hay
    alguien mirando el número antes de cobrarlo.
    """
    return "web" if origen == "web" else "mostrador"


def seleccionar_tipo_tarifa(dias: int) -> TipoTarifa:
    """
    Banda a la que pertenece la duración, mirada como un todo.

    Sigue siendo útil para etiquetar un alquiler ("es semanal") y para el
    `tarifa_aplicada_id` que se guarda en la reserva, pero **ya no determina
    el precio por sí sola**: eso lo hace `cotizar_por_bandas`, que puede
    combinar varias bandas en un mismo alquiler.
    """
    if dias < 7:
        return TipoTarifa.DIARIA
    elif dias < 30:
        return TipoTarifa.SEMANAL
    else:
        return TipoTarifa.MENSUAL


def _mejor(candidatas: list[TarifaInfo], canal: str) -> TarifaInfo | None:
    """
    De un grupo de tarifas del mismo alcance, la que rige en este canal.

    **La tarifa del canal pedido le gana a la de `ambos`, y si no hay, se usa
    la de `ambos`.** Esa caída es lo que hace seguro tener canal acá: cargar un
    precio sólo para web no deja al mostrador sin precio ni al revés. Sin ella,
    olvidarse de cargar un canal sería un "no se puede cotizar" — que es
    exactamente la falla que hay que evitar en el fallback del motor.

    A igualdad de canal gana la de id más alto, o sea la cargada más
    recientemente. Igual que en el resto del sistema, el desempate nunca es al
    azar.
    """
    if not candidatas:
        return None
    del_canal = [t for t in candidatas if t.canal == canal]
    if del_canal:
        return max(del_canal, key=lambda t: t.id)
    ambos = [t for t in candidatas if t.canal == "ambos"]
    if ambos:
        return max(ambos, key=lambda t: t.id)
    return None


def _elegir_de_tipo(
    tipo: TipoTarifa,
    tarifas: list[TarifaInfo],
    categoria_id: int | None,
    canal: str = "ambos",
    vehiculo_id: int | None = None,
) -> TarifaInfo | None:
    """
    La tarifa de una banda concreta, aplicando la prioridad de D-08:
    vehículo puntual > categoría > general. Dentro de cada nivel, el canal
    decide (ver `_mejor`), y a igualdad gana la más reciente.

    **Sobre `vehiculo_id`:** antes esta función tomaba *cualquier* tarifa con
    `vehiculo_id is not None`, sin compararla con el vehículo pedido. Funcionaba
    sólo porque el SQL de arriba ya venía filtrado por vehículo; cualquier
    llamador que pasara una lista sin pre-filtrar cotizaba con la tarifa de otro
    auto, en silencio. Ahora se compara acá cuando se informa el vehículo, y el
    comportamiento viejo se conserva cuando no se informa.
    """
    if vehiculo_id is not None:
        especificas = [t for t in tarifas if t.vehiculo_id == vehiculo_id and t.tipo == tipo]
    else:
        especificas = [t for t in tarifas if t.vehiculo_id is not None and t.tipo == tipo]
    elegida = _mejor(especificas, canal)
    if elegida:
        return elegida

    if categoria_id is not None:
        de_categoria = [t for t in tarifas if t.categoria_id == categoria_id and t.tipo == tipo]
        elegida = _mejor(de_categoria, canal)
        if elegida:
            return elegida

    generales = [
        t for t in tarifas
        if t.vehiculo_id is None and t.categoria_id is None and t.tipo == tipo
    ]
    return _mejor(generales, canal)


def seleccionar_tarifa(
    duracion_dias: int,
    tarifas: list[TarifaInfo],
    categoria_id: int | None = None,
    canal: str = "ambos",
    vehiculo_id: int | None = None,
) -> TarifaInfo:
    """
    La tarifa de la banda que corresponde a la duración total.

    Se conserva porque es lo que define la banda "principal" de un alquiler,
    pero **el precio no sale de acá**: ver `cotizar_por_bandas`.
    """
    tipo = seleccionar_tipo_tarifa(duracion_dias)
    elegida = _elegir_de_tipo(tipo, tarifas, categoria_id, canal, vehiculo_id)
    if elegida is None:
        raise BusinessRuleError(
            "tarifa_no_encontrada",
            f"No hay tarifa activa de tipo '{tipo.value}' para una duración de {duracion_dias} días",
        )
    return elegida


def _repartir_en_dias(precio_bloque: Decimal, dias_por_bloque: int) -> list[Decimal]:
    """
    Reparte el precio de un bloque entre sus días, sin perder ni inventar
    centavos: el resto de la división se le suma al último día, así la suma
    del desglose diario es **exactamente** el precio del bloque.

    Sin esto, una semana de $150.000 daría 7 × $21.428,57 = $149.999,99 y el
    total del desglose no coincidiría con el que se cobra — que es la clase de
    diferencia de un centavo que hace que nadie confíe en la pantalla.
    """
    if dias_por_bloque == 1:
        return [_redondear(precio_bloque)]
    base = _redondear(precio_bloque / Decimal(dias_por_bloque))
    dias = [base] * (dias_por_bloque - 1)
    dias.append(_redondear(precio_bloque - base * Decimal(dias_por_bloque - 1)))
    return dias


def cotizar_por_bandas(
    duracion_dias: int,
    tarifas: list[TarifaInfo],
    categoria_id: int | None = None,
    canal: str = "ambos",
    vehiculo_id: int | None = None,
) -> CotizacionPorBandas:
    """
    Descompone el alquiler en bloques y lo cotiza (D-35).

    Consume siempre el bloque más grande disponible: mes, después semana,
    después día. Una banda sin tarifa cargada simplemente se saltea — con
    sólo tarifa diaria, 10 días son 10 bloques de un día.

    **No busca el precio más barato.** Si 6 días sueltos salieran más que una
    semana completa, se cobran los 6 días: proponerle al cliente que alquile
    más tiempo es una decisión comercial, no del cálculo. Esa sugerencia queda
    pendiente de definición (D-35b) y se apoya en este mismo desglose.

    Si sobran días que ninguna banda puede cubrir —porque falta la tarifa
    diaria— levanta `BusinessRuleError` en vez de cotizar de menos.
    """
    if duracion_dias <= 0:
        raise BusinessRuleError(
            "duracion_invalida", "La duración del alquiler debe ser de al menos un día"
        )

    bloques: list[BloqueCobrado] = []
    precios_por_dia: list[Decimal] = []
    restantes = duracion_dias

    for tipo, tamanio in BLOQUES:
        if restantes < tamanio:
            continue
        tarifa = _elegir_de_tipo(tipo, tarifas, categoria_id, canal, vehiculo_id)
        if tarifa is None:
            continue
        cantidad = restantes // tamanio
        bloques.append(BloqueCobrado(
            tipo=tipo,
            dias_por_bloque=tamanio,
            cantidad=cantidad,
            precio_bloque=Decimal(str(tarifa.monto)),
            tarifa_id=tarifa.id,
        ))
        for _ in range(cantidad):
            precios_por_dia.extend(_repartir_en_dias(Decimal(str(tarifa.monto)), tamanio))
        restantes -= cantidad * tamanio

    if restantes > 0 or not bloques:
        faltante = TipoTarifa.DIARIA.value if restantes > 0 else "ninguna"
        raise BusinessRuleError(
            "tarifa_no_encontrada",
            f"No hay tarifa activa para cubrir {restantes or duracion_dias} día(s) "
            f"del alquiler (falta la banda '{faltante}')",
        )

    total = _redondear(sum((b.subtotal for b in bloques), Decimal("0")))

    # La banda "principal" es la del bloque más grande — la que etiqueta el
    # alquiler y la que se guarda en `reserva.tarifa_aplicada_id`.
    principal_id = bloques[0].tarifa_id
    principal = next(t for t in tarifas if t.id == principal_id)

    return CotizacionPorBandas(
        dias=duracion_dias,
        bloques=bloques,
        total=total,
        tarifa_principal=principal,
        precios_por_dia=precios_por_dia,
    )


def calcular_precio_total(
    duracion_dias: int,
    tarifas: list[TarifaInfo],
    categoria_id: int | None = None,
    canal: str = "ambos",
    vehiculo_id: int | None = None,
) -> Decimal:
    """Atajo de `cotizar_por_bandas` cuando sólo interesa el total."""
    return cotizar_por_bandas(duracion_dias, tarifas, categoria_id, canal, vehiculo_id).total
