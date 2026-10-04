"""
El sincronizador que trae los prospectos del buscador de leads de Gael.

Lo que más importa probar: **no puede escribir en `leads.db`** y **no empuja a
quien no corresponde** (competencia, descartados, duplicados).
"""
import sqlite3

import pytest

from scripts.sincronizar_prospectos_leadgen import (
    abrir_solo_lectura, leer_prospectos,
)

COLUMNAS = """
    place_id TEXT PRIMARY KEY, nombre TEXT, categoria TEXT, localidad TEXT,
    direccion TEXT, telefono TEXT, email TEXT, website TEXT, instagram TEXT,
    score INTEGER, etapa TEXT, duplicado_de TEXT, no_contactar INTEGER DEFAULT 0,
    no_contactar_motivo TEXT, mail_enviado_at TEXT, wa_enviado_at TEXT, respondio_at TEXT
"""


@pytest.fixture
def leads_db(tmp_path):
    ruta = tmp_path / "leads.db"
    c = sqlite3.connect(ruta)
    c.execute(f"CREATE TABLE leads ({COLUMNAS})")
    filas = [
        ("a", "Constructora Sur", "Constructoras y Desarrollo", "Bahía Blanca", None, "2914567890", "a@sur.com.ar", None, None, 90, "calificado", None, 0, None, None, None, None),
        ("b", "Obras Norte", "Construcción y Maquinaria", "Punta Alta", None, None, "b@norte.com.ar", None, None, 70, "nuevo", None, 0, None, "2026-09-12 10:00", None, None),
        ("c", "Otro Rent a Car", "Rent a Car", "Bahía Blanca", None, "2911111111", None, None, None, 95, "calificado", None, 1, "competencia", None, None, None),
        ("d", "Descartada SA", "Constructoras y Desarrollo", "Bahía Blanca", None, "2912222222", None, None, None, 80, "descartado", None, 0, None, None, None, None),
        ("e", "Duplicada SA", "Constructoras y Desarrollo", "Bahía Blanca", None, "2913333333", None, None, None, 80, "nuevo", "a", 0, None, None, None, None),
        ("f", "Sin contacto SA", "Constructoras y Desarrollo", "Bahía Blanca", None, None, None, None, None, 80, "nuevo", None, 0, None, None, None, None),
        ("g", "Peluquería X", "Retail y Comercio", "Bahía Blanca", None, "2914444444", None, None, None, 80, "nuevo", None, 0, None, None, None, None),
        ("h", "Dio de baja SRL", "Constructoras y Desarrollo", "Bahía Blanca", None, None, "h@baja.com.ar", None, None, 60, "nuevo", None, 1, "baja", None, None, None),
    ]
    c.executemany("INSERT INTO leads VALUES (" + ",".join("?" * 17) + ")", filas)
    c.commit()
    c.close()
    return str(ruta)


SEGS = ["Constructoras y Desarrollo", "Construccion y Maquinaria"]


def test_trae_sólo_los_segmentos_elegidos(leads_db):
    conn = abrir_solo_lectura(leads_db)
    nombres = {p["nombre"] for p in leer_prospectos(conn, SEGS)}
    assert nombres == {"Constructora Sur", "Obras Norte", "Dio de baja SRL"}


def test_no_trae_competencia_descartados_duplicados_ni_sin_contacto(leads_db):
    conn = abrir_solo_lectura(leads_db)
    nombres = {p["nombre"] for p in leer_prospectos(conn, SEGS + ["Rent a Car"])}
    assert not nombres & {"Otro Rent a Car", "Descartada SA", "Duplicada SA", "Sin contacto SA"}


def test_el_segmento_con_y_sin_tilde_es_uno_solo(leads_db):
    conn = abrir_solo_lectura(leads_db)
    p = next(x for x in leer_prospectos(conn, SEGS) if x["nombre"] == "Obras Norte")
    assert p["segmento"] == "Construccion y Maquinaria"


def test_quien_dio_de_baja_viaja_marcado(leads_db):
    conn = abrir_solo_lectura(leads_db)
    p = next(x for x in leer_prospectos(conn, SEGS) if x["nombre"] == "Dio de baja SRL")
    assert p["no_contactar"] is True and p["no_contactar_motivo"] == "baja"


def test_el_contacto_previo_viaja_con_su_detalle(leads_db):
    conn = abrir_solo_lectura(leads_db)
    p = next(x for x in leer_prospectos(conn, SEGS) if x["nombre"] == "Obras Norte")
    assert p["contacto_previo"] is True
    assert "mail 2026-09-12" in p["contacto_previo_detalle"]


def test_score_minimo_y_limite(leads_db):
    conn = abrir_solo_lectura(leads_db)
    assert [p["nombre"] for p in leer_prospectos(conn, SEGS, score_min=80)] == ["Constructora Sur"]
    assert len(leer_prospectos(conn, SEGS, limite=1)) == 1


def test_la_base_se_abre_en_solo_lectura(leads_db):
    """Aunque el script tuviera un error, no puede tocar `leads.db`."""
    conn = abrir_solo_lectura(leads_db)
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("UPDATE leads SET nombre = 'x'")
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("INSERT INTO leads (place_id, nombre) VALUES ('z', 'z')")
