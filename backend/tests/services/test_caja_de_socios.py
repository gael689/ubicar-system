"""
La caja de Franco (04/10/2026): alquileres con facturado y caja, el mes con los
socios, la compensación y la cuenta propia privada.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models.caja_socios import Socio
from app.models.pago import Pago
from app.models.usuario import Usuario
from app.services.caja_socios_service import CajaSociosService

D = Decimal


@pytest.fixture
def socios(db, usuario):
    franco = Socio(nombre="Franco Marchese", porcentaje=50, usuario_id=usuario.id)
    martin = Socio(nombre="Martín González", porcentaje=50)
    ramiro = Socio(nombre="Ramiro Rodríguez", porcentaje=0)
    db.add_all([franco, martin, ramiro])
    db.flush()
    return franco, martin, ramiro


@pytest.fixture
def cobrar(db, usuario):
    def _cobrar(reserva, monto, socio=None, medio="transferencia", fecha=date(2026, 10, 3)):
        p = Pago(
            cliente_id=reserva.cliente_id, reserva_id=reserva.id, monto=D(str(monto)),
            medio_pago=medio, fecha=fecha, cobrado_por=usuario.id,
            **({"socio_id": socio.id} if socio else {}),
        )
        db.add(p)
        db.flush()
        return p
    return _cobrar


@pytest.fixture
def svc(db):
    return CajaSociosService(db)


class TestElCobroQuedaAFirmaDelSocio:
    def test_un_cobro_nuevo_queda_a_nombre_del_socio_del_usuario(self, db, socios, hacer_reserva, cobrar):
        franco, _, _ = socios
        p = cobrar(hacer_reserva(), 1000)
        assert p.socio_id == franco.id

    def test_si_el_usuario_no_es_socio_queda_sin_asignar(self, db, usuario, hacer_reserva, cobrar):
        p = cobrar(hacer_reserva(), 1000)
        assert p.socio_id is None


class TestAlquileres:
    def test_facturado_y_caja_suman_el_total(self, svc, socios, hacer_reserva):
        hacer_reserva(precio_total="100000", monto_facturado=D("60000"), con_factura=True)
        filas, total = svc.alquileres(None, None, None, None)
        f = filas[0]
        assert total == 1
        assert (f["facturado"], f["caja"], f["total"]) == (60000.0, 40000.0, 100000.0)

    def test_distribuible_es_facturado_sobre_1_25_mas_caja(self, svc, socios, hacer_reserva):
        hacer_reserva(precio_total="100000", monto_facturado=D("50000"), con_factura=True)
        f = svc.alquileres(None, None, None, None)[0][0]
        assert f["distribuible"] == 90000.0  # 50.000/1,25 + 50.000

    def test_una_reserva_anterior_sin_monto_usa_el_con_factura(self, svc, socios, hacer_reserva):
        hacer_reserva(precio_total="100000", con_factura=True)
        f = svc.alquileres(None, None, None, None)[0][0]
        assert (f["facturado"], f["caja"]) == (100000.0, 0.0)

    def test_cobrado_es_si_el_saldo_llego_a_cero(self, svc, socios, hacer_reserva, cobrar):
        r = hacer_reserva(precio_total="100000")
        cobrar(r, 40000)
        f = svc.alquileres(None, None, None, None)[0][0]
        assert (f["cobrado"], f["saldo"]) == (False, 60000.0)
        cobrar(r, 60000, fecha=date(2026, 10, 5))
        f = svc.alquileres(None, None, None, None)[0][0]
        assert f["cobrado"] is True and f["fecha_cobro"] == "2026-10-05"

    def test_lo_cobrado_a_cuenta_corriente_no_es_plata_que_entro(self, svc, socios, hacer_reserva, cobrar):
        r = hacer_reserva(precio_total="100000")
        cobrar(r, 100000, medio="cuenta_corriente")
        assert svc.alquileres(None, None, None, None)[0][0]["cobrado"] is False

    def test_las_canceladas_no_son_alquileres(self, svc, socios, hacer_reserva):
        hacer_reserva(estado="cancelada")
        assert svc.alquileres(None, None, None, None)[1] == 0

    def test_filtra_por_cobrado_y_por_texto(self, svc, socios, hacer_reserva, cobrar):
        r1 = hacer_reserva(precio_total="1000")
        hacer_reserva(precio_total="1000")
        cobrar(r1, 1000)
        assert svc.alquileres(None, None, None, True)[1] == 1
        assert svc.alquileres(None, None, "AB123", None)[1] == 2
        assert svc.alquileres(None, None, "no existe", None)[1] == 0

    def test_el_csv_tiene_las_columnas_de_la_planilla(self, svc, socios, hacer_reserva):
        hacer_reserva(precio_total="100000", monto_facturado=D("50000"), con_factura=True)
        encabezado = svc.alquileres_csv(None, None).splitlines()[0]
        for col in ("Patente", "Facturado", "Caja", "Distribuible", "Parte c/u", "¿Repartido?"):
            assert col in encabezado


class TestFacturaParcial:
    def test_se_puede_corregir_despues_de_crear(self, db, svc, socios, usuario, hacer_reserva):
        r = hacer_reserva(precio_total="100000")
        svc.actualizar_facturado(r.id, D("30000"), usuario.id)
        assert r.monto_facturado == D("30000") and r.con_factura is True
        svc.actualizar_facturado(r.id, D("0"), usuario.id)
        assert r.con_factura is False

    def test_no_puede_pasar_del_total(self, svc, socios, usuario, hacer_reserva):
        r = hacer_reserva(precio_total="100000")
        with pytest.raises(BusinessRuleError):
            svc.actualizar_facturado(r.id, D("100001"), usuario.id)


class TestElMes:
    def test_total_por_medio_y_socio(self, svc, socios, hacer_reserva, cobrar):
        franco, martin, _ = socios
        r = hacer_reserva(precio_total="1000000")
        cobrar(r, 600000, franco)
        cobrar(r, 400000, martin, medio="efectivo")
        m = svc.mes(date(2026, 10, 1))
        assert m["total_cobrado"] == 1000000.0
        assert m["por_medio"]["transferencia"][str(franco.id)] == 600000.0
        assert m["por_medio"]["efectivo"][str(martin.id)] == 400000.0

    def test_compensacion_como_la_planilla(self, svc, socios, hacer_reserva, cobrar):
        franco, martin, _ = socios
        r = hacer_reserva(precio_total="1000000")
        cobrar(r, 600000, franco)
        cobrar(r, 400000, martin)
        t = svc.mes(date(2026, 10, 1))["compensacion"]["transferencias"]
        assert [(x["de_nombre"], x["a_nombre"], x["monto"]) for x in t] == [("Franco", "Martín", 100000.0)]

    def test_lo_que_cobra_ramiro_se_pasa_a_los_socios(self, svc, socios, hacer_reserva, cobrar):
        franco, martin, ramiro = socios
        r = hacer_reserva(precio_total="1000000")
        cobrar(r, 400000, franco)
        cobrar(r, 400000, martin)
        cobrar(r, 200000, ramiro)
        t = svc.mes(date(2026, 10, 1))["compensacion"]["transferencias"]
        assert sorted((x["de_nombre"], x["a_nombre"], x["monto"]) for x in t) == [
            ("Ramiro", "Franco", 100000.0), ("Ramiro", "Martín", 100000.0)]

    def test_el_distribuible_del_mes_sigue_la_proporcion_facturada(self, svc, socios, hacer_reserva, cobrar):
        franco, martin, _ = socios
        r = hacer_reserva(precio_total="100000", monto_facturado=D("50000"), con_factura=True)
        cobrar(r, 100000, franco)
        m = svc.mes(date(2026, 10, 1))
        assert m["distribuible"] == 90000.0
        assert m["parte_por_socio"][str(franco.id)] == 45000.0

    def test_otro_mes_no_se_mezcla(self, svc, socios, hacer_reserva, cobrar):
        franco, _, _ = socios
        cobrar(hacer_reserva(), 1000, franco, fecha=date(2026, 9, 30))
        assert svc.mes(date(2026, 10, 1))["total_cobrado"] == 0

    def test_los_cobros_sin_socio_se_avisan(self, svc, usuario, hacer_reserva, cobrar):
        cobrar(hacer_reserva(), 5000)
        assert svc.mes(date(2026, 10, 1))["sin_socio"] == 5000.0


class TestRepartir:
    def test_reparte_y_marca_los_cobros(self, db, svc, socios, usuario, hacer_reserva, cobrar):
        franco, martin, _ = socios
        r = hacer_reserva(precio_total="1000000")
        p1, p2 = cobrar(r, 600000, franco), cobrar(r, 400000, martin)
        reparto = svc.repartir(date(2026, 10, 15), usuario.id, None)
        assert p1.reparto_id == reparto.id and p2.reparto_id == reparto.id
        assert reparto.transferencias[0]["monto"] == 100000.0
        f = svc.alquileres(None, None, None, None)[0][0]
        assert f["repartido"] is True

    def test_no_se_reparte_dos_veces_el_mismo_mes(self, svc, socios, usuario, hacer_reserva, cobrar):
        franco, _, _ = socios
        cobrar(hacer_reserva(), 1000, franco)
        svc.repartir(date(2026, 10, 1), usuario.id, None)
        with pytest.raises(BusinessRuleError) as e:
            svc.repartir(date(2026, 10, 1), usuario.id, None)
        assert "mes_ya_repartido" in str(e.value)

    def test_con_cobros_sin_socio_se_niega(self, svc, socios, usuario, hacer_reserva, cobrar):
        cobrar(hacer_reserva(), 1000)  # el usuario ya es socio → a su nombre
        db_pago = Pago  # noqa: F841
        cobrar(hacer_reserva(), 1000)
        # Un cobro sin socio:
        svc.db.query(Pago).update({"socio_id": None})
        with pytest.raises(BusinessRuleError) as e:
            svc.repartir(date(2026, 10, 1), usuario.id, None)
        assert "cobros_sin_socio" in str(e.value)

    def test_anular_el_reparto_libera_los_cobros(self, svc, socios, usuario, hacer_reserva, cobrar):
        franco, _, _ = socios
        p = cobrar(hacer_reserva(), 1000, franco)
        reparto = svc.repartir(date(2026, 10, 1), usuario.id, None)
        svc.anular_reparto(reparto.id, usuario.id)
        assert p.reparto_id is None
        svc.repartir(date(2026, 10, 1), usuario.id, None)  # ahora sí se puede de nuevo

    def test_un_cobro_repartido_no_cambia_de_socio(self, svc, socios, usuario, hacer_reserva, cobrar):
        franco, martin, _ = socios
        p = cobrar(hacer_reserva(), 1000, franco)
        svc.repartir(date(2026, 10, 1), usuario.id, None)
        with pytest.raises(BusinessRuleError):
            svc.asignar_socio_a_pago(p.id, martin.id, usuario.id)


class TestSocios:
    def test_los_porcentajes_tienen_que_sumar_100(self, svc, socios):
        franco, martin, _ = socios
        with pytest.raises(BusinessRuleError):
            svc.guardar_socios([{"id": franco.id, "porcentaje": 70}])
        svc.guardar_socios([{"id": franco.id, "porcentaje": 60}, {"id": martin.id, "porcentaje": 40}])
        assert franco.porcentaje == 60


class TestLaCuentaPropia:
    @pytest.fixture
    def otro(self, db):
        u = Usuario(email="martin@x.com", nombre="Martín", rol="admin", auth_sub="otro", activo=True)
        db.add(u)
        db.flush()
        return u

    def test_lo_propio_suma_y_resta(self, svc, usuario):
        svc.anotar_propio(usuario.id, date(2026, 10, 1), "Alquiler de mi otro negocio", "entra", D("50000"), None, None)
        svc.anotar_propio(usuario.id, date(2026, 10, 2), "Combustible", "sale", D("12000"), None, None)
        r = svc.propios(usuario.id)
        assert (r["entra"], r["sale"], r["saldo"]) == (50000.0, 12000.0, 38000.0)

    def test_otro_usuario_no_ve_lo_propio(self, svc, usuario, otro):
        svc.anotar_propio(usuario.id, date(2026, 10, 1), "Privado", "entra", D("1000"), None, None)
        assert svc.propios(otro.id)["items"] == []

    def test_otro_usuario_no_puede_anularlo(self, svc, usuario, otro):
        m = svc.anotar_propio(usuario.id, date(2026, 10, 1), "Privado", "entra", D("1000"), None, None)
        with pytest.raises(NotFoundError):
            svc.anular_propio(otro.id, m.id)

    def test_lo_propio_no_entra_en_los_totales_de_la_empresa(self, svc, socios, usuario, hacer_reserva, cobrar):
        franco, _, _ = socios
        cobrar(hacer_reserva(), 1000, franco)
        svc.anotar_propio(usuario.id, date(2026, 10, 3), "Mi otro negocio", "entra", D("999999"), None, None)
        assert svc.mes(date(2026, 10, 1))["total_cobrado"] == 1000.0

    def test_validaciones(self, svc, usuario):
        with pytest.raises(BusinessRuleError):
            svc.anotar_propio(usuario.id, date(2026, 10, 1), "", "entra", D("1"), None, None)
        with pytest.raises(BusinessRuleError):
            svc.anotar_propio(usuario.id, date(2026, 10, 1), "x", "otro", D("1"), None, None)
        with pytest.raises(BusinessRuleError):
            svc.anotar_propio(usuario.id, date(2026, 10, 1), "x", "entra", D("0"), None, None)


class TestPorLaApi:
    def test_lo_propio_no_aparece_en_la_respuesta_de_otro_usuario(self, client, db, usuario):
        r = client.post("/api/v1/caja/propios", json={
            "fecha": "2026-10-01", "concepto": "Mío", "tipo": "entra", "monto": "100"})
        assert r.status_code == 201
        mio = client.get("/api/v1/caja/propios").json()["data"]
        assert mio["entra"] == 100.0
        # La cuenta de otra persona (otro usuario en la misma base) está vacía.
        otro = Usuario(email="m@x.com", nombre="M", rol="admin", auth_sub="m", activo=True)
        db.add(otro)
        db.flush()
        from app.core.deps import get_current_user
        from app.main import app
        app.dependency_overrides[get_current_user] = lambda: otro
        assert client.get("/api/v1/caja/propios").json()["data"]["items"] == []

    def test_la_planilla_se_exporta(self, client):
        r = client.get("/api/v1/caja/alquileres/exportar")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/csv")


class TestFacturaParcialAlCrear:
    def _crear(self, db, cliente, usuario, vehiculo, **extra):
        from datetime import time

        from app.services.reserva_service import ReservaService
        reserva, _ = ReservaService(db).create(
            cliente_id=cliente.id, vehiculo_id=vehiculo.id,
            fecha_inicio=date(2026, 10, 5), hora_inicio=time(10, 0),
            fecha_fin=date(2026, 10, 8), hora_fin=time(10, 0),
            lugar_entrega="x", lugar_devolucion="x", usuario_id=usuario.id,
            precio_total=D("100000"), descuento_motivo="prueba", **extra,
        )
        return reserva

    def test_un_monto_mayor_a_cero_factura(self, db, cliente, usuario, vehiculo):
        r = self._crear(db, cliente, usuario, vehiculo, monto_facturado=D("40000"), tipo_factura="B")
        assert r.con_factura is True and r.monto_facturado == D("40000")

    def test_un_monto_cero_no_factura_aunque_diga_con_factura(self, db, cliente, usuario, vehiculo):
        r = self._crear(db, cliente, usuario, vehiculo, monto_facturado=D("0"), con_factura=True)
        assert r.con_factura is False

    def test_sin_monto_sigue_el_todo_o_nada_de_siempre(self, db, cliente, usuario, vehiculo):
        r = self._crear(db, cliente, usuario, vehiculo, con_factura=True)
        assert r.monto_facturado is None and r.con_factura is True

    def test_negativo_se_rechaza(self, db, cliente, usuario, vehiculo):
        with pytest.raises(BusinessRuleError):
            self._crear(db, cliente, usuario, vehiculo, monto_facturado=D("-1"))


class TestMedioOtro:
    def test_otro_es_plata_que_entro_y_aparece_en_el_mes(self, svc, socios, hacer_reserva, cobrar):
        franco, _, _ = socios
        r = hacer_reserva(precio_total="100000")
        cobrar(r, 100000, franco, medio="otro")
        assert svc.alquileres(None, None, None, None)[0][0]["cobrado"] is True
        m = svc.mes(date(2026, 10, 1))
        assert m["por_medio"]["otro"][str(franco.id)] == 100000.0

    def test_se_puede_registrar_un_cobro_por_la_api(self, client, db, hacer_reserva):
        r = hacer_reserva(precio_total="100000")
        resp = client.post("/api/v1/pagos", json={
            "cliente_id": r.cliente_id, "monto": 5000, "medio_pago": "otro", "fecha": "2026-10-03"})
        assert resp.status_code == 201
