"""
En el sistema un auto que se pisa **avisa**, no bloquea (pedido de Gael,
06/10/2026).

Caso real: un auto se devolvía a las 9:00, quisieron hacer un contrato rápido
para las 10:00 y el sistema no los dejó. El mostrador es quien sabe si el auto
vuelve a tiempo, así que el sistema le avisa y lo deja seguir — también si el
auto queda pisado de verdad.

Lo que **sigue bloqueando**:
- la web pública (no pasa `permitir_solape`);
- un auto bloqueado por taller, siniestro o uso interno;
- repetir la misma reserva (mismo cliente, mismas fechas y horas), que es un
  reintento del contrato rápido y la duplicaría.
"""
from datetime import date, datetime, time
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.cliente import Cliente
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services.alquiler_service import AlquilerService
from app.services.reserva_service import ReservaService

D5 = date(2026, 10, 5)
D6 = date(2026, 10, 6)
D7 = date(2026, 10, 7)
D8 = date(2026, 10, 8)


@pytest.fixture
def otro_cliente(db):
    c = Cliente(
        nombre_completo="Ana Gómez", dni_cuit="30999888",
        telefono="2915551111", tipo="particular",
    )
    db.add(c)
    db.flush()
    return c


def _ocupar(db, vehiculo, cliente, usuario, inicio, fin, estado="confirmada"):
    """Una reserva que ya tiene el auto, con las horas que se pidan."""
    r = Reserva(
        vehiculo_id=vehiculo.id, cliente_id=cliente.id,
        fecha_inicio=inicio.date(), hora_inicio=inicio.time(),
        fecha_fin=fin.date(), hora_fin=fin.time(),
        lugar_entrega="Local", lugar_devolucion="Local",
        estado=estado, usuario_id=usuario.id, precio_total=Decimal("100000"),
        condicion_pago="contado", condicion_pago_ancla="checkout",
    )
    db.add(r)
    db.flush()
    return r


def _crear(db, cliente, usuario, vehiculo, inicio, fin, **extra):
    return ReservaService(db).create(
        cliente_id=cliente.id, vehiculo_id=vehiculo.id,
        fecha_inicio=inicio.date(), hora_inicio=inicio.time(),
        fecha_fin=fin.date(), hora_fin=fin.time(),
        lugar_entrega="Paraguay 241", lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"), descuento_motivo="prueba",
        usuario_id=usuario.id, **extra,
    )


def _dt(dia, h, m=0):
    return datetime.combine(dia, time(h, m))


@pytest.fixture
def auto_ocupado(db, cliente, usuario, vehiculo):
    """Reserva confirmada del 5/10 07:00 al 6/10 10:00."""
    existente = _ocupar(db, vehiculo, cliente, usuario, _dt(D5, 7), _dt(D6, 10))
    return vehiculo, existente


class TestCrear:
    def test_encima_de_una_confirmada_crea_y_avisa(
        self, db, otro_cliente, usuario, auto_ocupado
    ):
        vehiculo, existente = auto_ocupado
        reserva, warnings = _crear(
            db, otro_cliente, usuario, vehiculo, _dt(D5, 10), _dt(D7, 10),
            permitir_solape=True,
        )
        assert reserva.id
        assert len(warnings) == 1
        w = warnings[0]
        assert w["tipo"] == "solape_con_ocupado"
        assert w["reserva_id"] == existente.id
        assert w["estado"] == "confirmada"
        assert w["cliente"] == "Cliente de Prueba"
        assert (w["fecha_fin"], w["hora_fin"]) == ("2026-10-06", "10:00")

    def test_sin_permiso_sigue_bloqueando_como_la_web(
        self, db, otro_cliente, usuario, auto_ocupado
    ):
        vehiculo, _ = auto_ocupado
        with pytest.raises(ConflictError):
            _crear(db, otro_cliente, usuario, vehiculo, _dt(D5, 10), _dt(D7, 10))

    def test_un_auto_en_el_taller_sigue_bloqueando(
        self, db, cliente, usuario, vehiculo
    ):
        db.add(BloqueoVehiculo(
            vehiculo_id=vehiculo.id, fecha_desde=D6, fecha_hasta=D6,
            motivo="mantenimiento", activo=True,
        ))
        db.flush()
        with pytest.raises(ConflictError) as e:
            _crear(db, cliente, usuario, vehiculo, _dt(D5, 10), _dt(D7, 10),
                   permitir_solape=True)
        assert "vehiculo_bloqueado" in str(e.value)

    def test_el_mismo_cliente_y_las_mismas_fechas_sigue_siendo_409(
        self, db, cliente, usuario, auto_ocupado
    ):
        """El reintento del contrato rápido sin conexión no duplica la reserva."""
        vehiculo, _ = auto_ocupado
        with pytest.raises(ConflictError):
            _crear(db, cliente, usuario, vehiculo, _dt(D5, 7), _dt(D6, 10),
                   permitir_solape=True)

    def test_el_mismo_cliente_con_otras_horas_si_pasa_con_aviso(
        self, db, cliente, usuario, auto_ocupado
    ):
        vehiculo, _ = auto_ocupado
        _, warnings = _crear(db, cliente, usuario, vehiculo, _dt(D5, 8), _dt(D6, 10),
                             permitir_solape=True)
        assert warnings[0]["tipo"] == "solape_con_ocupado"

    def test_vuelve_a_las_9_y_sale_a_las_10_no_tiene_nada_que_avisar(
        self, db, cliente, otro_cliente, usuario, vehiculo
    ):
        _ocupar(db, vehiculo, cliente, usuario, _dt(D5, 7), _dt(D6, 9))
        _, warnings = _crear(db, otro_cliente, usuario, vehiculo, _dt(D6, 10), _dt(D7, 10),
                             permitir_solape=True)
        assert warnings == []

    def test_encima_de_una_pendiente_avisa_como_siempre(
        self, db, cliente, otro_cliente, usuario, vehiculo
    ):
        _ocupar(db, vehiculo, cliente, usuario, _dt(D5, 7), _dt(D6, 10), estado="pendiente")
        _, warnings = _crear(db, otro_cliente, usuario, vehiculo, _dt(D5, 10), _dt(D7, 10),
                             permitir_solape=True)
        assert warnings[0]["tipo"] == "solape_con_pendiente"


class TestOtrosCaminos:
    def test_editar_una_reserva_encima_de_otra_avisa(
        self, db, cliente, otro_cliente, usuario, auto_ocupado
    ):
        vehiculo, existente = auto_ocupado
        reserva, _ = _crear(db, otro_cliente, usuario, vehiculo, _dt(D8, 10), _dt(date(2026, 10, 9), 10))
        reserva, warnings = ReservaService(db).update(
            reserva.id, usuario.id,
            fecha_inicio=D6, hora_inicio=time(9, 0), fecha_fin=D7, hora_fin=time(9, 0),
            permitir_solape=True,
        )
        assert [w["reserva_id"] for w in warnings] == [existente.id]

    def test_editar_sin_permiso_sigue_dando_409(
        self, db, otro_cliente, usuario, auto_ocupado
    ):
        vehiculo, _ = auto_ocupado
        reserva, _ = _crear(db, otro_cliente, usuario, vehiculo, _dt(D8, 10), _dt(date(2026, 10, 9), 10))
        with pytest.raises(ConflictError):
            ReservaService(db).update(
                reserva.id, usuario.id,
                fecha_inicio=D6, hora_inicio=time(9, 0), fecha_fin=D7, hora_fin=time(9, 0),
            )

    def test_confirmar_encima_de_otra_avisa(
        self, db, cliente, otro_cliente, usuario, vehiculo
    ):
        existente = _ocupar(db, vehiculo, cliente, usuario, _dt(D5, 7), _dt(D6, 10))
        pendiente = _ocupar(db, vehiculo, otro_cliente, usuario, _dt(D6, 9), _dt(D7, 9),
                            estado="pendiente")
        reserva, avisos = ReservaService(db).confirmar(
            pendiente.id, usuario.id, permitir_solape=True
        )
        assert reserva.estado == "confirmada"
        assert avisos[0]["reserva_id"] == existente.id

    def test_confirmar_sin_permiso_sigue_dando_409(
        self, db, cliente, otro_cliente, usuario, vehiculo
    ):
        _ocupar(db, vehiculo, cliente, usuario, _dt(D5, 7), _dt(D6, 10))
        pendiente = _ocupar(db, vehiculo, otro_cliente, usuario, _dt(D6, 9), _dt(D7, 9),
                            estado="pendiente")
        with pytest.raises(ConflictError):
            ReservaService(db).confirmar(pendiente.id, usuario.id)

    def test_reasignar_a_un_auto_ocupado_avisa(
        self, db, cliente, otro_cliente, usuario, auto_ocupado
    ):
        vehiculo, existente = auto_ocupado
        otro_auto = Vehiculo(
            patente="ZZ999ZZ", marca="Fiat", modelo="Argo", anio=2024, tipo="auto",
            color="gris", estado="disponible", km_actual=1000,
        )
        db.add(otro_auto)
        db.flush()
        reserva, _ = _crear(db, otro_cliente, usuario, otro_auto, _dt(D6, 9), _dt(D7, 9))
        reserva, warnings = ReservaService(db).reasignar(
            reserva.id, vehiculo.id, usuario.id, permitir_solape=True
        )
        assert reserva.vehiculo_id == vehiculo.id
        assert [w["reserva_id"] for w in warnings] == [existente.id]

    def test_validar_disponibilidad_devuelve_los_avisos(
        self, db, auto_ocupado
    ):
        vehiculo, existente = auto_ocupado
        args = (vehiculo.id, D6, time(9, 0), D7, time(9, 0))
        with pytest.raises(ConflictError):
            ReservaService(db).validar_disponibilidad_vehiculo(*args)
        avisos = ReservaService(db).validar_disponibilidad_vehiculo(*args, permitir_solape=True)
        assert [a["reserva_id"] for a in avisos] == [existente.id]

    def test_extender_encima_de_otra_reserva_avisa(
        self, db, cliente, otro_cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler
    ):
        activa = hacer_reserva(estado="activa", fecha_inicio=D5, fecha_fin=D6)
        alquiler = hacer_alquiler(activa, checkout_fecha=D5)
        siguiente = _ocupar(db, vehiculo, otro_cliente, usuario, _dt(D7, 10), _dt(D8, 10))
        args = dict(
            alquiler_id=alquiler.id, nueva_fecha_fin=D8, nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id, precio_manual=Decimal("300000"),
        )
        with pytest.raises(ConflictError):
            AlquilerService(db).extender(**args)
        _, avisos = AlquilerService(db).extender(**args, permitir_solape=True)
        assert [a["reserva_id"] for a in avisos] == [siguiente.id]


class TestAvisosAntesDeGuardar:
    def test_dice_con_que_se_pisa_y_no_toma_el_lock_del_auto(
        self, db, auto_ocupado, monkeypatch
    ):
        vehiculo, existente = auto_ocupado

        def _no_debe_llamarse(*a, **k):
            raise AssertionError("una lectura no toma el lock del vehículo")

        monkeypatch.setattr(ReservaService, "_lock_vehiculo", _no_debe_llamarse)
        r = ReservaService(db).avisos_de_solape(vehiculo.id, _dt(D6, 9), _dt(D7, 9))
        assert [s["reserva_id"] for s in r["solapes"]] == [existente.id]
        assert r["bloqueo"] is None

    def test_el_bloqueo_viene_aparte(self, db, vehiculo):
        db.add(BloqueoVehiculo(
            vehiculo_id=vehiculo.id, fecha_desde=D6, fecha_hasta=D7,
            motivo="mantenimiento", activo=True,
        ))
        db.flush()
        r = ReservaService(db).avisos_de_solape(vehiculo.id, _dt(D6, 9), _dt(D8, 9))
        assert r["solapes"] == []
        assert r["bloqueo"]["fecha_desde"] == "2026-10-06"
        assert r["bloqueo"]["fecha_hasta"] == "2026-10-07"

    def test_no_se_cuenta_a_si_misma_al_editar(self, db, auto_ocupado):
        vehiculo, existente = auto_ocupado
        r = ReservaService(db).avisos_de_solape(
            vehiculo.id, _dt(D5, 7), _dt(D6, 10), excluir_reserva_id=existente.id
        )
        assert r["solapes"] == []

    def test_el_endpoint_responde_y_avisa_cuando_vuelve_el_auto(
        self, client, db, cliente, usuario, vehiculo
    ):
        _ocupar(db, vehiculo, cliente, usuario, _dt(D5, 7), _dt(D6, 9))
        r = client.get("/api/v1/reservas/avisos-de-solape", params={
            "vehiculo_id": vehiculo.id,
            "fecha_inicio": D6.isoformat(), "hora_inicio": "10:00:00",
            "fecha_fin": D7.isoformat(), "hora_fin": "10:00:00",
        })
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["solapes"] == []
        assert data["vuelve_a"] == "09:00"
        assert data["minutos_para_prepararlo"] == 60


class TestPorHttp:
    def _payload(self, vehiculo, cliente, inicio, fin):
        return {
            "vehiculo_id": vehiculo.id, "cliente_id": cliente.id,
            "fecha_inicio": inicio.date().isoformat(), "hora_inicio": inicio.strftime("%H:%M:%S"),
            "fecha_fin": fin.date().isoformat(), "hora_fin": fin.strftime("%H:%M:%S"),
            "lugar_entrega": "Paraguay 241", "lugar_devolucion": "Paraguay 241",
            "precio_total": 100000, "descuento_motivo": "prueba",
        }

    def test_post_de_una_reserva_encimada_da_201_con_el_aviso(
        self, client, otro_cliente, auto_ocupado
    ):
        vehiculo, existente = auto_ocupado
        r = client.post("/api/v1/reservas", json=self._payload(
            vehiculo, otro_cliente, _dt(D5, 10), _dt(D7, 10)))
        assert r.status_code == 201, r.text
        warnings = r.json()["data"]["warnings"]
        assert warnings[0]["tipo"] == "solape_con_ocupado"
        assert warnings[0]["reserva_id"] == existente.id

    def test_post_sobre_un_auto_en_el_taller_da_409(self, client, db, otro_cliente, vehiculo):
        db.add(BloqueoVehiculo(
            vehiculo_id=vehiculo.id, fecha_desde=D6, fecha_hasta=D6,
            motivo="mantenimiento", activo=True,
        ))
        db.flush()
        r = client.post("/api/v1/reservas", json=self._payload(
            vehiculo, otro_cliente, _dt(D5, 10), _dt(D7, 10)))
        assert r.status_code == 409
