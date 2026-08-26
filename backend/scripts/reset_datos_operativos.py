"""
Limpieza de datos operativos (plan de conexión y limpieza, 13/08/2026 — §4).

    *"la idea ahora es limpiar todo el programa, quedaron cosas viejas,
    únicamente que quede la flota vehicular, y los usuarios creados en
    CLERK, pero toda reserva, gasto, caja, anterior, todo eliminado"* — Franco

Uso:

    python -m scripts.reset_datos_operativos              # dry-run: sólo cuenta
    python -m scripts.reset_datos_operativos --confirmar   # borra de verdad

**Contra producción se corre adentro del contenedor**, no desde acá: el proxy
TCP de Railway (`DATABASE_PUBLIC_URL`) da timeout desde la máquina de Gael, así
que ningún `DATABASE_URL` apuntando afuera llega. El camino que funciona sale
por el API de Railway en 443:

    railway ssh --service ubicar-system "cd /app && python -m scripts.reset_datos_operativos"

Requiere, una sola vez: `railway ssh keys add --key ~/.ssh/id_ed25519.pub` y
`ssh-keyscan ssh.railway.com >> ~/.ssh/known_hosts` (sin lo segundo el CLI
corta con `Host key verification failed` y no explica por qué).

**Dry-run por default a propósito.** Esto no es un script de demo (como
`seed_demo_web.py`): toca la base real, en una sola pasada, sin vuelta atrás
salvo restaurar un backup. `--confirmar` es la única forma de que borre algo.

Qué se borra — de hoja a raíz, en una sola transacción (§4.2):
  reservas y su ciclo (reserva_adicionales, contratos, pagos_web, holds,
  alquileres) · plata (pagos, recibos, comprobantes, movimientos de cuenta
  corriente, cuentas corrientes, echeqs, multas, gastos, presupuestos) ·
  operación (daños, fotos de daño, bloqueos de vehículo) · clientes (y
  conductores adicionales, contactos, tarjetas, documentos de cliente) ·
  pedidos de que los llamen (`solicitudes_contacto`) · avisos
  (notificaciones, emails enviados) · estadística de demanda insatisfecha ·
  tarifas y tarifas_calendario, **salvo que se pase `--conservar-tarifas`**
  (el aviso `categoria_precio_generico` sigue sonando hasta que se cargue la
  tarifa real).

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

Y al revés, dos cosas que el default decide y que en la limpieza del
21/08/2026 se decidieron distinto:

    --conservar-tarifas    no toca `tarifas` ni `tarifas_calendario`. Los
                           precios son lo único que el sistema no puede
                           reconstruir solo, y sin ellos la web deja de vender
                           en silencio (ver `_verificar_operabilidad`). Si los
                           precios cargados son los de verdad, este flag es lo
                           que hay que pasar.

    --incluir-auditoria    vacía también el log de auditoría. Por default se
                           conserva —es la prueba de que el sistema audita—
                           pero cuando todo lo auditado fueron pruebas, el log
                           es ruido y conviene que lo primero que aparezca sea
                           trabajo real.

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
    # Primera de la lista y no por orden alfabético: `solicitudes_contacto`
    # apunta a categorías, a clientes y a reservas, así que borrarla antes que
    # nada la saca del camino sin importar qué se toque después. Faltaba en
    # esta lista hasta el 21/08/2026 — es la tabla de "que me llamen" de la
    # web (D-61), o sea operación diaria pura, y la limpieza la dejaba viva.
    "solicitudes_contacto",
    "fotos_danio",
    "danios",
    "reserva_adicionales",
    "contratos",
    "pagos_web",
    "holds",
    "recibos",
    "comprobantes",
    "echeqs",
    # Los movimientos de caja van **antes** que el ledger y que los clientes:
    # apuntan a los dos (migración 080).
    "movimientos_caja",
    "movimientos_cuenta_corriente",
    "cuentas_corrientes",
    "pagos",
    # Antes iba después de `reservas` y el DELETE de `alquileres` moría contra
    # `multas_alquiler_id_fkey`: una multa se imputa al alquiler durante el
    # cual se cometió la infracción. `_romper_ciclos` ya nulleó
    # `movimientos_cuenta_corriente.multa_id`, así que nada la retiene acá.
    "multas",
    "alquileres",
    "reservas",
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
]

# Los precios. Van al final y **aparte**, detrás de `--conservar-tarifas`: son
# lo único de esta limpieza que no se puede reconstruir mirando el sistema, y
# borrarlos rompe la venta sin dar error. Cuando se borran, van después de
# `reservas`, que las referencia por `tarifa_aplicada_id`.
TABLAS_TARIFAS = ["tarifas_calendario", "tarifas"]

# El log de auditoría, detrás de `--incluir-auditoria`. Último de todos: sólo
# referencia `usuarios`, que se conserva, así que no condiciona a nadie.
TABLA_AUDITORIA = "auditoria"

TABLA_SERVICIOS = "servicios"


def tablas_a_borrar(conservar_tarifas: bool, incluir_auditoria: bool) -> list[str]:
    """La secuencia final, ya resueltos los flags. Una sola fuente de verdad
    entre lo que el dry-run cuenta y lo que el borrado ejecuta: cuando eran dos
    listas separadas, el dry-run mentía apenas alguien tocaba una sola."""
    tablas = list(TABLAS_EN_ORDEN)
    if not conservar_tarifas:
        tablas += TABLAS_TARIFAS
    if incluir_auditoria:
        tablas.append(TABLA_AUDITORIA)
    return tablas


def _romper_ciclos(db: Session) -> None:
    """Nullea las columnas que crean referencias circulares, para que el
    DELETE en orden de `TABLAS_EN_ORDEN` no choque contra una FK sin
    importar en qué paso esté cada lado del ciclo."""
    db.execute(text("""
        UPDATE movimientos_cuenta_corriente
        SET recibo_id = NULL, comprobante_id = NULL, echeq_id = NULL,
            multa_id = NULL, danio_id = NULL,
            -- Autorreferenciales, las dos: `anulado_por_movimiento_id` apunta
            -- al contra-asiento y `aplicado_por_movimiento_id` (migración 079)
            -- al débito contra el que se consumió un anticipo. Sin nullearlas,
            -- el DELETE de la tabla choca contra sus propias filas.
            anulado_por_movimiento_id = NULL,
            aplicado_por_movimiento_id = NULL, aplicado_en = NULL
    """))
    # `pagos.reserva_id` (migración 079) apunta a `reservas`, que se borra
    # después de `pagos` en la secuencia. Se nullea igual, por si el orden
    # cambia: es más barato que descubrirlo en producción.
    db.execute(text("UPDATE pagos SET reserva_id = NULL"))
    # `alquileres.garantia_movimiento_caja_id` (migración 081) apunta a
    # `movimientos_caja`, que se borra en la misma pasada. Sin nullearlo, el
    # orden relativo entre las dos tablas decide si el DELETE explota o no.
    db.execute(text("UPDATE alquileres SET garantia_movimiento_caja_id = NULL"))
    # Y los movimientos de caja apuntan al ledger, que también se borra.
    db.execute(text("UPDATE movimientos_caja SET movimiento_cc_id = NULL"))
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


def dry_run(db: Session, incluir_servicios: bool, conservar_tarifas: bool,
            incluir_auditoria: bool) -> None:
    print(f"DRY-RUN contra: {engine.url.render_as_string(hide_password=True)}\n")
    print("No se borra nada. Para borrar de verdad: --confirmar\n")
    total = 0
    for entrada in tablas_a_borrar(conservar_tarifas, incluir_auditoria):
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

    if conservar_tarifas:
        for t in TABLAS_TARIFAS:
            n = _contar(db, t)
            print(f"  {t:32} {n:>6} fila(s)  (SE CONSERVA, --conservar-tarifas)")
    if not incluir_auditoria:
        n = _contar(db, TABLA_AUDITORIA)
        print(f"  {TABLA_AUDITORIA:32} {n:>6} fila(s)  (NO se toca, pasa --incluir-auditoria)")

    n_vehiculos = db.execute(text(
        "SELECT COUNT(*) FROM vehiculos WHERE estado IN ('alquilado','reservado','en_transicion')"
    )).scalar() or 0
    print(f"\n  vehiculos a resetear a 'disponible': {n_vehiculos}")
    print(f"\nTotal de filas a borrar: {total}")


def limpiar(db: Session, incluir_servicios: bool, conservar_tarifas: bool,
            incluir_auditoria: bool) -> int:
    print(f"Limpiando contra: {engine.url.render_as_string(hide_password=True)}\n")

    _romper_ciclos(db)

    for entrada in tablas_a_borrar(conservar_tarifas, incluir_auditoria):
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

    # Lo último, y lo más importante: que la base quede operable.
    return _verificar_operabilidad(db)


def _verificar_operabilidad(db: Session) -> int:
    """
    Falla ruidosamente si la base quedó sin algo indispensable para vender.

    **La lección del 20/08/2026.** Este script borra `tarifas` y
    `tarifas_calendario` —está documentado en su encabezado— y esa vez el
    sistema quedó sin poder cotizar: **cinco de seis categorías devolvieron "sin
    disponibilidad" sin dar ningún error**. Desde afuera se ve idéntico a que no
    haya autos libres, así que nadie se entera hasta que un cliente no puede
    reservar.

    **No inventa nada, avisa.** Inventar un precio es peor que no tenerlo: un
    número puesto por un script se vende igual que uno decidido, y nadie lo
    revisa después. Lo que hace es decir exactamente qué falta y en qué
    categoría.

    Devuelve la cantidad de problemas encontrados, para que el proceso salga con
    código distinto de cero y un deploy automatizado no siga adelante.
    """
    print("\n" + "=" * 60)
    print("VERIFICACIÓN DE OPERABILIDAD")
    print("=" * 60)

    problemas: list[str] = []

    # Una categoría activa **con flota** tiene que poder cotizar: si tiene autos
    # y no tiene tarifa diaria, la web la va a mostrar y no va a poder venderla.
    filas = db.execute(text("""
        SELECT c.id, c.nombre,
               COUNT(DISTINCT v.id) AS autos,
               COUNT(DISTINCT t.id) AS tarifas_diarias
          FROM categorias c
          LEFT JOIN vehiculos v
                 ON v.categoria_id = c.id AND v.activo = true
          LEFT JOIN tarifas t
                 ON t.categoria_id = c.id AND t.tipo = 'diaria' AND t.activo = true
         WHERE c.activo = true
      GROUP BY c.id, c.nombre
      ORDER BY c.nombre
    """)).all()

    if not filas:
        problemas.append("No hay ninguna categoría activa: la web no tiene nada que ofrecer.")

    for _id, nombre, autos, tarifas in filas:
        estado = "OK"
        if autos and not tarifas:
            estado = "SIN TARIFA DIARIA"
            problemas.append(
                f"La categoría '{nombre}' tiene {autos} auto(s) y ninguna tarifa "
                f"diaria activa: va a devolver 'sin disponibilidad' sin dar error."
            )
        elif not autos:
            estado = "sin flota (no se ofrece)"
        print(f"  {nombre:24} {autos:>3} auto(s)  {tarifas:>2} tarifa(s)  {estado}")

    # Y el mínimo para que el back-office arranque.
    if not db.execute(text("SELECT 1 FROM usuarios WHERE activo = true LIMIT 1")).first():
        problemas.append("No quedó ningún usuario activo: nadie puede entrar al sistema.")

    print()
    if problemas:
        print("!! LA BASE NO QUEDÓ OPERABLE:")
        for p in problemas:
            print(f"   - {p}")
        print("\n   No se inventa ningún dato: cargá lo que falta antes de salir a vender.")
    else:
        print("Todo lo indispensable está: cada categoría con flota puede cotizar.")

    print("\nConfirmá igual que /reservar y /public/solicitudes responden antes de "
          "dar la limpieza por buena.")
    return len(problemas)


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
    conservar_tarifas = "--conservar-tarifas" in sys.argv
    incluir_auditoria = "--incluir-auditoria" in sys.argv

    # Un flag mal escrito no puede pasar por "no lo pediste": `--conservar-tarifa`
    # en singular borraría los precios en silencio, que es exactamente el
    # accidente que este script ya tuvo una vez.
    conocidos = {"--confirmar", "--incluir-servicios", "--conservar-tarifas",
                 "--incluir-auditoria"}
    desconocidos = [a for a in sys.argv[1:] if a not in conocidos]
    if desconocidos:
        print(f"Flag desconocido: {' '.join(desconocidos)}")
        print(f"Los que existen: {' '.join(sorted(conocidos))}")
        sys.exit(2)

    db = SessionLocal()
    try:
        if confirmar:
            problemas = limpiar(db, incluir_servicios, conservar_tarifas, incluir_auditoria)
            # Código de salida distinto de cero si la base quedó sin poder
            # vender: es lo que hace que un deploy automatizado se frene en vez
            # de seguir contento hasta que un cliente no pueda reservar.
            if problemas:
                sys.exit(1)
        else:
            dry_run(db, incluir_servicios, conservar_tarifas, incluir_auditoria)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
