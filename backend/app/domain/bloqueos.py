"""
Matriz de bloqueos (Fase 3, ítem 39 del plan maestro).

Antes de esto, el operador sólo se enteraba de un problema (VTV vencida,
cliente con deuda, garantía sin definir) cuando ya estaba a mitad del
formulario de check-out/check-in y el submit fallaba o mostraba un warning
suelto. Esto da un semáforo *previo*, consultable desde la lista de
reservas, sin tener que abrir el modal.

Consistente con "el sistema informa, la persona decide" (ver
docs/DECISIONES.md / memoria reglas-negocio-operativas): la mayoría de los
ítems son **advertencia**, no bloqueo real — el operador puede seguir
igual, a sabiendas. Sólo son **bloqueante** las condiciones que ya son un
hard block en otro lado del sistema (solape, vehículo fuera de servicio) o
que representan un riesgo legal/operativo serio (circular sin VTV/seguro
vigente).

No duplica la validación real de checkout()/checkin() (que sigue siendo la
autoridad — esto es sólo un adelanto informativo); si diverge, gana la del
service correspondiente.
"""
from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from app.models.alquiler import Alquiler
from app.models.cuenta_corriente import CuentaCorriente
from app.models.multa import Multa
from app.models.reserva import Reserva

Severidad = Literal["bloqueante", "advertencia"]


@dataclass
class BloqueoItem:
    codigo: str
    mensaje: str
    severidad: Severidad


def _semaforo(items: list[BloqueoItem]) -> str:
    if any(i.severidad == "bloqueante" for i in items):
        return "rojo"
    if items:
        return "amarillo"
    return "verde"


def _deuda_cliente(db: Session, cliente_id: int) -> BloqueoItem | None:
    cc = db.query(CuentaCorriente).filter(CuentaCorriente.cliente_id == cliente_id).first()
    if not cc or float(cc.saldo) <= 0:
        return None
    saldo = float(cc.saldo)
    if cc.bloqueada:
        return BloqueoItem("cuenta_bloqueada", f"La cuenta corriente del cliente está bloqueada (saldo ${saldo:,.2f})", "bloqueante")
    return BloqueoItem("deuda_previa", f"El cliente tiene un saldo pendiente de ${saldo:,.2f}", "advertencia")


# Si el mostrador está pidiendo garantía/depósito al armar una reserva.
#
# Es una decisión comercial que se prende y apaga desde Configuración, no una
# constante: se apagó en agosto de 2026 mientras se define la política, y el
# día que vuelva no tiene que hacer falta un deploy.
CLAVE_PIDE_GARANTIA = "reservas.pide_garantia"


def _pide_garantia(db: Session) -> bool:
    """
    Lee la clave, con `True` por default.

    El default es el comportamiento histórico: quien no tenga la fila cargada
    —una instalación vieja, los tests— sigue viendo la advertencia como antes.
    """
    from app.services.configuracion_service import ConfiguracionService

    return ConfiguracionService(db).get_bool(CLAVE_PIDE_GARANTIA, True)


def evaluar_datos_pre_checkout(
    db: Session,
    *,
    vehiculo=None,
    cliente=None,
    conductor=None,
    garantia_tipo: str | None = None,
    bloqueada_por_solape: bool = False,
    contrato_firmado: bool | None = None,
    hoy: date | None = None,
) -> tuple[str, list[BloqueoItem]]:
    """
    El semáforo sobre los datos sueltos, sin exigir una reserva guardada.

    **Existe para que haya un solo criterio.** El formulario de alta necesita
    mostrar el semáforo *antes* de guardar —que es cuando todavía se puede
    hacer algo al respecto—, y hasta ahora lo armaba a mano en el frontend con
    su propia lista de faltantes. Dos listas que dicen parecido son dos listas
    que en algún momento dicen distinto, y la que el operador cree es la que
    tiene delante.

    `evaluar_pre_checkout` pasó a ser esta misma función leyendo los datos de
    una reserva: la de siempre no cambió de comportamiento, sólo dejó de ser
    la única puerta.

    `contrato_firmado=None` significa que todavía no hay alquiler —el caso del
    alta— y entonces el ítem del contrato no se evalúa: reclamar una firma que
    no puede existir todavía es ruido.
    """
    hoy = hoy or date.today()
    items: list[BloqueoItem] = []

    if bloqueada_por_solape:
        items.append(BloqueoItem(
            "solape_pendiente", "La reserva tiene un solape con otra reserva pendiente de resolver", "bloqueante"
        ))

    if vehiculo:
        if vehiculo.estado == "fuera_de_servicio":
            items.append(BloqueoItem("vehiculo_fuera_servicio", "El vehículo está marcado fuera de servicio", "bloqueante"))
        if vehiculo.vtv_vencimiento and vehiculo.vtv_vencimiento < hoy:
            items.append(BloqueoItem("vtv_vencida", f"La VTV del vehículo venció el {vehiculo.vtv_vencimiento}", "bloqueante"))
        if vehiculo.poliza_vencimiento and vehiculo.poliza_vencimiento < hoy:
            items.append(BloqueoItem("poliza_vencida", f"La póliza del vehículo venció el {vehiculo.poliza_vencimiento}", "bloqueante"))

    # Licencia de quien maneja: el conductor real si hay uno asignado, si no el cliente.
    licencia_vencimiento = conductor.licencia_vencimiento if conductor else (cliente.licencia_vencimiento if cliente else None)
    quien = conductor.nombre_completo if conductor else (cliente.nombre_completo if cliente else "el cliente")
    if licencia_vencimiento and licencia_vencimiento < hoy:
        items.append(BloqueoItem("licencia_vencida", f"La licencia de {quien} está vencida desde el {licencia_vencimiento}", "advertencia"))

    if cliente:
        deuda = _deuda_cliente(db, cliente.id)
        if deuda:
            items.append(deuda)

    # **Sólo se reclama la garantía si el negocio la está pidiendo.**
    #
    # `reservas.pide_garantia` apagado esconde el bloque del formulario, y
    # entonces ninguna reserva puede tener una: reclamarla igual pondría esta
    # advertencia en **todas**, para siempre y sin forma de resolverla. Una
    # advertencia que está siempre encendida no avisa de nada — enseña a
    # ignorar la lista entera, que es justo lo que el semáforo evita separando
    # bloqueantes de avisos.
    #
    # `no_aplica` es el valor con el que arranca el formulario, así que en la
    # práctica significa "todavía no se definió" igual que el vacío.
    if _pide_garantia(db) and (not garantia_tipo or garantia_tipo == "no_aplica"):
        items.append(BloqueoItem("sin_garantia", "La reserva no tiene garantía/depósito definido", "advertencia"))

    if contrato_firmado is False:
        items.append(BloqueoItem("contrato_no_firmado", "El contrato de este alquiler todavía no está firmado", "advertencia"))

    return _semaforo(items), items


def evaluar_pre_checkout(db: Session, reserva: Reserva, hoy: date | None = None) -> tuple[str, list[BloqueoItem]]:
    """El semáforo de una reserva guardada. Ver `evaluar_datos_pre_checkout`."""
    return evaluar_datos_pre_checkout(
        db,
        vehiculo=reserva.vehiculo,
        cliente=reserva.cliente,
        conductor=reserva.conductor,
        garantia_tipo=reserva.garantia_tipo,
        bloqueada_por_solape=bool(reserva.bloqueada_por_solape),
        contrato_firmado=(
            bool(reserva.alquiler.contrato_firmado) if reserva.alquiler else None
        ),
        hoy=hoy,
    )


def evaluar_pre_checkin(db: Session, alquiler: Alquiler, hoy: date | None = None) -> tuple[str, list[BloqueoItem]]:
    hoy = hoy or date.today()
    items: list[BloqueoItem] = []
    reserva = alquiler.reserva
    cliente = reserva.cliente if reserva else None
    vehiculo = reserva.vehiculo if reserva else None

    if reserva and reserva.fecha_fin < hoy:
        dias = (hoy - reserva.fecha_fin).days
        if dias > 0:
            items.append(BloqueoItem("devolucion_atrasada", f"La devolución está atrasada {dias} día{'s' if dias != 1 else ''}", "advertencia"))

    if cliente:
        deuda = _deuda_cliente(db, cliente.id)
        if deuda:
            items.append(deuda)

    if vehiculo:
        multas_sin_imputar = (
            db.query(Multa)
            .filter(Multa.vehiculo_id == vehiculo.id, Multa.estado == "pendiente", Multa.activo == True)
            .count()
        )
        if multas_sin_imputar:
            items.append(BloqueoItem(
                "multas_sin_imputar",
                f"El vehículo tiene {multas_sin_imputar} multa{'s' if multas_sin_imputar != 1 else ''} sin imputar a ningún cliente",
                "advertencia",
            ))

    return _semaforo(items), items
