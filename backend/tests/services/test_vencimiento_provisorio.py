"""
El débito con ancla en check-in deja de ser invisible.

`PLAN_DINERO.md` §3.4. Cuando la condición de pago cuenta los días desde que el
auto vuelve (D-41), el débito del check-out nacía con `fecha_vencimiento = None`
porque al entregar el auto todavía no se sabe cuándo lo devuelven.

El problema es lo que eso produce: **un débito sin vencimiento no aparece en
ningún aviso**. `cc_vencida` y `cc_vencimiento_proximo` filtran por
`fecha_vencimiento`, y un `NULL` nunca entra. Podían ser $400.000 esperando a
que alguien cargara el check-in.

Ahora nace con la fecha de fin **pactada** —lo mejor que se sabe al entregar— y
el check-in real la recalcula. La marca `vencimiento_provisorio` dice que es una
estimación, para que la pantalla no la muestre con la misma cara que un
vencimiento firme.
"""
from datetime import date, timedelta
from decimal import Decimal

from app.domain.notificaciones_reglas import cc_vencida
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.services.cuenta_corriente_service import CuentaCorrienteService

CHECKOUT = date(2026, 8, 1)
FIN_PACTADO = date(2026, 8, 5)


def _debito_con_ancla_checkin(db, cliente, usuario, reserva, alquiler, monto="400000"):
    """Lo que asienta el check-out cuando el ancla es el check-in."""
    from app.domain.cuenta_corriente import calcular_vencimiento

    return CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente.id,
        tipo="debito",
        naturaleza="alquiler",
        concepto=f"Alquiler #{reserva.id} — checkout",
        monto=Decimal(monto),
        fecha=CHECKOUT,
        creado_por=usuario.id,
        condicion=reserva.condicion_pago,
        fecha_vencimiento=calcular_vencimiento(reserva.fecha_fin, reserva.condicion_pago),
        sin_vencimiento_automatico=True,
        vencimiento_provisorio=True,
        alquiler_id=alquiler.id,
        reserva_id=reserva.id,
    )


class TestNaceConFechaEstimada:
    def test_el_debito_tiene_vencimiento_desde_el_fin_pactado(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        reserva = hacer_reserva(
            precio_total="400000", estado="activa", condicion_pago="cta_cte_15",
            condicion_pago_ancla="checkin",
            fecha_inicio=CHECKOUT, fecha_fin=FIN_PACTADO,
        )
        alquiler = hacer_alquiler(reserva, checkout_fecha=CHECKOUT)
        mov = _debito_con_ancla_checkin(db, cliente, usuario, reserva, alquiler)
        db.flush()

        assert mov.fecha_vencimiento == FIN_PACTADO + timedelta(days=15)
        assert mov.vencimiento_provisorio is True

    def test_un_debito_invisible_deja_de_serlo(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        Lo que esta fase viene a arreglar: sin fecha, el aviso nunca salía por
        más vencida que estuviera la deuda.
        """
        reserva = hacer_reserva(
            precio_total="400000", estado="activa", condicion_pago="contado",
            condicion_pago_ancla="checkin",
            fecha_inicio=CHECKOUT, fecha_fin=FIN_PACTADO,
        )
        alquiler = hacer_alquiler(reserva, checkout_fecha=CHECKOUT)
        _debito_con_ancla_checkin(db, cliente, usuario, reserva, alquiler)
        db.flush()

        # Nadie pagó nada: el alquiler tiene saldo pendiente y el aviso sale.
        avisos = cc_vencida(db, FIN_PACTADO + timedelta(days=10))
        assert len(avisos) == 1
        assert f"#{reserva.id}" in avisos[0]["descripcion"]


class TestElCheckinLaRecalcula:
    def test_la_fecha_real_reemplaza_a_la_estimada(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """El auto volvió tarde: el plazo se cuenta desde que volvió."""
        from app.domain.cuenta_corriente import calcular_vencimiento

        reserva = hacer_reserva(
            precio_total="400000", estado="activa", condicion_pago="cta_cte_15",
            condicion_pago_ancla="checkin",
            fecha_inicio=CHECKOUT, fecha_fin=FIN_PACTADO,
        )
        alquiler = hacer_alquiler(reserva, checkout_fecha=CHECKOUT)
        mov = _debito_con_ancla_checkin(db, cliente, usuario, reserva, alquiler)
        db.flush()

        # Lo que hace el check-in.
        checkin_real = date(2026, 8, 9)
        provisorios = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(reserva_id=reserva.id, tipo="debito", vencimiento_provisorio=True)
            .all()
        )
        for d in provisorios:
            d.fecha_vencimiento = calcular_vencimiento(checkin_real, reserva.condicion_pago)
            d.vencimiento_provisorio = False
        db.flush()

        assert mov.fecha_vencimiento == checkin_real + timedelta(days=15)
        assert mov.vencimiento_provisorio is False


class TestLaFechaPuestaAMano:
    def test_editar_el_vencimiento_apaga_la_marca_de_provisorio(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        Una fecha renegociada con el cliente es una decisión, no una
        estimación — y el check-in no la puede pisar.
        """
        reserva = hacer_reserva(
            precio_total="400000", estado="activa", condicion_pago="cta_cte_30",
            condicion_pago_ancla="checkin",
            fecha_inicio=CHECKOUT, fecha_fin=FIN_PACTADO,
        )
        alquiler = hacer_alquiler(reserva, checkout_fecha=CHECKOUT)
        mov = _debito_con_ancla_checkin(db, cliente, usuario, reserva, alquiler)
        db.flush()
        assert mov.vencimiento_provisorio is True

        CuentaCorrienteService(db).editar_vencimiento(
            movimiento_id=mov.id,
            fecha_vencimiento=date(2026, 10, 15),
            motivo="el cliente pidió plazo hasta después de la cosecha",
            usuario_id=usuario.id,
        )
        db.flush()

        assert mov.fecha_vencimiento == date(2026, 10, 15)
        assert mov.vencimiento_provisorio is False, (
            "el check-in no puede pisar una fecha que alguien negoció"
        )
