"""
El id de cada migración entra en `alembic_version.version_num`, que en
Postgres es VARCHAR(32).

El 14/10 la 107 tenía un id de 34 caracteres: Postgres la rechazó al anotarla,
el backend no levantó y el deploy falló por healthcheck. Los tests corren con
SQLite, que no controla el largo, así que nada lo había frenado. Ahora sí.

Las migraciones viejas con ids largos ya están aplicadas en producción; el
control vale de la 100 en adelante.
"""
import re
from pathlib import Path

VERSIONES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def test_los_ids_nuevos_entran_en_version_num():
    largos = []
    for f in VERSIONES.glob("*.py"):
        m = re.search(r'^revision\s*=\s*["\']([^"\']+)["\']', f.read_text(encoding="utf-8"), re.M)
        if not m:
            continue
        rev = m.group(1)
        if rev[:3].isdigit() and int(rev[:3]) >= 100 and len(rev) > 32:
            largos.append(f"{rev} ({len(rev)})")
    assert not largos, f"Ids de migración de más de 32 caracteres: {largos}"
