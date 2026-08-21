"""
El test de humo de la Fase 0: demuestra que la base de prueba existe y que un
service real puede escribir en ella.

No prueba ninguna regla de negocio. Prueba que **se puede probar**: si este
archivo falla, ninguno de los tests de service de la Fase 1 en adelante
significa nada.
"""
from datetime import date
from decimal import Decimal

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.services.cuenta_corriente_service import CuentaCorrienteService


class TestInfraestructuraDePruebas:
    def test_el_esquema_completo_se_construye(self, engine):
        """Las 30 y pico de tablas del modelo entran en la base de prueba."""
        from sqlalchemy import inspect

        tablas = set(inspect(engine).get_table_names())
        # Las que sostienen el circuito del dinero, que es lo que se va a probar.
        assert {"clientes", "reservas", "alquileres", "pagos",
                "cuentas_corrientes", "movimientos_cuenta_corriente",
                "multas", "danios", "echeqs", "gastos"} <= tablas

    def test_un_movimiento_real_mueve_el_saldo(self, db, cliente, usuario):
        svc = CuentaCorrienteService(db)

        cc = svc.get_or_create(cliente.id)
        assert Decimal(str(cc.saldo)) == Decimal("0")

        svc.registrar_movimiento(
            cliente_id=cliente.id,
            tipo="debito",
            concepto="Alquiler de prueba",
            monto=Decimal("100000"),
            fecha=date(2026, 9, 1),
            creado_por=usuario.id,
            condicion="contado",
        )
        svc.registrar_movimiento(
            cliente_id=cliente.id,
            tipo="credito",
            concepto="Cobro de prueba",
            monto=Decimal("40000"),
            fecha=date(2026, 9, 1),
            creado_por=usuario.id,
        )

        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("60000")
        assert db.query(MovimientoCuentaCorriente).count() == 2

    def test_ningun_test_anterior_dejo_parcheado_el_service(self):
        """
        La bomba de la Fase 0, desactivada y con alarma.

        `tests/domain/test_sena_no_se_duplica.py` reemplaza el global
        `MovimientoCuentaCorriente` del service por un doble. `tests/services/`
        se colecta después de `tests/domain/`, así que si ese parche volviera a
        no restaurarse, este test lo ve — y lo dice, en vez de dejar que el
        siguiente falle por un motivo incomprensible.
        """
        import app.services.cuenta_corriente_service as mod

        assert mod.MovimientoCuentaCorriente is MovimientoCuentaCorriente

    def test_cada_test_arranca_con_la_base_vacia(self, db):
        """
        La contracara del anterior: si el aislamiento fallara, este vería el
        movimiento que dejó el test de arriba y el orden de colección
        empezaría a importar.
        """
        assert db.query(MovimientoCuentaCorriente).count() == 0
        assert db.query(CuentaCorriente).count() == 0
