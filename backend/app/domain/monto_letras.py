"""
Conversión de un monto a su expresión en letras (español, moneda local),
para el texto legal del recibo ("Son pesos: ...").
"""
from decimal import Decimal, ROUND_HALF_UP

_UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"]
_DIECIS = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"]
_VEINTIS = ["veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
            "veintiséis", "veintisiete", "veintiocho", "veintinueve"]
_DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
_CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
             "seiscientos", "setecientos", "ochocientos", "novecientos"]


def _tres_digitos(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "cien"
    c, resto = divmod(n, 100)
    partes = []
    if c:
        partes.append(_CENTENAS[c])
    if resto:
        if resto < 10:
            partes.append(_UNIDADES[resto])
        elif resto < 20:
            partes.append(_DIECIS[resto - 10])
        elif resto < 30:
            partes.append(_VEINTIS[resto - 20])
        else:
            d, u = divmod(resto, 10)
            partes.append(f"{_DECENAS[d]} y {_UNIDADES[u]}" if u else _DECENAS[d])
    return " ".join(partes)


def _entero_a_letras(n: int) -> str:
    if n == 0:
        return "cero"

    millones, resto = divmod(n, 1_000_000)
    miles, unidades = divmod(resto, 1000)

    partes = []
    if millones:
        partes.append("un millón" if millones == 1 else f"{_entero_a_letras(millones)} millones")
    if miles:
        partes.append("mil" if miles == 1 else f"{_tres_digitos(miles)} mil")
    if unidades:
        partes.append(_tres_digitos(unidades))

    return " ".join(partes)


def monto_a_letras(monto: Decimal, moneda: str = "pesos") -> str:
    """
    Formato de recibo: "Pesos quince mil doscientos cincuenta con 30 centavos".
    Sin centavos, no se menciona la parte decimal (antes decía "con 00/100",
    una notación de cheque que confundía más de lo que aclaraba).
    """
    monto = Decimal(str(monto)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    entero = int(monto)
    centavos = int((monto - entero) * 100)
    base = f"{moneda.capitalize()} {_entero_a_letras(entero)}"
    if centavos == 0:
        return base
    return f"{base} con {centavos} centavo{'s' if centavos != 1 else ''}"
