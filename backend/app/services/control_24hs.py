from datetime import datetime, timedelta

MINUTOS_GRACIA = 40


def calcular_excedente(
    checkout_fecha: str,
    checkout_hora: str,
    fecha_fin_pactada: str,
    hora_fin_pactada: str,
    checkin_fecha: str,
    checkin_hora: str,
    tarifa_diaria: float,
) -> dict:
    fmt = "%Y-%m-%d %H:%M"
    checkout_dt = datetime.strptime(f"{checkout_fecha} {checkout_hora}", fmt)
    fin_pactado_dt = datetime.strptime(f"{fecha_fin_pactada} {hora_fin_pactada}", fmt)
    checkin_dt = datetime.strptime(f"{checkin_fecha} {checkin_hora}", fmt)

    # Vencimiento real = checkout + duración acordada
    duracion_acordada = fin_pactado_dt - checkout_dt
    vencimiento_real = checkout_dt + duracion_acordada
    limite_gracia = vencimiento_real + timedelta(minutes=MINUTOS_GRACIA)

    if checkin_dt <= limite_gracia:
        return {"horas_excedente": 0, "cargo_excedente": 0}

    horas_excedente = (checkin_dt - vencimiento_real).total_seconds() / 3600
    cargo_por_hora = tarifa_diaria / 24
    cargo_excedente = round(horas_excedente * cargo_por_hora, 2)

    return {
        "horas_excedente": round(horas_excedente, 2),
        "cargo_excedente": cargo_excedente,
    }
