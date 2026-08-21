"""
Cancelar una reserva pagada no le deja plata a favor al cliente (D-11).

`PLAN_DINERO.md` §1.3: `cancelar()` asentaba **siempre** un par débito+crédito
por la seña. Con la seña de mostrador eso está bien —el crédito no existía— y
el saldo queda en cero. Con Mercado Pago y con echeq el crédito **ya estaba
asentado**, así que el neto era `crédito + débito + crédito = −seña`: saldo a
favor del cliente por exactamente la plata que D-11 dice que no se devuelve.
"""
from datetime import date
from decimal import Decimal

from app.models.cuenta_corriente import CuentaCorriente
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.reserva_service import ReservaService


def _saldo(db, cliente_id) -> Decimal:
    cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente_id).first()
    return Decimal(str(cc.saldo)) if cc else Decimal("0")


class TestCancelarConSena:
    def test_sena_de_mostrador_deja_saldo_cero(
        self, db, cliente, usuario, hacer_reserva
    ):
        """El caso que ya funcionaba: no se rompe."""
        reserva = hacer_reserva(
            precio_total="400000",
            anticipo_monto=Decimal("100000"),
            anticipo_fecha=date(2026, 8, 20),
            anticipo_medio_pago="efectivo",
        )

        ReservaService(db).cancelar(reserva.id, usuario.id, "el cliente se arrepintió")

        assert _saldo(db, cliente.id) == Decimal("0")

    def test_sena_por_mercado_pago_deja_saldo_cero(
        self, db, cliente, usuario, hacer_reserva, hacer_pago
    ):
        """
        El caso roto: el crédito del cobro online ya existe, así que la
        cancelación sólo tiene que poner el débito.
        """
        reserva = hacer_reserva(
            precio_total="400000",
            anticipo_monto=Decimal("100000"),
            anticipo_fecha=date(2026, 8, 20),
            anticipo_medio_pago="mercado_pago",
        )
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          medio_pago="mercado_pago", fecha=date(2026, 8, 20))
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id,
            tipo="credito",
            concepto=f"Pago online reserva #{reserva.id} (25%)",
            monto=Decimal("100000"),
            fecha=date(2026, 8, 20),
            creado_por=usuario.id,
            reserva_id=reserva.id,
            pago_id=pago.id,
        )
        assert _saldo(db, cliente.id) == Decimal("-100000")

        ReservaService(db).cancelar(reserva.id, usuario.id, "el cliente se arrepintió")

        assert _saldo(db, cliente.id) == Decimal("0"), (
            "la seña retenida no puede quedar a favor del cliente (D-11)"
        )

    def test_sena_por_echeq_deja_saldo_cero(
        self, db, cliente, usuario, hacer_reserva
    ):
        """Mismo problema por el otro camino: el echeq acredita al recibirse."""
        from app.services.echeq_service import EcheqService

        reserva = hacer_reserva(
            precio_total="400000",
            anticipo_monto=Decimal("100000"),
            anticipo_fecha=date(2026, 8, 20),
            anticipo_medio_pago="echeq",
        )
        EcheqService(db).crear_recibido(
            cliente_id=cliente.id,
            contraparte=cliente.nombre_completo,
            monto=Decimal("100000"),
            fecha_emision=date(2026, 8, 20),
            creado_por=usuario.id,
            reserva_id=reserva.id,
            generar_credito=True,
        )
        assert _saldo(db, cliente.id) == Decimal("-100000")

        ReservaService(db).cancelar(reserva.id, usuario.id, "el cliente se arrepintió")

        assert _saldo(db, cliente.id) == Decimal("0")

    def test_sin_sena_no_asienta_nada(self, db, cliente, usuario, hacer_reserva):
        from app.models.cuenta_corriente import MovimientoCuentaCorriente

        reserva = hacer_reserva(precio_total="400000")
        ReservaService(db).cancelar(reserva.id, usuario.id, "no vino")

        assert db.query(MovimientoCuentaCorriente).count() == 0


class TestLaFichaDespuesDeCancelar:
    """
    `PLAN_DINERO.md` §1.4b: el desglose del 21/08 definía anticipo como
    "crédito con reserva_id cuya reserva todavía no tiene alquiler". Una
    reserva cancelada nunca va a tener alquiler, así que su crédito contaba
    como anticipo para siempre y la ficha decía **"Debe $seña"** eternamente.
    """

    def test_tras_cancelar_con_sena_de_mostrador_la_ficha_no_dice_nada(
        self, db, cliente, usuario, hacer_reserva
    ):
        reserva = hacer_reserva(
            precio_total="400000",
            anticipo_monto=Decimal("100000"),
            anticipo_fecha=date(2026, 8, 20),
            anticipo_medio_pago="efectivo",
        )
        ReservaService(db).cancelar(reserva.id, usuario.id, "se arrepintió")

        d = CuentaCorrienteService(db).desglose(cliente.id)
        assert d["saldo"] == Decimal("0")
        assert d["anticipos"] == Decimal("0")
        assert d["deuda"] == Decimal("0"), "la ficha decía 'Debe $seña' para siempre"

    def test_tras_cancelar_con_sena_de_mercado_pago_la_ficha_no_dice_nada(
        self, db, cliente, usuario, hacer_reserva, hacer_pago
    ):
        reserva = hacer_reserva(
            precio_total="400000",
            anticipo_monto=Decimal("100000"),
            anticipo_fecha=date(2026, 8, 20),
            anticipo_medio_pago="mercado_pago",
        )
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          medio_pago="mercado_pago", fecha=date(2026, 8, 20))
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito",
            concepto=f"Pago online reserva #{reserva.id} (25%)",
            monto=Decimal("100000"), fecha=date(2026, 8, 20),
            creado_por=usuario.id, reserva_id=reserva.id, pago_id=pago.id,
        )
        ReservaService(db).cancelar(reserva.id, usuario.id, "se arrepintió")

        d = CuentaCorrienteService(db).desglose(cliente.id)
        assert d["saldo"] == Decimal("0")
        assert d["anticipos"] == Decimal("0")
        assert d["deuda"] == Decimal("0")

    def test_una_resena_viva_sigue_contando_como_anticipo(
        self, db, cliente, usuario, hacer_reserva, hacer_pago
    ):
        """
        La contracara: el arreglo no puede apagar el anticipo legítimo, que es
        para lo que se escribió el desglose.
        """
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          medio_pago="mercado_pago", fecha=date(2026, 8, 20))
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito",
            concepto=f"Pago online reserva #{reserva.id} (25%)",
            monto=Decimal("100000"), fecha=date(2026, 8, 20),
            creado_por=usuario.id, reserva_id=reserva.id, pago_id=pago.id,
        )

        d = CuentaCorrienteService(db).desglose(cliente.id)
        assert d["saldo"] == Decimal("-100000")
        assert d["anticipos"] == Decimal("100000")
        assert d["deuda"] == Decimal("0"), "no le debemos plata: le debemos un auto"
