from __future__ import annotations
"""
Motor de precios por calendario (Fase 5, ítem 57 — plan §7.2).

Lógica pura, sin SQLAlchemy ni FastAPI: entra una lista de reglas ya
cargadas y sale el desglose. Eso es lo que la hace testeable de verdad y lo
que permite reusarla desde el sistema interno, el cotizador y la web sin
tres implementaciones distintas.

**La idea central es una sola: una única fuente de precios.**

    Para cada día del rango:
      precio = la regla de MAYOR PRIORIDAD que cubre ese día
               (si ninguna lo cubre → la tarifa por banda de siempre)
      ↓
    Subtotal = Σ precios diarios
      ↓
    − Descuento por duración
      ↓
    = TOTAL

`domain/tarifas.py` (precio por banda diaria/semanal/mensual, sin fechas) no
desaparece ni queda como un camino paralelo: pasa a ser **el caso particular
de prioridad más baja** de este motor. Un sistema sin ninguna regla de
calendario cargada sigue cotizando exactamente igual que antes — que es lo
que permite que esto entre sin migrar nada ni romper las reservas que ya
existen.

Sobre qué días se cobran: el rango es [fecha_inicio, fecha_fin), o sea el día
de devolución NO se cobra. Un alquiler del 21/05 al 23/05 son 2 días (21 y
22), consistente con `tarifas.calcular_duracion_dias`. Si el desglose
cobrara el día de devolución, este motor daría un total distinto al que el
sistema viene calculando desde siempre.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from app.core.exceptions import BusinessRuleError


CENTAVO = Decimal("0.01")


def _redondear(monto: Decimal) -> Decimal:
    return monto.quantize(CENTAVO, rounding=ROUND_HALF_UP)


# ─── Entrada ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ReglaPrecio:
    """
    Una fila de `tarifas_calendario`, con el rango ya resuelto.

    Si la regla apuntaba a una fecha especial, quien la construye (el
    service) ya reemplazó `fecha_desde`/`fecha_hasta` por las de la fecha
    especial. El dominio no sabe que las fechas especiales existen: recibe
    rangos concretos y nada más.
    """
    id: int
    nombre: str
    precio_dia: Decimal
    fecha_desde: date
    fecha_hasta: date               # inclusivo: el rango de vigencia de la regla
    prioridad: int = 0
    categoria_id: int | None = None
    vehiculo_id: int | None = None
    dias_semana: list[int] | None = None   # ISO 1=lunes..7=domingo; None = todos
    min_dias: int | None = None
    max_dias: int | None = None
    canal: str = "ambos"            # ambos | web | mostrador
    es_promocional: bool = False
    precio_referencia: Decimal | None = None
    etiqueta_promo: str | None = None

    @property
    def especificidad(self) -> int:
        """Vehículo puntual (2) > categoría (1) > general (0). Sólo desempata."""
        if self.vehiculo_id is not None:
            return 2
        if self.categoria_id is not None:
            return 1
        return 0

    @property
    def amplitud_dias(self) -> int:
        """Largo del rango. Entre dos reglas empatadas, la más corta es la más específica."""
        return (self.fecha_hasta - self.fecha_desde).days


@dataclass(frozen=True)
class DescuentoDuracionInfo:
    id: int
    nombre: str
    dias_desde: int
    porcentaje: Decimal
    dias_hasta: int | None = None
    categoria_id: int | None = None


@dataclass(frozen=True)
class AdicionalSolicitado:
    """
    Un adicional a cotizar, con su precio ya resuelto por quien llama.

    El dominio no sabe de dónde salió el precio: al cotizar sale de la tabla
    `adicionales`, pero al recotizar una reserva vieja sale del precio
    congelado en `reserva_adicionales`. Que el precio entre como dato es lo
    que permite las dos cosas sin duplicar la fórmula.
    """
    id: int
    nombre: str
    precio_unitario: Decimal
    unidad_cobro: str = "por_dia"   # por_dia | unico
    cantidad: int = 1
    grupo: str = "extra"
    # D-53: coberturas con precio como % del alquiler del vehículo, no un
    # monto fijo. Cuando viene informado, `PrecioService` ya resolvió
    # `precio_unitario = subtotal_vehiculo * porcentaje/100` antes de llegar
    # acá — el dominio sólo lo necesita para no volver a multiplicar por los
    # días si `unidad_cobro == "por_dia"` viene mal cargado en el adicional.
    es_porcentaje: bool = False


@dataclass(frozen=True)
class AdicionalCotizado:
    id: int
    nombre: str
    precio_unitario: Decimal
    unidad_cobro: str
    cantidad: int
    subtotal: Decimal
    grupo: str = "extra"


# ─── Salida ───────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DiaCotizado:
    """
    Un día del alquiler con su precio y de dónde salió.

    El `origen` y el `regla_nombre` no son decoración: son lo que permite
    contestar "¿por qué este día sale $95.000?" sin abrir la base. Es la
    diferencia entre un motor debuggeable y una caja negra que factura mal.
    """
    fecha: date
    precio: Decimal
    origen: str                     # "calendario" | "banda"
    regla_id: int | None = None
    regla_nombre: str | None = None
    es_promocional: bool = False
    precio_referencia: Decimal | None = None
    etiqueta_promo: str | None = None
    # **Por qué ganó esta regla y no otra.** El `origen` decía de dónde salió
    # el precio, pero no cuál fue el criterio del desempate — y cuando dos
    # reglas compiten por el mismo día, esa es justamente la pregunta: la
    # única forma de saberlo era hacer una reserva de prueba.
    #
    # `None` cuando no hubo competencia: una sola candidata, o el precio salió
    # de la banda. Ver `MOTIVO_*` y `resolver_regla_dia`.
    motivo: str | None = None
    # Cuántas reglas se disputaban el día. 1 = ganó por ser la única.
    candidatas: int = 0


# Los cuatro criterios de desempate, en el orden en que se aplican. Son los
# mismos que la clave de `max()` de `resolver_regla_dia`: si esa tupla cambia,
# esto tiene que cambiar con ella.
MOTIVO_UNICA = "unica"
MOTIVO_PRIORIDAD = "prioridad"
MOTIVO_ESPECIFICIDAD = "especificidad"
MOTIVO_RANGO = "rango_mas_corto"
MOTIVO_RECIENTE = "mas_reciente"


@dataclass(frozen=True)
class Cotizacion:
    dias: list[DiaCotizado]
    subtotal: Decimal
    descuento_porcentaje: Decimal
    descuento_monto: Decimal
    total: Decimal
    duracion_dias: int
    # Alquiler del vehículo ya con el descuento por duración aplicado, antes
    # de sumar adicionales. Es la línea que el cliente reconoce como "el auto".
    subtotal_vehiculo: Decimal = Decimal("0")
    adicionales: list[AdicionalCotizado] = field(default_factory=list)
    total_adicionales: Decimal = Decimal("0")
    descuento_id: int | None = None
    descuento_nombre: str | None = None
    # Total a precio de lista: lo que costaría sin ninguna promo. Sirve para
    # el "antes $X, ahora $Y" de la web. Igual al subtotal si no hubo promos.
    total_referencia: Decimal | None = None
    promociones: list[str] = field(default_factory=list)

    @property
    def precio_dia_promedio(self) -> Decimal:
        """
        Promedio por día del **vehículo**, sin adicionales. Es el número que
        la web muestra como "desde $X por día": meterle el seguro y la silla
        de bebé lo volvería incomparable entre categorías.
        """
        if self.duracion_dias == 0:
            return Decimal("0")
        return _redondear(self.subtotal_vehiculo / Decimal(self.duracion_dias))

    @property
    def tiene_promocion(self) -> bool:
        return any(d.es_promocional for d in self.dias)


# ─── Resolución día por día ───────────────────────────────────────────────────

def regla_aplica(
    regla: ReglaPrecio,
    dia: date,
    duracion_dias: int,
    categoria_id: int | None,
    vehiculo_id: int | None,
    canal: str,
) -> bool:
    """
    ¿Esta regla puede fijar el precio de este día para este alquiler?

    Todas las condiciones son excluyentes: alcanza con que una falle.
    """
    if not (regla.fecha_desde <= dia <= regla.fecha_hasta):
        return False

    if regla.dias_semana and dia.isoweekday() not in regla.dias_semana:
        return False

    # Las restricciones de duración miran el alquiler completo, no el día:
    # "precio de fin de semana largo, mínimo 3 días" se cumple o no se cumple
    # para toda la cotización.
    if regla.min_dias is not None and duracion_dias < regla.min_dias:
        return False
    if regla.max_dias is not None and duracion_dias > regla.max_dias:
        return False

    if regla.canal != "ambos" and regla.canal != canal:
        return False

    # Una regla de vehículo puntual sólo aplica a ese vehículo; una de
    # categoría, sólo a esa categoría. Una general (ambos NULL) aplica a todo.
    if regla.vehiculo_id is not None and regla.vehiculo_id != vehiculo_id:
        return False
    if regla.categoria_id is not None and regla.categoria_id != categoria_id:
        return False

    return True


def resolver_regla_dia(
    dia: date,
    reglas: list[ReglaPrecio],
    duracion_dias: int,
    categoria_id: int | None = None,
    vehiculo_id: int | None = None,
    canal: str = "mostrador",
) -> ReglaPrecio | None:
    """
    Devuelve la regla que gobierna este día, o None si ninguna lo cubre.

    Orden de desempate, de mayor a menor peso:

    1. **`prioridad` más alta.** Es el eje explícito, el que el dueño carga a
       mano y el único que se ve en la pantalla. Manda sobre todo lo demás a
       propósito: si alguien pone la promo de Navidad en 20, quiere que gane,
       aunque exista un precio cargado para ese vehículo puntual. Para sacar
       un vehículo de la promo se le carga su regla con prioridad ≥ 20 — es
       una acción explícita, no un efecto lateral.
    2. **Más específica**: vehículo > categoría > general.
    3. **Rango más corto.** "Semana de Navidad" le gana a "temporada alta",
       que es el mismo criterio que ya usa el calendario de fechas especiales.
    4. **Id más alto** — la cargada más recientemente. Igual que
       `tarifas.seleccionar_tarifa`. Nunca devuelve empate al azar.
    """
    candidatas = [
        r for r in reglas
        if regla_aplica(r, dia, duracion_dias, categoria_id, vehiculo_id, canal)
    ]
    if not candidatas:
        return None
    return max(
        candidatas,
        key=lambda r: (r.prioridad, r.especificidad, -r.amplitud_dias, r.id),
    )


def explicar_regla_dia(
    dia: date,
    reglas: list[ReglaPrecio],
    duracion_dias: int,
    categoria_id: int | None = None,
    vehiculo_id: int | None = None,
    canal: str = "mostrador",
) -> tuple[ReglaPrecio | None, str | None, int]:
    """
    Lo mismo que `resolver_regla_dia`, pero además **dice por qué ganó**.

    Devuelve `(regla, motivo, cuántas competían)`.

    El motivo se deduce comparando la ganadora contra la segunda: se recorre la
    clave de desempate en orden y se informa **el primer criterio que las
    separó**. Si ganó por prioridad, decir además que es más específica sería
    ruido — la prioridad ya la había definido.

    Existe aparte de `resolver_regla_dia` para no cargar el camino caliente del
    cálculo con trabajo que sólo le sirve al simulador: cotizar una reserva no
    necesita saber por qué, sólo cuánto.
    """
    candidatas = [
        r for r in reglas
        if regla_aplica(r, dia, duracion_dias, categoria_id, vehiculo_id, canal)
    ]
    if not candidatas:
        return None, None, 0

    clave = lambda r: (r.prioridad, r.especificidad, -r.amplitud_dias, r.id)
    ordenadas = sorted(candidatas, key=clave, reverse=True)
    ganadora = ordenadas[0]
    if len(ordenadas) == 1:
        return ganadora, MOTIVO_UNICA, 1

    segunda = ordenadas[1]
    if ganadora.prioridad != segunda.prioridad:
        motivo = MOTIVO_PRIORIDAD
    elif ganadora.especificidad != segunda.especificidad:
        motivo = MOTIVO_ESPECIFICIDAD
    elif ganadora.amplitud_dias != segunda.amplitud_dias:
        motivo = MOTIVO_RANGO
    else:
        motivo = MOTIVO_RECIENTE
    return ganadora, motivo, len(candidatas)


def cotizar_adicionales(
    adicionales: list[AdicionalSolicitado],
    duracion_dias: int,
) -> tuple[list[AdicionalCotizado], Decimal]:
    """
    Resuelve el costo de cada adicional según su unidad de cobro.

    - `por_dia`: precio × cantidad × días del alquiler (un seguro se paga
      todos los días que el auto está afuera).
    - `unico`: precio × cantidad, sin importar la duración (un portaequipaje
      se cobra una vez).

    **Los adicionales quedan fuera del descuento por duración a propósito**:
    ese descuento es una bonificación sobre el alquiler del vehículo, y
    aplicarlo también al seguro regalaría cobertura sin que nadie lo haya
    decidido. Es el orden del pipeline del plan §7.2.
    """
    cotizados: list[AdicionalCotizado] = []
    total = Decimal("0")

    for a in adicionales:
        if a.cantidad < 1:
            raise BusinessRuleError(
                "cantidad_invalida",
                f"La cantidad de '{a.nombre}' debe ser al menos 1",
            )
        precio = Decimal(str(a.precio_unitario))
        multiplicador = Decimal(a.cantidad)
        # Un adicional por porcentaje ya llega con `precio_unitario` resuelto
        # como el monto total sobre el alquiler completo (D-53): multiplicar
        # otra vez por los días lo cobraría al cuadrado.
        if a.unidad_cobro == "por_dia" and not a.es_porcentaje:
            multiplicador *= Decimal(duracion_dias)
        subtotal = _redondear(precio * multiplicador)

        cotizados.append(AdicionalCotizado(
            id=a.id,
            nombre=a.nombre,
            precio_unitario=precio,
            unidad_cobro=a.unidad_cobro,
            cantidad=a.cantidad,
            subtotal=subtotal,
            grupo=a.grupo,
        ))
        total += subtotal

    return cotizados, _redondear(total)


def validar_seleccion_adicionales(adicionales: list[AdicionalSolicitado]) -> None:
    """
    Las coberturas son excluyentes: se elige una sola.

    Se valida acá y no sólo en la UI porque la web es pública y hostil — un
    request armado a mano con dos coberturas dejaría una reserva cobrando dos
    seguros del mismo auto.
    """
    coberturas = [a for a in adicionales if a.grupo == "cobertura"]
    if len(coberturas) > 1:
        raise BusinessRuleError(
            "coberturas_excluyentes",
            "Sólo se puede elegir una cobertura: "
            + ", ".join(c.nombre for c in coberturas),
        )


def aplica_descuento_por_duracion(canal: str, porcentaje_anticipo: int | None) -> bool:
    """
    ¿Corresponde aplicar el descuento por duración?

    **En el mostrador, siempre.** Ahí el precio se conversa y la forma de pago
    se acuerda en el momento; el descuento por alquiler largo es parte de la
    lista.

    **En la web, sólo si el cliente paga el 100% por adelantado.** Deja de ser
    un precio de lista y pasa a ser la contraprestación por cobrar todo hoy: el
    negocio resigna margen a cambio de no financiar el alquiler ni quedar
    expuesto a la seña que no alcanza. Con 30% o 50% de anticipo se cobra el
    precio de lista, sin descuento por duración.

    `None` —que es el caso del paso 1, cuando todavía no eligió cuánto adelanta—
    se trata como "no corresponde": la grilla muestra el precio de lista y el
    descuento aparece como una mejora al elegir el pago total. **Mostrarlo al
    revés sería peor**: un precio que sube cuando el cliente elige pagar menos
    se lee como un recargo escondido, aunque la cuenta sea la misma.
    """
    if canal != "web":
        return True
    return porcentaje_anticipo == 100


def seleccionar_descuento(
    duracion_dias: int,
    descuentos: list[DescuentoDuracionInfo],
    categoria_id: int | None = None,
) -> DescuentoDuracionInfo | None:
    """
    Descuento por duración aplicable. Si hay varios, gana el de mayor
    porcentaje (el cliente no puede salir perdiendo por un solapamiento mal
    cargado), y a igualdad, el de la categoría por sobre el general.
    """
    aplicables = [
        d for d in descuentos
        if duracion_dias >= d.dias_desde
        and (d.dias_hasta is None or duracion_dias <= d.dias_hasta)
        and (d.categoria_id is None or d.categoria_id == categoria_id)
    ]
    if not aplicables:
        return None
    return max(aplicables, key=lambda d: (d.porcentaje, d.categoria_id is not None, d.id))


# ─── Cotización completa ──────────────────────────────────────────────────────

def cotizar(
    fecha_inicio: date,
    fecha_fin: date,
    reglas: list[ReglaPrecio],
    precio_fallback: Decimal | list[Decimal] | None = None,
    descuentos: list[DescuentoDuracionInfo] | None = None,
    categoria_id: int | None = None,
    vehiculo_id: int | None = None,
    canal: str = "mostrador",
    nombre_fallback: str = "Tarifa por duración",
    adicionales: list[AdicionalSolicitado] | None = None,
    porcentaje_anticipo: int | None = None,
) -> Cotizacion:
    """
    Cotiza un alquiler resolviendo el precio día por día.

    `precio_fallback` es el precio por día de la tarifa por banda
    (`domain/tarifas.py`), usado para los días que ninguna regla de calendario
    cubre. Acepta dos formas:

    - **una lista** con un precio por cada día del alquiler — es lo que
      devuelve `cotizar_por_bandas` desde D-35, donde el precio de un día
      depende del bloque al que pertenece (los 7 primeros días valen 1/7 de la
      semana, los sueltos valen el día completo);
    - **un único Decimal**, que aplica a todos los días. Lo usa la vista de
      calendario, que muestra "cuánto sale UN día" sin una duración concreta.

    Puede ser None si no hay tarifa configurada: en ese
    caso, si además falta alguna regla, se levanta `BusinessRuleError` en vez
    de cotizar un día en $0 — cobrar de menos en silencio es peor que fallar.

    Args:
        fecha_inicio: primer día del alquiler (se cobra).
        fecha_fin: día de devolución (NO se cobra).
        canal: "web" o "mostrador" — filtra las reglas por canal.
    """
    duracion_dias = (fecha_fin - fecha_inicio).days
    if duracion_dias <= 0:
        raise BusinessRuleError(
            "rango_invalido",
            "La fecha de fin debe ser posterior a la de inicio",
        )

    dias: list[DiaCotizado] = []
    subtotal = Decimal("0")
    referencia = Decimal("0")
    promociones: list[str] = []

    for offset in range(duracion_dias):
        dia = fecha_inicio + timedelta(days=offset)
        # Se usa la versión que además explica el desempate: el costo extra es
        # ordenar las candidatas del día, y a cambio el desglose puede decir
        # **por qué** ganó cada regla en vez de sólo cuál.
        regla, motivo, n_candidatas = explicar_regla_dia(
            dia, reglas, duracion_dias, categoria_id, vehiculo_id, canal
        )

        if regla is not None:
            precio = Decimal(str(regla.precio_dia))
            # El precio "tachado" sólo tiene sentido si es mayor al que se
            # cobra. Si viene mal cargado, se ignora en vez de mostrarle al
            # cliente un descuento negativo.
            ref = regla.precio_referencia
            precio_ref = Decimal(str(ref)) if ref is not None and Decimal(str(ref)) > precio else None
            dias.append(DiaCotizado(
                fecha=dia,
                precio=precio,
                origen="calendario",
                regla_id=regla.id,
                regla_nombre=regla.nombre,
                es_promocional=regla.es_promocional,
                precio_referencia=precio_ref,
                etiqueta_promo=regla.etiqueta_promo if regla.es_promocional else None,
                motivo=motivo,
                candidatas=n_candidatas,
            ))
            referencia += precio_ref if precio_ref is not None else precio
            if regla.es_promocional and regla.etiqueta_promo and regla.etiqueta_promo not in promociones:
                promociones.append(regla.etiqueta_promo)
        else:
            # El fallback puede venir como un precio por día del alquiler
            # (bloques, D-35) o como un único valor para todos.
            if isinstance(precio_fallback, list):
                del_dia = precio_fallback[offset] if offset < len(precio_fallback) else None
            else:
                del_dia = precio_fallback
            if del_dia is None:
                raise BusinessRuleError(
                    "sin_precio_para_el_dia",
                    f"No hay ninguna regla de precio ni tarifa configurada para el {dia.isoformat()}",
                )
            precio = Decimal(str(del_dia))
            dias.append(DiaCotizado(
                fecha=dia, precio=precio, origen="banda", regla_nombre=nombre_fallback,
            ))
            referencia += precio

        subtotal += precio

    # En la web el descuento por duración se gana pagando el 100% por
    # adelantado; en el mostrador va siempre. Ver `aplica_descuento_por_duracion`.
    descuento = (
        seleccionar_descuento(duracion_dias, descuentos or [], categoria_id)
        if aplica_descuento_por_duracion(canal, porcentaje_anticipo)
        else None
    )
    porcentaje = Decimal(str(descuento.porcentaje)) if descuento else Decimal("0")
    descuento_monto = _redondear(subtotal * porcentaje / Decimal("100"))
    subtotal_vehiculo = _redondear(subtotal - descuento_monto)

    # **Acá iba el recargo por franja etaria (D-38).** Se retiró: la edad ya no
    # modifica el precio, sólo decide si se puede alquilar por la web
    # (`alquiler.edad_minima`, D-51). El orden del pipeline queda:
    #
    #     días → subtotal → descuento por duración → subtotal_vehiculo
    #                                              → adicionales aparte
    # Los adicionales se suman DESPUÉS del descuento por duración (plan §7.2).
    solicitados = adicionales or []
    validar_seleccion_adicionales(solicitados)
    adicionales_cotizados, total_adicionales = cotizar_adicionales(
        solicitados, duracion_dias
    )

    total = _redondear(subtotal_vehiculo + total_adicionales)

    return Cotizacion(
        dias=dias,
        subtotal=_redondear(subtotal),
        descuento_porcentaje=porcentaje,
        descuento_monto=descuento_monto,
        subtotal_vehiculo=subtotal_vehiculo,
        adicionales=adicionales_cotizados,
        total_adicionales=total_adicionales,
        total=total,
        duracion_dias=duracion_dias,
        descuento_id=descuento.id if descuento else None,
        descuento_nombre=descuento.nombre if descuento else None,
        total_referencia=_redondear(referencia),
        promociones=promociones,
    )
