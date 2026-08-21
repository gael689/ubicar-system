"""
ReciboService — emisión y anulación de recibos de cobro.

**El recibo es el papel, no el hecho.** El crédito en la cuenta corriente lo
genera el `Pago`; el recibo sólo lo documenta. Por eso `crear()` recibe un
`pago_id` y **no toca el ledger**.

Hasta la migración 043 esto no era así: el recibo generaba su propio crédito,
en paralelo al del pago y sin conocerlo, así que documentar un cobro ya
registrado bajaba el saldo dos veces (PLAN_MAESTRO §2.12).

Anular un recibo nunca lo borra ni edita: pasa a `estado='anulado'`. Como el
recibo no movió plata, anularlo tampoco la mueve — si además hay que revertir
el cobro, eso se hace anulando el `Pago`, que es donde vive el asiento.
"""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, BusinessRuleError
from app.models.recibo import Recibo
from app.models.pago import Pago
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

    def emitir_para_pago(self, pago: Pago, concepto: str, usuario_id: int | None) -> Recibo:
        """
        El recibo de un `Pago` que ya existe y que ya generó su crédito.

        No toca el ledger. `saldo_anterior`/`saldo_posterior` se reconstruyen a
        partir del movimiento del pago —no del saldo actual de la cuenta—
        porque el recibo tiene que imprimir el saldo **de ese momento**, no el
        de hoy: si después hubo otros movimientos, mostrar el saldo actual
        haría que el papel mienta.
        """
        if pago.cliente_id is None:
            raise BusinessRuleError(
                "pago_sin_cliente",
                "No se puede emitir un recibo de un pago que no tiene cliente asociado",
            )
        # Un cobro dado de baja no entró: emitirle un recibo pondría a circular
        # un papel que afirma lo contrario de lo que dice el libro. El orden
        # correcto es al revés — primero se anula el recibo, después el cobro —
        # y eso ya lo exige `POST /pagos/{id}/anular`.
        if pago.anulado:
            raise BusinessRuleError(
                "pago_anulado",
                f"El cobro #{pago.id} está dado de baja: no se le puede emitir un recibo.",
            )

        existente = self.db.query(Recibo).filter(
            Recibo.pago_id == pago.id, Recibo.estado == "emitido"
        ).first()
        if existente:
            raise BusinessRuleError(
                "pago_ya_tiene_recibo",
                f"El pago #{pago.id} ya tiene el recibo {existente.prefijo}-{existente.numero:08d}",
            )

        cc = self.cc_service.get_or_create(pago.cliente_id)

        mov = (
            self.db.query(MovimientoCuentaCorriente)
            .filter(MovimientoCuentaCorriente.pago_id == pago.id,
                    MovimientoCuentaCorriente.anulado.is_(False))
            .order_by(MovimientoCuentaCorriente.id)
            .first()
        )
        monto = Decimal(str(pago.monto))
        if mov is not None:
            saldo_posterior = Decimal(str(mov.saldo_posterior))
            # El crédito bajó el saldo, así que antes valía monto más.
            saldo_anterior = saldo_posterior + monto
        else:
            saldo_posterior = Decimal(str(cc.saldo))
            saldo_anterior = saldo_posterior + monto

        recibo = Recibo(
            cliente_id=pago.cliente_id,
            cuenta_corriente_id=cc.id,
            pago_id=pago.id,
            movimiento_cc_id=mov.id if mov else None,
            fecha=pago.fecha,
            monto=monto,
            medio_pago=pago.medio_pago,
            concepto=concepto,
            saldo_anterior=saldo_anterior,
            saldo_posterior=saldo_posterior,
            estado="emitido",
            creado_por=usuario_id,
        )
        self.db.add(recibo)
        self.db.flush()

        # Historial gratis: el movimiento sabe a qué recibo pertenece.
        if mov is not None:
            mov.recibo_id = recibo.id
        self.db.flush()
        self.db.refresh(recibo)
        return recibo

    def crear(self, payload: ReciboCreate, usuario_id: int | None) -> Recibo:
        """
        Cobrar y documentar en una sola acción: crea el `Pago` (que genera el
        crédito) y su recibo.

        Es el camino que usa el botón "Emitir recibo" de la cuenta corriente.
        El operador no tiene que acordarse de hacer dos cosas — que era
        justamente la confusión que producía el diseño anterior.
        """
        cliente = self.db.query(Cliente).filter(Cliente.id == payload.cliente_id).first()
        if not cliente:
            raise NotFoundError("Cliente", payload.cliente_id)

        pago = Pago(
            cliente_id=payload.cliente_id,
            alquiler_id=payload.alquiler_id,
            monto=payload.monto,
            medio_pago=payload.medio_pago,
            con_factura=False,
            cobrado_por=usuario_id,
            fecha=payload.fecha,
            notas=payload.concepto,
        )
        self.db.add(pago)
        self.db.flush()

        self.cc_service.registrar_movimiento(
            cliente_id=payload.cliente_id,
            tipo="credito",
            naturaleza="pago",
            concepto=f"Recibo — {payload.concepto}",
            monto=payload.monto,
            fecha=payload.fecha,
            creado_por=usuario_id,
            alquiler_id=payload.alquiler_id,
            pago_id=pago.id,
        )

        return self.emitir_para_pago(pago, payload.concepto, usuario_id)

    def anular(self, id: int, motivo: str, usuario_id: int | None) -> Recibo:
        """
        Anula el papel. **No revierte el cobro**: si la plata no entró o entró
        mal, lo que se anula es el `Pago`, que es donde vive el asiento.

        Separarlos es lo correcto — un recibo mal impreso (nombre errado,
        concepto equivocado) se anula y se emite de nuevo sin tocar el ledger.
        """
        recibo = self.get(id)
        if recibo.estado == "anulado":
            raise BusinessRuleError("recibo_ya_anulado", "El recibo ya está anulado")

        # Los recibos anteriores a la migración 043 sí generaron su propio
        # asiento; para esos, anular el recibo sigue teniendo que revertirlo.
        # Se distinguen porque no tienen `pago_id`.
        if recibo.pago_id is None and recibo.movimiento_cc_id is not None:
            self.cc_service.anular_movimiento(
                recibo.movimiento_cc_id, motivo=motivo, creado_por=usuario_id
            )

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
