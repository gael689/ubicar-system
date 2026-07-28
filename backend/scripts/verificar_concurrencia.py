"""
Verifica que dos personas no puedan reservar el mismo auto a la vez.

**Por qué existe como script y no como test.** La suite de `tests/` es de
dominio puro: lógica sin base de datos, que corre en segundos. Esto necesita
dos conexiones reales contra Postgres tomando locks de verdad — un lock que
funciona en SQLite en memoria no prueba nada sobre lo que va a pasar en
producción.

Correrlo antes de un deploy que toque reservas, disponibilidad o solapamientos:

    python -m scripts.verificar_concurrencia

Escribe y borra una reserva de prueba a 400 días de hoy, sobre el primer
vehículo activo. No toca datos reales.
"""
from __future__ import annotations

import datetime
import sys
import threading
import time

from app.database import SessionLocal
from app.domain.solapamientos import detectar_solapamientos
from app.models.cliente import Cliente
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services.reserva_service import ReservaService

HORA = datetime.time(10, 0)


def main() -> int:
    db = SessionLocal()
    veh = db.query(Vehiculo).filter(Vehiculo.activo.is_(True)).first()
    cli = db.query(Cliente).filter(Cliente.activo.is_(True)).first()
    if not veh or not cli:
        print("No hay vehículos o clientes activos para probar.")
        db.close()
        return 0

    veh_id, patente, cli_id = veh.id, veh.patente, cli.id
    desde = datetime.date.today() + datetime.timedelta(days=400)
    hasta = desde + datetime.timedelta(days=3)
    _limpiar(db, veh_id, desde)
    db.close()

    print(f"Vehículo #{veh_id} ({patente})  ·  {desde} → {hasta}\n")

    resultados: dict[int, str] = {}

    def usuario(n: int, demora_inicial: float, demora_al_confirmar: float) -> None:
        """
        Simula a una persona: abre la pantalla, mira, y confirma.

        El usuario 1 tarda en confirmar —mira el precio, habla con el
        cliente—. Ese hueco entre leer y grabar es exactamente donde se cuela
        la doble reserva.
        """
        s = SessionLocal()
        try:
            time.sleep(demora_inicial)
            svc = ReservaService(s)

            t0 = time.monotonic()
            ventanas = svc._cargar_ventanas(veh_id)  # el lock vive acá adentro
            espera = time.monotonic() - t0

            libre = not detectar_solapamientos(
                veh_id,
                datetime.datetime.combine(desde, HORA),
                datetime.datetime.combine(hasta, HORA),
                ventanas,
            ).hay_conflicto_bloqueante

            prefijo = f"(esperó {espera:.1f}s el lock) " if espera > 0.2 else ""
            if not libre:
                resultados[n] = f"{prefijo}vio OCUPADO → rechazada (409)"
                return

            time.sleep(demora_al_confirmar)
            s.add(Reserva(
                cliente_id=cli_id, vehiculo_id=veh_id,
                fecha_inicio=desde, hora_inicio=HORA,
                fecha_fin=hasta, hora_fin=HORA,
                lugar_entrega="verificación", lugar_devolucion="verificación",
                estado="confirmada", precio_total=1, precio_lista=1, usuario_id=1,
            ))
            s.commit()
            resultados[n] = f"{prefijo}vio libre → grabó"
        except Exception as e:  # noqa: BLE001 — cualquier fallo es información
            s.rollback()
            resultados[n] = f"{type(e).__name__}: {str(e)[:70]}"
        finally:
            s.close()

    hilos = [
        threading.Thread(target=usuario, args=(1, 0.0, 1.5)),
        threading.Thread(target=usuario, args=(2, 0.3, 0.0)),
    ]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    for n in sorted(resultados):
        print(f"  usuario {n}: {resultados[n]}")

    db = SessionLocal()
    creadas = _limpiar(db, veh_id, desde)
    db.close()

    print(f"\nReservas creadas sobre ese auto y rango: {creadas}")
    if creadas == 1:
        print("OK — el lock serializó las dos operaciones.")
        return 0
    print("FALLO — doble reserva. Revisar ReservaService._lock_vehiculo.")
    return 1


def _limpiar(db, veh_id: int, desde: datetime.date) -> int:
    reservas = (
        db.query(Reserva)
        .filter(Reserva.vehiculo_id == veh_id, Reserva.fecha_inicio == desde)
        .all()
    )
    for r in reservas:
        db.delete(r)
    db.commit()
    return len(reservas)


if __name__ == "__main__":
    sys.exit(main())
