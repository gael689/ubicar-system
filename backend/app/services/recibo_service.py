"""
ReciboService — emisión y anulación de recibos de cobro.

Emitir un recibo genera un crédito en la cuenta corriente del cliente
(mismo mecanismo que pago/echeq/multa — ver CuentaCorrienteService).
Anular un recibo nunca lo borra ni edita: pasa a estado='anulado' y el
crédito se revierte con un contra-asiento (mismo patrón que la multa
bonificada).
"""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, BusinessRuleError
from app.models.recibo import Recibo
from app.models.cliente import Cliente
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.schemas.recibo import ReciboCreate
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.recibo_pdf import generar_pdf_recibo


class ReciboService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.cc_service = CuentaCorrienteService(db)

    def get(self, id: int) -> Recibo:
        recibo = self.db.query(Recibo).options(joinedload(Recibo.cliente)).filter(Recibo.id == id).first()
        if not recibo:
            raise NotFoundError("Recibo", id)
        return recibo

    def list(
        self,
        cliente_id: int | None = None,
        estado: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Recibo], int]:
        query = self.db.query(Recibo).options(joinedload(Recibo.cliente))
        if cliente_id:
            query = query.filter(Recibo.cliente_id == cliente_id)
        if estado:
            query = query.filter(Recibo.estado == estado)
        query = query.order_by(Recibo.numero.desc())
        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()
        return items, total

    def crear(self, payload: ReciboCreate, usuario_id: int | None) -> Recibo:
        cliente = self.db.query(Cliente).filter(Cliente.id == payload.cliente_id).first()
        if not cliente:
            raise NotFoundError("Cliente", payload.cliente_id)

        cc = self.cc_service.get_or_create(payload.cliente_id)
        saldo_anterior = Decimal(str(cc.saldo))

        mov = self.cc_service.registrar_movimiento(
            cliente_id=payload.cliente_id,
            tipo="credito",
            concepto=f"Recibo — {payload.concepto}",
            monto=payload.monto,
            fecha=payload.fecha,
            creado_por=usuario_id,
        )

        recibo = Recibo(
            cliente_id=payload.cliente_id,
            cuenta_corriente_id=cc.id,
            movimiento_cc_id=mov.id,
            fecha=payload.fecha,
            monto=payload.monto,
            medio_pago=payload.medio_pago,
            concepto=payload.concepto,
            saldo_anterior=saldo_anterior,
            saldo_posterior=Decimal(str(cc.saldo)),
            estado="emitido",
            creado_por=usuario_id,
        )
        self.db.add(recibo)
        self.db.flush()

        # Historial gratis: el movimiento sabe a qué recibo pertenece.
        mov.recibo_id = recibo.id
        self.db.flush()
        self.db.refresh(recibo)
        return recibo

    def anular(self, id: int, motivo: str, usuario_id: int | None) -> Recibo:
        recibo = self.get(id)
        if recibo.estado == "anulado":
            raise BusinessRuleError("recibo_ya_anulado", "El recibo ya está anulado")

        self.cc_service.anular_movimiento(recibo.movimiento_cc_id, motivo=motivo, creado_por=usuario_id)

        recibo.estado = "anulado"
        recibo.motivo_anulacion = motivo
        recibo.anulado_por = usuario_id
        recibo.anulado_en = datetime.utcnow()
        self.db.flush()
        return recibo

    def generar_pdf(self, id: int) -> bytes:
        recibo = self.get(id)
        return generar_pdf_recibo(recibo, recibo.cliente.nombre_completo, recibo.cliente.dni_cuit)

    def historial_movimientos(self, id: int) -> list[MovimientoCuentaCorriente]:
        """Todo movimiento de CC vinculado a este recibo (crédito original + contra-asiento si se anuló)."""
        self.get(id)
        return (
            self.db.query(MovimientoCuentaCorriente)
            .filter(MovimientoCuentaCorriente.recibo_id == id)
            .order_by(MovimientoCuentaCorriente.id)
            .all()
        )
