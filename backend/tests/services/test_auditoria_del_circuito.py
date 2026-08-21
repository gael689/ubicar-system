"""
Lo que encontró la auditoría del circuito completo, una vez terminadas las fases.

No son fases nuevas: son huecos que quedaron entre lo que cambió y lo que ya
estaba, y que ningún test cubría porque cada fase probaba lo suyo.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.pago import Pago
from app.schemas.pago import PagoDetalladoResponse
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.recibo_service import ReciboService

HOY = date(2026, 8, 10)
API = "/api/v1"


class TestTodosLosMediosDePagoEntran:
    """
    `wapa` estaba en el modelo (migración 057) y **no** en el schema. El
    frontend lo venía ofreciendo en cinco pantallas, así que un cobro por Wapa
    se rechazaba con un 422 que no explicaba nada — y si el `Pago` entraba por
    otro camino (una multa cobrada por Wapa), la respuesta reventaba con un 500
    al validar el modelo contra el Literal.
    """

    @pytest.mark.parametrize(
        "medio",
        ["efectivo", "transferencia", "tarjeta", "cheque", "echeq",
         "cuenta_corriente", "mercado_pago", "wapa"],
    )
    def test_el_schema_acepta_los_mismos_que_el_modelo(self, medio):
        from app.models.pago import Pago as ModeloPago

        del_modelo = set(ModeloPago.__table__.columns["medio_pago"].type.enums)
        assert medio in del_modelo

        p = Pago(
            id=1, cliente_id=1, monto=Decimal("1000"), medio_pago=medio,
            con_factura=False, fecha=HOY, cobrado_por=1,
        )
        r = PagoDetalladoResponse.model_validate(p, from_attributes=True)
        assert r.medio_pago == medio

    def test_el_filtro_de_la_caja_acepta_wapa(self, client, db, cliente, hacer_pago):
        hacer_pago(cliente_id=cliente.id, monto="50000", medio_pago="wapa", fecha=HOY)
        db.flush()

        r = client.get(f"{API}/pagos", params={"medio_pago": "wapa"})
        assert r.status_code == 200, "antes devolvía 400: 'medio de pago inválido'"
        assert r.json()["resumen"]["por_medio"]["wapa"] == 50_000

    def test_una_multa_cobrada_por_wapa_no_rompe_la_respuesta(
        self, client, db, cliente, usuario, vehiculo
    ):
        from app.models.multa import Multa
        from app.schemas.multa import MultaUpdate
        from app.services.multa_service import MultaService

        m = Multa(
            patente=vehiculo.patente, vehiculo_id=vehiculo.id, cliente_id=cliente.id,
            fecha_infraccion=date(2026, 8, 5), monto=Decimal("75000"), estado="pendiente",
        )
        db.add(m)
        db.flush()
        MultaService(db).actualizar(m.id, MultaUpdate(estado="imputada"), usuario.id)
        db.flush()

        r = client.post(f"{API}/multas/{m.id}/resolver", json={
            "decision": "cobrada", "medio_pago": "wapa", "fecha_cobro": HOY.isoformat(),
        })
        assert r.status_code == 200

        caja = client.get(f"{API}/pagos/caja/dia", params={"fecha": HOY.isoformat()})
        assert caja.status_code == 200, "la respuesta reventaba al validar el medio"
        assert caja.json()["data"]["por_medio_pago"]["wapa"] == 75_000


class TestLaSenaSabeDeQueReservaEs:
    """
    Un cobro anterior al check-out no tiene alquiler, así que la caja lo
    mostraba sin decir de qué reserva era. `Pago.reserva_id` (migración 079)
    existía y nadie lo leía.
    """

    def test_el_cobro_de_una_sena_muestra_su_reserva(
        self, client, db, cliente, usuario, hacer_reserva
    ):
        from app.services.reserva_service import ReservaService

        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "transferencia", usuario.id, fecha=HOY,
        )
        db.flush()

        cobros = client.get(f"{API}/pagos/caja/dia",
                            params={"fecha": HOY.isoformat()}).json()["data"]["cobros"]
        assert len(cobros) == 1
        assert cobros[0]["reserva_id"] == reserva.id
        assert cobros[0]["alquiler_id"] is None


class TestElReciboNoContradiceAlLibro:
    def test_no_se_emite_sobre_un_cobro_dado_de_baja(
        self, db, cliente, usuario, hacer_pago
    ):
        """
        Un cobro dado de baja no entró. Emitirle un recibo pondría a circular un
        papel que afirma lo contrario de lo que dice el libro.
        """
        pago = hacer_pago(cliente_id=cliente.id, monto="100000", fecha=HOY)
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="pago",
            concepto="Cobro", monto=Decimal("100000"), fecha=HOY,
            creado_por=usuario.id, pago_id=pago.id,
        )
        db.flush()

        pago.anulado = True
        db.flush()

        with pytest.raises(BusinessRuleError):
            ReciboService(db).emitir_para_pago(pago, "Alquiler #1", usuario.id)


class TestLoDadoDeBajaSePuedeMirar:
    """
    La baja es lógica justamente para poder ver qué pasó. Pero nunca por
    default: el 99% de las consultas es "cuánto entró".
    """

    def test_por_default_no_aparece(self, client, db, cliente, hacer_pago):
        pago = hacer_pago(cliente_id=cliente.id, monto="100000", fecha=HOY)
        db.flush()
        pago.anulado = True
        pago.motivo_anulacion = "se cargó dos veces"
        db.flush()

        r = client.get(f"{API}/pagos").json()
        assert r["data"] == []

    def test_pidiendolo_aparece_pero_no_suma(self, client, db, cliente, hacer_pago):
        vivo = hacer_pago(cliente_id=cliente.id, monto="40000", fecha=HOY)
        muerto = hacer_pago(cliente_id=cliente.id, monto="100000", fecha=HOY)
        db.flush()
        muerto.anulado = True
        muerto.motivo_anulacion = "se cargó dos veces"
        db.flush()

        r = client.get(f"{API}/pagos", params={"incluir_anulados": True}).json()
        ids = {p["id"] for p in r["data"]}
        assert ids == {vivo.id, muerto.id}
        assert r["resumen"]["total"] == 40_000, (
            "se muestran para poder mirarlos, no para que sumen"
        )
        anulado = next(p for p in r["data"] if p["id"] == muerto.id)
        assert anulado["anulado"] is True
        assert anulado["motivo_anulacion"] == "se cargó dos veces"
