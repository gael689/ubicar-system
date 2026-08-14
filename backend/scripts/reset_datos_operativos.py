"""
Limpieza de datos operativos (plan de conexión y limpieza, 13/08/2026 — §4).

    *"la idea ahora es limpiar todo el programa, quedaron cosas viejas,
    únicamente que quede la flota vehicular, y los usuarios creados en
    CLERK, pero toda reserva, gasto, caja, anterior, todo eliminado"* — Franco

Uso:

    python -m scripts.reset_datos_operativos              # dry-run: sólo cuenta
    python -m scripts.reset_datos_operativos --confirmar   # borra de verdad

**Dry-run por default a propósito.** Esto no es un script de demo (como
`seed_demo_web.py`): toca la base real, en una sola pasada, sin vuelta atrás
salvo restaurar un backup. `--confirmar` es la única forma de que borre algo.

Qué se borra — de hoja a raíz, en una sola transacción (§4.2):
  reservas y su ciclo (reserva_adicionales, contratos, pagos_web, holds,
  alquileres) · plata (pagos, recibos, comprobantes, movimientos de cuenta
  corriente, cuentas corrientes, echeqs, multas, gastos, presupuestos) ·
  operación (daños, fotos de daño, bloqueos de vehículo) · clientes (y
  conductores adicionales, contactos, tarjetas, documentos de cliente) ·
  avisos (notificaciones, emails enviados) · estadística de demanda
  insatisfecha · tarifas y tarifas_calendario (sólo tienen la tarifa
  genérica de demo — migración 058; el aviso `categoria_precio_generico`
  sigue sonando hasta que se cargue la real).

Qué se conserva siempre: vehículos, categorías, usuarios, configuración,
plantillas de contrato, descuentos por duración, fechas especiales,
adicionales, recargos por edad, documentos del vehículo (VTV, póliza) y el
log de auditoría — es la prueba de que el sistema audita, no ruido (§5,
punto 4).

Qué se conserva por default pero se puede incluir con un flag: el historial
de `servicios` (services) y los km de cada vehículo. Es historial real de la
flota, no de las pruebas — el plan recomienda **preguntar antes** (§5, punto
4), así que acá es opt-in:

    python -m scripts.reset_datos_operativos --confirmar --incluir-servicios

Después de borrar, el script arregla las tres cosas que el borrado solo
rompe (§4.3):
  1. Crea el cliente "Consultas web" — sin él, `POST /public/solicitudes`
     devuelve 503 apenas la tabla de clientes queda vacía.
  2. Crea el usuario "Sistema" — antes esos dos lugares usaban
     `order_by(id).first()`, que después de esta limpieza sería una persona
     real, y la auditoría diría que Franco cargó algo que entró solo por la
     web a las 3 de la mañana.
  3. Resetea a `disponible` los vehículos que quedaron en `alquilado`,
     `reservado` o `en_transicion` por una reserva que ya no existe. No toca
     `fuera_de_servicio`: ese estado es real (un auto en el taller no se
     vuelve disponible porque se borró una reserva vieja).

Lo que NO hace: no toca los objetos del bucket (firmas, PDFs de contratos,
fotos de daños quedan huérfanos — §4.3 punto 4, no urgente) y no hace nada
con `../ubicar-rent-pro/` (§4.4, es un dominio de Vercel, no datos).
"""
import sys
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models.cliente import DNI_CLIENTE_GENERICO, NOMBRE_CLIENTE_GENERICO, Cliente
from app.models.usuario import AUTH_SUB_SISTEMA, Usuario

# De hoja a raíz. Antes de recorrerla se rompen a mano los ciclos entre
# `movimientos_cuenta_corriente` y `recibos/comprobantes/echeqs/danios`
# (cada uno referencia al otro, nullable en los dos sentidos — un asiento
# puede señalar el recibo que lo originó y el recibo puede señalar el
# asiento que generó, para poder revertir con un contra-asiento). Sin
# romperlos primero, cualquier orden lineal de DELETE choca contra una FK en
# algún punto.
TABLAS_EN_ORDEN = [
    "fotos_danio",
    "danios",
    "reserva_adicionales",
    "contratos",
    "pagos_web",
    "holds",
    "recibos",
    "comprobantes",
    "echeqs",
    "movimientos_cuenta_corriente",
    "cuentas_corrientes",
    "pagos",
    "alquileres",
    "reservas",
    "multas",
    "gastos",
    "presupuestos",
    "bloqueos_vehiculo",
    "tarjetas_cliente",
    "conductores_adicionales",
    "cliente_contactos",
    # sólo los documentos de cliente (DNI, licencia) — los del vehículo
    # (VTV, póliza) se conservan, así que esta tabla no se vacía entera.
    "documentos WHERE cliente_id IS NOT NULL",
    "clientes",
    "notificaciones_vistas",
    "notificaciones",
    "emails_enviados",
    "busquedas_sin_resultado",
    # Sólo tienen la tarifa genérica de demo (migración 058) — van después de
    # `reservas`, que las referencia por `tarifa_aplicada_id`.
    "tarifas_calendario",
    "tarifas",
]

TABLA_SERVICIOS = "servicios"


def _romper_ciclos(db: Session) -> None:
    """Nullea las columnas que crean referencias circulares, para que el
    DELETE en orden de `TABLAS_EN_ORDEN` no choque contra una FK sin
    importar en qué paso esté cada lado del ciclo."""
    db.execute(text("""
        UPDATE movimientos_cuenta_corriente
        SET recibo_id = NULL, comprobante_id = NULL, echeq_id = NULL,
            multa_id = NULL, danio_id = NULL
    """))
    db.execute(text("UPDATE recibos SET movimiento_cc_id = NULL"))
    db.execute(text("UPDATE comprobantes SET movimiento_cc_id = NULL"))
    db.execute(text("UPDATE danios SET movimiento_cc_id = NULL"))
    # echeqs además referencia cuenta_corriente/alquiler/reserva/gasto —
    # nulleado entero para que se pueda borrar en cualquier punto de la
    # secuencia sin importar el orden relativo a esas cuatro tablas.
    db.execute(text("""
        UPDATE echeqs
        SET movimiento_cc_id = NULL, gasto_id = NULL,
            cuenta_corriente_id = NULL, alquiler_id = NULL, reserva_id = NULL
    """))


def _contar(db: Session, tabla: str) -> int:
    # `tabla` puede traer un WHERE (ver "documentos WHERE ..." en la lista) —
    # armar el SELECT con el mismo sufijo mantiene una sola fuente de verdad
    # entre contar y borrar.
    return db.execute(text(f"SELECT COUNT(*) FROM {tabla}")).scalar() or 0


def _nombre_tabla(entrada: str) -> str:
    return entrada.split(" WHERE ")[0]


def dry_run(db: Session, incluir_servicios: bool) -> None:
    print(f"DRY-RUN contra: {engine.url.render_as_string(hide_password=True)}\n")
    print("No se borra nada. Para borrar de verdad: --confirmar\n")
    total = 0
    for entrada in TABLAS_EN_ORDEN:
        n = _contar(db, entrada)
        total += n
        print(f"  {_nombre_tabla(entrada):32} {n:>6} fila(s)")
    if incluir_servicios:
        n = _contar(db, TABLA_SERVICIOS)
        total += n
        print(f"  {TABLA_SERVICIOS:32} {n:>6} fila(s)  (--incluir-servicios)")
    else:
        n = _contar(db, TABLA_SERVICIOS)
        print(f"  {TABLA_SERVICIOS:32} {n:>6} fila(s)  (NO se toca, pasa --incluir-servicios)")

    n_vehiculos = db.execute(text(
        "SELECT COUNT(*) FROM vehiculos WHERE estado IN ('alquilado','reservado','en_transicion')"
    )).scalar() or 0
    print(f"\n  vehiculos a resetear a 'disponible': {n_vehiculos}")
    print(f"\nTotal de filas a borrar: {total}")


def limpiar(db: Session, incluir_servicios: bool) -> None:
    print(f"Limpiando contra: {engine.url.render_as_string(hide_password=True)}\n")

    _romper_ciclos(db)

    for entrada in TABLAS_EN_ORDEN:
        n = db.execute(text(f"DELETE FROM {entrada}")).rowcount
        print(f"  {_nombre_tabla(entrada):32} {n:>6} borrada(s)")

    if incluir_servicios:
        n = db.execute(text(f"DELETE FROM {TABLA_SERVICIOS}")).rowcount
        print(f"  {TABLA_SERVICIOS:32} {n:>6} borrada(s)")
        n = db.execute(text(
            "UPDATE vehiculos SET km_actual = 0, km_proximo_service = km_entre_services"
        )).rowcount
        print(f"  km de vehículos reseteados: {n}")
    else:
        print(f"  {TABLA_SERVICIOS:32} conservado (no se pasó --incluir-servicios)")

    # ── Los tres arreglos de §4.3 ────────────────────────────────────────
    print()
    _asegurar_cliente_generico(db)
    _asegurar_usuario_sistema(db)
    _resetear_vehiculos(db)

    db.commit()
    print("\nListo. Confirma que /reservar y /public/solicitudes siguen respondiendo antes de dar la limpieza por buena.")


def _asegurar_cliente_generico(db: Session) -> None:
    existente = db.query(Cliente).filter(Cliente.nombre_completo == NOMBRE_CLIENTE_GENERICO).first()
    if existente:
        print(f"  cliente '{NOMBRE_CLIENTE_GENERICO}' ya existía (id {existente.id})")
        return
    cliente = Cliente(
        nombre_completo=NOMBRE_CLIENTE_GENERICO,
        dni_cuit=DNI_CLIENTE_GENERICO,
        telefono="-",
        tipo="particular",
        notas="Cliente de sistema — sostiene las solicitudes sin cupo que todavía no tienen un cliente real (D-53, §4.3).",
    )
    db.add(cliente)
    db.flush()
    print(f"  cliente '{NOMBRE_CLIENTE_GENERICO}' creado (id {cliente.id})")


def _asegurar_usuario_sistema(db: Session) -> None:
    existente = db.query(Usuario).filter(Usuario.auth_sub == AUTH_SUB_SISTEMA).first()
    if existente:
        print(f"  usuario 'Sistema' ya existía (id {existente.id})")
        return
    usuario = Usuario(
        email="sistema@ubicar.internal",
        nombre="Sistema",
        rol="admin",
        auth_sub=AUTH_SUB_SISTEMA,
        activo=True,
    )
    db.add(usuario)
    db.flush()
    print(f"  usuario 'Sistema' creado (id {usuario.id})")


def _resetear_vehiculos(db: Session) -> None:
    n = db.execute(text("""
        UPDATE vehiculos
        SET estado = 'disponible', estado_desde = :ahora
        WHERE estado IN ('alquilado', 'reservado', 'en_transicion')
    """), {"ahora": datetime.utcnow()}).rowcount
    print(f"  vehículos reseteados a 'disponible': {n}")


def main() -> None:
    confirmar = "--confirmar" in sys.argv
    incluir_servicios = "--incluir-servicios" in sys.argv

    db = SessionLocal()
    try:
        if confirmar:
            limpiar(db, incluir_servicios)
        else:
            dry_run(db, incluir_servicios)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
