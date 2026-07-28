"""
Datos de demostración para recorrer el flujo de reserva web de punta a punta.

**No son datos reales.** Existen para poder VER el flujo funcionando antes de
que Franco y Martín carguen los precios y los adicionales de verdad. Todo lo
que crea este script está marcado con el prefijo `demo_` o con la nota
"[DEMO]", así que se puede sacar entero cuando ya no haga falta:

    python -m scripts.seed_demo_web            # carga
    python -m scripts.seed_demo_web --limpiar  # saca todo lo que cargó

Qué carga:
  - Una tarifa diaria, una semanal y una mensual GENERALES, para que el
    prorrateo por bloques (D-35) se pueda ver de verdad: 10 días tienen que
    dar 1 semana + 3 días, no 10 días sueltos.
  - Dos coberturas (una incluida y una paga) y dos extras.
  - Un recargo por conductor joven.
  - Fotos y specs en las categorías, tomadas de las imágenes que ya están
    en la web.

**No toca nada de lo que ya existe**: si una categoría ya tiene foto o specs,
se respetan.
"""
import sys

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal

NOTA = "[DEMO] Dato de demostración — borrar con scripts/seed_demo_web.py --limpiar"

# Precio del BLOQUE completo, no por día (D-35).
TARIFAS = [
    ("diaria", 85_000),
    ("semanal", 480_000),    # ~$68.500/día: alquilar la semana conviene
    ("mensual", 1_600_000),  # ~$53.300/día
]

ADICIONALES = [
    # (codigo, nombre, descripcion, grupo, precio, unidad, incluido, franquicia, max, orden)
    ("demo_cob_basica", "Cobertura Básica",
     "Incluida en todos los alquileres. Cubre responsabilidad civil frente a terceros.",
     "cobertura", 0, "por_dia", True, 2_620_000, 1, 0),
    ("demo_cob_full", "Cobertura Full",
     "Reduce al mínimo lo que pagás vos ante cualquier daño al vehículo.",
     "cobertura", 12_000, "por_dia", False, 350_000, 1, 1),
    ("demo_silla", "Silla para bebé",
     "Homologada. La instalamos nosotros antes de que retires el auto.",
     "extra", 4_500, "por_dia", False, None, 2, 1),
    ("demo_cadenas", "Cadenas para nieve",
     "Por si el viaje va a la cordillera.",
     "extra", 9_000, "unico", False, None, 1, 2),
]

RECARGO = ("Conductor joven", 18, 24, 15)  # nombre, desde, hasta, porcentaje

# Fotos que ya viven en web/public/img. La `foto_key` apunta al storage del
# backend, así que se copian ahí al sembrar.
FOTOS = {
    "compacto": "compacto.png",
    "sedan": "sedan-intermedio.png",
    "sedan_superior": "sedan-superior.png",
    "pickup": "pickup.png",
}

SPECS = {
    # codigo: (pasajeros, valijas, transmision, ejemplo_modelos)
    "compacto": (5, 2, "manual", "Fiat Argo, Chevrolet Onix o similar"),
    "sedan": (5, 3, "manual", "Fiat Cronos, Fiat Siena, Toyota Etios o similar"),
    "sedan_superior": (5, 3, "automatica", "VW Virtus o similar"),
    "suv": (5, 4, "automatica", "Jeep Renegade o similar"),
    "pickup": (5, 4, "manual", "Toyota Hilux, VW Amarok, Foton Tunland o similar"),
    "furgon": (3, 8, "manual", "Fiat Fiorino, Renault Kangoo o similar"),
}


def copiar_fotos(db: Session) -> int:
    """Copia las fotos de la web al storage del backend y las enlaza."""
    from pathlib import Path
    from app.core.deps import get_storage

    origen = Path(__file__).resolve().parents[2] / "web" / "public" / "img"
    storage = get_storage()
    copiadas = 0

    for codigo, archivo in FOTOS.items():
        ruta = origen / archivo
        if not ruta.exists():
            print(f"  [!] No se encontro {ruta.name}, se saltea")
            continue
        key = f"categorias/demo_{archivo}"
        storage.upload(key, ruta.read_bytes(), "image/png")
        db.execute(
            text("UPDATE categorias SET foto_key = :k WHERE codigo = :c AND foto_key IS NULL"),
            {"k": key, "c": codigo},
        )
        copiadas += 1
    return copiadas


def cargar(db: Session) -> None:
    print("Cargando datos de demostracion...\n")

    # ── Tarifas generales ─────────────────────────────────────────────────
    for tipo, monto in TARIFAS:
        ya = db.execute(text("""
            SELECT COUNT(*) FROM tarifas
            WHERE tipo = :t AND vehiculo_id IS NULL AND categoria_id IS NULL AND activo
        """), {"t": tipo}).scalar()
        if ya:
            print(f"  tarifa {tipo:9} ya existia, se respeta")
            continue
        db.execute(text("""
            INSERT INTO tarifas (tipo, monto, vehiculo_id, categoria_id, activo, vigencia_desde)
            VALUES (:t, :m, NULL, NULL, true, CURRENT_DATE)
        """), {"t": tipo, "m": monto})
        print(f"  tarifa {tipo:9} ${monto:,}")

    # ── Adicionales ───────────────────────────────────────────────────────
    print()
    for cod, nom, desc, grupo, precio, unidad, incluido, franq, maxc, orden in ADICIONALES:
        ya = db.execute(text("SELECT COUNT(*) FROM adicionales WHERE codigo = :c"),
                        {"c": cod}).scalar()
        if ya:
            print(f"  adicional {nom} ya existia")
            continue
        db.execute(text("""
            INSERT INTO adicionales (codigo, nombre, descripcion, grupo, precio, unidad_cobro,
                                     incluido, franquicia, max_cantidad, orden,
                                     visible_web, activo, created_at)
            VALUES (:cod, :nom, :desc, :grupo, :precio, :unidad,
                    :incluido, :franq, :maxc, :orden, true, true, NOW())
        """), dict(cod=cod, nom=nom, desc=desc, grupo=grupo, precio=precio,
                   unidad=unidad, incluido=incluido, franq=franq, maxc=maxc, orden=orden))
        print(f"  adicional {nom}")

    # ── Recargo por edad ──────────────────────────────────────────────────
    print()
    nombre, desde, hasta, pct = RECARGO
    ya = db.execute(text("SELECT COUNT(*) FROM recargos_edad WHERE nombre = :n"),
                    {"n": nombre}).scalar()
    if not ya:
        db.execute(text("""
            INSERT INTO recargos_edad (nombre, descripcion, edad_desde, edad_hasta,
                                       porcentaje, unidad_cobro, activo, created_at)
            VALUES (:n, :d, :de, :ha, :p, 'por_dia', true, NOW())
        """), {"n": nombre, "d": NOTA, "de": desde, "ha": hasta, "p": pct})
        print(f"  recargo {nombre} ({desde}-{hasta} anios, +{pct}%)")

    # ── Specs y fotos de categorias ───────────────────────────────────────
    print()
    for codigo, (pas, val, trans, ejemplo) in SPECS.items():
        db.execute(text("""
            UPDATE categorias
            SET pasajeros = COALESCE(pasajeros, :p),
                valijas = COALESCE(valijas, :v),
                transmision = COALESCE(transmision, :t),
                ejemplo_modelos = COALESCE(ejemplo_modelos, :e)
            WHERE codigo = :c
        """), {"p": pas, "v": val, "t": trans, "e": ejemplo, "c": codigo})
    print(f"  specs cargadas en {len(SPECS)} categorias")
    print(f"  fotos copiadas: {copiar_fotos(db)}")

    db.commit()
    print("\nListo. La web ya puede mostrar precios y disponibilidad.")


def limpiar(db: Session) -> None:
    print("Sacando los datos de demostracion...\n")

    n = db.execute(text("DELETE FROM adicionales WHERE codigo LIKE 'demo_%'")).rowcount
    print(f"  adicionales borrados: {n}")

    n = db.execute(text("DELETE FROM recargos_edad WHERE descripcion = :d"),
                   {"d": NOTA}).rowcount
    print(f"  recargos borrados: {n}")

    montos = [m for _, m in TARIFAS]
    n = db.execute(text("""
        DELETE FROM tarifas
        WHERE vehiculo_id IS NULL AND categoria_id IS NULL AND monto = ANY(:montos)
    """), {"montos": montos}).rowcount
    print(f"  tarifas generales borradas: {n}")

    n = db.execute(text("""
        UPDATE categorias SET foto_key = NULL WHERE foto_key LIKE 'categorias/demo_%'
    """)).rowcount
    print(f"  fotos desvinculadas: {n}")

    db.commit()
    print("\nListo. Las specs de las categorias se dejan: no molestan y son correctas.")


def main() -> None:
    db = SessionLocal()
    try:
        if "--limpiar" in sys.argv:
            limpiar(db)
        else:
            cargar(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
