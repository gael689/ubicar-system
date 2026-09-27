"""
Entregar el auto sin contrato firmado no pide motivo, pero deja la marca.

Pedido del mostrador (27/09): la pregunta *"¿El cliente ya firmó el
contrato?"* en la entrega frenaba cada salida para escribir siempre lo mismo.
Se sacó de la pantalla y el backend dejó de exigir `motivo_sin_contrato`.

Lo que **no** se pierde es el rastro: `entregado_sin_contrato` sigue en True y
la advertencia sigue saliendo, que es lo que muestra la ficha y el listado
hasta que el contrato se firme (D-34).
"""
from datetime import date, time

from app.services.alquiler_service import AlquilerService


def _entregar(db, reserva, vehiculo, usuario, **extra):
    alquiler, warnings = AlquilerService(db).checkout(
        reserva_id=reserva.id,
        checkout_fecha=date(2026, 9, 1),
        checkout_hora=time(10, 0),
        checkout_km=vehiculo.km_actual,
        checkout_combustible=100,
        checkout_descripcion=None,
        usuario_id=usuario.id,
        **extra,
    )
    db.flush()
    return alquiler, warnings


def test_sin_motivo_se_entrega_igual_y_queda_marcado(db, usuario, vehiculo, hacer_reserva):
    reserva = hacer_reserva()

    alquiler, warnings = _entregar(db, reserva, vehiculo, usuario)

    assert alquiler.entregado_sin_contrato is True
    assert alquiler.motivo_sin_contrato is None
    assert any(w["tipo"] == "contrato_no_firmado" for w in warnings)


def test_un_motivo_vacio_no_se_guarda_como_texto(db, usuario, vehiculo, hacer_reserva):
    reserva = hacer_reserva()

    alquiler, _ = _entregar(db, reserva, vehiculo, usuario, motivo_sin_contrato="   ")

    assert alquiler.entregado_sin_contrato is True
    assert alquiler.motivo_sin_contrato is None


def test_si_mandan_motivo_se_guarda(db, usuario, vehiculo, hacer_reserva):
    reserva = hacer_reserva()

    alquiler, _ = _entregar(db, reserva, vehiculo, usuario, motivo_sin_contrato="Se firma al volver")

    assert alquiler.motivo_sin_contrato == "Se firma al volver"
