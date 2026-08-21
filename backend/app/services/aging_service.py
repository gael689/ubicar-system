"""
AgingService — cuánto le deben a Ubicar, y desde hace cuánto.

**Por qué el aging vive acá y no en la pantalla.** Estaba calculado en el
frontend (`CuentaCorrienteTab.tsx`), lo que rompía la regla que gobierna todo el
circuito: *ninguna pantalla calcula un saldo por su cuenta*. Además sólo existía
**por cliente**: para contestar "¿cuánto nos deben en total y desde hace cuánto?"
había que abrir las fichas de a una y sumar a mano.

⚠️ **El aging es aproximado, y es una decisión consciente.** El sistema **no
tiene imputación crédito→débito**: sabe *cuánto* debe un cliente, no *qué*
débito suyo está impago (`PLAN_DINERO.md` §4.3). Construir imputación completa
—FIFO, allocations— es la clase de complejidad que este plan viene a evitar, y
para tres personas y decenas de reservas por mes no se justifica.

Lo que sí se hace para que la aproximación no mienta demasiado:

1. **Se filtra por alquiler con saldo pendiente**, igual que las notificaciones
   (`cobranza_service`). Un alquiler cobrado íntegro no aporta ningún débito al
   aging, que es de donde venía casi todo el ruido.
2. **El total del aging se topea contra la deuda real** del cliente. Sin eso,
   un cliente que debe $300.000 podía aparecer con $500.000 vencidos, porque
   cada débito entra por su monto bruto sin restarle los créditos posteriores.
3. **Los vencimientos provisorios no cuentan** (Fase 5): esa fecha todavía puede
   correrse, y clasificar una deuda como "vencida hace 45 días" apoyándose en
   una estimación es peor que no clasificarla.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.cliente import Cliente
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.services import cobranza_service as cobranza
from app.services.cuenta_corriente_service import CuentaCorrienteService


# Los tramos, del más nuevo al más viejo. El corte a 30 días es el que pide el
# objetivo ("con aging a 30 días"); los de arriba existen porque una deuda de
# 90 días no se gestiona igual que una de 40.
TRAMOS = (
    ("por_vencer", None, 0),      # todavía no venció
    ("d0_30", 1, 30),
    ("d31_60", 31, 60),
    ("d61_90", 61, 90),
    ("d90mas", 91, None),
)


def _tramo(dias_vencido: int) -> str:
    if dias_vencido <= 0:
        return "por_vencer"
    if dias_vencido <= 30:
        return "d0_30"
    if dias_vencido <= 60:
        return "d31_60"
    if dias_vencido <= 90:
        return "d61_90"
    return "d90mas"


def _vacio() -> dict[str, Decimal]:
    return {nombre: Decimal("0") for nombre, _, _ in TRAMOS}


class AgingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def de_cliente(self, cliente_id: int, hoy: date | None = None) -> dict:
        """El aging de un cliente, ya topeado contra su deuda real."""
        hoy = hoy or date.today()
        alquileres_con_saldo = cobranza.alquileres_con_saldo_pendiente(self.db)
        deuda = CuentaCorrienteService(self.db).desglose(cliente_id)["deuda"]

        movs = (
            self.db.query(MovimientoCuentaCorriente)
            .join(
                CuentaCorriente,
                CuentaCorriente.id == MovimientoCuentaCorriente.cuenta_corriente_id,
            )
            .filter(
                CuentaCorriente.cliente_id == cliente_id,
                MovimientoCuentaCorriente.tipo == "debito",
                MovimientoCuentaCorriente.anulado.is_(False),
                MovimientoCuentaCorriente.fecha_vencimiento.isnot(None),
                MovimientoCuentaCorriente.vencimiento_provisorio.is_(False),
            )
            .all()
        )

        tramos = _vacio()
        for m in movs:
            # Mismo filtro que las notificaciones: si el alquiler está cobrado,
            # su débito no es deuda de nadie.
            if m.alquiler_id is not None and m.alquiler_id not in alquileres_con_saldo:
                continue
            tramos[_tramo((hoy - m.fecha_vencimiento).days)] += Decimal(str(m.monto))

        return self._topear(tramos, deuda)

    @staticmethod
    def _topear(tramos: dict[str, Decimal], deuda: Decimal) -> dict:
        """
        Recorta el aging para que no supere la deuda real, empezando por lo más
        nuevo.

        **Sin esto el número miente hacia arriba.** Cada débito entra por su
        monto bruto: un cliente que debe $300.000 después de haber pagado a
        cuenta puede tener $500.000 en débitos vencidos, y el reporte diría que
        debe $500.000. Se recorta desde `por_vencer` hacia atrás porque lo que
        un pago cancela primero es lo más nuevo sólo si nadie dijo lo contrario
        — y nadie lo dice, porque no hay imputación. Es la aproximación menos
        alarmista de las dos posibles, que es la correcta cuando el número
        dispara llamadas a clientes.
        """
        total_bruto = sum(tramos.values())
        deuda = max(Decimal("0"), Decimal(str(deuda)))
        sobrante = total_bruto - deuda

        recortado = dict(tramos)
        if sobrante > 0:
            for nombre, _, _ in TRAMOS:
                if sobrante <= 0:
                    break
                quita = min(recortado[nombre], sobrante)
                recortado[nombre] -= quita
                sobrante -= quita

        vencido = sum(v for k, v in recortado.items() if k != "por_vencer")
        return {
            **{k: v for k, v in recortado.items()},
            "total_vencido": vencido,
            "total": sum(recortado.values()),
            "deuda": deuda,
            # Lo que se recortó por no tener imputación. Se expone en vez de
            # esconderse: si es grande, quiere decir que ese cliente paga a
            # cuenta y el aging suyo hay que mirarlo con pinzas.
            "ajuste_por_pagos_sin_imputar": total_bruto - sum(recortado.values()),
        }

    def global_(self, hoy: date | None = None) -> dict:
        """
        Cuánto le deben a Ubicar, en total y por cliente.

        Es la primera pregunta del objetivo del plan y no existía: había un
        aging por cliente, en el frontend, y para el total había que abrir las
        fichas de a una.
        """
        hoy = hoy or date.today()
        alquileres_con_saldo = cobranza.alquileres_con_saldo_pendiente(self.db)
        cc_svc = CuentaCorrienteService(self.db)

        cuentas = (
            self.db.query(CuentaCorriente, Cliente)
            .join(Cliente, Cliente.id == CuentaCorriente.cliente_id)
            .all()
        )

        totales = _vacio()
        por_cliente = []
        a_favor = []

        for cc, cliente in cuentas:
            desglose = cc_svc.desglose(cliente.id)
            deuda = desglose["deuda"]

            if deuda < 0:
                # **"A favor" se mide sobre la deuda, no sobre el saldo.** El
                # saldo negativo incluye los anticipos, que no son plata a favor
                # del cliente: es un auto que le debemos entregar.
                a_favor.append({
                    "cliente_id": cliente.id,
                    "cliente_nombre": cliente.nombre_completo,
                    "a_favor": -deuda,
                    "anticipos": desglose["anticipos"],
                })
                continue
            if deuda == 0:
                continue

            movs = (
                self.db.query(MovimientoCuentaCorriente)
                .filter(
                    MovimientoCuentaCorriente.cuenta_corriente_id == cc.id,
                    MovimientoCuentaCorriente.tipo == "debito",
                    MovimientoCuentaCorriente.anulado.is_(False),
                    MovimientoCuentaCorriente.fecha_vencimiento.isnot(None),
                    MovimientoCuentaCorriente.vencimiento_provisorio.is_(False),
                )
                .all()
            )
            tramos = _vacio()
            for m in movs:
                if m.alquiler_id is not None and m.alquiler_id not in alquileres_con_saldo:
                    continue
                tramos[_tramo((hoy - m.fecha_vencimiento).days)] += Decimal(str(m.monto))

            fila = self._topear(tramos, deuda)
            for nombre in totales:
                totales[nombre] += fila[nombre]
            por_cliente.append({
                "cliente_id": cliente.id,
                "cliente_nombre": cliente.nombre_completo,
                **fila,
            })

        # Lo más vencido primero: es el orden en el que hay que llamar.
        por_cliente.sort(key=lambda f: (-f["d90mas"], -f["d61_90"], -f["d31_60"], -f["total"]))
        a_favor.sort(key=lambda f: -f["a_favor"])

        vencido = sum(v for k, v in totales.items() if k != "por_vencer")
        return {
            "fecha": hoy,
            "tramos": totales,
            "total_vencido": vencido,
            "total_adeudado": sum(totales.values()),
            "clientes": por_cliente,
            "clientes_a_favor": a_favor,
        }
