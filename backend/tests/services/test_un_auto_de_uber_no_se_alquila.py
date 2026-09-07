"""
Un auto afectado a Uber no se puede reservar por ningún camino.

**La guarda existía en un solo sentido.** `VehiculoService.update` no deja pasar
un auto a Uber si tiene reservas vivas — pero nada impedía lo contrario:
reservar uno que ya estaba en Uber. `DisponibilidadService` los saca del cupo,
así que no aparecían como "libres"; pero alcanzaba con elegirlo a mano en el
selector, apretar el `+` de su fila en el calendario, o mandar el `POST`
directo.

Y el resultado era peor que una reserva de más: una reserva que el sistema **no
cuenta como ocupación**. No descuenta cupo, no aparece en disponibilidad, y el
auto que la tiene no está.

Del mostrador, sobre por qué molesta que estén mezclados con el resto:
*"si es UBER no tiene que aparecer en Sedán, porque le quita lugar a los que sí
alquilamos"*.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.vehiculo import Vehiculo
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


def _crear(db, cliente, usuario, vehiculo_id):
    return ReservaService(db).create(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo_id,
        fecha_inicio=date(2026, 10, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 3),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"),
        descuento_motivo="prueba",
        usuario_id=usuario.id,
    )


class TestNoSePuedeReservar:
    def test_crear_una_reserva_con_un_auto_de_uber_se_rechaza(
        self, db, cliente, usuario, auto_de_uber
    ):
        with pytest.raises(BusinessRuleError) as e:
            _crear(db, cliente, usuario, auto_de_uber.id)
        assert "vehiculo_no_se_alquila" in str(e.value)

    def test_el_mensaje_dice_cómo_resolverlo(self, db, cliente, usuario, auto_de_uber):
        """
        Un rechazo que no dice qué hacer manda a alguien a probar cosas al azar
        con el cliente enfrente.
        """
        with pytest.raises(BusinessRuleError) as e:
            _crear(db, cliente, usuario, auto_de_uber.id)
        mensaje = str(e.value)
        assert "UB100ER" in mensaje
        assert "destino" in mensaje.lower()

    def test_asignarle_uno_de_uber_a_una_reserva_sin_auto_se_rechaza(
        self, db, cliente, usuario, auto_de_uber
    ):
        """
        El otro camino: la reserva nace por categoría y alguien le asigna la
        unidad después, desde el panel o arrastrándola en el calendario.
        """
        from app.models.categoria import Categoria

        cat = Categoria(codigo="compacto-test", nombre="Compacto", orden=1, activo=True)
        db.add(cat)
        db.flush()

        reserva, _ = ReservaService(db).create(
            cliente_id=cliente.id,
            categoria_id=cat.id,
            fecha_inicio=date(2026, 10, 1),
            hora_inicio=time(10, 0),
            fecha_fin=date(2026, 10, 3),
            hora_fin=time(10, 0),
            lugar_entrega="Paraguay 241",
            lugar_devolucion="Paraguay 241",
            precio_total=Decimal("100000"),
            descuento_motivo="prueba",
            usuario_id=usuario.id,
        )
        db.flush()

        with pytest.raises(BusinessRuleError) as e:
            ReservaService(db).asignar_vehiculo(reserva.id, auto_de_uber.id, usuario.id)
        assert "vehiculo_no_se_alquila" in str(e.value)


class TestElRestoDeLaFlotaSigueIgual:
    def test_un_auto_de_alquiler_se_reserva_sin_problema(
        self, db, cliente, usuario, vehiculo
    ):
        """
        La guarda no puede volverse un obstáculo para el caso normal, que es
        el 100% de lo que se hace todos los días.
        """
        reserva, _ = _crear(db, cliente, usuario, vehiculo.id)
        assert reserva.vehiculo_id == vehiculo.id

    def test_devolver_el_auto_a_la_flota_lo_vuelve_a_habilitar(
        self, db, cliente, usuario, auto_de_uber
    ):
        """
        No es una baja: es a qué está afectado. Si vuelve a alquiler, se puede
        reservar de nuevo — y sin tener que tocar nada más.
        """
        auto_de_uber.destino = "alquiler"
        db.flush()

        reserva, _ = _crear(db, cliente, usuario, auto_de_uber.id)
        assert reserva.vehiculo_id == auto_de_uber.id


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
