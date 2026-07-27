"""
Archivado del PDF de confirmación de reserva en el perfil del cliente.

Separado de `reserva_pdf.py` (que sólo dibuja) y de `ReservaService` (que sólo
sabe de reglas de reserva): acá vive el pegamento entre el PDF, el storage y
la ficha del cliente.
"""
from __future__ import annotations

import logging
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
