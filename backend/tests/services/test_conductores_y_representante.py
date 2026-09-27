"""
Clientes, empresas, representante y conductores (plan 27/09, A3).

La causa raíz de *"cargué el conductor y no impactó en el contrato"*: el
formulario mandaba el vencimiento de la licencia vacío, la API contestaba 422
después de haber creado el cliente, y el conductor no se guardaba nunca. Lo que
estos tests cuidan:

1. El cliente y sus conductores entran en una sola llamada, y un vencimiento
   vacío no rompe nada.
2. Una reserva lleva hasta tres conductores; el primero es el principal
   (`conductor_id`) y se puede sacar a todos.
3. El contrato los lee en vivo y los imprime, con la empresa como arrendataria
   y su representante.
4. "Regenerar" anula y vuelve a emitir en un paso, con los datos de hoy.
5. Aviso —no bloqueo— si un conductor ya tiene otro auto en esas fechas.
6. Los clientes se listan del último agregado al primero.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from io import BytesIO

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.cliente import Cliente, ConductorAdicional
from app.models.contrato import Contrato
from app.services.contrato_service import ContratoService, _nombre_para_el_papel
from app.services.reserva_service import ReservaService


def _crear_reserva(db, cliente, usuario, vehiculo, **extra):
    kwargs = dict(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 10, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 5),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Aeropuerto",
        precio_total=Decimal("100000"),
        descuento_motivo="Precio pactado",
        usuario_id=usuario.id,
    )
    kwargs.update(extra)
    reserva, _ = ReservaService(db).create(**kwargs)
    db.flush()
    return reserva


def _conductor(db, cliente, nombre, dni):
    c = ConductorAdicional(cliente_id=cliente.id, nombre_completo=nombre, dni=dni)
    db.add(c)
    db.flush()
    return c


@pytest.fixture()
def empresa(db):
    c = Cliente(
        nombre_completo="Transportes del Sur S.A.", dni_cuit="30712345678",
        telefono="2914000000", tipo="empresa", razon_social="Transportes del Sur S.A.",
        representante_nombre="Laura Díaz", representante_dni="28111222",
        representante_cargo="Apoderada",
    )
    db.add(c)
    db.flush()
    return c


# ── Alta de cliente con conductores ──────────────────────────────────────────

class TestAltaConConductores:
    def test_empresa_con_representante_y_dos_conductores_en_una_llamada(self, client, db):
        r = client.post("/api/v1/clientes", json={
            "tipo": "empresa",
            "nombre_completo": "Logística Norte SRL",
            "dni_cuit": "30-70000000-1",
            "telefono": "2915000000",
            "representante_nombre": "Carlos Pérez",
            "representante_dni": "25111222",
            "representante_cargo": "Socio gerente",
            "conductores": [
                # El vencimiento vacío es exactamente lo que mandaba el
                # formulario y daba 422.
                {"nombre_completo": "Juan Chofer", "dni": "30111000", "licencia_vencimiento": ""},
                {"nombre_completo": "Ana Chofer", "dni": "31222000", "licencia_numero": "B123",
                 "licencia_vencimiento": "2028-01-01", "fecha_nacimiento": ""},
            ],
        })
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["representante_nombre"] == "Carlos Pérez"
        nombres = sorted(c["nombre_completo"] for c in data["conductores_adicionales"])
        assert nombres == ["Ana Chofer", "Juan Chofer"]
        sin_vto = next(c for c in data["conductores_adicionales"] if c["nombre_completo"] == "Juan Chofer")
        assert sin_vto["licencia_vencimiento"] is None

    def test_un_conductor_invalido_no_deja_el_cliente_a_medias(self, client, db):
        r = client.post("/api/v1/clientes", json={
            "nombre_completo": "Particular Uno", "dni_cuit": "40111222", "telefono": "1",
            "conductores": [{"nombre_completo": "   "}],
        })
        assert r.status_code == 422
        assert db.query(Cliente).filter_by(dni_cuit="40111222").first() is None

    def test_agregar_un_conductor_sin_vencimiento_ya_no_da_422(self, client, cliente):
        r = client.post(f"/api/v1/clientes/{cliente.id}/conductores", json={
            "nombre_completo": "Pedro", "dni": "", "licencia_vencimiento": "",
        })
        assert r.status_code == 201, r.text
        assert r.json()["data"]["dni"] is None


class TestOrdenDelListado:
    def test_del_ultimo_agregado_al_primero(self, db, client):
        base = datetime(2026, 9, 1)
        for i, nombre in enumerate(["Zulema", "Abel", "Marta"]):
            db.add(Cliente(nombre_completo=nombre, dni_cuit=f"5000000{i}", telefono="1",
                           created_at=base + timedelta(days=i)))
        db.flush()
        data = client.get("/api/v1/clientes").json()["data"]
        assert [c["nombre_completo"] for c in data][:3] == ["Marta", "Abel", "Zulema"]


# ── Conductores de la reserva ────────────────────────────────────────────────

class TestConductoresDeLaReserva:
    def test_hasta_tres_y_el_primero_es_el_principal(self, db, cliente, usuario, vehiculo):
        a, b, c = (_conductor(db, cliente, n, d) for n, d in [("A", "1"), ("B", "2"), ("C", "3")])
        r = _crear_reserva(db, cliente, usuario, vehiculo, conductor_ids=[b.id, a.id, c.id])
        assert r.conductor_id == b.id
        assert r.conductor_ids == [b.id, a.id, c.id]

    def test_cuatro_no(self, db, cliente, usuario, vehiculo):
        ids = [_conductor(db, cliente, f"C{i}", str(i)).id for i in range(4)]
        with pytest.raises(BusinessRuleError, match="hasta 3 conductores"):
            _crear_reserva(db, cliente, usuario, vehiculo, conductor_ids=ids)

    def test_un_conductor_de_otro_cliente_no(self, db, cliente, empresa, usuario, vehiculo):
        ajeno = _conductor(db, empresa, "Ajeno", "9")
        with pytest.raises(BusinessRuleError, match="no pertenece"):
            _crear_reserva(db, cliente, usuario, vehiculo, conductor_ids=[ajeno.id])

    def test_el_conductor_id_suelto_sigue_andando(self, db, cliente, usuario, vehiculo):
        a = _conductor(db, cliente, "A", "1")
        r = _crear_reserva(db, cliente, usuario, vehiculo, conductor_id=a.id)
        assert r.conductor_ids == [a.id]

    def test_editar_cambia_la_lista_y_se_puede_vaciar(self, db, cliente, usuario, vehiculo):
        a, b = _conductor(db, cliente, "A", "1"), _conductor(db, cliente, "B", "2")
        r = _crear_reserva(db, cliente, usuario, vehiculo, conductor_ids=[a.id])
        svc = ReservaService(db)
        svc.update(r.id, usuario.id, conductor_ids=[b.id, a.id])
        db.flush()
        db.refresh(r)
        assert r.conductor_ids == [b.id, a.id] and r.conductor_id == b.id
        svc.update(r.id, usuario.id, conductor_ids=[])
        db.flush()
        db.refresh(r)
        assert r.conductor_ids == [] and r.conductor_id is None

    def test_la_api_devuelve_los_conductores(self, db, client, cliente, usuario, vehiculo):
        a, b = _conductor(db, cliente, "A", "1"), _conductor(db, cliente, "B", "2")
        r = _crear_reserva(db, cliente, usuario, vehiculo, conductor_ids=[a.id, b.id])
        data = client.get(f"/api/v1/reservas/{r.id}").json()["data"]
        assert data["conductor_ids"] == [a.id, b.id]
        assert [c["nombre_completo"] for c in data["conductores"]] == ["A", "B"]
        # El PATCH con lista vacía llega (no lo filtra `exclude_none`).
        r2 = client.patch(f"/api/v1/reservas/{r.id}", json={"conductor_ids": []})
        assert r2.status_code == 200, r2.text
        assert r2.json()["data"]["conductor_ids"] == []


class TestConductorOcupado:
    def test_avisa_si_el_conductor_ya_tiene_otro_auto(self, db, client, cliente, usuario, vehiculo, hacer_reserva):
        a = _conductor(db, cliente, "Chofer", "1")
        otra = hacer_reserva(fecha_inicio=date(2026, 10, 3), fecha_fin=date(2026, 10, 8), conductor_id=a.id)
        r = client.get(
            "/api/v1/reservas/conductores-ocupados",
            params={"conductor_ids": str(a.id), "fecha_inicio": "2026-10-01", "fecha_fin": "2026-10-04"},
        )
        assert r.status_code == 200, r.text
        avisos = r.json()["data"]
        assert [x["reserva_id"] for x in avisos] == [otra.id]
        assert avisos[0]["conductor_nombre"] == "Chofer"

    def test_no_avisa_por_la_misma_reserva_ni_fuera_de_fecha(self, db, client, cliente, hacer_reserva):
        a = _conductor(db, cliente, "Chofer", "1")
        misma = hacer_reserva(fecha_inicio=date(2026, 10, 1), fecha_fin=date(2026, 10, 4), conductor_id=a.id)
        hacer_reserva(fecha_inicio=date(2026, 11, 1), fecha_fin=date(2026, 11, 4), conductor_id=a.id)
        r = client.get(
            "/api/v1/reservas/conductores-ocupados",
            params={"conductor_ids": str(a.id), "fecha_inicio": "2026-10-01",
                    "fecha_fin": "2026-10-04", "excluir_reserva_id": misma.id},
        )
        assert r.json()["data"] == []


# ── Contrato ─────────────────────────────────────────────────────────────────

class TestContrato:
    def test_la_empresa_es_arrendataria_y_los_conductores_van_aparte(
        self, db, empresa, usuario, vehiculo,
    ):
        a, b = _conductor(db, empresa, "Juan Chofer", "30111000"), _conductor(db, empresa, "Ana Chofer", "31222000")
        r = _crear_reserva(db, empresa, usuario, vehiculo, conductor_ids=[a.id, b.id])
        snap = ContratoService(db).preparar(r.id)
        assert snap["representante"]["nombre"] == "Laura Díaz"
        assert [c["nombre"] for c in snap["conductores"]] == ["Juan Chofer", "Ana Chofer"]
        # La clave vieja sigue, con el principal.
        assert snap["conductor_adicional"]["nombre"] == "Juan Chofer"

    def test_el_pdf_imprime_los_conductores_con_dni_y_el_cuit_de_la_empresa(
        self, db, empresa, usuario, vehiculo,
    ):
        pypdf = pytest.importorskip("pypdf")
        from app.services.contrato_pdf import generar_pdf_contrato

        ids = [_conductor(db, empresa, n, d).id for n, d in
               [("Juan Chofer", "30111000"), ("Ana Chofer", "31222000"), ("Luis Chofer", "32333000")]]
        r = _crear_reserva(db, empresa, usuario, vehiculo, conductor_ids=ids)
        contrato = ContratoService(db).crear(r.id, None, usuario.id)
        plantilla = ContratoService(db).plantilla_vigente()
        texto = pypdf.PdfReader(BytesIO(generar_pdf_contrato(contrato, plantilla))).pages[0].extract_text()
        for esperado in ["ARRENDATARIO", "CONDUCTORES AUTORIZADOS", "JUAN CHOFER", "LUIS CHOFER",
                         "DNI 32333000", "Laura Díaz", "CUIT", "RETIRO", "DEVOLUCIÓN", "Aeropuerto"]:
            assert esperado in texto, esperado

    def test_un_contrato_viejo_se_reimprime_con_conductor_adicional(self):
        pypdf = pytest.importorskip("pypdf")
        from tests.domain.test_contrato_pdf_layout import EMPRESA_REAL, _PLANTILLA, _contrato
        from app.services.contrato_pdf import generar_pdf_contrato

        c = _contrato(EMPRESA_REAL)
        c.snapshot["conductor_adicional"] = {"nombre": "Segundo Viejo", "dni": "20111222"}
        texto = pypdf.PdfReader(BytesIO(generar_pdf_contrato(c, _PLANTILLA))).pages[0].extract_text()
        assert "SEGUNDO VIEJO" in texto and "DNI 20111222" in texto


class TestRegenerar:
    def test_anula_y_emite_uno_nuevo_con_el_conductor_de_hoy(self, db, client, cliente, usuario, vehiculo):
        a, b = _conductor(db, cliente, "Primero", "1"), _conductor(db, cliente, "Segundo", "2")
        r = _crear_reserva(db, cliente, usuario, vehiculo, conductor_ids=[a.id])
        viejo = ContratoService(db).crear(r.id, None, usuario.id)
        db.flush()
        ReservaService(db).update(r.id, usuario.id, conductor_ids=[b.id])
        db.flush()

        resp = client.post(f"/api/v1/contratos/{viejo.id}/regenerar", json={"motivo": "Cambió el chofer"})
        assert resp.status_code == 201, resp.text
        nuevo_id = resp.json()["data"]["id"]
        db.refresh(viejo)
        assert viejo.anulado and "Cambió el chofer" in viejo.motivo_anulacion
        nuevo = db.get(Contrato, nuevo_id)
        assert [c["nombre"] for c in nuevo.snapshot["conductores"]] == ["Segundo"]

    def test_sin_motivo_no(self, db, client, cliente, usuario, vehiculo):
        r = _crear_reserva(db, cliente, usuario, vehiculo)
        viejo = ContratoService(db).crear(r.id, None, usuario.id)
        db.flush()
        resp = client.post(f"/api/v1/contratos/{viejo.id}/regenerar", json={"motivo": "  "})
        assert resp.status_code == 422
        db.refresh(viejo)
        assert not viejo.anulado


# ── "Atendido por" ───────────────────────────────────────────────────────────

class TestAtendidoPor:
    @pytest.mark.parametrize("nombre", ["Operador", "operador", "user_3HBPnBzP6K0", ""])
    def test_un_nombre_de_relleno_no_va_al_papel(self, nombre):
        from types import SimpleNamespace
        u = SimpleNamespace(nombre=nombre, email="user_x@sin-email.clerk")
        assert _nombre_para_el_papel(u) == ""

    def test_un_nombre_real_si(self):
        from types import SimpleNamespace
        assert _nombre_para_el_papel(SimpleNamespace(nombre="Franco Ruiz", email="f@x.com")) == "Franco Ruiz"

    def test_el_login_completa_el_nombre_desde_clerk(self, db, monkeypatch):
        import app.core.deps as deps
        from app.models.usuario import Usuario

        u = Usuario(email="franco@ubicar.test", nombre="Operador", rol="admin", auth_sub="user_abc")
        db.add(u)
        db.flush()
        monkeypatch.setattr(deps, "_nombre_desde_api_de_clerk", lambda sub: "Franco Ruiz")
        assert deps._usuario_desde_clerk(db, {"sub": "user_abc"}).nombre == "Franco Ruiz"

    def test_un_nombre_ya_presentable_no_se_pisa(self, db, monkeypatch):
        import app.core.deps as deps
        from app.models.usuario import Usuario

        u = Usuario(email="franco@ubicar.test", nombre="Franco Ruiz", rol="admin", auth_sub="user_def")
        db.add(u)
        db.flush()

        def _no_llamar(sub):
            raise AssertionError("no tenía que ir a Clerk")

        monkeypatch.setattr(deps, "_nombre_desde_api_de_clerk", _no_llamar)
        assert deps._usuario_desde_clerk(db, {"sub": "user_def"}).nombre == "Franco Ruiz"

    def test_si_clerk_falla_el_login_sigue(self, db, monkeypatch):
        import app.core.deps as deps
        from app.models.usuario import Usuario

        u = Usuario(email="x@ubicar.test", nombre="x", rol="admin", auth_sub="user_ghi")
        db.add(u)
        db.flush()
        monkeypatch.setattr(deps.settings, "clerk_secret_key", "sk_test_x")
        deps._clerk_nombres_cache.clear()

        def _explota(*a, **k):
            raise RuntimeError("sin red")

        import httpx
        monkeypatch.setattr(httpx, "get", _explota)
        assert deps._usuario_desde_clerk(db, {"sub": "user_ghi"}).nombre == "x"

    def test_mi_nombre_se_puede_corregir(self, client, usuario):
        r = client.patch("/api/v1/usuarios/me", json={"nombre": "  Martín Gómez "})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["nombre"] == "Martín Gómez"
        assert r.json()["data"]["nombre_presentable"] is True
