"""
Service de Documentos — soporta documentos de vehículos Y de clientes/empresas.

- Vehiculo: key `vehiculos/{id}/documentos/{doc_id}.{ext}`
- Cliente:  key `clientes/{id}/documentos/{doc_id}.{ext}`
"""
from __future__ import annotations

from datetime import date
from uuid import uuid4

from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models.documento import Documento
from app.repositories.documento_repo import DocumentoRepository
from app.repositories.vehiculo_repo import VehiculoRepository
from app.repositories.cliente_repo import ClienteRepository
from app.schemas.documento import DocumentoCreate, DocumentoResponse, DocumentoUpdate


class DocumentoService:
    def __init__(self, db: Session, storage: IStorage):
        self.db = db
        self.storage = storage
        self.repo = DocumentoRepository(db)
        self.vehiculo_repo = VehiculoRepository(db)
        self.cliente_repo = ClienteRepository(db)

    def to_response(self, doc: Documento) -> DocumentoResponse:
        response = DocumentoResponse.model_validate(doc)
        response.archivo_url = self.storage.public_url(doc.archivo_key)
        return response

    def list(self, vehiculo_id: int, tipo: str | None = None) -> list[Documento]:
        if self.vehiculo_repo.get(vehiculo_id) is None:
            raise NotFoundError("Vehículo", vehiculo_id)
        return self.repo.list_by_vehiculo(vehiculo_id, tipo=tipo)

    def list_by_cliente(self, cliente_id: int, tipo: str | None = None) -> list[Documento]:
        if self.cliente_repo.get(cliente_id) is None:
            raise NotFoundError("Cliente", cliente_id)
        return self.repo.list_by_cliente(cliente_id, tipo=tipo)

    def get(self, documento_id: int) -> Documento:
        doc = self.repo.get(documento_id)
        if doc is None:
            raise NotFoundError("Documento", documento_id)
        return doc

    def create(
        self,
        *,
        vehiculo_id: int,
        payload: DocumentoCreate,
        content: bytes,
        content_type: str,
        ext: str,
        cargado_por: int,
    ) -> Documento:
        if self.vehiculo_repo.get(vehiculo_id) is None:
            raise NotFoundError("Vehículo", vehiculo_id)

        _check_vigencias(payload.vigencia_desde, payload.vigencia_hasta)

        doc = Documento(
            vehiculo_id=vehiculo_id,
            cliente_id=None,
            tipo=payload.tipo,
            nombre=payload.nombre,
            archivo_key="",
            vigencia_desde=payload.vigencia_desde.isoformat() if payload.vigencia_desde else None,
            vigencia_hasta=payload.vigencia_hasta.isoformat() if payload.vigencia_hasta else None,
            cargado_por=cargado_por,
        )
        self.repo.create(doc)

        key = f"vehiculos/{vehiculo_id}/documentos/{doc.id}-{uuid4().hex[:8]}.{ext}"
        self.storage.upload(key, content, content_type)
        doc.archivo_key = key

        self.db.commit()
        self.db.refresh(doc)
        return doc

    def create_for_cliente(
        self,
        *,
        cliente_id: int,
        payload: DocumentoCreate,
        content: bytes,
        content_type: str,
        ext: str,
        cargado_por: int,
    ) -> Documento:
        if self.cliente_repo.get(cliente_id) is None:
            raise NotFoundError("Cliente", cliente_id)

        _check_vigencias(payload.vigencia_desde, payload.vigencia_hasta)

        doc = Documento(
            vehiculo_id=None,
            cliente_id=cliente_id,
            tipo=payload.tipo,
            nombre=payload.nombre,
            archivo_key="",
            vigencia_desde=payload.vigencia_desde.isoformat() if payload.vigencia_desde else None,
            vigencia_hasta=payload.vigencia_hasta.isoformat() if payload.vigencia_hasta else None,
            cargado_por=cargado_por,
        )
        self.repo.create(doc)

        key = f"clientes/{cliente_id}/documentos/{doc.id}-{uuid4().hex[:8]}.{ext}"
        self.storage.upload(key, content, content_type)
        doc.archivo_key = key

        self.db.commit()
        self.db.refresh(doc)
        return doc

    def update(self, documento_id: int, payload: DocumentoUpdate) -> Documento:
        doc = self.get(documento_id)

        cambios = payload.model_dump(exclude_unset=True)
        nueva_desde = cambios.get("vigencia_desde", _parse_iso(doc.vigencia_desde))
        nueva_hasta = cambios.get("vigencia_hasta", _parse_iso(doc.vigencia_hasta))
        _check_vigencias(nueva_desde, nueva_hasta)

        for field, value in cambios.items():
            if field in ("vigencia_desde", "vigencia_hasta") and value is not None:
                value = value.isoformat()
            setattr(doc, field, value)

        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete(self, documento_id: int) -> None:
        doc = self.get(documento_id)
        key = doc.archivo_key
        self.repo.delete(doc)
        self.db.commit()
        if key:
            self.storage.delete(key)


def _check_vigencias(desde: date | None, hasta: date | None) -> None:
    if desde and hasta and desde > hasta:
        raise BusinessRuleError(
            "vigencia_invalida",
            "vigencia_desde debe ser anterior o igual a vigencia_hasta",
        )


def _parse_iso(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)
