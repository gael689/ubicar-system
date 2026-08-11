from __future__ import annotations
"""
Registro de auditoría — quién hizo qué (plan §6.6).

Punto único para dejar constancia de una acción sensible. Se llama desde los
services, no desde los routers, por la misma razón que el ledger de cuenta
corriente pasa por `CuentaCorrienteService`: **la acción y su constancia
tienen que quedar en la misma transacción.** Si el asiento se graba y la
auditoría no, el libro miente.

Dos reglas que no se negocian:

1. **`registrar()` nunca hace `commit()`.** Sólo `add()` + `flush()`, para
   componer dentro de la transacción de quien lo llama. Si esa transacción se
   revierte, el registro de auditoría se revierte con ella — que es lo
   correcto: no pasó nada, no hay nada que auditar.

2. **`registrar()` nunca levanta una excepción hacia afuera.** Un problema
   escribiendo el libro no puede impedir que se cobre un alquiler. Si falla,
   queda en el log del servidor y la operación sigue. Es la decisión opuesta a
   la del punto 1 y no se contradicen: la transacción manda mientras exista,
   pero un bug acá no puede voltear una operación de plata.
"""
import logging
from contextvars import ContextVar
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.auditoria import Auditoria
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


# La IP de quien está pidiendo, puesta por el middleware de `main.py`. Va por
# contexto y no como parámetro porque enhebrar el `Request` hasta el fondo de
# veinte services sólo para tener un dato de diagnóstico habría ensuciado
# todas las firmas. Un ContextVar es por-request incluso con async.
_ip_actual: ContextVar[str | None] = ContextVar("auditoria_ip", default=None)


def fijar_ip(ip: str | None) -> None:
    _ip_actual.set(ip)


def _serializable(valor: Any) -> Any:
    """
    Deja el valor en algo que el JSON de la base acepte.

    Decimal y date/datetime no son serializables por defecto, y son
    justamente los tipos que más aparecen en lo que interesa auditar (montos y
    fechas). Sin esto, auditar un pago tiraría al escribir.
    """
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, datetime):
        return valor.isoformat()
    if hasattr(valor, "isoformat"):
        return valor.isoformat()
    if isinstance(valor, dict):
        return {k: _serializable(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_serializable(v) for v in valor]
    return valor


def _limpiar(datos: dict | None) -> dict | None:
    if not datos:
        return None
    return {k: _serializable(v) for k, v in datos.items()}


def _nombre_legible(usuario) -> str | None:
    """
    El nombre que se guarda en la auditoría.

    **La auditoría es para leerla, no para cruzar IDs.** Cuando el token de
    Clerk viene sin el claim de email, el usuario quedaba con el `sub` como
    nombre y el registro salía impreso como
    *"user_3HBPnBzP6K0WDB3Q05CxEQzWtIF autorizó descuento"*, que no le dice
    nada a nadie — y la auditoría existe justamente para contestar *quién*.

    Se corrigió el origen (`core/deps.py`), pero los usuarios ya dados de alta
    con ese nombre siguen en la base. Este filtro es la última línea antes de
    congelar el nombre en el registro, que después no se toca.

    Si no hay nada presentable cae al email, y si tampoco, a `None`: la
    pantalla ya sabe mostrar "Sistema" cuando no hay nombre. **Un identificador
    técnico es peor que un campo vacío** — el vacío se nota y se corrige.
    """
    if usuario is None:
        return None

    def _presentable(valor: str | None) -> str | None:
        v = (valor or "").strip()
        if not v or v.startswith("user_") or v.endswith("@sin-email.clerk"):
            return None
        return v

    return _presentable(getattr(usuario, "nombre", None)) or _presentable(
        getattr(usuario, "email", None)
    )


def registrar(
    db: Session,
    *,
    usuario_id: int | None,
    accion: str,
    entidad_tipo: str,
    entidad_id: int | None,
    descripcion: str,
    datos_antes: dict | None = None,
    datos_despues: dict | None = None,
    monto: Decimal | float | None = None,
) -> Auditoria | None:
    """
    Deja constancia de una acción. Devuelve el registro, o None si falló.

    `descripcion` es una línea en castellano ya armada — la que se lee en la
    pantalla. Los JSON son el detalle para cuando esa línea no alcanza.
    """
    try:
        nombre = None
        if usuario_id is not None:
            usuario = db.get(Usuario, usuario_id)
            nombre = _nombre_legible(usuario)

        registro = Auditoria(
            usuario_id=usuario_id,
            usuario_nombre=nombre,
            accion=accion,
            entidad_tipo=entidad_tipo,
            entidad_id=entidad_id,
            descripcion=descripcion,
            datos_antes=_limpiar(datos_antes),
            datos_despues=_limpiar(datos_despues),
            monto=float(monto) if monto is not None else None,
            ip=_ip_actual.get(),
        )
        db.add(registro)
        db.flush()
        return registro
    except Exception:
        logger.exception(
            "[auditoria] no se pudo registrar %s sobre %s#%s",
            accion, entidad_tipo, entidad_id,
        )
        return None


def diferencias(antes: dict, despues: dict) -> tuple[dict, dict]:
    """
    Los campos que efectivamente cambiaron, en los dos lados.

    Guardar la fila entera en cada edición llenaría la tabla de ruido y de
    datos personales repetidos. Interesa el delta: qué era y qué pasó a ser.
    """
    cambiados = [
        k for k in despues
        if k in antes and _serializable(antes[k]) != _serializable(despues[k])
    ]
    return (
        {k: antes[k] for k in cambiados},
        {k: despues[k] for k in cambiados},
    )
