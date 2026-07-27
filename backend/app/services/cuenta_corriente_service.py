"""
CuentaCorrienteService — punto único para mover el ledger de cuenta corriente.

Cualquier código que necesite generar un asiento (checkout, pago, excedente,
multa, echeq...) pasa por acá en vez de tocar `cc.saldo` directamente. Sólo
hace `flush()`, nunca `commit()` — así compone bien dentro de la transacción
del que lo llama (ver AlquilerService, que ya envuelve todo en
`begin_nested()`).
"""
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.cuenta_corriente import aplicar_movimiento, calcular_vencimiento
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente


class CuentaCorrienteService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create(self, cliente_id: int) -> CuentaCorriente:
        cc = self.db.query(CuentaCorriente).filter(CuentaCorriente.cliente_id == cliente_id).first()
        if not cc:
            cc = CuentaCorriente(cliente_id=cliente_id, saldo=0)
            self.db.add(cc)
            self.db.flush()
        return cc

    def registrar_movimiento(
        self,
        *,
        cliente_id: int,
        tipo: str,
        concepto: str,
        monto: Decimal,
        fecha: date,
        creado_por: int | None,
        condicion: str | None = None,
        fecha_vencimiento: date | None = None,
        sin_vencimiento_automatico: bool = False,
        alquiler_id: int | None = None,
        reserva_id: int | None = None,
        pago_id: int | None = None,
        echeq_id: int | None = None,
        multa_id: int | None = None,
        recibo_id: int | None = None,
        comprobante_id: int | None = None,
        danio_id: int | None = None,
    ) -> MovimientoCuentaCorriente:
        if monto is None or monto <= 0:
            raise ValueError("El monto del movimiento debe ser > 0")

        cc = self.get_or_create(cliente_id)
        condicion_efectiva = condicion or cc.condicion_pago
        # Ancla = check-in (D-?): todavía no sabemos cuándo vuelve el auto,
        # así que no hay que calcular nada contra la fecha de este asiento
        # (que sería la del checkout) — queda sin vencimiento hasta que el
        # check-in real lo complete, o hasta que alguien lo edite a mano
        # (ver editar_vencimiento).
        if sin_vencimiento_automatico:
            vencimiento = fecha_vencimiento
        else:
            vencimiento = fecha_vencimiento or calcular_vencimiento(fecha, condicion_efectiva)
        nuevo_saldo = aplicar_movimiento(Decimal(str(cc.saldo)), tipo, Decimal(str(monto)))

        mov = MovimientoCuentaCorriente(
            cuenta_corriente_id=cc.id,
            tipo=tipo,
            concepto=concepto,
            monto=monto,
            fecha=fecha,
            condicion=condicion_efectiva,
            fecha_vencimiento=vencimiento,
            saldo_posterior=nuevo_saldo,
            alquiler_id=alquiler_id,
            reserva_id=reserva_id,
            pago_id=pago_id,
            echeq_id=echeq_id,
            multa_id=multa_id,
            recibo_id=recibo_id,
            comprobante_id=comprobante_id,
            danio_id=danio_id,
            creado_por=creado_por,
        )
        self.db.add(mov)
        cc.saldo = nuevo_saldo
        self.db.flush()
        return mov

    def anular_movimiento(
        self, movimiento_id: int, motivo: str, creado_por: int | None
    ) -> MovimientoCuentaCorriente:
        original = self.db.get(MovimientoCuentaCorriente, movimiento_id)
        if not original:
            raise ValueError(f"Movimiento {movimiento_id} no encontrado")
        if original.anulado:
            raise ValueError("El movimiento ya está anulado")

        cc = self.db.get(CuentaCorriente, original.cuenta_corriente_id)
        tipo_contrario = "credito" if original.tipo == "debito" else "debito"
        nuevo_saldo = aplicar_movimiento(Decimal(str(cc.saldo)), tipo_contrario, Decimal(str(original.monto)))

        contra = MovimientoCuentaCorriente(
            cuenta_corriente_id=cc.id,
            tipo=tipo_contrario,
            concepto=f"Anulación de movimiento #{original.id} ({original.concepto}) — {motivo}",
            monto=original.monto,
            fecha=date.today(),
            saldo_posterior=nuevo_saldo,
            alquiler_id=original.alquiler_id,
            reserva_id=original.reserva_id,
            # Se propagan las mismas FK que el original (menos pago_id, que se
            # desvincula más abajo) para que el historial por multa/echeq/recibo
            # incluya también el contra-asiento, no sólo el movimiento original.
            echeq_id=original.echeq_id,
            multa_id=original.multa_id,
            recibo_id=original.recibo_id,
            comprobante_id=original.comprobante_id,
            creado_por=creado_por,
        )
        self.db.add(contra)
        self.db.flush()

        original.anulado = True
        original.anulado_por_movimiento_id = contra.id
        # Si el original enlazaba a un pago que puede desaparecer (hard
        # delete), se desvincula la FK acá para que quien borre el pago
        # después no choque con una referencia colgada.
        original.pago_id = None
        cc.saldo = nuevo_saldo
        self.db.flush()
        return contra

    def editar_vencimiento(
        self,
        movimiento_id: int,
        fecha_vencimiento: date | None,
        motivo: str,
        usuario_id: int | None,
        condicion: str | None = None,
    ) -> MovimientoCuentaCorriente:
        """
        Corrige a mano la fecha de vencimiento (y opcionalmente la condición)
        de un débito — no toca `monto` ni `saldo_posterior`, no es una
        excepción a la inmutabilidad contable del ledger. Cubre: completar el
        vencimiento cuando el ancla era check-in y el auto ya volvió, correr
        el plazo por una extensión, o cualquier renegociación puntual.
        Siempre exige motivo — no hay roles todavía que restrinjan quién
        puede hacerlo, así que el rastro de auditoría es lo que queda.
        """
        if not motivo or not motivo.strip():
            raise ValueError("Editar el vencimiento requiere un motivo")

        mov = self.db.get(MovimientoCuentaCorriente, movimiento_id)
        if not mov:
            raise ValueError(f"Movimiento {movimiento_id} no encontrado")
        if mov.tipo != "debito":
            raise ValueError("Sólo se puede editar el vencimiento de un débito")
        if mov.anulado:
            raise ValueError("El movimiento está anulado")

        if condicion is not None:
            mov.condicion = condicion
        mov.fecha_vencimiento = fecha_vencimiento
        mov.vencimiento_editado_motivo = motivo
        mov.vencimiento_editado_por = usuario_id
        mov.vencimiento_editado_en = datetime.utcnow()
        self.db.flush()
        return mov

    def anular_por_pago(self, pago_id: int, motivo: str, creado_por: int | None) -> MovimientoCuentaCorriente | None:
        """Anula el movimiento vinculado a un pago, si existe. None si no había ninguno."""
        mov = (
            self.db.query(MovimientoCuentaCorriente)
            .filter(MovimientoCuentaCorriente.pago_id == pago_id, MovimientoCuentaCorriente.anulado == False)
            .first()
        )
        if not mov:
            return None
        return self.anular_movimiento(mov.id, motivo, creado_por)
