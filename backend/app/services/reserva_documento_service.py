"""
Archivado del PDF de confirmación de reserva en el perfil del cliente.

Separado de `reserva_pdf.py` (que sólo dibuja) y de `ReservaService` (que sólo
sabe de reglas de reserva): acá vive el pegamento entre el PDF, el storage y
la ficha del cliente.
"""
from __future__ import annotations

import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.models.documento import Documento
from app.models.reserva import Reserva
from app.services.reserva_pdf import generar_pdf_reserva

logger = logging.getLogger(__name__)


class ReservaDocumentoService:
    def __init__(self, db: Session, storage: IStorage) -> None:
        self.db = db
        self.storage = storage

    def generar(self, reserva: Reserva) -> bytes:
        """Sólo genera los bytes del PDF, sin guardar nada."""
        return generar_pdf_reserva(
            reserva,
            cliente=reserva.cliente,
            vehiculo=reserva.vehiculo,
            conductor=reserva.conductor,
        )

    def generar_y_archivar(self, reserva: Reserva, usuario_id: int | None) -> Documento | None:
        """
        Genera el PDF y lo deja archivado en el perfil del cliente.

        **Nunca hace fallar la creación de la reserva**: si el PDF no se puede
        generar o el storage falla, se registra el error y la reserva sigue su
        curso. El PDF se puede volver a pedir en cualquier momento desde
        `GET /reservas/{id}/pdf` — no es un dato que se pierda.
        """
        try:
            contenido = self.generar(reserva)
        except Exception:
            logger.exception("pdf_reserva_generacion_fallida", extra={"reserva_id": reserva.id})
            return None

        try:
            key = f"clientes/{reserva.cliente_id}/reservas/{reserva.id}-{uuid4().hex[:8]}.pdf"
            self.storage.upload(key, contenido, "application/pdf")

            doc = Documento(
                cliente_id=reserva.cliente_id,
                vehiculo_id=None,
                tipo="reserva",
                nombre=f"Reserva #{reserva.id:05d} — {reserva.fecha_inicio.strftime('%d/%m/%Y')}",
                archivo_key=key,
                cargado_por=usuario_id,
            )
            self.db.add(doc)
            self.db.flush()
            return doc
        except Exception:
            logger.exception("pdf_reserva_archivado_fallido", extra={"reserva_id": reserva.id})
            return None

    def _archivado(self, reserva: Reserva) -> Documento | None:
        """
        El PDF de esta reserva que ya está en la ficha del cliente, si hay.

        `Documento` no tiene `reserva_id`: la reserva se reconoce por la key,
        que siempre fue `clientes/{cliente}/reservas/{reserva}-{sufijo}.pdf`.
        El guion después del id es lo que evita que la #1 agarre el PDF de la
        #12. Si hubiera más de uno (reservas viejas regeneradas a mano), se
        toma el más nuevo.
        """
        prefijo = f"clientes/{reserva.cliente_id}/reservas/{reserva.id}-"
        return (
            self.db.query(Documento)
            .filter(
                Documento.tipo == "reserva",
                Documento.cliente_id == reserva.cliente_id,
                Documento.archivo_key.like(f"{prefijo}%"),
            )
            .order_by(Documento.id.desc())
            .first()
        )

    def regenerar_archivado(
        self, reserva: Reserva, usuario_id: int | None, crear_si_falta: bool = True,
    ) -> Documento | None:
        """
        Vuelve a dibujar el PDF archivado con los datos de hoy (plan 27/09, A2).

        El PDF se archivaba una sola vez, al crear la reserva. Si después se
        corregía el precio, las fechas o se completaban los datos del cliente
        —que en el mostrador es lo normal: la reserva se toma por teléfono y
        el DNI llega al retirar—, la ficha seguía mostrando el PDF viejo, con
        los datos que ya no son. El que se descarga desde `GET /reservas/{id}/pdf`
        sí salía bien, así que había dos versiones del mismo papel.

        **Reemplaza, no agrega**: se reusa la fila de `Documento` y se le cambia
        el archivo, así la ficha no junta un PDF por cada edición. El archivo
        viejo se borra del storage después de subir el nuevo; si ese borrado
        falla queda un huérfano, que es preferible a quedarse sin PDF.

        Igual que `generar_y_archivar`, **nunca hace fallar a quien la llama**.

        `crear_si_falta=False` es para cuando se edita el cliente: ahí se
        recorren todas sus reservas abiertas, y a una reserva vieja que nunca
        tuvo PDF archivado no hay por qué inventarle uno ahora.
        """
        existente = self._archivado(reserva)
        if existente is None:
            if not crear_si_falta:
                return None
            return self.generar_y_archivar(reserva, usuario_id)

        try:
            contenido = self.generar(reserva)
        except Exception:
            logger.exception("pdf_reserva_generacion_fallida", extra={"reserva_id": reserva.id})
            return None

        try:
            anterior = existente.archivo_key
            key = f"clientes/{reserva.cliente_id}/reservas/{reserva.id}-{uuid4().hex[:8]}.pdf"
            self.storage.upload(key, contenido, "application/pdf")
            existente.archivo_key = key
            existente.nombre = (
                f"Reserva #{reserva.id:05d} — {reserva.fecha_inicio.strftime('%d/%m/%Y')}"
            )
            existente.fecha_carga = datetime.utcnow()
            self.db.flush()
        except Exception:
            logger.exception("pdf_reserva_archivado_fallido", extra={"reserva_id": reserva.id})
            return None

        try:
            self.storage.delete(anterior)
        except Exception:
            logger.warning("pdf_reserva_viejo_no_borrado", extra={"key": anterior})
        return existente


def regenerar_pdfs_en_segundo_plano(
    reserva_ids: list[int], usuario_id: int | None, crear_si_falta: bool = True,
) -> None:
    """
    `regenerar_archivado` para varias reservas, **fuera del request**.

    Mismo criterio que `routers/reservas._archivar_pdf_y_avisar`: dibujar el
    PDF y subirlo tarda, y nada de eso es lo que la persona está esperando ver
    al guardar. La edición ya se commiteó cuando esto arranca, así que nada de
    acá puede voltearla. Abre su propia sesión porque la del endpoint se cierra
    al contestar.
    """
    from app.core.deps import get_storage
    from app.database import SessionLocal

    if not reserva_ids:
        return
    db = SessionLocal()
    try:
        svc = ReservaDocumentoService(db, get_storage())
        for rid in reserva_ids:
            reserva = db.get(Reserva, rid)
            if reserva is None:
                continue
            if svc.regenerar_archivado(reserva, usuario_id, crear_si_falta=crear_si_falta) is not None:
                db.commit()
    except Exception:
        db.rollback()
        logger.exception("[Reservas] falló la regeneración del PDF de %s", reserva_ids)
    finally:
        db.close()
