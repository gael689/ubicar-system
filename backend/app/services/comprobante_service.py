from __future__ import annotations
"""
ComprobanteService — facturas/notas de crédito-débito/remitos, cargados
manualmente con su PDF (D-05: sin AFIP en esta etapa).

Sólo nota_credito/nota_debito generan un movimiento nuevo en la cuenta
corriente — factura_a/b/c y remito documentan un cargo que el ledger
completo ya facturó automáticamente al checkout, no generan un segundo
asiento (ver domain de la sesión: [[cuenta-corriente-ledger]]).
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.exceptions import NotFoundError, BusinessRuleError
from app.models.comprobante import Comprobante
from app.models.cliente import Cliente
from app.repositories.comprobante_repo import ComprobanteRepository
from app.schemas.comprobante import ComprobanteCreate
from app.services.cuenta_corriente_service import CuentaCorrienteService

TIPOS_QUE_AJUSTAN_CC = {"nota_credito", "nota_debito"}


class ComprobanteService:
    def __init__(self, db: Session, storage: IStorage):
        self.db = db
        self.storage = storage
        self.repo = ComprobanteRepository(db)
        self.cc_service = CuentaCorrienteService(db)

    def to_response(self, comp: Comprobante):
        from app.schemas.comprobante import ComprobanteResponse
        response = ComprobanteResponse.model_validate(comp)
        response.archivo_url = self.storage.public_url(comp.archivo_key)
        return response

    def list_by_cliente(self, cliente_id: int, incluir_inactivos: bool = False) -> list[Comprobante]:
        if not self.db.get(Cliente, cliente_id):
            raise NotFoundError("Cliente", cliente_id)
        return self.repo.list_by_cliente(cliente_id, incluir_inactivos=incluir_inactivos)

    def get(self, id: int) -> Comprobante:
        comp = self.repo.get_with_cliente(id)
        if not comp:
            raise NotFoundError("Comprobante", id)
        return comp

    def create(
        self,
        *,
        cliente_id: int,
        payload: ComprobanteCreate,
        content: bytes,
        content_type: str,
        ext: str,
        creado_por: int,
    ) -> Comprobante:
        if not self.db.get(Cliente, cliente_id):
            raise NotFoundError("Cliente", cliente_id)

        movimiento_cc_id = None
        if payload.tipo in TIPOS_QUE_AJUSTAN_CC:
            tipo_movimiento = "credito" if payload.tipo == "nota_credito" else "debito"
            mov = self.cc_service.registrar_movimiento(
                cliente_id=cliente_id,
                tipo=tipo_movimiento,
                concepto=f"{'Nota de crédito' if payload.tipo == 'nota_credito' else 'Nota de débito'} {payload.punto_venta or ''}-{payload.numero}",
                monto=Decimal(str(payload.total)),
                fecha=payload.fecha_emision,
                creado_por=creado_por,
                alquiler_id=payload.alquiler_id,
                reserva_id=payload.reserva_id,
            )
            movimiento_cc_id = mov.id

        comp = Comprobante(
            tipo=payload.tipo,
            punto_venta=payload.punto_venta,
            numero=payload.numero,
            fecha_emision=payload.fecha_emision,
            fecha_vencimiento=payload.fecha_vencimiento,
            cliente_id=cliente_id,
            alquiler_id=payload.alquiler_id,
            reserva_id=payload.reserva_id,
            neto=payload.neto,
            iva=payload.iva,
            total=payload.total,
            archivo_key="",
            movimiento_cc_id=movimiento_cc_id,
            creado_por=creado_por,
        )
        self.db.add(comp)
        self.db.flush()

        key = f"clientes/{cliente_id}/comprobantes/{comp.id}-{uuid4().hex[:8]}.{ext}"
        self.storage.upload(key, content, content_type)
        comp.archivo_key = key

        if movimiento_cc_id:
            from app.models.cuenta_corriente import MovimientoCuentaCorriente
            mov = self.db.get(MovimientoCuentaCorriente, movimiento_cc_id)
            mov.comprobante_id = comp.id

        self.db.commit()
        self.db.refresh(comp)
        return comp

    def anular(self, id: int, motivo: str, usuario_id: int) -> Comprobante:
        """Baja lógica (ver regla-nunca-eliminar): nunca se borra. Si había
        generado un movimiento (nota de crédito/débito), se revierte con
        contra-asiento."""
        comp = self.get(id)
        if comp.estado == "anulada":
            raise BusinessRuleError("comprobante_ya_anulado", "El comprobante ya está anulado")

        if comp.movimiento_cc_id:
            self.cc_service.anular_movimiento(comp.movimiento_cc_id, motivo=motivo, creado_por=usuario_id)

        comp.estado = "anulada"
        comp.motivo_anulacion = motivo
        self.db.flush()
        return comp
