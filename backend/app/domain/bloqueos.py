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


def evaluar_pre_checkout(db: Session, reserva: Reserva, hoy: date | None = None) -> tuple[str, list[BloqueoItem]]:
    hoy = hoy or date.today()
    items: list[BloqueoItem] = []
    vehiculo = reserva.vehiculo
    cliente = reserva.cliente

    if reserva.bloqueada_por_solape:
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
    conductor = reserva.conductor
    licencia_vencimiento = conductor.licencia_vencimiento if conductor else (cliente.licencia_vencimiento if cliente else None)
    quien = conductor.nombre_completo if conductor else (cliente.nombre_completo if cliente else "el cliente")
    if licencia_vencimiento and licencia_vencimiento < hoy:
        items.append(BloqueoItem("licencia_vencida", f"La licencia de {quien} está vencida desde el {licencia_vencimiento}", "advertencia"))

    if cliente:
        deuda = _deuda_cliente(db, cliente.id)
        if deuda:
            items.append(deuda)

    if not reserva.garantia_tipo:
        items.append(BloqueoItem("sin_garantia", "La reserva no tiene garantía/depósito definido", "advertencia"))

    if reserva.alquiler and not reserva.alquiler.contrato_firmado:
        items.append(BloqueoItem("contrato_no_firmado", "El contrato de este alquiler todavía no está firmado", "advertencia"))

    return _semaforo(items), items


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
