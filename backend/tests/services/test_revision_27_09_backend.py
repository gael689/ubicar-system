"""
Revisión del 27/09: lo que la revisión de código encontró en el backend.

Un archivo, una clase por hallazgo. Cada test es la regresión del bug tal como
se verificó, así que el nombre dice lo que tiene que seguir siendo cierto:

1. Editar una reserva no anota plata que no entró (`estado_pago`/`anticipo_*`
   del PATCH se ignoran; el anticipo se deriva de los `Pago` de seña).
2. Los adicionales por día se recalculan sólo si la duración cambió y nunca
   con el auto afuera; extender debita lo que suman en los días agregados.
3. Una reserva fantasma (`activa`/`vencida` sin alquiler) se puede cancelar.
4. El aviso de contrato sin firmar vuelve a sonar cuando sube de urgencia.
5. Un conductor dado de baja no traba la edición de la reserva que ya lo tenía.
6. Regenerar el contrato avisa que se anuló la franquicia.
7. Clerk caído no cuesta 3 s por request: el fracaso se recuerda un rato.
8. El script de limpieza libera el auto, mira todo pago web y usa la fecha
   argentina.
9. El cotizador cobra el día extra por horario, como la reserva.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.models.adicional import Adicional, ReservaAdicional
from app.models.cliente import ConductorAdicional
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.notificacion import Notificacion
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.services.alquiler_service import AlquilerService
from app.services.reserva_service import ReservaService

# Los fixtures del contrato con la empresa configurada viven en el test del
# pagaré; importarlos los registra también acá.
from tests.services.test_pagare import contrato, empresa_configurada, _emitir  # noqa: F401

HOY = date.today()


def _adicional(db, *, codigo, precio, unidad="unico"):
    a = Adicional(
        codigo=codigo, nombre=codigo.upper(), grupo="extra", precio=Decimal(precio),
        unidad_cobro=unidad, activo=True,
    )
    db.add(a)
    db.flush()
    return a


def _crear(db, cliente, usuario, vehiculo, **extra):
    kwargs = dict(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 10, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 5),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"),
        descuento_motivo="Precio pactado",
        usuario_id=usuario.id,
    )
    kwargs.update(extra)
    reserva, _ = ReservaService(db).create(**kwargs)
    db.flush()
    return reserva


def _con_seguro_por_dia(db, reserva, por_dia="1000"):
    """Le cuelga a la reserva un seguro por día, con el subtotal de su duración."""
    from app.domain.tarifas import dias_facturables

    seguro = _adicional(db, codigo="seguro", precio=por_dia, unidad="por_dia")
    dias = dias_facturables(reserva.fecha_inicio, reserva.hora_inicio, reserva.fecha_fin, reserva.hora_fin)
    ra = ReservaAdicional(
        adicional_id=seguro.id, cantidad=1, precio_unitario=Decimal(por_dia),
        unidad_cobro="por_dia", subtotal=Decimal(por_dia) * dias,
    )
    reserva.adicionales.append(ra)
    db.flush()
    return ra


# ── 1. Editar no anota plata ─────────────────────────────────────────────────

class TestEditarNoInventaPlata:
    def test_sumar_un_adicional_a_una_pagada_no_sube_el_anticipo(
        self, db, cliente, usuario, vehiculo
    ):
        """
        **El bug:** reserva pagada, se le suma un seguro, el formulario manda
        `estado_pago="pagado"` y el anticipo subía al total nuevo sin un peso
        detrás. Ahora queda en lo que se cobró, y en "anticipo": falta el seguro.
        """
        gps = _adicional(db, codigo="gps", precio="5000")
        seguro = _adicional(db, codigo="silla", precio="20000")
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            adicionales=[(gps.id, 1)], estado_pago="pagado", anticipo_medio_pago="efectivo",
        )
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("105000")

        svc = ReservaService(db)
        reserva, _ = svc.update(
            reserva.id, usuario.id,
            adicionales=[(gps.id, 1), (seguro.id, 1)],
            estado_pago="pagado", anticipo_monto=Decimal("125000"),
        )

        assert Decimal(str(reserva.anticipo_monto)) == Decimal("105000")
        assert reserva.estado_pago == "anticipo"
        assert svc.saldo_pendiente(reserva) == Decimal("20000")
        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 1

    def test_la_plata_nueva_entra_por_registrar_cobro(self, db, cliente, usuario, vehiculo):
        gps = _adicional(db, codigo="gps", precio="5000")
        seguro = _adicional(db, codigo="silla", precio="20000")
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            adicionales=[(gps.id, 1)], estado_pago="pagado", anticipo_medio_pago="efectivo",
        )
        svc = ReservaService(db)
        svc.update(reserva.id, usuario.id, adicionales=[(gps.id, 1), (seguro.id, 1)])
        reserva = svc.registrar_cobro(
            reserva.id, Decimal("20000"), "efectivo", usuario.id, fecha=HOY, confirmar=False,
        )
        assert reserva.estado_pago == "pagado"
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("125000")

    def test_un_anticipo_arbitrario_se_ignora_si_hay_pagos(self, db, cliente, usuario, vehiculo):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="anticipo", anticipo_monto=Decimal("30000"), anticipo_medio_pago="efectivo",
        )
        reserva, _ = ReservaService(db).update(
            reserva.id, usuario.id, anticipo_monto=Decimal("999999"), notas="x",
        )
        assert Decimal(str(reserva.anticipo_monto)) == Decimal("30000")
        assert reserva.estado_pago == "anticipo"

    def test_una_sena_anulada_deja_de_contar(self, db, cliente, usuario, vehiculo):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="anticipo", anticipo_monto=Decimal("30000"), anticipo_medio_pago="efectivo",
        )
        pago = db.query(Pago).filter_by(reserva_id=reserva.id).one()
        pago.anulado = True
        db.flush()
        reserva, _ = ReservaService(db).update(reserva.id, usuario.id, notas="x")
        assert Decimal(str(reserva.anticipo_monto)) == 0
        assert reserva.estado_pago == "pendiente"

    def test_una_reserva_vieja_sin_pagos_conserva_su_sena(self, db, usuario, hacer_reserva):
        """Datos de antes de la migración 079: la seña anotada es la única constancia."""
        r = hacer_reserva(
            estado="confirmada", anticipo_monto=Decimal("50000"), estado_pago="anticipo",
            fecha_inicio=HOY + timedelta(days=10), fecha_fin=HOY + timedelta(days=12),
        )
        r, _ = ReservaService(db).update(r.id, usuario.id, notas="Llamó el cliente")
        assert Decimal(str(r.anticipo_monto)) == Decimal("50000")
        assert r.estado_pago == "anticipo"
        assert r.notas == "Llamó el cliente"


# ── 2. Adicionales por día ───────────────────────────────────────────────────

class TestAdicionalesPorDia:
    def test_guardar_sin_cambiar_la_duracion_no_los_toca(self, db, usuario, hacer_reserva):
        r = hacer_reserva(fecha_inicio=HOY + timedelta(days=10), fecha_fin=HOY + timedelta(days=14))
        ra = _con_seguro_por_dia(db, r)
        # Un subtotal que el recálculo no reproduciría: si se recalculara, cambia.
        ra.subtotal = Decimal("1234")
        db.flush()
        # La pantalla manda siempre las fechas y horas, aunque no cambien.
        ReservaService(db).update(
            r.id, usuario.id,
            fecha_inicio=r.fecha_inicio, hora_inicio=r.hora_inicio,
            fecha_fin=r.fecha_fin, hora_fin=r.hora_fin, notas="x",
        )
        assert Decimal(str(ra.subtotal)) == Decimal("1234")

    def test_alargar_la_reserva_los_recalcula(self, db, usuario, hacer_reserva):
        r = hacer_reserva(fecha_inicio=HOY + timedelta(days=10), fecha_fin=HOY + timedelta(days=14))
        ra = _con_seguro_por_dia(db, r)
        ReservaService(db).update(r.id, usuario.id, fecha_fin=HOY + timedelta(days=16))
        assert Decimal(str(ra.subtotal)) == Decimal("6000")

    def test_con_el_auto_afuera_no_los_recalcula_y_avisa(
        self, db, usuario, hacer_reserva, hacer_alquiler
    ):
        r = hacer_reserva(estado="activa", fecha_inicio=HOY - timedelta(days=1),
                          fecha_fin=HOY + timedelta(days=3))
        ra = _con_seguro_por_dia(db, r)
        hacer_alquiler(r, checkout_fecha=HOY - timedelta(days=1))
        _, warnings = ReservaService(db).update(r.id, usuario.id, hora_fin=time(16, 0))
        assert Decimal(str(ra.subtotal)) == Decimal("4000")
        assert [w["tipo"] for w in warnings] == ["adicionales_no_recalculados"]

    def test_extender_debita_los_adicionales_de_los_dias_nuevos(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        r = hacer_reserva(estado="activa")  # 1 al 5/9: cuatro días
        _con_seguro_por_dia(db, r)
        alquiler = hacer_alquiler(r)

        AlquilerService(db).extender(
            alquiler_id=alquiler.id, nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0), usuario_id=usuario.id,
            precio_extension=Decimal("30000"),
        )
        db.flush()

        montos = sorted(
            Decimal(str(m.monto))
            for m in db.query(MovimientoCuentaCorriente).filter_by(naturaleza="extension")
        )
        assert montos == [Decimal("3000"), Decimal("30000")]

    def test_el_endpoint_devuelve_adicionales_extension(
        self, db, client, usuario, hacer_reserva, hacer_alquiler
    ):
        r = hacer_reserva(estado="activa")
        _con_seguro_por_dia(db, r)
        alquiler = hacer_alquiler(r)
        resp = client.patch(f"/api/v1/alquileres/{alquiler.id}/extender", json={
            "nueva_fecha_fin": "2026-09-08", "nueva_hora_fin": "10:00",
            "precio_extension": "30000",
        })
        assert resp.status_code == 200, resp.text
        datos = resp.json()["data"]
        assert Decimal(str(datos["adicionales_extension"])) == Decimal("3000")
        assert Decimal(str(datos["precio_extension"])) == Decimal("30000")


# ── 3. Reservas fantasma ─────────────────────────────────────────────────────

class TestCancelarUnaFantasma:
    @pytest.mark.parametrize("estado", ["activa", "vencida"])
    def test_sin_alquiler_se_cancela_y_libera_el_auto(
        self, db, usuario, vehiculo, hacer_reserva, estado
    ):
        vehiculo.estado = "reservado"
        r = hacer_reserva(estado=estado, fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        r = ReservaService(db).cancelar(r.id, usuario.id, motivo="Nunca vino")
        assert r.estado == "cancelada"
        assert vehiculo.estado == "disponible"

    def test_con_sena_la_retiene_como_cualquier_cancelacion(
        self, db, cliente, usuario, vehiculo, hacer_reserva
    ):
        r = hacer_reserva(estado="vencida", fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        svc = ReservaService(db)
        # El cobro se registra mientras está resoluble y el reloj viejo la pasó después.
        r.estado = "confirmada"
        svc.registrar_cobro(r.id, Decimal("20000"), "efectivo", usuario.id, fecha=HOY, confirmar=False)
        r.estado = "vencida"
        db.flush()

        svc.cancelar(r.id, usuario.id, motivo="Nunca vino")
        retenida = db.query(MovimientoCuentaCorriente).filter_by(naturaleza="sena_retenida").one()
        assert Decimal(str(retenida.monto)) == Decimal("20000")

    def test_con_el_auto_afuera_no(self, db, usuario, hacer_reserva, hacer_alquiler):
        r = hacer_reserva(estado="activa")
        hacer_alquiler(r)
        with pytest.raises(ConflictError):
            ReservaService(db).cancelar(r.id, usuario.id, motivo="x")


# ── 4. El aviso de contrato sin firmar escala ────────────────────────────────

@pytest.fixture
def motor(db, monkeypatch):
    from app.services import notificacion_service as ns
    from app.services.notificacion_service import NotificacionService

    estado = {"candidatos": []}
    monkeypatch.setattr(ns, "evaluar_todas", lambda _db, _hoy: list(estado["candidatos"]))

    def correr(dia, candidatos):
        estado["candidatos"] = candidatos
        NotificacionService(db).generar(hoy=dia)
        db.flush()
    return correr


ENTREGA = HOY + timedelta(days=3)


def _contrato_sin_firmar(urgencia):
    return {
        "tipo": "contrato_no_firmado", "titulo": "Contrato sin firmar", "descripcion": "d",
        "urgencia": urgencia, "entidad_tipo": "reserva", "entidad_id": 7,
        "url_destino": "/reservas?reserva=7", "fecha_objetivo": ENTREGA,
    }


def _activas(db):
    from app.services.notificacion_service import ESTADOS_ACTIVOS

    return db.query(Notificacion).filter(
        Notificacion.tipo == "contrato_no_firmado", Notificacion.estado.in_(ESTADOS_ACTIVOS),
    ).all()


class TestContratoSinFirmarEscala:
    def test_descartar_el_media_no_calla_el_alta(self, db, motor):
        from app.services.notificacion_service import NotificacionService

        motor(HOY, [_contrato_sin_firmar("media")])
        NotificacionService(db).descartar(_activas(db)[0].id)

        # Al día siguiente, misma urgencia: no se repite.
        motor(HOY + timedelta(days=1), [_contrato_sin_firmar("media")])
        assert _activas(db) == []

        # El día anterior a la entrega sube a alta: vuelve a sonar.
        motor(HOY + timedelta(days=2), [_contrato_sin_firmar("alta")])
        activas = _activas(db)
        assert len(activas) == 1 and activas[0].urgencia == "alta"

        # Descartado el alta, el día de la entrega no se repite.
        NotificacionService(db).descartar(activas[0].id)
        motor(ENTREGA, [_contrato_sin_firmar("alta")])
        assert _activas(db) == []

    def test_una_resuelta_no_calla_el_aviso_si_el_problema_vuelve(self, db, motor):
        motor(HOY, [_contrato_sin_firmar("media")])
        # Se firmó (o se regeneró): la regla deja de proponerlo y se resuelve.
        motor(HOY, [])
        assert _activas(db) == []
        # El contrato regenerado tampoco está firmado.
        motor(HOY + timedelta(days=1), [_contrato_sin_firmar("media")])
        assert len(_activas(db)) == 1

    def test_no_se_duplica_mientras_esta_abierto(self, db, motor):
        for i in range(3):
            motor(HOY + timedelta(days=i), [_contrato_sin_firmar("media" if i < 2 else "alta")])
        activas = _activas(db)
        assert len(activas) == 1 and activas[0].urgencia == "alta"


# ── 5. Conductor dado de baja ────────────────────────────────────────────────

class TestConductorDadoDeBaja:
    def _conductor(self, db, cliente, nombre, dni):
        c = ConductorAdicional(cliente_id=cliente.id, nombre_completo=nombre, dni=dni)
        db.add(c)
        db.flush()
        return c

    def test_el_que_ya_estaba_no_traba_la_edicion(self, db, cliente, usuario, hacer_reserva):
        r = hacer_reserva(fecha_inicio=HOY + timedelta(days=10), fecha_fin=HOY + timedelta(days=12))
        a = self._conductor(db, cliente, "Ana", "30000001")
        svc = ReservaService(db)
        svc.update(r.id, usuario.id, conductor_ids=[a.id])
        a.activo = False
        db.flush()

        r, _ = svc.update(r.id, usuario.id, conductor_ids=[a.id], notas="Otra nota")
        assert r.conductor_ids == [a.id]
        assert r.notas == "Otra nota"

    def test_sumar_uno_dado_de_baja_sigue_sin_poderse(self, db, cliente, usuario, hacer_reserva):
        r = hacer_reserva(fecha_inicio=HOY + timedelta(days=10), fecha_fin=HOY + timedelta(days=12))
        b = self._conductor(db, cliente, "Beto", "30000002")
        b.activo = False
        db.flush()
        with pytest.raises(NotFoundError):
            ReservaService(db).update(r.id, usuario.id, conductor_ids=[b.id])


# ── 6. Regenerar avisa de la franquicia ──────────────────────────────────────

class TestRegenerarAvisaDeLaFranquicia:
    def test_con_franquicia(self, db, usuario, contrato):  # noqa: F811
        from app.services.contrato_service import ContratoService
        from app.services.pagare_service import PagareService

        pagare = _emitir(db, contrato, usuario)
        nuevo, anulada, aviso = ContratoService(db).regenerar(contrato.id, "Cambió el conductor", usuario.id)
        assert anulada is True
        assert "franquicia" in aviso.lower()
        assert PagareService(db).get(pagare.id).anulado is True
        assert PagareService(db).de_contrato(nuevo.id) is None

    def test_sin_franquicia(self, db, usuario, contrato):  # noqa: F811
        from app.services.contrato_service import ContratoService

        _, anulada, aviso = ContratoService(db).regenerar(contrato.id, "Cambió el domicilio", usuario.id)
        assert anulada is False
        assert aviso is None

    def test_el_endpoint_lo_devuelve(self, db, client, usuario, contrato):  # noqa: F811
        _emitir(db, contrato, usuario)
        resp = client.post(f"/api/v1/contratos/{contrato.id}/regenerar", json={"motivo": "Conductor"})
        assert resp.status_code == 201, resp.text
        datos = resp.json()["data"]
        assert datos["franquicia_anulada"] is True
        assert datos["aviso"]


# ── 7. Clerk caído ───────────────────────────────────────────────────────────

class TestClerkCaido:
    def test_el_fracaso_se_recuerda_un_rato(self, monkeypatch):
        import httpx

        import app.core.deps as deps

        llamadas = {"n": 0}

        def _caido(*a, **k):
            llamadas["n"] += 1
            raise httpx.ConnectTimeout("sin respuesta")

        reloj = {"t": 1000.0}
        monkeypatch.setattr(deps.settings, "clerk_secret_key", "sk_test_x")
        monkeypatch.setattr(httpx, "get", _caido)
        monkeypatch.setattr(deps.time, "monotonic", lambda: reloj["t"])
        deps._clerk_nombres_cache.clear()
        deps._clerk_fallos.clear()

        assert deps._nombre_desde_api_de_clerk("user_1") == ""
        assert deps._nombre_desde_api_de_clerk("user_1") == ""
        assert llamadas["n"] == 1, "con Clerk caído no se le vuelve a preguntar en cada request"

        reloj["t"] += deps.CLERK_REINTENTO_SEGUNDOS + 1
        deps._nombre_desde_api_de_clerk("user_1")
        assert llamadas["n"] == 2, "pasado el rato se reintenta"
        deps._clerk_fallos.clear()

    def test_un_5xx_no_queda_cacheado_para_siempre(self, monkeypatch):
        import httpx

        import app.core.deps as deps

        class _R:
            def __init__(self, code, datos=None):
                self.status_code = code
                self._datos = datos or {}

            def json(self):
                return self._datos

        respuestas = [_R(503), _R(200, {"first_name": "Franco", "last_name": "Ruiz"})]
        reloj = {"t": 1000.0}
        monkeypatch.setattr(deps.settings, "clerk_secret_key", "sk_test_x")
        monkeypatch.setattr(httpx, "get", lambda *a, **k: respuestas.pop(0))
        monkeypatch.setattr(deps.time, "monotonic", lambda: reloj["t"])
        deps._clerk_nombres_cache.clear()
        deps._clerk_fallos.clear()

        assert deps._nombre_desde_api_de_clerk("user_2") == ""
        reloj["t"] += deps.CLERK_REINTENTO_SEGUNDOS + 1
        assert deps._nombre_desde_api_de_clerk("user_2") == "Franco Ruiz"
        deps._clerk_nombres_cache.clear()


# ── 8. El script de limpieza ─────────────────────────────────────────────────

class TestLaLimpiezaDelScript:
    def test_libera_el_auto(self, db, vehiculo, hacer_reserva):
        from scripts import limpiar_reservas_sin_contrato as limpieza

        vehiculo.estado = "reservado"
        hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                      fecha_fin=HOY - timedelta(days=8))
        hacer_reserva(estado="activa", fecha_inicio=HOY - timedelta(days=7),
                      fecha_fin=HOY - timedelta(days=5))
        db.flush()
        assert limpieza.cancelar(db, limpieza.seleccionar(db, HOY).a_cancelar) == 2
        assert vehiculo.estado == "disponible"

    def test_no_libera_el_auto_si_otra_reserva_lo_tiene(self, db, vehiculo, hacer_reserva):
        from scripts import limpiar_reservas_sin_contrato as limpieza

        vehiculo.estado = "reservado"
        hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                      fecha_fin=HOY - timedelta(days=8))
        hacer_reserva(estado="confirmada", fecha_inicio=HOY + timedelta(days=5),
                      fecha_fin=HOY + timedelta(days=8))
        limpieza.cancelar(db, limpieza.seleccionar(db, HOY).a_cancelar)
        assert vehiculo.estado == "reservado"

    @pytest.mark.parametrize("estado", ["iniciado", "pendiente", "revision", "devuelto", "aprobado"])
    def test_todo_pago_web_no_rechazado_es_plata(self, db, hacer_reserva, estado):
        from app.models.pago_web import PagoWeb
        from scripts import limpiar_reservas_sin_contrato as limpieza

        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        db.add(PagoWeb(reserva_id=r.id, preference_id="pref", monto=Decimal("1000"),
                       porcentaje_anticipo=30, total_reserva=Decimal("3000"), estado=estado))
        db.flush()
        sel = limpieza.seleccionar(db, HOY)
        assert sel.a_cancelar == []
        assert [m for _, m in sel.con_plata] == [["pago web"]]

    def test_un_pago_web_rechazado_no_la_retiene(self, db, hacer_reserva):
        from app.models.pago_web import PagoWeb
        from scripts import limpiar_reservas_sin_contrato as limpieza

        r = hacer_reserva(estado="confirmada", fecha_inicio=HOY - timedelta(days=10),
                          fecha_fin=HOY - timedelta(days=8))
        db.add(PagoWeb(reserva_id=r.id, preference_id="pref", monto=Decimal("1000"),
                       porcentaje_anticipo=30, total_reserva=Decimal("3000"), estado="rechazado"))
        db.flush()
        assert [x.id for x in limpieza.seleccionar(db, HOY).a_cancelar] == [r.id]

    def test_usa_la_fecha_argentina(self):
        import inspect

        from scripts import limpiar_reservas_sin_contrato as limpieza

        fuente = inspect.getsource(limpieza.main)
        assert "fecha_hoy_argentina()" in fuente
        assert "seleccionar(db, date.today()" not in fuente


# ── 9. El cotizador mira el horario ──────────────────────────────────────────

class TestCotizadorConHorario:
    @pytest.fixture()
    def tarifa(self, db):
        from app.models.tarifa import Tarifa

        t = Tarifa(tipo="diaria", monto=Decimal("10000"), activo=True)
        db.add(t)
        db.flush()
        return t

    def _cotizar(self, client, vehiculo, **horas):
        params = {"vehiculo_id": vehiculo.id, "fecha_inicio": "2026-10-01", "fecha_fin": "2026-10-03"}
        params.update(horas)
        r = client.post("/api/v1/cotizador/calcular", params=params)
        assert r.status_code == 200, r.text
        return r.json()["data"]

    def test_sin_horas_como_antes(self, client, vehiculo, tarifa):
        assert self._cotizar(client, vehiculo)["dias"] == 2

    def test_devolver_mas_tarde_suma_un_dia(self, client, vehiculo, tarifa):
        datos = self._cotizar(client, vehiculo, hora_inicio="10:00", hora_fin="14:00")
        assert datos["dias"] == 3
        assert Decimal(str(datos["total_sugerido"])) == Decimal("30000")

    def test_dentro_de_la_tolerancia_no(self, client, vehiculo, tarifa):
        assert self._cotizar(client, vehiculo, hora_inicio="10:00", hora_fin="10:30")["dias"] == 2
