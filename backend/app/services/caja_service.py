"""
CajaService — dónde está la plata.

`pagos` contesta cuánto entró y `gastos` cuánto salió. Ninguno de los dos
contesta **dónde quedó**, que es la pregunta que hace alguien al cerrar el día:
*"¿cuánto tendría que haber en el cajón?"*. Este service la contesta a partir de
los `MovimientoCaja` (migración 080) más los pagos y gastos en efectivo.

**Es un número calculado, no un saldo confirmado.** No hay arqueo y no hay
bloqueo, a propósito: un arqueo que hay que confirmar todos los días termina
confirmándose sin mirar, y entonces miente con la autoridad de algo que alguien
firmó.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.gasto import Gasto
from app.models.movimiento_caja import SIGNO_EN_CAJA, MovimientoCaja
from app.models.pago import Pago
from app.services import auditoria_service


# El medio de pago que **no es plata que entró**. Un cobro con medio
# `cuenta_corriente` significa "se lo anotamos en la cuenta", o sea que la plata
# no entró: sumarlo a los ingresos del día infla la caja sin que nadie lo note.
MEDIOS_QUE_NO_SON_PLATA = {"cuenta_corriente"}

# Lo que efectivamente pasa por el cajón. Una transferencia o un cobro con
# tarjeta entran a una cuenta, no al cajón, y por eso no cuentan para "cuánto
# tendría que haber acá".
MEDIO_EFECTIVO = "efectivo"


class CajaService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Escritura ────────────────────────────────────────────────────────────

    def registrar(
        self,
        *,
        tipo: str,
        monto: Decimal,
        medio: str,
        motivo: str,
        fecha: date,
        creado_por: int | None,
        cliente_id: int | None = None,
        reserva_id: int | None = None,
        alquiler_id: int | None = None,
        movimiento_cc_id: int | None = None,
    ) -> MovimientoCaja:
        if tipo not in SIGNO_EN_CAJA:
            raise ValueError(f"Tipo de movimiento de caja inválido: {tipo!r}")
        if monto is None or Decimal(str(monto)) <= 0:
            raise ValueError("El monto del movimiento de caja debe ser > 0")
        # Mismo criterio que el ledger: sin motivo, dentro de un mes nadie sabe
        # qué fue este movimiento, y no hay ningún evento del sistema que lo
        # explique por su cuenta.
        if not motivo or not motivo.strip():
            raise ValueError("El movimiento de caja necesita un motivo")

        mov = MovimientoCaja(
            fecha=fecha,
            tipo=tipo,
            monto=Decimal(str(monto)),
            medio=medio,
            motivo=motivo.strip(),
            cliente_id=cliente_id,
            reserva_id=reserva_id,
            alquiler_id=alquiler_id,
            movimiento_cc_id=movimiento_cc_id,
            creado_por=creado_por,
        )
        self.db.add(mov)
        self.db.flush()

        auditoria_service.registrar(
            self.db,
            usuario_id=creado_por,
            accion="crear",
            entidad_tipo="movimiento_caja",
            entidad_id=mov.id,
            descripcion=f"Movimiento de caja: {tipo} de ${mov.monto} ({medio}). Motivo: {mov.motivo}",
            datos_despues={
                "tipo": tipo, "monto": mov.monto, "medio": medio,
                "fecha": fecha, "motivo": mov.motivo,
            },
            monto=mov.monto,
        )
        return mov

    def anular(self, movimiento_id: int, motivo: str, usuario_id: int | None) -> MovimientoCaja:
        """
        Baja lógica con motivo. **Nunca un DELETE**: un movimiento de caja
        borrado saca plata de un día pasado sin dejar rastro, que es
        exactamente lo que la Fase 7 corrige en `pagos`.
        """
        if not motivo or not motivo.strip():
            raise ValueError("Anular un movimiento de caja requiere un motivo")

        mov = self.db.get(MovimientoCaja, movimiento_id)
        if mov is None:
            raise ValueError(f"Movimiento de caja {movimiento_id} no encontrado")
        if mov.anulado:
            raise ValueError("El movimiento ya está anulado")

        mov.anulado = True
        mov.motivo_anulacion = motivo.strip()
        self.db.flush()

        auditoria_service.registrar(
            self.db,
            usuario_id=usuario_id,
            accion="anular",
            entidad_tipo="movimiento_caja",
            entidad_id=mov.id,
            descripcion=f"Anuló el movimiento de caja #{mov.id} de ${mov.monto}. Motivo: {motivo}",
            datos_antes={"tipo": mov.tipo, "monto": mov.monto, "fecha": mov.fecha},
            datos_despues={"anulado": True, "motivo": motivo},
            monto=mov.monto,
        )
        return mov

    # ── Lectura ──────────────────────────────────────────────────────────────

    def del_dia(self, fecha: date) -> list[MovimientoCaja]:
        return (
            self.db.query(MovimientoCaja)
            .filter(MovimientoCaja.fecha == fecha, MovimientoCaja.anulado.is_(False))
            .order_by(MovimientoCaja.id.desc())
            .all()
        )

    def ultimo_deposito(self) -> MovimientoCaja | None:
        """
        El último depósito al banco cargado.

        **Es la mitad que hace útil al número de abajo.** El depósito y el
        retiro son los dos únicos datos que ningún evento del sistema dispara
        solo: los tiene que cargar una persona. Mostrar "hay $850.000 en el
        cajón" sin decir desde cuándo se viene acumulando convierte un número
        viejo en una afirmación falsa. Con la fecha al lado, el propio número
        empuja a cargar el depósito que falta.
        """
        return (
            self.db.query(MovimientoCaja)
            .filter(
                MovimientoCaja.tipo == "deposito_banco",
                MovimientoCaja.anulado.is_(False),
            )
            .order_by(MovimientoCaja.fecha.desc(), MovimientoCaja.id.desc())
            .first()
        )

    def efectivo_acumulado(self, hasta: date | None = None) -> Decimal:
        """
        Cuánto efectivo debería haber en el cajón.

            Σ(pagos en efectivo)
          − Σ(gastos en efectivo)
          + Σ(garantías en efectivo recibidas)
          − Σ(garantías en efectivo devueltas)
          − Σ(depósitos)  − Σ(retiros)  − Σ(reembolsos en efectivo)

        Sólo cuenta lo que pasa por el cajón: una transferencia o un cobro con
        tarjeta entran a una cuenta bancaria, no acá.

        Se cuenta **desde siempre** y no desde el último depósito: si alguien no
        cargó un depósito, el número tiene que quedar alto y visible, no
        reiniciarse solo y ocultar el olvido.
        """
        q_pagos = self.db.query(func.coalesce(func.sum(Pago.monto), 0)).filter(
            Pago.medio_pago == MEDIO_EFECTIVO
        )
        q_gastos = self.db.query(func.coalesce(func.sum(Gasto.monto), 0)).filter(
            Gasto.medio_pago == MEDIO_EFECTIVO
        )
        q_movs = self.db.query(MovimientoCaja).filter(
            MovimientoCaja.medio == MEDIO_EFECTIVO,
            MovimientoCaja.anulado.is_(False),
        )
        if hasta is not None:
            q_pagos = q_pagos.filter(Pago.fecha <= hasta)
            q_gastos = q_gastos.filter(Gasto.fecha <= hasta)
            q_movs = q_movs.filter(MovimientoCaja.fecha <= hasta)

        total = Decimal(str(q_pagos.scalar() or 0)) - Decimal(str(q_gastos.scalar() or 0))
        for m in q_movs.all():
            total += m.efecto_en_caja
        return total

    def donde_esta_la_plata(self, hasta: date | None = None) -> dict:
        """El bloque que contesta la pregunta, listo para la pantalla."""
        ultimo = self.ultimo_deposito()
        return {
            "efectivo_sin_depositar": self.efectivo_acumulado(hasta),
            "ultimo_deposito_fecha": ultimo.fecha if ultimo else None,
            "ultimo_deposito_monto": Decimal(str(ultimo.monto)) if ultimo else None,
            # `True` cuando nunca se cargó un depósito. La pantalla lo dice con
            # todas las letras en vez de mostrar un número que parece un saldo.
            "sin_depositos_cargados": ultimo is None,
        }
