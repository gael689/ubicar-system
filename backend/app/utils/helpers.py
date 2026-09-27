from datetime import datetime, date


def calcular_dias(fecha_inicio: str, fecha_fin: str) -> int:
    fmt = "%Y-%m-%d"
    inicio = datetime.strptime(fecha_inicio, fmt).date()
    fin = datetime.strptime(fecha_fin, fmt).date()
    return max((fin - inicio).days, 1)


def determinar_tipo_tarifa(dias: int) -> str:
    if dias >= 30:
        return "mensual"
    if dias >= 7:
        return "semanal"
    return "diaria"


def fecha_hoy_argentina() -> str:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).strftime("%Y-%m-%d")


def pesos_ar(monto, simbolo: str = "$") -> str:
    """Un monto como se lee en Argentina: `150000` → `$150.000`, `1234.5` → `$1.234,50`.

    El formato de Python (`f"{x:,.2f}"`) escribe `150,000.00`, al revés de como
    se lee acá: coma de miles y punto decimal. En un aviso o en un PDF eso se
    confunde ("¿$ 20.00 son veinte pesos o veinte mil?"). Los centavos sólo se
    escriben si existen.
    """
    from decimal import Decimal

    if monto is None:
        return "—"
    d = Decimal(str(monto)).quantize(Decimal("0.01"))
    texto = f"{d:,.2f}" if d != d.to_integral_value() else f"{d:,.0f}"
    return simbolo + texto.replace(",", "@").replace(".", ",").replace("@", ".")
