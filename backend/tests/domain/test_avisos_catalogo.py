"""
El catálogo de avisos cubre todo lo que el sistema emite.

**Por qué existe.** El módulo y la acción de cada aviso salen de
`domain/avisos_catalogo.py`. Un tipo que no está ahí no rompe nada —cae en
Operación con el botón "Ver"—, y justamente por eso nadie se enteraría: fue lo
que pasó con `vtv_vencimiento`, que estuvo meses en "Otros". Este test lee el
código de las reglas y falla si alguien agrega una sin catalogarla.
"""
import re
from pathlib import Path

from app.domain import avisos_catalogo as catalogo
from app.domain.notificaciones_reglas import REGLAS
from app.domain.oportunidades_reglas import REGLAS_OPORTUNIDAD, TIPOS_OPORTUNIDAD

APP = Path(__file__).resolve().parents[2] / "app"
REGLAS_PY = (APP / "domain" / "notificaciones_reglas.py").read_text(encoding="utf-8")

# Los `"tipo":` que no son un literal, con lo que valen de verdad. Si aparece
# una forma nueva que no está acá, el test de abajo falla y hay que sumarla.
TIPOS_DINAMICOS = {
    '"tipo": tipo,': {"vtv_vencimiento", "poliza_vencimiento"},
    '"tipo": f"doc_{entidad_tipo}_vencido",': {"doc_vehiculo_vencido", "doc_cliente_vencido"},
    '"tipo": f"doc_{entidad_tipo}_por_vencer",': {"doc_vehiculo_por_vencer", "doc_cliente_por_vencer"},
}


def _tipos_de_las_reglas() -> set[str]:
    tipos = set(re.findall(r'"tipo":\s*"([a-z0-9_]+)"', REGLAS_PY))
    for forma, valores in TIPOS_DINAMICOS.items():
        if forma in REGLAS_PY:
            tipos |= valores
    return tipos


def _tipos_instantaneos() -> set[str]:
    """Los que nacen de `generar_una(...)` en routers y services."""
    tipos = set()
    for archivo in list((APP / "routers").glob("*.py")) + list((APP / "services").glob("*.py")):
        texto = archivo.read_text(encoding="utf-8")
        for m in re.finditer(r"generar_una\(", texto):
            encontrado = re.search(r'"tipo":\s*"([a-z0-9_]+)"', texto[m.end(): m.end() + 600])
            if encontrado:
                tipos.add(encontrado.group(1))
    return tipos


def test_no_hay_un_tipo_armado_de_una_forma_que_este_test_no_conozca():
    lineas = [l.strip() for l in REGLAS_PY.splitlines() if l.strip().startswith('"tipo":')]
    raras = [
        l for l in lineas
        if not re.match(r'"tipo":\s*"[a-z0-9_]+",', l) and l not in TIPOS_DINAMICOS
        # La línea del docstring que describe el contrato.
        and not l.startswith('"tipo": str,')
    ]
    assert raras == []


def test_todo_lo_que_emiten_las_reglas_esta_catalogado():
    tipos = _tipos_de_las_reglas()
    # Si el regex dejara de encontrar cosas, el test pasaría vacío.
    assert len(tipos) >= len(REGLAS)
    assert sorted(tipos - set(catalogo.CATALOGO)) == []


def test_los_avisos_instantaneos_tambien():
    tipos = _tipos_instantaneos()
    assert {"reserva_web_nueva", "solicitud_contacto", "echeq_rechazado",
            "pago_web_devuelto", "contrato_firmado"} <= tipos
    assert sorted(tipos - set(catalogo.CATALOGO)) == []


def test_las_oportunidades_estan_catalogadas_y_llevan_el_prefijo():
    assert TIPOS_OPORTUNIDAD <= set(catalogo.CATALOGO)
    assert all(catalogo.es_oportunidad(t) for t in TIPOS_OPORTUNIDAD)
    assert len(REGLAS_OPORTUNIDAD) == len(TIPOS_OPORTUNIDAD)
    # Y nada que no sea una oportunidad usa el prefijo.
    assert {t for t in catalogo.CATALOGO if catalogo.es_oportunidad(t)} == set(TIPOS_OPORTUNIDAD)


def test_cada_tipo_apunta_a_un_modulo_que_existe_y_tiene_accion():
    for tipo, (modulo, accion) in catalogo.CATALOGO.items():
        assert modulo in catalogo.MODULOS, tipo
        assert accion and accion[0].isupper() and len(accion) <= 30, tipo


def test_el_orden_de_los_modulos_es_el_pedido():
    assert list(catalogo.MODULOS) == [
        "operacion", "cobranzas", "flota", "clientes", "web", "uber",
        "configuracion", "oportunidades",
    ]
    assert catalogo.etiqueta_de("configuracion") == "Falta completar"


def test_un_tipo_desconocido_cae_en_operacion_con_ver():
    assert catalogo.modulo_de("algo_que_nadie_catalogo") == "operacion"
    assert catalogo.accion_de("algo_que_nadie_catalogo") == "Ver"


def test_ejemplos_del_catalogo():
    assert catalogo.modulo_de("echeq_sin_acreditar") == "cobranzas"
    assert catalogo.accion_de("echeq_sin_acreditar") == "Marcar acreditado"
    assert catalogo.modulo_de("vtv_vencimiento") == "flota"
    assert catalogo.modulo_de("op_auto_uber_libre") == "uber"
    # El catálogo puede tener tipos de más (los de Uber llegan con su paquete):
    # lo que no puede pasar es que a una regla le falte el suyo.
    assert {"op_auto_uber_libre", "uber_semana_vence_hoy"} <= catalogo.tipos_de_modulo("uber")
    assert catalogo.accion_de("uber_semana_atrasada") == "Cobrar lo atrasado"
