"""
La seña entra una vez, entra el día que entra, y el check-out no la reinventa.

**Lo que reemplaza.** Existía `tests/domain/test_sena_no_se_duplica.py`, que
probaba `tiene_credito_de_reserva` contra un doble de la tabla. Esa función era
el parche de la Fase 1: el check-out fabricaba el `Pago` y el crédito desde
`Reserva.anticipo_monto`, y hacía falta preguntar si el cobro online ya los
había creado para no contar la seña dos veces.

La Fase 2 sacó el problema de raíz en vez de seguir preguntando: **todo cobro
anterior al check-out asienta su propio crédito de naturaleza `anticipo` en el
momento en que entra la plata**, venga del mostrador, de una transferencia o de
Mercado Pago. El check-out no crea nada — sólo marca el anticipo aplicado
contra el débito del alquiler. Sin dos caminos no hay nada que duplicar.

El archivo viejo no se podía conservar: probaba una función que ya no existe, y
su doble de la tabla declaraba cuatro columnas, así que reventaba apenas la
consulta mencionara `naturaleza`.
"""
from datetime import date
from decimal import Decimal

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.pago import Pago
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.reserva_service import ReservaService

COBRO = date(2026, 8, 20)


def _saldo(db, cliente_id):
    cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente_id).first()
    return Decimal(str(cc.saldo)) if cc else Decimal("0")


class TestLaSenaDeMostrador:
    def test_entra_a_la_caja_el_dia_que_entra(self, db, cliente, usuario, hacer_reserva):
        """
        Antes el `Pago` lo fabricaba el check-out. Una transferencia cobrada el
        20 de agosto aparecía en la caja del día en que se entregaba el auto,
        que puede ser meses después.
        """
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")

        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "transferencia", usuario.id, fecha=COBRO,
        )
        db.flush()

        pago = db.query(Pago).one()
        assert pago.fecha == COBRO
        assert pago.medio_pago == "transferencia"
        assert pago.reserva_id == reserva.id
        assert pago.alquiler_id is None, "todavía no hay alquiler"

    def test_el_credito_nace_como_anticipo_y_no_como_saldo_a_favor(
        self, db, cliente, usuario, hacer_reserva
    ):
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "efectivo", usuario.id, fecha=COBRO,
        )
        db.flush()

        mov = db.query(MovimientoCuentaCorriente).filter_by(tipo="credito").one()
        assert mov.naturaleza == "anticipo"

        d = CuentaCorrienteService(db).desglose(cliente.id)
        assert d["saldo"] == Decimal("-100000")
        assert d["anticipos"] == Decimal("100000")
        assert d["deuda"] == Decimal("0"), "no le debemos plata: le debemos un auto"

    def test_dos_cobros_sobre_la_misma_reserva_se_acumulan(
        self, db, cliente, usuario, hacer_reserva
    ):
        """La seña y el refuerzo son dos hechos: dos pagos, dos anticipos."""
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        svc = ReservaService(db)
        svc.registrar_cobro(reserva.id, Decimal("100000"), "efectivo", usuario.id, fecha=COBRO)
        svc.registrar_cobro(reserva.id, Decimal("50000"), "transferencia", usuario.id, fecha=COBRO)
        db.flush()

        assert db.query(Pago).count() == 2
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("150000")
        assert CuentaCorrienteService(db).desglose(cliente.id)["anticipos"] == Decimal("150000")


class TestElCheckoutNoLaReinventa:
    def test_marca_el_anticipo_aplicado_y_no_crea_ningun_pago_nuevo(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "efectivo", usuario.id, fecha=COBRO,
        )
        db.flush()
        pagos_antes = db.query(Pago).count()

        # El débito del alquiler y la aplicación, que es lo que hace el
        # check-out. Se ejercita el service directamente para no arrastrar las
        # validaciones de solapamiento y contrato, que no son lo que se prueba.
        alquiler = hacer_alquiler(reserva)
        cc = CuentaCorrienteService(db)
        debito = cc.registrar_movimiento(
            cliente_id=cliente.id, tipo="debito", naturaleza="alquiler",
            concepto="Alquiler — checkout", monto=Decimal("400000"),
            fecha=date(2026, 9, 1), creado_por=usuario.id,
            alquiler_id=alquiler.id, reserva_id=reserva.id,
        )
        aplicados = cc.aplicar_anticipos_de_reserva(reserva.id, debito.id)
        db.flush()

        assert len(aplicados) == 1
        assert aplicados[0].aplicado_por_movimiento_id == debito.id
        assert db.query(Pago).count() == pagos_antes, "el check-out no cobra de nuevo"

        d = cc.desglose(cliente.id)
        assert d["saldo"] == Decimal("300000")
        assert d["anticipos"] == Decimal("0"), "el anticipo se consumió"
        assert d["deuda"] == Decimal("300000")

    def test_el_credito_del_echeq_no_se_marca_como_anticipo_aplicado(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        Tercer borde de `PLAN_DINERO.md` §4.2: un echeq recibido baja la deuda
        pero no es plata en la caja — es un papel que puede rebotar. Su crédito
        tiene naturaleza propia y el check-out no lo toca.
        """
        from app.services.echeq_service import EcheqService

        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        EcheqService(db).crear_recibido(
            cliente_id=cliente.id, contraparte=cliente.nombre_completo,
            monto=Decimal("400000"), fecha_emision=COBRO, creado_por=usuario.id,
            reserva_id=reserva.id, generar_credito=True,
        )
        db.flush()

        mov = db.query(MovimientoCuentaCorriente).filter_by(tipo="credito").one()
        assert mov.naturaleza == "echeq_en_cartera"
        assert CuentaCorrienteService(db).desglose(cliente.id)["anticipos"] == Decimal("0"), (
            "un cheque en cartera no es plata anticipada"
        )

        alquiler = hacer_alquiler(reserva)
        cc = CuentaCorrienteService(db)
        debito = cc.registrar_movimiento(
            cliente_id=cliente.id, tipo="debito", naturaleza="alquiler",
            concepto="Alquiler — checkout", monto=Decimal("400000"),
            fecha=date(2026, 9, 1), creado_por=usuario.id,
            alquiler_id=alquiler.id, reserva_id=reserva.id,
        )
        cc.aplicar_anticipos_de_reserva(reserva.id, debito.id)
        db.flush()

        assert mov.aplicado_por_movimiento_id is None
        assert _saldo(db, cliente.id) == Decimal("0")

    def test_una_reserva_sin_precio_consume_igual_el_anticipo(
        self, db, cliente, usuario, hacer_reserva
    ):
        """
        Primer borde de §4.2: si el auto sale sin precio cargado, el check-out
        no asienta ningún débito y no hay a qué apuntar. Se marca aplicado
        igual — si no, el anticipo quedaría "por aplicar" para siempre y
        deuda = saldo + anticipos inventaría una deuda del tamaño del anticipo
        entero.
        """
        reserva = hacer_reserva(precio_total=None, estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "efectivo", usuario.id, fecha=COBRO,
        )
        db.flush()

        cc = CuentaCorrienteService(db)
        cc.aplicar_anticipos_de_reserva(reserva.id, None)   # sin débito al que apuntar
        db.flush()

        d = cc.desglose(cliente.id)
        assert d["anticipos"] == Decimal("0")
        assert d["deuda"] == Decimal("-100000"), (
            "el cliente pagó y no se le facturó nada: eso sí es plata a favor"
        )

    def test_anular_el_debito_suelta_el_anticipo(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        Segundo borde de §4.2. Si el débito del alquiler se anula, el anticipo
        marcado contra él queda colgando: seguiría fuera de "por aplicar" con
        su crédito vivo en el saldo, y la ficha volvería a decir "a favor".
        """
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "efectivo", usuario.id, fecha=COBRO,
        )
        alquiler = hacer_alquiler(reserva)
        cc = CuentaCorrienteService(db)
        debito = cc.registrar_movimiento(
            cliente_id=cliente.id, tipo="debito", naturaleza="alquiler",
            concepto="Alquiler — checkout", monto=Decimal("400000"),
            fecha=date(2026, 9, 1), creado_por=usuario.id,
            alquiler_id=alquiler.id, reserva_id=reserva.id,
        )
        anticipo = cc.aplicar_anticipos_de_reserva(reserva.id, debito.id)[0]
        db.flush()
        assert anticipo.aplicado_por_movimiento_id == debito.id

        cc.anular_movimiento(debito.id, "se cargó el alquiler equivocado", usuario.id)
        db.flush()

        assert anticipo.aplicado_por_movimiento_id is None
        d = cc.desglose(cliente.id)
        assert d["anticipos"] == Decimal("100000"), "vuelve a estar por aplicar"
        assert d["deuda"] == Decimal("0")
