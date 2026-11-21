"""
El tablero de Uber (21/11/2026): quién pagó la semana y quién debe, cobrar en
dos clics, cargar el km, renovar, y los avisos.

Las fechas son relativas a hoy a propósito: el tablero es una foto del día, y
varias validaciones (una lectura no puede ser futura, por ejemplo) miran el
reloj de verdad.
"""
from datetime import date, time, timedelta
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError, ConflictError
from app.domain import notificaciones_reglas as reglas
from app.models.cliente import Cliente
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.notificacion import Notificacion
from app.models.pago import Pago
from app.models.vehiculo import Vehiculo
from app.services.alquiler_service import AlquilerService
from app.services.notificacion_service import NotificacionService
from app.services.reserva_service import ReservaService
from app.services.uber_service import UberService

HOY = date.today()
VALOR = Decimal("200000")


def dias(n: int) -> date:
    return HOY + timedelta(days=n)


@pytest.fixture
def flota(db):
    """Fábrica de (cliente, vehículo): cada contrato necesita los suyos."""
    contador = {"n": 0}

    def _hacer(nombre: str):
        contador["n"] += 1
        n = contador["n"]
        c = Cliente(nombre_completo=nombre, dni_cuit=f"2000000{n}", telefono=f"291555000{n}", tipo="particular")
        v = Vehiculo(
            patente=f"UB{n:03d}ER", marca="Fiat", modelo="Cronos", anio=2024, tipo="auto",
            color="blanco", estado="disponible", km_actual=10_000,
        )
        db.add_all([c, v])
        db.flush()
        return c, v

    return _hacer


@pytest.fixture
def contratar(db, usuario, flota):
    """Crea un contrato de Uber y, salvo que se pida lo contrario, entrega el auto."""

    def _hacer(nombre="Chofer Uno", *, empezo_hace=0, semanas=4, entregar=True, **extra):
        cliente, vehiculo = flota(nombre)
        inicio = dias(-empezo_hace)
        reserva, _ = ReservaService(db).create(
            cliente_id=cliente.id,
            vehiculo_id=vehiculo.id,
            fecha_inicio=inicio,
            hora_inicio=time(10, 0),
            fecha_fin=inicio + timedelta(days=7 * semanas),
            hora_fin=time(10, 0),
            lugar_entrega="Paraguay 241",
            lugar_devolucion="Paraguay 241",
            usuario_id=usuario.id,
            tipo="uber",
            uber_valor_semana=VALOR,
            uber_km_semana=1500,
            uber_precio_km_extra=Decimal("150"),
            **extra,
        )
        db.flush()
        if not entregar:
            return reserva, None
        alquiler, _ = AlquilerService(db).checkout(
            reserva_id=reserva.id,
            checkout_fecha=inicio,
            checkout_hora=time(10, 0),
            checkout_km=10_000,
            checkout_combustible=100,
            checkout_descripcion=None,
            usuario_id=usuario.id,
        )
        db.flush()
        return reserva, alquiler

    return _hacer


def _cobrar(db, usuario, alquiler, monto, medio="efectivo", fecha=None):
    pago = UberService(db).cobrar_semana(
        alquiler.id, monto=Decimal(str(monto)), medio_pago=medio,
        fecha=fecha or HOY, usuario_id=usuario.id,
    )
    db.flush()
    return pago


def _fila(tablero, alquiler):
    return next(c for c in tablero["contratos"] if c["alquiler_id"] == alquiler.id)


# ── El tablero ───────────────────────────────────────────────────────────────

class TestTablero:
    def test_cada_contrato_con_su_estado_y_ordenados_por_urgencia(self, db, usuario, contratar):
        _, atrasado = contratar("Atrasado", empezo_hace=16)       # debe 3 semanas
        _, vence = contratar("Vence Hoy", empezo_hace=7)
        _cobrar(db, usuario, vence, VALOR, fecha=dias(-7))
        _, al_dia = contratar("Al Dia", empezo_hace=3)
        _cobrar(db, usuario, al_dia, VALOR, fecha=dias(-3))
        por_entregar, _ = contratar("Por Entregar", empezo_hace=-2, entregar=False)

        t = UberService(db).tablero(HOY)

        assert [c["chofer"] for c in t["contratos"]] == ["Atrasado", "Vence Hoy", "Al Dia", "Por Entregar"]
        assert [c["estado"] for c in t["contratos"]] == ["atrasado", "vence_hoy", "al_dia", "a_entregar"]

        fila = _fila(t, atrasado)
        assert fila["semana"]["numero"] == 3 and fila["semana"]["total"] == 4
        assert fila["dias_atraso"] == 16
        assert fila["semanas_adeudadas"] == 3
        assert fila["adeudado"] == 600000
        assert fila["valor_semana"] == 200000
        assert fila["proxima_fecha"] == dias(5).isoformat()
        assert fila["dias_para_terminar"] == 12
        assert fila["telefono"] and fila["patente"]

        assert _fila(t, vence)["cuota_a_cobrar"] == {
            "numero": 2, "monto": 200000, "vencimiento": HOY.isoformat(),
        }
        assert _fila(t, al_dia)["proxima_fecha"] == dias(4).isoformat()

        reserva_fila = t["contratos"][-1]
        assert reserva_fila["tipo_fila"] == "reserva" and reserva_fila["alquiler_id"] is None
        assert reserva_fila["reserva_id"] == por_entregar.id
        assert len(reserva_fila["cuotas"]) == 4

    def test_los_cuatro_numeros_de_arriba(self, db, usuario, contratar):
        contratar("Atrasado", empezo_hace=16)
        _, vence = contratar("Vence Hoy", empezo_hace=7)
        _cobrar(db, usuario, vence, VALOR, fecha=dias(-7))
        _, al_dia = contratar("Al Dia", empezo_hace=3)
        _cobrar(db, usuario, al_dia, VALOR, fecha=dias(-3))
        contratar("Por Entregar", empezo_hace=-2, entregar=False)

        r = UberService(db).tablero(HOY)["resumen"]
        assert (r["activos"], r["al_dia"], r["vence_hoy"], r["atrasados"]) == (3, 1, 1, 1)
        assert r["adeudado"] == 600000
        assert r["a_entregar"] == 1
        # Lo de hoy (y lo que venza de lunes a domingo) siempre entra.
        assert r["a_cobrar_semana"] >= 200000

    def test_el_detalle_muestra_cada_cuota_con_su_pago(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=8)
        _cobrar(db, usuario, alquiler, VALOR, medio="transferencia", fecha=dias(-8))

        cuotas = _fila(UberService(db).tablero(HOY), alquiler)["cuotas"]
        assert [q["estado"] for q in cuotas] == ["paga", "vencida", "pendiente", "pendiente"]
        assert cuotas[0]["fecha_pago"] == dias(-8).isoformat()
        assert cuotas[0]["medio_pago"] == "transferencia"
        assert cuotas[1]["saldo"] == 200000

    def test_los_autos_de_uber_sin_chofer_aparecen_libres(self, db, contratar, flota):
        reserva, _ = contratar(empezo_hace=1)
        _, libre = flota("Nadie")
        libre.destino = "uber"
        _, de_alquiler = flota("Otro")  # destino alquiler: no es de Uber
        db.flush()

        t = UberService(db).tablero(HOY)
        assert [v["vehiculo_id"] for v in t["libres"]] == [libre.id]
        assert reserva.vehiculo_id not in [v["vehiculo_id"] for v in t["libres"]]
        assert (t["pie"]["autos_ocupados"], t["pie"]["autos_libres"]) == (1, 1)

    def test_el_pie_dice_cuanto_entra_por_semana_y_cuanto_se_cobro(self, db, usuario, contratar):
        _, a = contratar("Uno", empezo_hace=0)
        _cobrar(db, usuario, a, VALOR)
        contratar("Dos", empezo_hace=0)

        pie = UberService(db).tablero(HOY)["pie"]
        assert pie["ingreso_semanal"] == 400000
        assert pie["cobranza_mes_pct"] == 50

    def test_un_contrato_devuelto_o_un_alquiler_comun_no_aparecen(
        self, db, usuario, contratar, hacer_reserva, hacer_alquiler
    ):
        hacer_alquiler(hacer_reserva())  # alquiler común
        assert UberService(db).tablero(HOY)["contratos"] == []

    def test_propone_los_valores_del_ultimo_contrato(self, db, contratar):
        assert UberService(db).ultimos_valores() is None
        contratar(entregar=False, condicion_pago_texto="Semanal vencido — transferencia")
        assert UberService(db).ultimos_valores() == {
            "valor_semana": 200000, "km_semana": 1500, "precio_km_extra": 150, "modalidad": "vencido",
        }

    def test_la_sena_se_aplica_a_la_primera_semana(self, db, usuario, contratar):
        reserva, _ = contratar(empezo_hace=-1, entregar=False)
        ReservaService(db).registrar_cobro(
            reserva.id, monto=Decimal("200000"), medio_pago="efectivo", usuario_id=usuario.id,
        )
        db.flush()
        fila = UberService(db).tablero(HOY)["contratos"][0]
        assert fila["estado"] == "a_entregar"
        assert [q["estado"] for q in fila["cuotas"]][:2] == ["paga", "pendiente"]


# ── Cobrar la semana ─────────────────────────────────────────────────────────

class TestCobrarSemana:
    def test_es_un_cobro_comun_pago_y_credito_en_la_cuenta(self, db, usuario, contratar):
        reserva, alquiler = contratar(empezo_hace=0)
        cc = db.query(CuentaCorriente).filter_by(cliente_id=reserva.cliente_id).one()
        assert cc.saldo == Decimal("800000")

        pago = _cobrar(db, usuario, alquiler, VALOR, medio="transferencia")

        assert (pago.alquiler_id, pago.cliente_id, pago.medio_pago) == (
            alquiler.id, reserva.cliente_id, "transferencia",
        )
        assert pago.cobrado_por == usuario.id
        credito = db.query(MovimientoCuentaCorriente).filter_by(pago_id=pago.id).one()
        assert (credito.tipo, credito.naturaleza, credito.alquiler_id) == ("credito", "pago", alquiler.id)
        assert credito.monto == VALOR
        assert "semana 1" in credito.concepto
        db.refresh(cc)
        assert cc.saldo == Decimal("600000")

    def test_asienta_lo_mismo_que_un_cobro_cargado_desde_caja(self, client, db, contratar):
        _, por_tablero = contratar("Tablero", empezo_hace=0)
        _, por_caja = contratar("Caja", empezo_hace=0)
        db.commit()

        r1 = client.post(
            f"/api/v1/uber/contratos/{por_tablero.id}/cobrar-semana",
            json={"monto": 200000, "medio_pago": "efectivo", "fecha": HOY.isoformat()},
        )
        r2 = client.post(
            "/api/v1/pagos",
            json={"alquiler_id": por_caja.id, "monto": 200000, "medio_pago": "efectivo", "fecha": HOY.isoformat()},
        )
        assert (r1.status_code, r2.status_code) == (201, 201), (r1.text, r2.text)

        def asiento(alquiler):
            pago = db.query(Pago).filter_by(alquiler_id=alquiler.id).one()
            mov = db.query(MovimientoCuentaCorriente).filter_by(pago_id=pago.id).one()
            return (
                pago.monto, pago.medio_pago, pago.fecha, pago.con_factura, pago.anulado,
                mov.tipo, mov.naturaleza, mov.monto, mov.fecha, mov.alquiler_id == alquiler.id,
            )

        assert asiento(por_tablero) == asiento(por_caja)

        # Y los dos están en la caja del día y en el listado de cobros.
        caja = client.get(f"/api/v1/pagos/caja/dia?fecha={HOY.isoformat()}").json()["data"]
        assert caja["total_ingresos"] == 400000
        assert caja["por_medio_pago"] == {"efectivo": 400000}
        cobros = client.get(f"/api/v1/pagos?alquiler_id={por_tablero.id}").json()
        assert cobros["total"] == 1 and cobros["resumen"]["total"] == 200000
        # Y "A cobrar" ve el mismo saldo que el tablero.
        pendientes = client.get("/api/v1/pagos/pendientes").json()["data"]
        del_tablero = next(p for p in pendientes if p["id_origen"] == por_tablero.id)
        assert del_tablero["saldo_pendiente"] == 600000
        assert r1.json()["data"]["contrato"]["saldo_total"] == 600000

    def test_un_pago_parcial_baja_lo_adeudado_pero_sigue_atrasado(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=2)
        _cobrar(db, usuario, alquiler, 150000)
        fila = _fila(UberService(db).tablero(HOY), alquiler)
        assert (fila["estado"], fila["adeudado"]) == ("atrasado", 50000)
        assert fila["cuota_a_cobrar"] == {"numero": 1, "monto": 50000, "vencimiento": dias(-2).isoformat()}

    def test_cobrar_todo_lo_atrasado_lo_pone_al_dia(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=9)
        antes = _fila(UberService(db).tablero(HOY), alquiler)
        assert (antes["semanas_adeudadas"], antes["exigible"]) == (2, 400000)

        pago = _cobrar(db, usuario, alquiler, antes["exigible"])

        despues = _fila(UberService(db).tablero(HOY), alquiler)
        assert (despues["estado"], despues["adeudado"]) == ("al_dia", 0)
        assert "semanas 1 a 2" in pago.notas

    def test_no_deja_cobrar_mas_de_lo_que_queda(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=0)
        with pytest.raises(BusinessRuleError, match="800.000"):
            _cobrar(db, usuario, alquiler, 800001)

    def test_anotar_a_cuenta_no_es_cobrar(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=0)
        with pytest.raises(BusinessRuleError, match="plata"):
            _cobrar(db, usuario, alquiler, VALOR, medio="cuenta_corriente")

    def test_un_alquiler_comun_no_se_cobra_por_aca(self, client, db, hacer_reserva, hacer_alquiler):
        alquiler = hacer_alquiler(hacer_reserva())
        db.commit()
        r = client.post(
            f"/api/v1/uber/contratos/{alquiler.id}/cobrar-semana",
            json={"monto": 1000, "medio_pago": "efectivo", "fecha": HOY.isoformat()},
        )
        assert r.status_code == 422
        assert "no es un contrato de Uber" in r.json()["detail"]

    def test_el_endpoint_del_tablero_responde(self, client, db, contratar):
        contratar(empezo_hace=1)
        db.commit()
        r = client.get("/api/v1/uber/tablero")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["resumen"]["activos"] == 1
        assert data["contratos"][0]["estado"] == "atrasado"


# ── Kilómetros ───────────────────────────────────────────────────────────────

class TestLecturasDeKm:
    def test_la_lectura_dice_como_viene_contra_el_tope(self, db, usuario, contratar):
        reserva, alquiler = contratar(empezo_hace=7)
        lectura, consumo = UberService(db).registrar_lectura(
            alquiler.id, fecha=HOY, km=11_800, usuario_id=usuario.id,
        )
        assert lectura.usuario_id == usuario.id
        assert consumo["recorridos"] == 1800
        assert consumo["permitidos"] == Decimal("1500.00")
        assert consumo["excedidos"] == Decimal("300.00")
        assert consumo["costo_estimado"] == Decimal("45000.00")
        # El km del auto queda al día, que es lo que mira el aviso de service.
        assert reserva.vehiculo.km_actual == 11_800

    def test_no_cobra_nada(self, db, usuario, contratar):
        reserva, alquiler = contratar(empezo_hace=7)
        antes = db.query(MovimientoCuentaCorriente).count()
        UberService(db).registrar_lectura(alquiler.id, fecha=HOY, km=15_000, usuario_id=usuario.id)
        assert db.query(MovimientoCuentaCorriente).count() == antes

    def test_el_tablero_muestra_la_ultima_y_el_historial(self, client, db, contratar):
        _, alquiler = contratar(empezo_hace=14)
        db.commit()
        for cuando, km in ((dias(-7), 11_200), (HOY, 12_900)):
            r = client.post(
                f"/api/v1/uber/contratos/{alquiler.id}/lecturas-km",
                json={"fecha": cuando.isoformat(), "km": km},
            )
            assert r.status_code == 201, r.text
        assert r.json()["data"]["recorridos"] == 2900

        fila = _fila(UberService(db).tablero(HOY), alquiler)
        assert fila["km"]["ultimo_km"] == 12_900
        assert fila["km"]["permitidos_hoy"] == 3000
        assert fila["km"]["consumo"]["excedidos"] == 0
        assert [l["km"] for l in fila["lecturas"]] == [12_900, 11_200]

    def test_el_odometro_no_vuelve_para_atras(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=7)
        svc = UberService(db)
        with pytest.raises(BusinessRuleError, match="salió con 10000 km"):
            svc.registrar_lectura(alquiler.id, fecha=HOY, km=9_000, usuario_id=usuario.id)
        svc.registrar_lectura(alquiler.id, fecha=dias(-2), km=11_000, usuario_id=usuario.id)
        with pytest.raises(BusinessRuleError, match="no puede ser menor"):
            svc.registrar_lectura(alquiler.id, fecha=HOY, km=10_500, usuario_id=usuario.id)
        with pytest.raises(BusinessRuleError, match="futura"):
            svc.registrar_lectura(alquiler.id, fecha=dias(1), km=12_000, usuario_id=usuario.id)


# ── Renovar ──────────────────────────────────────────────────────────────────

def _cuotas_de_extension(db, alquiler):
    return (
        db.query(MovimientoCuentaCorriente)
        .filter_by(alquiler_id=alquiler.id, tipo="debito", naturaleza="extension", anulado=False)
        .order_by(MovimientoCuentaCorriente.fecha_vencimiento)
        .all()
    )


class TestRenovar:
    def test_genera_una_cuota_por_cada_semana_agregada(self, db, usuario, contratar):
        reserva, alquiler = contratar(empezo_hace=10, semanas=2)
        fin_anterior = reserva.fecha_fin

        UberService(db).renovar(alquiler.id, semanas=3, usuario_id=usuario.id)
        db.flush()

        cuotas = _cuotas_de_extension(db, alquiler)
        assert [q.monto for q in cuotas] == [VALOR] * 3
        assert [q.fecha_vencimiento for q in cuotas] == [
            fin_anterior, fin_anterior + timedelta(days=7), fin_anterior + timedelta(days=14),
        ]
        assert "semana 3 de 5" in cuotas[0].concepto
        assert reserva.fecha_fin == fin_anterior + timedelta(days=21)
        assert reserva.precio_total == VALOR * 5
        assert len(reserva.fechas_pago) == 5

        fila = _fila(UberService(db).tablero(HOY), alquiler)
        assert fila["semana"]["total"] == 5
        assert len(fila["cuotas"]) == 5
        # Lo renovado no vence hoy: sólo debe lo que ya debía.
        assert fila["adeudado"] == 400000

    def test_se_puede_renovar_a_otro_valor(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=5, semanas=1)
        UberService(db).renovar(
            alquiler.id, semanas=2, valor_semana=Decimal("230000"), usuario_id=usuario.id,
        )
        db.flush()
        assert [q.monto for q in _cuotas_de_extension(db, alquiler)] == [Decimal("230000")] * 2

    def test_extender_desde_reservas_tambien_genera_cuotas(self, db, usuario, contratar):
        """El modal de Extender de siempre, sobre un contrato de Uber: 10 días
        más son dos cuotas, no un débito único que vence hoy."""
        reserva, alquiler = contratar(empezo_hace=5, semanas=1)
        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=reserva.fecha_fin + timedelta(days=10),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_extension=Decimal("300000"),
            permitir_solape=True,
        )
        db.flush()
        cuotas = _cuotas_de_extension(db, alquiler)
        assert [q.monto for q in cuotas] == [Decimal("150000")] * 2
        assert all(q.fecha_vencimiento >= dias(2) for q in cuotas)

    def test_un_alquiler_comun_se_extiende_como_siempre(
        self, db, usuario, hacer_reserva, hacer_alquiler
    ):
        reserva = hacer_reserva(estado="activa", fecha_inicio=dias(-2), fecha_fin=dias(2))
        alquiler = hacer_alquiler(reserva, checkout_fecha=dias(-2))
        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=dias(16),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_extension=Decimal("300000"),
            permitir_solape=True,
        )
        db.flush()
        cuotas = _cuotas_de_extension(db, alquiler)
        assert len(cuotas) == 1 and cuotas[0].monto == Decimal("300000")
        assert "Extensión de alquiler" in cuotas[0].concepto

    def test_si_pisa_otra_reserva_del_auto_avisa_antes_de_renovar(self, client, db, usuario, contratar):
        reserva, alquiler = contratar(empezo_hace=5, semanas=1)
        otro = Cliente(nombre_completo="El Que Sigue", dni_cuit="20999999", telefono="2915559999", tipo="particular")
        db.add(otro)
        db.flush()
        ReservaService(db).create(
            cliente_id=otro.id, vehiculo_id=reserva.vehiculo_id,
            fecha_inicio=reserva.fecha_fin + timedelta(days=3), hora_inicio=time(10, 0),
            fecha_fin=reserva.fecha_fin + timedelta(days=6), hora_fin=time(10, 0),
            lugar_entrega="Local", lugar_devolucion="Local", usuario_id=usuario.id,
            precio_total=Decimal("100000"),
        )
        db.commit()

        with pytest.raises(ConflictError):
            UberService(db).renovar(alquiler.id, semanas=1, usuario_id=usuario.id)
        db.rollback()

        r = client.post(f"/api/v1/uber/contratos/{alquiler.id}/renovar", json={"semanas": 1})
        assert r.status_code == 409
        assert "El Que Sigue" in r.json()["detail"]

        r = client.post(
            f"/api/v1/uber/contratos/{alquiler.id}/renovar",
            json={"semanas": 1, "permitir_solape": True},
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["contrato"]["semana"]["total"] == 2
        assert r.json()["data"]["warnings"]


# ── Alta: fechas alineadas ───────────────────────────────────────────────────

class TestFechasAlineadas:
    def test_no_se_puede_crear_con_menos_fechas_que_semanas(self, db, contratar):
        with pytest.raises(BusinessRuleError, match="una por semana"):
            contratar(entregar=False, semanas=3, fechas_pago=[dias(0), dias(7)])

    def test_mover_una_fecha_puntual_si_se_puede(self, db, contratar):
        reserva, _ = contratar(entregar=False, semanas=2, fechas_pago=[dias(0), dias(9)])
        assert reserva.fechas_pago == [dias(0).isoformat(), dias(9).isoformat()]

    def test_el_endpoint_lo_explica(self, client, db, flota):
        cliente, vehiculo = flota("Chofer")
        db.commit()
        r = client.post("/api/v1/reservas", json={
            "cliente_id": cliente.id, "vehiculo_id": vehiculo.id,
            "fecha_inicio": dias(1).isoformat(), "hora_inicio": "10:00",
            "fecha_fin": dias(15).isoformat(), "hora_fin": "10:00",
            "lugar_entrega": "Local", "lugar_devolucion": "Local",
            "tipo": "uber", "uber_valor_semana": 200000,
            "fechas_pago": [dias(1).isoformat()],
        })
        assert r.status_code == 422, r.text
        assert "una por semana" in r.text


# ── Avisos ───────────────────────────────────────────────────────────────────

def _tipos(avisos):
    return [a["tipo"] for a in avisos]


class TestAvisos:
    def test_hoy_paga_la_semana(self, db, usuario, contratar):
        reserva, alquiler = contratar("Juan Pérez", empezo_hace=7)
        _cobrar(db, usuario, alquiler, VALOR, fecha=dias(-7))

        avisos = reglas.uber_semana_vence_hoy(db, HOY)
        assert len(avisos) == 1
        a = avisos[0]
        assert a["titulo"] == "Hoy paga Juan Pérez la semana 2 — $200.000"
        assert (a["urgencia"], a["url_destino"]) == ("alta", "/uber")
        assert (a["entidad_tipo"], a["entidad_id"]) == ("alquiler", alquiler.id)
        assert reglas.uber_semana_atrasada(db, HOY) == []

    def test_semana_atrasada_es_alta_y_pasa_a_critica(self, db, contratar):
        contratar("Juan Pérez", empezo_hace=2)
        a = reglas.uber_semana_atrasada(db, HOY)[0]
        assert a["titulo"] == "Juan Pérez debe 1 semana — $200.000"
        assert a["urgencia"] == "alta"
        assert reglas.uber_semana_vence_hoy(db, HOY) == []

        # Una semana entera sin pagar (y ya van dos adeudadas).
        a = reglas.uber_semana_atrasada(db, dias(6))[0]
        assert a["titulo"] == "Juan Pérez debe 2 semanas — $400.000"
        assert a["urgencia"] == "critica"

    def test_la_atrasada_es_una_sola_fila_que_se_actualiza(self, db, contratar):
        contratar("Juan Pérez", empezo_hace=2)
        svc = NotificacionService(db)
        svc.generar(HOY)
        db.flush()
        svc.generar(dias(6))
        db.flush()

        filas = db.query(Notificacion).filter_by(tipo="uber_semana_atrasada").all()
        activas = [n for n in filas if n.estado in ("pendiente", "vista")]
        assert len(activas) == 1
        assert activas[0].titulo == "Juan Pérez debe 2 semanas — $400.000"
        assert activas[0].urgencia == "critica"

    def test_al_cobrar_el_aviso_se_resuelve_solo(self, db, usuario, contratar):
        _, alquiler = contratar(empezo_hace=2)
        svc = NotificacionService(db)
        svc.generar(HOY)
        db.flush()
        _cobrar(db, usuario, alquiler, VALOR)
        svc.generar(HOY)
        db.flush()
        fila = db.query(Notificacion).filter_by(tipo="uber_semana_atrasada").one()
        assert fila.estado == "resuelta"

    def test_km_excedido_recien_pasando_el_10_por_ciento(self, db, usuario, contratar):
        _, alquiler = contratar("Juan Pérez", empezo_hace=7)
        svc = UberService(db)
        svc.registrar_lectura(alquiler.id, fecha=dias(-1), km=11_300, usuario_id=usuario.id)
        db.flush()
        assert reglas.uber_km_excedido(db, HOY) == []  # 1.300 de 1.286: dentro del margen

        svc.registrar_lectura(alquiler.id, fecha=HOY, km=11_800, usuario_id=usuario.id)
        db.flush()
        a = reglas.uber_km_excedido(db, HOY)[0]
        assert a["urgencia"] == "media"
        assert "1800 km de 1500 permitidos" in a["descripcion"]
        assert "$45.000" in a["descripcion"]

    def test_contrato_por_terminar_y_renovarlo_lo_apaga(self, db, usuario, contratar):
        _, alquiler = contratar("Juan Pérez", empezo_hace=5, semanas=1)
        a = reglas.uber_contrato_por_terminar(db, HOY)[0]
        assert a["titulo"] == "El contrato de Juan Pérez termina en 2 días"
        assert "Renovar o coordinar la devolución" in a["descripcion"]
        assert a["urgencia"] == "media"

        UberService(db).renovar(alquiler.id, semanas=4, usuario_id=usuario.id)
        db.flush()
        assert reglas.uber_contrato_por_terminar(db, HOY) == []

    def test_a_mas_de_tres_dias_no_avisa(self, db, contratar):
        contratar(empezo_hace=1, semanas=1)
        assert reglas.uber_contrato_por_terminar(db, HOY) == []

    def test_las_cuatro_estan_en_el_catalogo(self):
        nombres = [r.__name__ for r in reglas.REGLAS]
        assert nombres[-4:] == [
            "uber_semana_vence_hoy", "uber_semana_atrasada",
            "uber_km_excedido", "uber_contrato_por_terminar",
        ]

    def test_la_deuda_de_un_chofer_no_aparece_dos_veces(self, db, contratar):
        """Una cuota de Uber vencida hace +7 días la avisa `uber_semana_atrasada`,
        no además `cc_vencida`."""
        contratar("Juan Pérez", empezo_hace=10)
        assert _tipos(reglas.uber_semana_atrasada(db, HOY)) == ["uber_semana_atrasada"]
        assert reglas.cc_vencida(db, HOY) == []
        assert reglas.cc_vencimiento_proximo(db, HOY) == []

    def test_la_deuda_de_un_alquiler_comun_se_sigue_avisando(
        self, db, cliente, hacer_reserva, hacer_alquiler
    ):
        from app.services.cuenta_corriente_service import CuentaCorrienteService

        reserva = hacer_reserva()
        alquiler = hacer_alquiler(reserva)
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="debito", naturaleza="alquiler",
            concepto="Alquiler común", monto=Decimal("100000"), fecha=dias(-10),
            creado_por=None, fecha_vencimiento=dias(-10),
            alquiler_id=alquiler.id, reserva_id=reserva.id,
        )
        db.flush()
        assert _tipos(reglas.cc_vencida(db, HOY)) == ["cc_vencida"]
