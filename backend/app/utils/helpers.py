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
