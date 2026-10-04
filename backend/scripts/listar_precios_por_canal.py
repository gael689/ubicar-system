"""
Qué precios cambian al unificar web y mostrador (04/10/2026). **Sólo lee.**

Desde el 04/10/2026 hay un solo precio: el motor ignora el canal, y entre dos
reglas que compiten por el mismo día gana la que no es "sólo web". Eso cambia
lo que paga la web en dos casos, y este script los lista para mirarlos ANTES de
desplegar:

  1. una regla/tarifa "sólo web" que pisaba a otra que sí rige en el mostrador;
  2. una regla/tarifa "sólo mostrador" o "ambos" que antes no llegaba a la web.

Uso (contra producción, adentro del contenedor):

    railway ssh --service ubicar-system "cd /app && python -m scripts.listar_precios_por_canal"

No modifica nada.
"""
from app.database import SessionLocal
from app.models.tarifa import Tarifa
from app.models.tarifa_calendario import TarifaCalendario


def main() -> None:
    db = SessionLocal()
    try:
        reglas = (
            db.query(TarifaCalendario)
            .filter(TarifaCalendario.activo.is_(True))
            .order_by(TarifaCalendario.categoria_id, TarifaCalendario.fecha_desde)
            .all()
        )
        solo_web = [r for r in reglas if r.canal == "web"]
        resto = [r for r in reglas if r.canal != "web"]

        print(f"Reglas de calendario activas: {len(reglas)} "
              f"({len(solo_web)} sólo web, {len(resto)} mostrador/ambos)\n")

        print("== Reglas 'sólo web' que chocan con una de mostrador/ambos ==")
        hubo = False
        for w in solo_web:
            for o in resto:
                misma_flota = (
                    w.categoria_id == o.categoria_id and w.vehiculo_id == o.vehiculo_id
                )
                if not misma_flota or w.fecha_desde is None or o.fecha_desde is None:
                    continue
                if w.fecha_desde <= o.fecha_hasta and o.fecha_desde <= w.fecha_hasta:
                    hubo = True
                    print(
                        f"  WEB   #{w.id} '{w.nombre}' {w.fecha_desde}→{w.fecha_hasta} "
                        f"${w.precio_dia}/día  (prio {w.prioridad})\n"
                        f"  QUEDA #{o.id} '{o.nombre}' {o.fecha_desde}→{o.fecha_hasta} "
                        f"${o.precio_dia}/día  (prio {o.prioridad}, {o.canal})\n"
                    )
        if not hubo:
            print("  ninguna\n")

        print("== Reglas 'sólo web' sin competencia (pasan a regir también en el mostrador) ==")
        sin_choque = [
            w for w in solo_web
            if not any(
                w.categoria_id == o.categoria_id and w.vehiculo_id == o.vehiculo_id
                and w.fecha_desde and o.fecha_desde
                and w.fecha_desde <= o.fecha_hasta and o.fecha_desde <= w.fecha_hasta
                for o in resto
            )
        ]
        for w in sin_choque:
            print(f"  #{w.id} '{w.nombre}' {w.fecha_desde}→{w.fecha_hasta} "
                  f"${w.precio_dia}/día cat={w.categoria_id} veh={w.vehiculo_id}")
        if not sin_choque:
            print("  ninguna")

        print("\n== Reglas 'sólo mostrador' (pasan a regir también en la web) ==")
        solo_mostrador = [r for r in reglas if r.canal == "mostrador"]
        for r in solo_mostrador:
            print(f"  #{r.id} '{r.nombre}' {r.fecha_desde}→{r.fecha_hasta} "
                  f"${r.precio_dia}/día cat={r.categoria_id} veh={r.vehiculo_id}")
        if not solo_mostrador:
            print("  ninguna")

        tarifas = db.query(Tarifa).filter(Tarifa.activo.is_(True)).all()
        distintas = [t for t in tarifas if t.canal != "ambos"]
        print(f"\n== Tarifas por banda con canal propio: {len(distintas)} de {len(tarifas)} ==")
        for t in distintas:
            print(f"  #{t.id} {t.tipo} ${t.monto} cat={t.categoria_id} veh={t.vehiculo_id} "
                  f"canal={t.canal}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
