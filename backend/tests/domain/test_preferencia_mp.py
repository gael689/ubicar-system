"""
Cómo se arma la preferencia de Mercado Pago, del lado del dominio.

Tres decisiones puras que antes vivían implícitas y ahora se pueden probar
sin cuenta, sin red y sin base: hasta cuándo se puede pagar, cuándo conviene
reusar una preferencia ya emitida, y cómo se parte el nombre del cliente.
"""
from datetime import datetime, timedelta

from app.domain.pagos_web import (
    MARGEN_PAGO_EN_CURSO,
    MARGEN_REUSO,
    partir_nombre,
    preferencia_sigue_viva,
    vencimiento_preferencia,
)

AHORA = datetime(2026, 8, 19, 12, 0, 0)


# ─── Hasta cuándo se puede pagar ─────────────────────────────────────────────

def test_la_preferencia_sobrevive_al_hold_por_el_margen():
    """
    No puede morir exactamente con el hold: el que apretó "pagar" en el minuto
    19 está tipeando la tarjeta cuando se vence, y ese pago —que iba a entrar—
    se le cae en la cara.
    """
    vence_hold = AHORA + timedelta(minutes=20)

    assert vencimiento_preferencia(vence_hold) == vence_hold + MARGEN_PAGO_EN_CURSO


def test_sin_hold_no_hay_vencimiento():
    assert vencimiento_preferencia(None) is None


# ─── Cuándo se reusa la preferencia ya emitida ───────────────────────────────

def test_una_preferencia_con_vida_por_delante_se_reusa():
    viva = AHORA + timedelta(minutes=15)

    assert preferencia_sigue_viva(viva, AHORA) is True


def test_una_preferencia_vencida_no_se_reusa():
    """
    El caso real: el cliente apretó "Darme más tiempo". El hold se extendió,
    la preferencia no. Devolverle la vieja hace que Mercado Pago le rechace el
    pago con el auto todavía reservado a su nombre.
    """
    vencida = AHORA - timedelta(minutes=1)

    assert preferencia_sigue_viva(vencida, AHORA) is False


def test_una_preferencia_que_muere_en_segundos_tampoco_se_reusa():
    """El margen existe para no entregar algo que expira leyendo la pantalla."""
    agonizando = AHORA + MARGEN_REUSO - timedelta(seconds=1)

    assert preferencia_sigue_viva(agonizando, AHORA) is False


def test_las_preferencias_viejas_sin_vencimiento_siguen_siendo_validas():
    """
    Las emitidas antes de la migración 071 tienen `vence_en` en NULL, y
    efectivamente no vencen. Tratarlas como muertas obligaría a emitir una
    preferencia nueva a alguien que ya está por pagar.
    """
    assert preferencia_sigue_viva(None, AHORA) is True


# ─── El nombre partido para Mercado Pago ─────────────────────────────────────

def test_nombre_y_apellido_simples():
    assert partir_nombre("Juan Pérez") == ("Juan", "Pérez")


def test_el_resto_va_todo_al_apellido():
    assert partir_nombre("Juan Carlos Pérez López") == ("Juan", "Carlos Pérez López")


def test_un_solo_nombre_deja_el_apellido_vacio():
    """Se manda `name` solo. Es mejor que no mandar nada: MP puntúa con eso."""
    assert partir_nombre("Cher") == ("Cher", "")


def test_los_espacios_de_mas_no_ensucian():
    assert partir_nombre("  Juan   Pérez  ") == ("Juan", "Pérez")


def test_vacio_y_none_no_rompen():
    assert partir_nombre("") == ("", "")
    assert partir_nombre(None) == ("", "")
    assert partir_nombre("   ") == ("", "")
