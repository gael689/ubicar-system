"""
Dar de baja un vehículo pide el motivo, y el motivo queda.

Pedido del cliente (27/09): la baja era un "¿seguro?" sin más, y meses
después nadie sabía si ese auto inactivo se vendió, se chocó o se lo robaron.
Ahora el motivo es obligatorio en los dos caminos (DELETE y /inactivar), se
guarda con la fecha, queda en la auditoría y se borra al reactivar.
"""
from datetime import date

from app.models.auditoria import Auditoria

API = "/api/v1"


def test_sin_motivo_no_se_da_de_baja(client, db, vehiculo):
    r = client.request("DELETE", f"{API}/vehiculos/{vehiculo.id}")
    assert r.status_code == 422
    db.refresh(vehiculo)
    assert vehiculo.activo is True

    r = client.request("DELETE", f"{API}/vehiculos/{vehiculo.id}", json={"motivo": "   "})
    assert r.status_code == 422


def test_con_motivo_guarda_motivo_fecha_y_auditoria(client, db, vehiculo):
    r = client.request("DELETE", f"{API}/vehiculos/{vehiculo.id}", json={"motivo": "Vendido"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["activo"] is False
    assert data["motivo_baja"] == "Vendido"
    assert data["fecha_baja"] == date.today().isoformat()

    aud = db.query(Auditoria).filter_by(accion="baja_vehiculo", entidad_id=vehiculo.id).one()
    assert "Vendido" in aud.descripcion


def test_inactivar_forzado_tambien_pide_motivo(client, db, vehiculo):
    r = client.patch(f"{API}/vehiculos/{vehiculo.id}/inactivar", json={"confirmacion": True})
    assert r.status_code == 422

    r = client.patch(
        f"{API}/vehiculos/{vehiculo.id}/inactivar",
        json={"confirmacion": True, "motivo": "Robo"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["motivo_baja"] == "Robo"


def test_reactivar_limpia_el_motivo(client, db, vehiculo):
    client.request("DELETE", f"{API}/vehiculos/{vehiculo.id}", json={"motivo": "Siniestro / destrucción total"})

    r = client.post(f"{API}/vehiculos/{vehiculo.id}/reactivar")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["activo"] is True
    assert data["motivo_baja"] is None
    assert data["fecha_baja"] is None


def test_dar_de_baja_uno_ya_inactivo_no_pide_nada(client, db, vehiculo):
    """Idempotente, como antes: no pisa el motivo original."""
    client.request("DELETE", f"{API}/vehiculos/{vehiculo.id}", json={"motivo": "Vendido"})
    r = client.request("DELETE", f"{API}/vehiculos/{vehiculo.id}")
    assert r.status_code == 200
    assert r.json()["data"]["motivo_baja"] == "Vendido"
