"""
El pagaré: aparte del contrato, en el mismo link, con la misma firma.

Pedido de Ubicar (12/09/2026). Lo que estos tests cuidan, en orden de gravedad:

1. **Una firma, un acto.** Firmar el contrato firma el pagaré pendiente con el
   mismo trazo, y si al pagaré le falta algo (un co-deudor) no se firma
   ninguno. Nunca queda el contrato firmado y el pagaré a medias.
2. **Nunca se copia una firma vieja.** Si el pagaré se genera después de que
   el contrato ya se firmó, el link se reabre sólo para el pagaré.
3. **El contrato no cambia.** Ni su snapshot ni su flujo cuando no hay pagaré.
4. **El pagaré se congela.** Cambiar la tasa después no reescribe lo emitido.
"""
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.domain import pagare_texto
from app.models.configuracion import Configuracion
from app.services.contrato_service import ContratoService
from app.services.pagare_service import PagareService, dia_local

FIRMA = b"\x89PNG-firma-del-titular"
FIRMA_COD = b"\x89PNG-firma-del-codeudor"


class StorageEnMemoria:
    def __init__(self):
        self.archivos: dict[str, bytes] = {}

    def upload(self, key, content, content_type):
        self.archivos[key] = content
        return key

    def read(self, key):
        return self.archivos[key]

    def delete(self, key):
        self.archivos.pop(key, None)

    def public_url(self, key):
        return f"/static/{key}"


@pytest.fixture()
def storage(monkeypatch):
    import app.core.deps as deps

    s = StorageEnMemoria()
    monkeypatch.setattr(deps, "_storage_singleton", s)
    return s


def _config(db, clave, valor, categoria="Pagaré"):
    db.add(Configuracion(clave=clave, valor=valor, tipo="string", categoria=categoria, descripcion=clave))


@pytest.fixture()
def empresa_configurada(db):
    _config(db, "empresa.locador_nombre", "FINAR GRUPO FINANCIERO S.R.L.", "Empresa")
    _config(db, "empresa.razon_social", "FINAR GRUPO FINANCIERO S.R.L.", "Empresa")
    _config(db, "empresa.cuit", "30-71756601-3", "Empresa")
    _config(db, "empresa.domicilio", "Paraguay 241, Piso 9, Dpto. A", "Empresa")
    _config(db, "empresa.localidad", "Bahía Blanca (8000), Provincia de Buenos Aires", "Empresa")
    _config(db, "pagare.interes_compensatorio_anual", "60% (sesenta por ciento)")
    _config(db, "pagare.interes_punitorio_anual", "30% (treinta por ciento)")
    _config(db, "pagare.lugar_emision", "Bahía Blanca")
    _config(db, "pagare.lugar_pago", "")
    db.flush()


@pytest.fixture()
def contrato(db, usuario, hacer_reserva, empresa_configurada):
    reserva = hacer_reserva(precio_total="140000")
    c = ContratoService(db).crear(reserva.id, None, usuario.id)
    db.flush()
    return c


def _emitir(db, contrato, usuario, **kw):
    datos = {"monto": 140000, "codeudores": []}
    datos.update(kw)
    p = PagareService(db).crear(contrato.reserva_id, usuario_id=usuario.id, **datos)
    db.flush()
    return p


# ── El texto ─────────────────────────────────────────────────────────────────

class TestTexto:
    def test_un_firmante_va_en_singular_sin_parentesis(self):
        t = pagare_texto.cuerpo(
            beneficiario="FINAR", monto=140000, lugar_pago="Paraguay 241",
            interes_compensatorio="60%", interes_punitorio="30%", firmantes=1,
        )
        assert t.startswith("A la vista pagaré solidariamente y sin protesto (Art. 50 - Dec. Ley 5965/63)")
        assert "En mi carácter de suscriptor hago constar expresamente que" in t
        assert "amplío el plazo de presentación" in t
        assert "(mos)" not in t and "/" not in t.replace("5965/63", "")

    def test_con_codeudores_va_en_plural(self):
        t = pagare_texto.cuerpo(
            beneficiario="FINAR", monto=1, lugar_pago="x",
            interes_compensatorio="1%", interes_punitorio="2%", firmantes=2,
        )
        assert "A la vista pagaremos" in t
        assert "En nuestro carácter de suscriptores hacemos constar" in t
        assert "ampliamos el plazo" in t

    def test_el_monto_va_en_letras_y_las_tasas_como_se_cargaron(self):
        t = pagare_texto.cuerpo(
            beneficiario="FINAR GRUPO FINANCIERO S.R.L.", monto=Decimal("140000"),
            lugar_pago="Paraguay 241, Bahía Blanca",
            interes_compensatorio="60% (sesenta por ciento)", interes_punitorio="30%", firmantes=1,
        )
        assert "a FINAR GRUPO FINANCIERO S.R.L. o a su orden, la cantidad de Pesos ciento cuarenta mil por igual valor" in t
        assert "es pagadero en Paraguay 241, Bahía Blanca." in t
        assert "interés compensatorio del 60% (sesenta por ciento) anual vencido" in t
        assert "interés punitorio del 30% anual vencido." in t

    def test_encabezado_y_monto_numerico(self):
        assert pagare_texto.encabezado_fecha("Bahía Blanca", date(2026, 9, 12)) == "Bahía Blanca, 12 de septiembre de 2026"
        assert pagare_texto.monto_numerico(140000) == "140.000,00"
        assert pagare_texto.monto_numerico("1234567.5") == "1.234.567,50"

    def test_la_fecha_es_la_de_argentina_y_no_la_de_utc(self):
        """Firmado a las 22 h del 12 en Bahía Blanca son las 01 h del 13 en UTC."""
        assert dia_local(datetime(2026, 9, 13, 1, 0)) == date(2026, 9, 12)


# ── Emisión ──────────────────────────────────────────────────────────────────

class TestEmision:
    def test_no_se_emite_sin_contrato(self, db, usuario, hacer_reserva, empresa_configurada):
        reserva = hacer_reserva()
        with pytest.raises(BusinessRuleError, match="Generá el contrato primero"):
            PagareService(db).crear(reserva.id, monto=1000, codeudores=[], usuario_id=usuario.id)

    def test_no_se_emite_sin_las_tasas(self, db, usuario, contrato):
        db.query(Configuracion).filter_by(clave="pagare.interes_punitorio_anual").one().valor = ""
        db.flush()
        with pytest.raises(BusinessRuleError, match="interés punitorio"):
            _emitir(db, contrato, usuario)

    def test_congela_todo_lo_que_se_imprime(self, db, usuario, contrato, cliente):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana Gómez", "dni": "30999888", "domicilio": "Alsina 350"}])
        s = p.snapshot
        assert s["monto_numerico"] == "140.000,00"
        assert s["monto_letras"] == "Pesos ciento cuarenta mil"
        assert s["beneficiario"] == "FINAR GRUPO FINANCIERO S.R.L."
        # Sin lugar de pago cargado, el domicilio de la empresa.
        assert s["lugar_pago"] == "Paraguay 241, Piso 9, Dpto. A, Bahía Blanca (8000), Provincia de Buenos Aires"
        assert s["deudor"]["nombre"] == cliente.nombre_completo
        assert s["deudor"]["dni"] == cliente.dni_cuit
        assert s["codeudores"] == [{"nombre": "Ana Gómez", "dni": "30999888", "domicilio": "Alsina 350"}]
        assert "pagaremos" in s["texto"]
        assert p.numero_formateado == f"P-{p.id:08d}"

    def test_cambiar_la_tasa_despues_no_reescribe_lo_emitido(self, db, usuario, contrato):
        p = _emitir(db, contrato, usuario)
        db.query(Configuracion).filter_by(clave="pagare.interes_compensatorio_anual").one().valor = "99%"
        db.flush()
        db.refresh(p)
        assert "60% (sesenta por ciento)" in p.snapshot["texto"]

    def test_uno_solo_por_contrato(self, db, usuario, contrato):
        _emitir(db, contrato, usuario)
        with pytest.raises(BusinessRuleError, match="ya tiene el pagaré"):
            _emitir(db, contrato, usuario)

    def test_monto_cero_o_codeudor_sin_dni_no(self, db, usuario, contrato):
        with pytest.raises(BusinessRuleError, match="mayor a cero"):
            _emitir(db, contrato, usuario, monto=0)
        with pytest.raises(BusinessRuleError, match="nombre y DNI"):
            _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": ""}])

    def test_el_contrato_no_cambia(self, db, usuario, contrato):
        antes = dict(contrato.snapshot)
        _emitir(db, contrato, usuario)
        db.refresh(contrato)
        assert contrato.snapshot == antes

    def test_preparar_sugiere_el_valor_del_alquiler(self, db, usuario, contrato):
        datos = PagareService(db).preparar(contrato.reserva_id)
        assert datos["monto_sugerido"] == float(contrato.snapshot["cargos"]["valor_estimado"])
        assert datos["faltantes"] == []
        assert datos["tiene_contrato"] is True


# ── Firma ────────────────────────────────────────────────────────────────────

class TestFirmaEnElMostrador:
    def test_una_firma_firma_los_dos(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario)
        ContratoService(db).firmar(contrato.id, FIRMA, "Juan Pérez", "30111222", usuario.id, medio="pantalla")
        db.flush()
        assert contrato.firmado and p.firmado
        assert p.firmado_por_nombre == "Juan Pérez" and p.firma_medio == "pantalla"
        assert storage.archivos[p.firma_key] == storage.archivos[contrato.firma_key] == FIRMA

    def test_si_falta_el_codeudor_no_se_firma_ninguno(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": "30999888"}])
        with pytest.raises(BusinessRuleError, match="Falta la firma del co-deudor: Ana"):
            ContratoService(db).firmar(contrato.id, FIRMA, "Juan", "30111222", usuario.id, medio="pantalla")
        assert not contrato.firmado and not p.firmado
        assert storage.archivos == {}

    def test_con_la_firma_del_codeudor_quedan_los_dos(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": "30999888"}])
        ContratoService(db).firmar(
            contrato.id, FIRMA, "Juan", "30111222", usuario.id, medio="pantalla",
            codeudores=[{"firma_bytes": FIRMA_COD}],
        )
        assert p.firmado
        assert p.firmas_codeudores[0]["nombre"] == "Ana"
        assert storage.archivos[p.firmas_codeudores[0]["firma_key"]] == FIRMA_COD

    def test_en_papel_no_se_piden_trazos(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": "30999888"}])
        ContratoService(db).firmar(contrato.id, None, "Juan", "30111222", usuario.id, medio="papel")
        assert p.firmado and p.firma_medio == "papel" and p.firma_key is None

    def test_pagare_generado_despues_se_firma_aparte_sin_copiar_la_firma_vieja(
        self, db, usuario, contrato, storage
    ):
        ContratoService(db).firmar(contrato.id, FIRMA, "Juan", "30111222", usuario.id, medio="pantalla")
        db.flush()
        p = _emitir(db, contrato, usuario)
        assert not p.firmado and p.firma_key is None

        nueva = b"\x89PNG-firma-de-hoy"
        ContratoService(db).firmar(contrato.id, nueva, "Juan", "30111222", usuario.id, medio="pantalla")
        assert p.firmado
        assert storage.archivos[p.firma_key] == nueva
        # El contrato sigue con su firma original.
        assert storage.archivos[contrato.firma_key] == FIRMA

    def test_sin_pagare_el_contrato_firmado_sigue_rechazando_otra_firma(self, db, usuario, contrato, storage):
        ContratoService(db).firmar(contrato.id, FIRMA, "Juan", "30111222", usuario.id, medio="pantalla")
        with pytest.raises(BusinessRuleError, match="ya está firmado"):
            ContratoService(db).firmar(contrato.id, FIRMA, "Juan", "30111222", usuario.id, medio="pantalla")


class TestFirmaPorLink:
    ACEPTACIONES_CONTRATO = ["contrato", "terminos", "licencia"]

    def _link(self, db, contrato):
        ContratoService(db).generar_link(contrato.id, "https://ubicar-rent.com.ar")
        db.flush()
        return contrato.firma_token

    def test_el_mismo_link_firma_los_dos_con_la_declaracion_del_pagare(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario)
        token = self._link(db, contrato)
        ContratoService(db).firmar_por_link(
            token, nombre="Juan", dni="30111222", firma_bytes=FIRMA,
            aceptadas=self.ACEPTACIONES_CONTRATO + ["pagare"], ip="1.2.3.4", user_agent="ua",
        )
        assert contrato.firmado and p.firmado
        assert p.firma_medio == "link" and p.firma_ip == "1.2.3.4"
        assert p.firma_aceptacion["clave"] == "pagare" and p.firma_aceptacion["aceptado_at"]

    def test_sin_tildar_el_pagare_no_firma_nada(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario)
        token = self._link(db, contrato)
        with pytest.raises(BusinessRuleError, match="Pagaré"):
            ContratoService(db).firmar_por_link(
                token, nombre="Juan", dni="30111222", firma_bytes=FIRMA,
                aceptadas=self.ACEPTACIONES_CONTRATO, ip=None, user_agent=None,
            )
        assert not contrato.firmado and not p.firmado

    def test_con_el_contrato_firmado_el_link_se_reabre_para_el_pagare(self, db, usuario, contrato, storage):
        token = self._link(db, contrato)
        ContratoService(db).firmar_por_link(
            token, nombre="Juan", dni="30111222", firma_bytes=FIRMA,
            aceptadas=self.ACEPTACIONES_CONTRATO, ip=None, user_agent=None,
        )
        db.flush()
        # Sin pagaré, el link ya no firma.
        with pytest.raises(BusinessRuleError, match="ya está firmado"):
            ContratoService(db).por_token(token, para_firmar=True)

        p = _emitir(db, contrato, usuario)
        assert ContratoService(db).por_token(token, para_firmar=True) is contrato
        aceptaciones_antes = list(contrato.firma_aceptaciones)
        # Para el pagaré sólo se pide su declaración, no las del contrato.
        ContratoService(db).firmar_por_link(
            token, nombre="Juan", dni="30111222", firma_bytes=FIRMA,
            aceptadas=["pagare"], ip=None, user_agent=None,
        )
        assert p.firmado
        assert contrato.firma_aceptaciones == aceptaciones_antes


class TestAnulacion:
    def test_anular_el_contrato_anula_su_pagare(self, db, usuario, contrato):
        p = _emitir(db, contrato, usuario)
        ContratoService(db).anular(contrato.id, "Datos mal cargados", usuario.id)
        assert p.anulado and "Datos mal cargados" in p.motivo_anulacion

    def test_anular_el_pagare_permite_emitir_otro(self, db, usuario, contrato):
        p = _emitir(db, contrato, usuario)
        PagareService(db).anular(p.id, "Monto equivocado", usuario.id)
        db.flush()
        otro = _emitir(db, contrato, usuario, monto=200000)
        assert otro.id != p.id and otro.snapshot["monto"] == 200000


class TestPdf:
    def test_se_genera_firmado_con_codeudores(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": "30999888"}, {"nombre": "Luis", "dni": "20111000"}])
        ContratoService(db).firmar(
            contrato.id, FIRMA, "Juan", "30111222", usuario.id, medio="pantalla",
            codeudores=[{"firma_bytes": FIRMA_COD}, {"firma_bytes": FIRMA_COD}],
        )
        pdf = PagareService(db).generar_pdf(p.id)
        assert pdf.startswith(b"%PDF") and len(pdf) > 1000

    def test_se_genera_sin_firmar(self, db, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario)
        assert PagareService(db).generar_pdf(p.id).startswith(b"%PDF")


# ── De punta a punta, por HTTP ───────────────────────────────────────────────

class TestLinkPublico:
    """Lo que ve y manda el teléfono del cliente, contra la app real."""

    PNG = "data:image/png;base64,iVBORw0KGgo="

    def test_el_link_trae_el_pagare_y_firma_los_dos_con_el_codeudor(
        self, db, client, usuario, contrato, storage
    ):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": "30999888"}])
        r = client.post(f"/api/v1/contratos/{contrato.id}/link")
        assert r.status_code == 200, r.text
        assert "el contrato de alquiler y el pagaré" in r.json()["data"]["mensaje"]
        token = contrato.firma_token

        vista = client.get(f"/api/v1/public/contratos/{token}").json()["data"]
        assert vista["pendiente"] is True
        assert vista["pagare"]["numero"] == p.numero_formateado
        assert vista["pagare"]["snapshot"]["codeudores"][0]["nombre"] == "Ana"

        cuerpo = {
            "nombre": "Juan", "dni": "30111222", "firma_base64": self.PNG,
            "aceptaciones": ["contrato", "terminos", "licencia", "pagare"],
        }
        # Sin la firma del co-deudor: 422 y nada firmado.
        r = client.post(f"/api/v1/public/contratos/{token}/firmar", json=cuerpo)
        assert r.status_code == 422, r.text
        assert "co-deudor" in r.json()["detail"]
        db.refresh(contrato)
        assert not contrato.firmado

        r = client.post(
            f"/api/v1/public/contratos/{token}/firmar",
            json={**cuerpo, "codeudores": [{"firma_base64": self.PNG}]},
        )
        assert r.status_code == 200, r.text
        db.refresh(contrato)
        db.refresh(p)
        assert contrato.firmado and p.firmado

        vista = client.get(f"/api/v1/public/contratos/{token}").json()["data"]
        assert vista["pendiente"] is False and vista["pagare"]["firmado"] is True

        pdf = client.get(f"/api/v1/public/contratos/{token}/pagare/pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    def test_sin_pagare_el_link_sigue_como_siempre(self, db, client, usuario, contrato, storage):
        client.post(f"/api/v1/contratos/{contrato.id}/link")
        token = contrato.firma_token
        vista = client.get(f"/api/v1/public/contratos/{token}").json()["data"]
        assert vista["pagare"] is None and vista["pendiente"] is True
        r = client.post(
            f"/api/v1/public/contratos/{token}/firmar",
            json={"nombre": "Juan", "dni": "30111222", "firma_base64": self.PNG,
                  "aceptaciones": ["contrato", "terminos", "licencia"]},
        )
        assert r.status_code == 200, r.text
        assert client.get(f"/api/v1/public/contratos/{token}/pagare/pdf").status_code == 404

    def test_api_interna_emite_lista_y_anula(self, db, client, usuario, contrato, storage):
        prep = client.get(f"/api/v1/pagares/preparar/{contrato.reserva_id}").json()["data"]
        r = client.post("/api/v1/pagares", json={
            "reserva_id": contrato.reserva_id, "monto": prep["monto_sugerido"], "codeudores": [],
        })
        assert r.status_code == 201, r.text
        pid = r.json()["data"]["id"]
        lista = client.get("/api/v1/pagares", params={"reserva_id": contrato.reserva_id}).json()["data"]
        assert [x["id"] for x in lista] == [pid]
        assert client.get(f"/api/v1/pagares/{pid}/pdf").status_code == 200
        r = client.post(f"/api/v1/pagares/{pid}/anular", json={"motivo": "prueba"})
        assert r.status_code == 200 and r.json()["data"]["anulado"] is True

    def test_la_firma_del_mostrador_acepta_codeudores(self, db, client, usuario, contrato, storage):
        p = _emitir(db, contrato, usuario, codeudores=[{"nombre": "Ana", "dni": "30999888"}])
        r = client.post(f"/api/v1/contratos/{contrato.id}/firmar", json={
            "nombre": "Juan", "dni": "30111222", "firma_medio": "pantalla",
            "firma_base64": self.PNG, "codeudores": [{"firma_base64": self.PNG}],
        })
        assert r.status_code == 200, r.text
        db.refresh(p)
        assert p.firmado and p.firmas_codeudores[0]["firma_key"]
