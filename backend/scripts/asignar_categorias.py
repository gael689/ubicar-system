"""
Asigna la categoría a los 9 vehículos que quedaron sin ella.

Confirmado por el usuario el 2026-07-28 (punto 7 de docs/VALIDAR_CON_DUENOS.md):
se aceptan las sugerencias del documento **con una corrección** — el Corsa
Classic va a **Sedán**, no a Compacto.

Con esto los 16 vehículos de la flota quedan categorizados y se desbloquea la
web: sin categoría, `GET /public/disponibilidad` no tiene nada que ofrecer y la
tarifa por categoría nunca se dispara.

Es un script y no una migración a propósito: **son datos de negocio, no
estructura**. Una migración que asigna categorías se ejecutaría también en una
base nueva o de test, donde estas patentes no existen. El script es idempotente
— se puede correr las veces que haga falta.

Uso:
    docker compose exec backend python -m scripts.asignar_categorias
"""
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.categoria import Categoria
from app.models.vehiculo import Vehiculo

# patente -> código de categoría (ver alembic/versions/025_categorias.py)
ASIGNACIONES = {
    # Compacto
    "AH762UL": "compacto",       # Fiat Argo Drive MT
    # Sedán
    "PMH625": "sedan",           # Chevrolet Corsa Classic  ← corregido por el usuario
    "AG591WA": "sedan",          # Fiat Cronos Drive 1.3
    "AH021RK": "sedan",          # Fiat Cronos Drive 1.3
    "AH067LW": "sedan",          # Fiat Cronos Drive 1.3
    "AH462EG": "sedan",          # Fiat Cronos Drive 1.3
    "LGW669": "sedan",           # Fiat Siena Essence
    "AF865DD": "sedan",          # Toyota Etios 1.5 XLS AT
    # Sedán superior
    "AG902AQ": "sedan_superior",  # VW Virtus 1.6 — el más equipado
}


def main() -> None:
    db: Session = SessionLocal()
    try:
        categorias = {c.codigo: c.id for c in db.query(Categoria).all()}
        faltantes = set(ASIGNACIONES.values()) - set(categorias)
        if faltantes:
            raise SystemExit(f"Faltan categorías en la base: {sorted(faltantes)}")

        asignados, ya_estaban, no_encontrados = 0, 0, []
        for patente, codigo in ASIGNACIONES.items():
            vehiculo = db.query(Vehiculo).filter(Vehiculo.patente == patente).first()
            if not vehiculo:
                no_encontrados.append(patente)
                continue
            destino = categorias[codigo]
            if vehiculo.categoria_id == destino:
                ya_estaban += 1
                continue
            vehiculo.categoria_id = destino
            asignados += 1
            print(f"  {patente:10} -> {codigo}")

        db.commit()

        # Sin simbolos unicode: la consola de Windows usa cp1252 y un "check"
        # rompe el script DESPUES del commit — parece que fallo cuando en
        # realidad ya guardo todo.
        print(f"\n  Asignados: {asignados} | Ya estaban: {ya_estaban}")
        if no_encontrados:
            print(f"  [!] Patentes no encontradas: {', '.join(no_encontrados)}")

        sin_categoria = db.query(Vehiculo).filter(
            Vehiculo.categoria_id.is_(None), Vehiculo.activo.is_(True)
        ).all()
        if sin_categoria:
            print(f"\n  [!] Siguen sin categoria: {', '.join(v.patente for v in sin_categoria)}")
        else:
            print("\n  OK: toda la flota activa tiene categoria.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
