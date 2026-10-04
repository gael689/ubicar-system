"""
Trae al sistema de Ubicar los prospectos que encontró el buscador de leads de
Gael (04/10/2026).

Corre **en la máquina de Gael**, no en Railway: lee `leads.db` y empuja a
Ubicar, por su API, **sólo las empresas que sirven para Ubicar**.

    python -m scripts.sincronizar_prospectos_leadgen               # prueba: sólo cuenta
    python -m scripts.sincronizar_prospectos_leadgen --enviar      # empuja de verdad

Qué garantiza:

- **No escribe nada en `leads.db`.** Se abre en modo sólo lectura. No inserta
  prospectos de Ubicar en la tabla `leads`, así que el envío automático de Gael
  (que toma cualquier lead calificado con mail) no los ve ni los toca.
- **No manda mensajes.** Sólo transporta datos de empresas.
- **No empuja "todo"**: sólo los segmentos elegidos (por defecto, los que suelen
  alquilar autos para obra, viajes de trabajo o visitas). Los de "Rent a Car"
  quedan afuera siempre: son la competencia.
- Quien pidió que no lo contacten viaja **marcado** como `no_contactar`, para que
  Ubicar tampoco le escriba. Haber sido contactado antes viaja como
  `contacto_previo`.

Variables de entorno (o argumentos): `UBICAR_API_URL`, `PROSPECTOS_TOKEN`,
`LEADS_DB`.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import unicodedata
import urllib.error
import urllib.request

LEADS_DB_POR_DEFECTO = r"C:\Users\gaelr\Desktop\leadgen\data\leads.db"
API_POR_DEFECTO = "https://ubicar-system-production.up.railway.app/api/v1"
LOTE = 200

# Segmentos del buscador que suelen alquilar autos a una empresa de alquiler:
# obra y construcción, ingeniería y mantenimiento (viajes a obra), turismo,
# eventos, logística, inmobiliarias, seguros, puerto. Se ajusta con --segmentos.
SEGMENTOS_POR_DEFECTO = (
    "Constructoras y Desarrollo",
    "Construccion y Maquinaria",
    "Ingenieria y Servicios Industriales",
    "Montajes y Mantenimiento Industrial",
    "Obradores y Modulos Habitacionales",
    "Hoteleria y Turismo",
    "Eventos y Catering",
    "Logistica y Depositos",
    "Energia y Telecomunicaciones",
    "Inmobiliarias",
    "Seguros",
    "Puerto y Comercio Exterior",
)

# Nunca: son la competencia (y ya vienen marcados como `no_contactar` allá).
SEGMENTOS_EXCLUIDOS = ("Rent a Car",)


def _norm(texto: str | None) -> str:
    """Sin tildes ni mayúsculas: en la base hay 'Construccion' y 'Construcción'."""
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def abrir_solo_lectura(ruta: str) -> sqlite3.Connection:
    """`mode=ro`: aunque el script tuviera un error, no puede escribir."""
    uri = "file:" + ruta.replace("\\", "/") + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _detalle_contacto_previo(r: sqlite3.Row) -> str | None:
    partes = []
    if r["mail_enviado_at"]:
        partes.append(f"mail {str(r['mail_enviado_at'])[:10]}")
    if r["wa_enviado_at"]:
        partes.append(f"WhatsApp {str(r['wa_enviado_at'])[:10]}")
    if r["respondio_at"]:
        partes.append(f"respondió {str(r['respondio_at'])[:10]}")
    return ("Contactado antes (" + ", ".join(partes) + ")") if partes else None


def a_prospecto(r: sqlite3.Row) -> dict:
    """Una fila de `leads` convertida en lo que entiende Ubicar."""
    previo = _detalle_contacto_previo(r)
    return {
        "ref_externa": r["place_id"],
        "nombre": r["nombre"],
        "segmento": r["categoria"],
        "ciudad": r["localidad"],
        "direccion": r["direccion"],
        "telefono": r["telefono"],
        "email": r["email"],
        "website": r["website"],
        "instagram": r["instagram"],
        "score": r["score"],
        "contacto_previo": previo is not None,
        "contacto_previo_detalle": previo,
        "no_contactar": bool(r["no_contactar"]),
        "no_contactar_motivo": r["no_contactar_motivo"] if r["no_contactar"] else None,
    }


def leer_prospectos(
    conn: sqlite3.Connection, segmentos: list[str], score_min: int = 0,
    limite: int | None = None, con_contacto: bool = True,
) -> list[dict]:
    """Los leads de los segmentos elegidos, sin duplicados ni descartados."""
    # {nombre normalizado: nombre canónico}: 'Construcción' y 'Construccion'
    # son el mismo segmento y no tienen que aparecer como dos.
    canonicos = {_norm(s): s for s in segmentos if _norm(s) not in {_norm(x) for x in SEGMENTOS_EXCLUIDOS}}
    elegidos = set(canonicos)
    filas = conn.execute(
        """
        SELECT place_id, nombre, categoria, localidad, direccion, telefono, email,
               website, instagram, score, no_contactar, no_contactar_motivo,
               mail_enviado_at, wa_enviado_at, respondio_at
          FROM leads
         WHERE etapa != 'descartado' AND duplicado_de IS NULL
         ORDER BY score DESC, nombre
        """
    ).fetchall()
    salida = []
    for r in filas:
        if _norm(r["categoria"]) not in elegidos:
            continue
        if (r["score"] or 0) < score_min:
            continue
        if con_contacto and not ((r["email"] or "").strip() or (r["telefono"] or "").strip()):
            continue
        prospecto = a_prospecto(r)
        prospecto["segmento"] = canonicos[_norm(r["categoria"])]
        salida.append(prospecto)
        if limite and len(salida) >= limite:
            break
    return salida


def empujar(api: str, token: str, prospectos: list[dict]) -> dict:
    """Los manda de a lotes. Devuelve los totales que informa Ubicar."""
    totales = {"nuevos": 0, "actualizados": 0, "invalidos": 0, "ya_clientes": 0}
    for i in range(0, len(prospectos), LOTE):
        cuerpo = json.dumps({"prospectos": prospectos[i:i + LOTE]}).encode("utf-8")
        req = urllib.request.Request(
            f"{api.rstrip('/')}/prospectos/importar", data=cuerpo, method="POST",
            headers={"Content-Type": "application/json", "X-Token-Prospectos": token},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                datos = json.loads(resp.read().decode("utf-8"))["data"]
        except urllib.error.HTTPError as e:
            raise SystemExit(f"Ubicar rechazó el lote ({e.code}): {e.read().decode('utf-8', 'ignore')[:200]}")
        for k in ("nuevos", "actualizados", "invalidos"):
            totales[k] += datos.get(k, 0)
        totales["ya_clientes"] = datos.get("ya_clientes", totales["ya_clientes"])
    return totales


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.environ.get("LEADS_DB", LEADS_DB_POR_DEFECTO))
    ap.add_argument("--api", default=os.environ.get("UBICAR_API_URL", API_POR_DEFECTO))
    ap.add_argument("--token", default=os.environ.get("PROSPECTOS_TOKEN", ""))
    ap.add_argument("--segmentos", help="separados por coma; por defecto, los de Ubicar")
    ap.add_argument("--score-min", type=int, default=0)
    ap.add_argument("--limite", type=int)
    ap.add_argument("--incluir-sin-contacto", action="store_true",
                    help="también los que no tienen mail ni teléfono")
    ap.add_argument("--enviar", action="store_true", help="empujar de verdad (sin esto, sólo cuenta)")
    a = ap.parse_args()

    segmentos = [s.strip() for s in a.segmentos.split(",")] if a.segmentos else list(SEGMENTOS_POR_DEFECTO)
    conn = abrir_solo_lectura(a.db)
    try:
        prospectos = leer_prospectos(
            conn, segmentos, a.score_min, a.limite, con_contacto=not a.incluir_sin_contacto)
    finally:
        conn.close()

    por_segmento: dict[str, int] = {}
    for p in prospectos:
        por_segmento[p["segmento"]] = por_segmento.get(p["segmento"], 0) + 1
    print(f"{len(prospectos)} prospectos en {len(por_segmento)} segmentos:")
    for s, n in sorted(por_segmento.items(), key=lambda x: -x[1]):
        print(f"  {n:5d}  {s}")
    print(f"  marcados 'no contactar': {sum(p['no_contactar'] for p in prospectos)}"
          f" · contactados antes: {sum(p['contacto_previo'] for p in prospectos)}")

    if not a.enviar:
        print("\nPrueba: no se envió nada. Agregá --enviar para empujarlos a Ubicar.")
        return
    if not a.token:
        sys.exit("Falta el token (PROSPECTOS_TOKEN o --token).")
    print("\nEnviando a", a.api)
    print(empujar(a.api, a.token, prospectos))


if __name__ == "__main__":
    main()
