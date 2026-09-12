"""
Los daños fotografiados en la entrega quedan atados al alquiler, y la foto de
la cámara sube aunque llegue sin extensión.

El pedido de Ubicar (12/09): *"Deja poner también fotos al momento del
checkout, en caso de quererlo."* La complicación es de orden: el operador carga
el daño **antes** de apretar "Entregar el vehículo", y el alquiler recién nace
con ese botón. Sin atarlo, el daño quedaba suelto sobre el auto sin decir en
qué entrega se constató — que es lo que pide la cláusula 1 del contrato.
"""
from datetime import date, time

from app.models.alquiler import Alquiler
from app.models.danio import Danio
from app.routers.danios import _extension_de_la_foto
from app.schemas.danio import DanioCreate
from app.services.alquiler_service import AlquilerService
from app.services.danio_service import DanioService


def _danio(db, vehiculo, usuario, **extra) -> Danio:
    datos = dict(vehiculo_id=vehiculo.id, momento="checkout", zona="Paragolpes")
    datos.update(extra)
    d = DanioService(db).registrar(DanioCreate(**datos), usuario_id=usuario.id)
    db.flush()
    return d


def _entregar(db, reserva, vehiculo, usuario, danios_ids):
    alquiler, _ = AlquilerService(db).checkout(
        reserva_id=reserva.id,
        checkout_fecha=date(2026, 9, 1),
        checkout_hora=time(10, 0),
        checkout_km=vehiculo.km_actual,
        checkout_combustible=100,
        checkout_descripcion=None,
        usuario_id=usuario.id,
        motivo_sin_contrato="Se firma en el mostrador",
        danios_ids=danios_ids,
    )
    db.flush()
    return alquiler


class TestDaniosDeLaEntrega:
    def test_el_checkout_ata_los_danios_cargados_en_la_pantalla(
        self, db, usuario, vehiculo, hacer_reserva
    ):
        reserva = hacer_reserva()
        d = _danio(db, vehiculo, usuario)
        assert d.alquiler_id is None

        alquiler = _entregar(db, reserva, vehiculo, usuario, [d.id])

        db.refresh(d)
        assert d.alquiler_id == alquiler.id

    def test_no_le_atribuye_el_danio_al_cliente_que_se_lleva_el_auto(
        self, db, usuario, vehiculo, hacer_reserva
    ):
        """Constatado al entregar es la prueba de que *ya estaba*."""
        reserva = hacer_reserva()
        d = _danio(db, vehiculo, usuario)
        _entregar(db, reserva, vehiculo, usuario, [d.id])
        db.refresh(d)
        assert d.cliente_id is None
        assert d.responsable == "sin_definir"

    def test_ignora_danios_de_otro_auto_o_de_otra_operacion(
        self, db, usuario, vehiculo, hacer_reserva
    ):
        from app.models.vehiculo import Vehiculo

        otro_auto = Vehiculo(
            patente="ZZ999ZZ", marca="VW", modelo="Gol", anio=2020, tipo="auto",
            color="gris", estado="disponible", km_actual=1,
        )
        db.add(otro_auto)
        db.flush()

        reserva = hacer_reserva()
        ajeno = _danio(db, otro_auto, usuario)
        de_devolucion = _danio(db, vehiculo, usuario, momento="checkin")
        manual = _danio(db, vehiculo, usuario, momento="preexistente")

        _entregar(db, reserva, vehiculo, usuario, [ajeno.id, de_devolucion.id, manual.id, 99999])

        for d in (ajeno, de_devolucion, manual):
            db.refresh(d)
            assert d.alquiler_id is None

    def test_no_reasigna_un_danio_que_ya_tiene_alquiler(self, db, usuario, vehiculo, hacer_reserva):
        primera = hacer_reserva()
        d = _danio(db, vehiculo, usuario)
        alquiler = _entregar(db, primera, vehiculo, usuario, [d.id])

        n = DanioService(db).atar_a_la_entrega([d.id], alquiler_id=alquiler.id + 1, vehiculo_id=vehiculo.id)
        assert n == 0
        db.refresh(d)
        assert d.alquiler_id == alquiler.id

    def test_sin_danios_la_entrega_sigue_igual(self, db, usuario, vehiculo, hacer_reserva):
        reserva = hacer_reserva()
        alquiler = _entregar(db, reserva, vehiculo, usuario, [])
        assert db.get(Alquiler, alquiler.id) is not None


class TestDaniosDeLaDevolucion:
    def test_el_danio_de_la_devolucion_hereda_el_cliente_pero_no_la_culpa(
        self, db, usuario, vehiculo, cliente, hacer_reserva
    ):
        reserva = hacer_reserva()
        alquiler = _entregar(db, reserva, vehiculo, usuario, [])
        d = _danio(db, vehiculo, usuario, momento="checkin", alquiler_id=alquiler.id)
        assert d.cliente_id == cliente.id
        assert d.responsable == "sin_definir"
        # Y es lo que lista la ficha del cliente.
        assert [x.id for x in DanioService(db).listar(cliente_id=cliente.id)] == [d.id]


class TestExtensionDeLaFoto:
    def test_la_del_nombre_si_es_valida(self):
        assert _extension_de_la_foto("IMG_2031.JPG", "image/jpeg") == "jpg"
        assert _extension_de_la_foto("foto.heic", "image/heic") == "heic"

    def test_la_foto_de_la_camara_sin_extension_sale_del_tipo(self):
        """El caso: `capture` en Android manda `image` o un número como nombre."""
        assert _extension_de_la_foto("image", "image/jpeg") == "jpg"
        assert _extension_de_la_foto("1694523000", "image/png") == "png"
        assert _extension_de_la_foto(None, "image/webp") == "webp"

    def test_lo_que_no_es_imagen_sigue_rechazandose(self):
        assert _extension_de_la_foto("virus.exe", "application/octet-stream") == "exe"
