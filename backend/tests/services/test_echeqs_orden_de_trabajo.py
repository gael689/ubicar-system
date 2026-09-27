"""
La lista de echeqs sale en orden de trabajo, no sólo por fecha de cobro.

Pedido del mostrador (27/09): ordenar por `fecha_cobro` mezclaba cheques
cobrados hace meses con los que vencen mañana, y los "pendientes de completar"
—los que piden una acción— quedaban perdidos. Primero lo abierto, por estado;
adentro, por vencimiento, los sin fecha al final.
"""
from datetime import date

from app.models.echeq import Echeq

API = "/api/v1"


def _echeq(db, **datos) -> Echeq:
    base = dict(
        tipo="recibido", monto=1000, fecha_emision=date(2026, 9, 1),
        contraparte="X", banco="Galicia", numero_cheque="1", estado="en_cartera",
        fecha_cobro=date(2026, 10, 1),
    )
    base.update(datos)
    e = Echeq(**base)
    db.add(e)
    db.flush()
    return e


def test_orden_por_estado_y_vencimiento(client, db):
    cobrado = _echeq(db, estado="cobrado", fecha_cobro=date(2026, 8, 1), contraparte="cobrado")
    endosado = _echeq(db, estado="endosado", contraparte="endosado")
    depositado = _echeq(db, estado="depositado", contraparte="depositado")
    cartera_tarde = _echeq(db, fecha_cobro=date(2026, 11, 1), contraparte="cartera_tarde")
    cartera_pronto = _echeq(db, fecha_cobro=date(2026, 9, 30), contraparte="cartera_pronto")
    incompleto = _echeq(db, banco=None, fecha_cobro=None, contraparte="incompleto")
    rechazado = _echeq(db, estado="rechazado", contraparte="rechazado")

    r = client.get(f"{API}/echeqs")
    assert r.status_code == 200
    orden = [e["contraparte"] for e in r.json()["data"]]

    assert orden[:5] == [
        incompleto.contraparte,
        cartera_pronto.contraparte,
        cartera_tarde.contraparte,
        depositado.contraparte,
        endosado.contraparte,
    ]
    assert set(orden[5:]) == {cobrado.contraparte, rechazado.contraparte}


def test_sin_fecha_de_cobro_va_al_final_de_su_grupo(client, db):
    # Un cerrado sin fecha no sube por encima de uno con fecha.
    _echeq(db, estado="cobrado", fecha_cobro=None, contraparte="sin_fecha")
    _echeq(db, estado="cobrado", fecha_cobro=date(2026, 9, 1), contraparte="con_fecha")

    orden = [e["contraparte"] for e in client.get(f"{API}/echeqs").json()["data"]]
    assert orden == ["con_fecha", "sin_fecha"]


def test_se_puede_crear_sin_banco_ni_numero(client, db):
    """Queda "pendiente de completar"; la fecha de cobro sí es obligatoria."""
    r = client.post(f"{API}/echeqs", json={
        "tipo": "emitido", "monto": 5000, "fecha_emision": "2026-09-27",
        "fecha_cobro": "2026-10-27", "contraparte": "Proveedor",
    })
    assert r.status_code == 201, r.text
    assert r.json()["data"]["datos_completos"] is False

    r = client.post(f"{API}/echeqs", json={
        "tipo": "emitido", "monto": 5000, "fecha_emision": "2026-09-27",
        "contraparte": "Proveedor",
    })
    assert r.status_code == 422
