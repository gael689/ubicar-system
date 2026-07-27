"""
EcheqService — punto único para crear un echeq "recibido" de un cliente y
(si corresponde) el crédito automático en su cuenta corriente.

Antes esta lógica vivía sólo en `routers/echeqs.py`. Se extrae acá para que
`ReservaService.create()` la reutilice cuando el medio de pago elegido es
"echeq" — sin duplicar el automatismo de crédito/contra-asiento.
"""
from __future__ import annotations
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.echeq import Echeq
from app.services.cuenta_corriente_service import CuentaCorrienteService


class EcheqService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def crear_recibido(
        self,
        *,
        cliente_id: int,
        contraparte: str,
        monto: Decimal,
        fecha_emision: date,
        creado_por: int | None,
        banco: str | None = None,
        numero_cheque: str | None = None,
        fecha_cobro: date | None = None,
        reserva_id: int | None = None,
        alquiler_id: int | None = None,
        gasto_id: int | None = None,
        notas: str | None = None,
        generar_credito: bool = True,
    ) -> Echeq:
        """
        Crea un echeq `recibido` de un cliente. `banco`/`numero_cheque`/
        `fecha_cobro` son opcionales — sin ellos queda "pendiente de
        completar" (ver `EcheqResponse.datos_completos`), se puede terminar
        de cargar después desde la ficha del cliente o el módulo de Echeqs.

        Si `generar_credito`, registra el crédito en la cuenta corriente del
        cliente (mismo automatismo que antes sólo vivía en el router) — un
        echeq recibido de un cliente identificado es, a los fines de la
        cuenta corriente, un cobro, aunque todavía no se haya hecho efectivo.
        """
        echeq = Echeq(
            tipo="recibido",
            estado="en_cartera",
            cliente_id=cliente_id,
            contraparte=contraparte,
            monto=monto,
            fecha_emision=fecha_emision,
            fecha_cobro=fecha_cobro,
            banco=banco,
            numero_cheque=numero_cheque,
            reserva_id=reserva_id,
            alquiler_id=alquiler_id,
            gasto_id=gasto_id,
            notas=notas,
            creado_por=creado_por,
        )
        self.db.add(echeq)
        self.db.flush()  # asegurar echeq.id

        if generar_credito:
            detalle = f"#{numero_cheque}" if numero_cheque else "(pendiente de completar)"
            banco_txt = f" ({banco})" if banco else ""
            vencimiento_txt = f" — vence {fecha_cobro}" if fecha_cobro else ""
            mov = CuentaCorrienteService(self.db).registrar_movimiento(
                cliente_id=cliente_id,
                tipo="credito",
                concepto=f"Echeq recibido {detalle}{banco_txt}{vencimiento_txt}",
                monto=Decimal(str(monto)),
                fecha=fecha_emision,
                creado_por=creado_por,
                reserva_id=reserva_id,
                alquiler_id=alquiler_id,
                echeq_id=echeq.id,
            )
            echeq.cuenta_corriente_id = mov.cuenta_corriente_id
            echeq.movimiento_cc_id = mov.id

        return echeq

    def completar_alquiler(self, reserva_id: int, alquiler_id: int) -> None:
        """Al checkout, vincula el/los echeq(s) de la reserva al alquiler
        recién creado — no existía todavía cuando se cargó la reserva."""
        echeqs = (
            self.db.query(Echeq)
            .filter(Echeq.reserva_id == reserva_id, Echeq.alquiler_id.is_(None))
            .all()
        )
        for e in echeqs:
            e.alquiler_id = alquiler_id
