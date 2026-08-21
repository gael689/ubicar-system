"""
La base de prueba, y las piezas mínimas para poder ejercitar un service.

**Por qué existe.** Hasta la Fase 0 del `PLAN_DINERO.md`, `tests/` tenía sólo
`domain/` y `adapters/`: lógica pura, sin base. Ningún test tocaba un service,
así que ninguna de las reglas que mueven plata —el ledger, la caja, las
notificaciones de deuda— tenía red. Todo "cómo se prueba" del plan era manual.

**Cómo funciona.** SQLite en memoria, con el esquema real construido desde los
modelos (`Base.metadata`). No es Postgres, y eso se paga en dos cosas puntuales
que se compensan más abajo; a cambio, el suite entero sigue corriendo con
`pytest` y sin levantar nada. Cada test recibe una sesión sobre una base
**recién creada**: no hay estado compartido y el orden de colección no importa.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.schema import ColumnDefault
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  — puebla Base.metadata con TODAS las tablas
from app.database import Base


# `recibos.numero` y `contratos.numero` traen `server_default` con
# `nextval('...')`, que es una secuencia de Postgres y SQLite no entiende. Se
# neutraliza sólo para el metadata de test — el modelo no se toca, así que la
# migración y producción siguen usando la secuencia real.
def _sin_secuencias_de_postgres() -> None:
    for tabla, columna in (("recibos", "numero"), ("contratos", "numero")):
        col = Base.metadata.tables[tabla].columns[columna]
        if col.server_default is not None:
            col.server_default = None
            # `recibos.numero` es NOT NULL sin default de Python: sin la
            # secuencia habría que pasarlo a mano en cada insert. Se le pone un
            # contador local para que crear un recibo en un test siga siendo
            # una línea.
            if not col.nullable and col.default is None:
                contador = {"n": 0}

                def _siguiente(_ctx, _c=contador):
                    _c["n"] += 1
                    return _c["n"]

                col.default = ColumnDefault(_siguiente)


_sin_secuencias_de_postgres()


@pytest.fixture()
def engine():
    """
    Una base nueva por test.

    `StaticPool` + `check_same_thread=False` para que todas las conexiones de
    la misma sesión vean la **misma** base en memoria: sin eso, cada conexión
    abre su propio SQLite vacío y el primer `flush()` no encuentra las tablas.
    """
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # SQLite no valida las foreign keys salvo que se le pida explícitamente, y
    # este esquema se apoya en ellas (el ledger tiene ocho FK de contexto). Sin
    # esto, un test podría pasar apuntando a un `cliente_id` inexistente.
    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture()
def db(engine) -> Session:
    """
    La sesión que reciben los tests de service.

    `autoflush=False` para copiar la sesión de producción
    (`app.database.SessionLocal`): los services están escritos asumiendo que el
    `flush()` lo controlan ellos, y un autoflush distinto haría que un test
    pase o falle por un motivo que en producción no existe.
    """
    Sesion = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    s = Sesion()
    try:
        yield s
    finally:
        s.close()


# ── Piezas mínimas ───────────────────────────────────────────────────────────
#
# Un movimiento de cuenta corriente necesita un cliente; casi todo lo demás
# necesita un usuario que lo haya cargado. Se arman acá para que ningún test
# empiece con veinte líneas de andamiaje.

@pytest.fixture()
def usuario(db):
    from app.models.usuario import Usuario

    u = Usuario(
        email="operador@ubicarrent.test",
        nombre="Operador de prueba",
        rol="admin",
        auth_sub="test:operador",
    )
    db.add(u)
    db.flush()
    return u


@pytest.fixture()
def cliente(db):
    from app.models.cliente import Cliente

    c = Cliente(
        nombre_completo="Cliente de Prueba",
        dni_cuit="30111222",
        telefono="2915550000",
        tipo="particular",
    )
    db.add(c)
    db.flush()
    return c


@pytest.fixture()
def vehiculo(db):
    from app.models.vehiculo import Vehiculo

    v = Vehiculo(
        patente="AB123CD",
        marca="Fiat",
        modelo="Cronos",
        anio=2024,
        tipo="auto",
        color="blanco",
        estado="disponible",
        km_actual=10_000,
    )
    db.add(v)
    db.flush()
    return v


@pytest.fixture()
def hacer_reserva(db, cliente, usuario, vehiculo):
    """
    Fábrica de reservas. Devuelve una función porque casi todo test del
    circuito del dinero necesita **dos** reservas (una pagada y una impaga)
    para demostrar que el filtro discrimina.
    """
    from datetime import date as _date, time as _time
    from app.models.reserva import Reserva

    def _hacer(
        *,
        precio_total="100000",
        estado="confirmada",
        condicion_pago="contado",
        condicion_pago_ancla="checkout",
        fecha_inicio=_date(2026, 9, 1),
        fecha_fin=_date(2026, 9, 5),
        cliente_id=None,
        **extra,
    ):
        r = Reserva(
            vehiculo_id=vehiculo.id,
            cliente_id=cliente_id or cliente.id,
            fecha_inicio=fecha_inicio,
            hora_inicio=_time(10, 0),
            fecha_fin=fecha_fin,
            hora_fin=_time(10, 0),
            lugar_entrega="Local",
            lugar_devolucion="Local",
            estado=estado,
            usuario_id=usuario.id,
            precio_total=Decimal(str(precio_total)) if precio_total is not None else None,
            condicion_pago=condicion_pago,
            condicion_pago_ancla=condicion_pago_ancla,
            **extra,
        )
        db.add(r)
        db.flush()
        return r

    return _hacer


@pytest.fixture()
def hacer_alquiler(db, usuario):
    """
    Fábrica de alquileres ya entregados, sin pasar por `checkout()`.

    Los tests que ejercitan `checkout()` lo llaman de verdad; los que sólo
    necesitan "un alquiler que existe" (los filtros de cobranza, por ejemplo)
    usan esto y se ahorran las validaciones de solapamiento y contrato.
    """
    from datetime import date as _date, time as _time
    from app.models.alquiler import Alquiler

    def _hacer(reserva, *, checkout_fecha=_date(2026, 9, 1), cargo_excedente="0"):
        a = Alquiler(
            reserva_id=reserva.id,
            checkout_fecha=checkout_fecha,
            checkout_hora=_time(10, 0),
            checkout_km=10_000,
            checkout_combustible=100,
            cargo_excedente=Decimal(str(cargo_excedente)),
            decidido_por=usuario.id,
        )
        db.add(a)
        db.flush()
        return a

    return _hacer


@pytest.fixture()
def hacer_pago(db, usuario):
    from datetime import date as _date
    from app.models.pago import Pago

    def _hacer(*, cliente_id, monto, alquiler_id=None, medio_pago="efectivo",
               fecha=_date(2026, 9, 1)):
        p = Pago(
            cliente_id=cliente_id,
            alquiler_id=alquiler_id,
            monto=Decimal(str(monto)),
            medio_pago=medio_pago,
            fecha=fecha,
            cobrado_por=usuario.id,
        )
        db.add(p)
        db.flush()
        return p

    return _hacer


@pytest.fixture()
def client(db, usuario):
    """
    Un cliente HTTP contra la app real, con la base de prueba y la sesión del
    test inyectadas.

    **Hace falta para probar lo que valida el router y no el service** — un
    payload que Pydantic tiene que rechazar antes de llegar a ninguna lógica.
    `get_current_user` se reemplaza por el usuario de prueba: la auth ya está
    cubierta en otro lado y acá sólo estorbaría.
    """
    from fastapi.testclient import TestClient

    from app.core.deps import get_current_user, get_db
    # **Hay dos `get_db` distintos.** Los routers internos lo importan de
    # `app.core.deps` y `public.py` de `app.database`: son dos objetos, y
    # FastAPI resuelve los overrides por identidad. Pisando uno solo, los
    # endpoints públicos seguían abriendo su propia sesión contra el Postgres
    # de desarrollo — el test pasaba o fallaba según en qué migración estuviera
    # esa base, que es lo contrario de un test.
    from app.database import get_db as get_db_publico
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_db_publico] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: usuario
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
