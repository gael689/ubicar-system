"""
Un motivo vacío no entra por API.

`PLAN_DINERO.md` §1.5.c: `AnularRequest.motivo` no tenía validator y
`anular_movimiento` no chequeaba `motivo.strip()` —a diferencia de
`editar_vencimiento`, que sí—, así que un motivo vacío quedaba escrito en el
concepto del contra-asiento y en la auditoría. Lo mismo con el movimiento
manual: `concepto: str` alcanzaba para Pydantic y `""` pasaba igual.

El único freno era el frontend (`CuentaCorrienteTab.tsx`), o sea que un POST
directo entraba sin resistencia. Y sin roles que restrinjan quién anula un
asiento, **el motivo es el control**.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.services.cuenta_corriente_service import CuentaCorrienteService

API = "/api/v1"


@pytest.fixture()
def movimiento(db, cliente, usuario):
    svc = CuentaCorrienteService(db)
    mov = svc.registrar_movimiento(
        cliente_id=cliente.id, tipo="debito", concepto="Alquiler #1 — checkout",
        monto=Decimal("100000"), fecha=date(2026, 9, 1), creado_por=usuario.id,
    )
    db.flush()
    return mov


class TestAnularMovimiento:
    @pytest.mark.parametrize("motivo", ["", "   ", "\n\t "])
    def test_sin_motivo_real_devuelve_422(self, client, movimiento, motivo):
        r = client.post(
            f"{API}/cuentas-corrientes/movimientos/{movimiento.id}/anular",
            json={"motivo": motivo},
        )
        assert r.status_code == 422

    def test_con_motivo_anula(self, client, movimiento):
        r = client.post(
            f"{API}/cuentas-corrientes/movimientos/{movimiento.id}/anular",
            json={"motivo": "se cargó el alquiler equivocado"},
        )
        assert r.status_code == 200
        assert movimiento.anulado is True

    def test_el_service_tambien_lo_corta(self, db, movimiento, usuario):
        """No sólo el router: quien llame al service desde adentro también."""
        with pytest.raises(ValueError):
            CuentaCorrienteService(db).anular_movimiento(movimiento.id, "  ", usuario.id)


class TestMovimientoManual:
    @pytest.mark.parametrize("concepto", ["", "   "])
    def test_sin_concepto_devuelve_422(self, client, db, cliente, usuario, concepto):
        cc = CuentaCorrienteService(db).get_or_create(cliente.id)
        db.flush()
        r = client.post(
            f"{API}/cuentas-corrientes/{cc.id}/movimientos",
            json={"tipo": "debito", "concepto": concepto,
                  "monto": 1000, "fecha": "2026-09-01"},
        )
        assert r.status_code == 422

    def test_con_concepto_entra(self, client, db, cliente, usuario):
        cc = CuentaCorrienteService(db).get_or_create(cliente.id)
        db.flush()
        r = client.post(
            f"{API}/cuentas-corrientes/{cc.id}/movimientos",
            json={"tipo": "debito", "concepto": "Ajuste por diferencia de tarifa",
                  "monto": 1000, "fecha": "2026-09-01"},
        )
        assert r.status_code == 201

    def test_el_service_tambien_lo_corta(self, db, cliente, usuario):
        with pytest.raises(ValueError):
            CuentaCorrienteService(db).registrar_movimiento(
                cliente_id=cliente.id, tipo="debito", concepto="   ",
                monto=Decimal("1000"), fecha=date(2026, 9, 1), creado_por=usuario.id,
            )


class TestEditarVencimiento:
    """Ya lo exigía en el service; ahora también lo corta el schema."""

    def test_sin_motivo_devuelve_422(self, client, movimiento):
        r = client.patch(
            f"{API}/cuentas-corrientes/movimientos/{movimiento.id}/vencimiento",
            json={"fecha_vencimiento": "2026-10-01", "motivo": "  "},
        )
        assert r.status_code == 422
