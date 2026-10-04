"""
El contrato decide el destino del auto, no al revés (04/10/2026).

Antes un auto marcado Uber **no se podía reservar** (`vehiculo_no_se_alquila`) y
había que cambiarle el destino a mano desde la ficha. Con autos que rotan entre
Uber y alquiler eso sólo estorbaba. Ahora:

- un contrato de **Uber** sobre cualquier auto lo pasa a `uber`;
- un contrato **normal** sobre un auto que estaba en Uber lo devuelve a
  `alquiler`;
- **la categoría no se toca nunca**: Uber no es una categoría, es el uso del
  momento.

El mostrador ve toda la flota libre; la web no ofrece los que están en Uber.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.categoria import Categoria
from app.models.vehiculo import Vehiculo
from app.services.disponibilidad_service import DisponibilidadService
from app.services.reserva_service import ReservaService


@pytest.fixture
def auto_de_uber(db):
    v = Vehiculo(
        patente="UB100ER", marca="Toyota", modelo="Etios", anio=2023,
        tipo="auto", color="gris", estado="disponible",
        destino="uber", activo=True, km_actual=0,
    )
    db.add(v)
    db.flush()
    return v


def _crear(db, cliente, usuario, vehiculo_id, **extra):
    return ReservaService(db).create(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo_id,
        fecha_inicio=date(2026, 10, 5),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 19),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"),
        descuento_motivo="prueba",
        usuario_id=usuario.id,
        **extra,
    )


UBER = dict(
    tipo="uber", uber_valor_semana=Decimal("200000"),
    uber_km_semana=1500, uber_precio_km_extra=Decimal("150"),
)


class TestElContratoCambiaElDestino:
    def test_un_contrato_uber_pasa_el_auto_a_uber(self, db, cliente, usuario, vehiculo):
        assert vehiculo.destino == "alquiler"
        reserva, _ = _crear(db, cliente, usuario, vehiculo.id, **UBER)
        assert reserva.tipo == "uber"
        assert vehiculo.destino == "uber"

    def test_un_contrato_normal_devuelve_el_auto_a_alquiler(
        self, db, cliente, usuario, auto_de_uber
    ):
        reserva, _ = _crear(db, cliente, usuario, auto_de_uber.id)
        assert reserva.tipo == "alquiler"
        assert auto_de_uber.destino == "alquiler"

    def test_la_categoria_no_cambia_nunca(self, db, cliente, usuario, vehiculo):
        cat = Categoria(codigo="sedan-test", nombre="Sedán", orden=1, activo=True)
        db.add(cat)
        db.flush()
        vehiculo.categoria_id = cat.id
        db.flush()

        _crear(db, cliente, usuario, vehiculo.id, **UBER)
        assert vehiculo.categoria_id == cat.id

        _crear_otra = ReservaService(db).create(
            cliente_id=cliente.id, vehiculo_id=vehiculo.id,
            fecha_inicio=date(2026, 12, 1), hora_inicio=time(10, 0),
            fecha_fin=date(2026, 12, 3), hora_fin=time(10, 0),
            lugar_entrega="x", lugar_devolucion="x",
            precio_total=Decimal("100000"), descuento_motivo="prueba",
            usuario_id=usuario.id,
        )
        assert vehiculo.categoria_id == cat.id
        assert vehiculo.destino == "alquiler"

    def test_asignarle_un_auto_a_una_reserva_uber_lo_pasa_a_uber(
        self, db, cliente, usuario, vehiculo
    ):
        cat = Categoria(codigo="compacto-test", nombre="Compacto", orden=1, activo=True)
        db.add(cat)
        db.flush()
        reserva, _ = ReservaService(db).create(
            cliente_id=cliente.id, categoria_id=cat.id,
            fecha_inicio=date(2026, 10, 5), hora_inicio=time(10, 0),
            fecha_fin=date(2026, 10, 19), hora_fin=time(10, 0),
            lugar_entrega="x", lugar_devolucion="x",
            usuario_id=usuario.id, **UBER,
        )
        db.flush()
        ReservaService(db).asignar_vehiculo(reserva.id, vehiculo.id, usuario.id)
        assert vehiculo.destino == "uber"


class TestElMostradorVeTodaLaFlota:
    def test_el_auto_de_uber_aparece_libre_en_el_mostrador(self, db, auto_de_uber):
        cat = Categoria(codigo="uber-test", nombre="Compacto", orden=1, activo=True)
        db.add(cat)
        db.flush()
        auto_de_uber.categoria_id = cat.id
        db.flush()

        mapa = DisponibilidadService(db).unidades_libres(
            date(2026, 10, 5), time(10, 0), date(2026, 10, 8), time(10, 0),
            con_margen=False,
        )
        libres = {vid for lista in mapa.values() for vid in lista}
        assert auto_de_uber.id in libres

    def test_la_web_no_ofrece_los_que_estan_en_uber(self, db, auto_de_uber):
        flota = {v.id for v in DisponibilidadService(db)._cargar_flota()}
        assert auto_de_uber.id not in flota


class TestElContratoUber:
    def test_el_precio_sale_del_valor_de_la_semana(self, db, cliente, usuario, vehiculo):
        reserva, _ = _crear(db, cliente, usuario, vehiculo.id, **UBER)
        # 14 días = 2 semanas × 200.000
        assert reserva.precio_total == Decimal("400000.00")

    def test_las_fechas_de_pago_se_proponen_una_por_semana(
        self, db, cliente, usuario, vehiculo
    ):
        reserva, _ = _crear(db, cliente, usuario, vehiculo.id, **UBER)
        assert reserva.fechas_pago == ["2026-10-05", "2026-10-12"]

    def test_se_pueden_editar_las_fechas(self, db, cliente, usuario, vehiculo):
        reserva, _ = _crear(
            db, cliente, usuario, vehiculo.id,
            fechas_pago=[date(2026, 10, 7), date(2026, 10, 14)], **UBER,
        )
        assert reserva.fechas_pago == ["2026-10-07", "2026-10-14"]

    def test_guarda_los_km_y_el_precio_del_km_extra(self, db, cliente, usuario, vehiculo):
        reserva, _ = _crear(db, cliente, usuario, vehiculo.id, **UBER)
        assert reserva.uber_km_semana == 1500
        assert reserva.uber_precio_km_extra == Decimal("150")

    def test_sin_valor_de_semana_se_rechaza(self, db, cliente, usuario, vehiculo):
        with pytest.raises(BusinessRuleError) as e:
            _crear(db, cliente, usuario, vehiculo.id, tipo="uber")
        assert "uber_sin_valor_semana" in str(e.value)

    def test_un_alquiler_normal_ignora_los_campos_de_uber(
        self, db, cliente, usuario, vehiculo
    ):
        reserva, _ = _crear(
            db, cliente, usuario, vehiculo.id,
            uber_valor_semana=Decimal("200000"), uber_km_semana=1500,
        )
        assert reserva.tipo == "alquiler"
        assert reserva.uber_valor_semana is None
        assert reserva.uber_km_semana is None
        assert reserva.fechas_pago is None

    def test_no_pide_motivo_de_descuento_aunque_no_coincida_con_la_lista(
        self, db, cliente, usuario, vehiculo
    ):
        reserva, _ = ReservaService(db).create(
            cliente_id=cliente.id, vehiculo_id=vehiculo.id,
            fecha_inicio=date(2026, 10, 5), hora_inicio=time(10, 0),
            fecha_fin=date(2026, 10, 19), hora_fin=time(10, 0),
            lugar_entrega="x", lugar_devolucion="x",
            usuario_id=usuario.id, **UBER,
        )
        assert reserva.precio_total == Decimal("400000.00")


class TestElCalendarioLosMuestraAparte:
    def test_llegan_con_su_destino_y_al_final(self, db, auto_de_uber, vehiculo):
        """
        Verse tienen que verse —siguen teniendo VTV, póliza y services— pero
        abajo de todo y en su propio grupo, no ocupando un renglón de Sedán.
        """
        from datetime import timedelta

        from app.routers.ocupacion import get_ocupacion

        hoy = date.today()
        respuesta = get_ocupacion(
            fecha_inicio=hoy, fecha_fin=hoy + timedelta(days=7),
            vehiculo_ids=None, db=db, _=None,
        )
        patentes = [v.patente for v in respuesta["data"].vehiculos]
        assert auto_de_uber.patente in patentes, "tiene que seguir viéndose"
        assert patentes[-1] == auto_de_uber.patente, "y va último"

        item = next(v for v in respuesta["data"].vehiculos if v.patente == auto_de_uber.patente)
        assert item.destino == "uber", "el front lo necesita para agruparlo aparte"
