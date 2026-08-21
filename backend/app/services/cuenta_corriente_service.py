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

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domain.cuenta_corriente import aplicar_movimiento, calcular_vencimiento
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.services import auditoria_service


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

    def desglose(self, cliente_id: int) -> dict:
        """
        El saldo, partido en las dos cosas que vienen sumadas en un solo número.

        **El problema que esto resuelve.** El libro mide *cuánto nos debe el
        cliente* (D-01: positivo = debe). El débito de un alquiler se crea en el
        **check-out**, pero la plata puede entrar mucho antes: una reserva web
        pagada con tarjeta acredita en el momento en que Mercado Pago confirma,
        y con la ventana comercial actual el auto puede retirarse hasta 120 días
        después. En todo ese tiempo hay un crédito sin su débito, el saldo queda
        negativo, y la ficha decía **"El cliente tiene saldo a favor"** en verde.

        Eso no es un error de cuentas —plata cobrada por algo no entregado es un
        anticipo, y un anticipo es una obligación real de la empresa— pero está
        mal contado como si fueran dos cosas iguales. Quien abre la ficha lee
        "le debemos plata" cuando lo que pasa es "nos pagó y todavía no le dimos
        el auto". Son dos hechos distintos y merecen dos números.

        - `anticipos`: créditos de naturaleza `anticipo` **todavía sin aplicar**
          (`aplicado_en IS NULL`).
        - `deuda`: lo que el cliente debe de verdad, o sea el saldo **sin**
          contar esos anticipos.
        - `saldo`: el de siempre, sin tocar. Ninguna cuenta cambia — esto sólo
          lee y explica.

        **Ahora es exacto.** Hasta la Fase 2 esto era un proxy: "crédito con
        `reserva_id` cuya reserva todavía no tiene alquiler". Fallaba en los dos
        bordes que importaban —la reserva cancelada, que nunca va a tener
        alquiler, y el crédito del echeq, que no es plata— y no distinguía un
        anticipo consumido de uno pendiente. Con `naturaleza` y la marca de
        aplicación, la pregunta se responde sin adivinar.
        """
        cc = self.get_or_create(cliente_id)
        saldo = Decimal(str(cc.saldo))

        total = (
            self.db.query(func.coalesce(func.sum(MovimientoCuentaCorriente.monto), 0))
            .join(
                CuentaCorriente,
                CuentaCorriente.id == MovimientoCuentaCorriente.cuenta_corriente_id,
            )
            .filter(
                CuentaCorriente.cliente_id == cliente_id,
                MovimientoCuentaCorriente.naturaleza == "anticipo",
                MovimientoCuentaCorriente.anulado.is_(False),
                MovimientoCuentaCorriente.aplicado_en.is_(None),
            )
            .scalar()
        )
        anticipos = Decimal(str(total or 0))

        return {
            "saldo": saldo,
            # El saldo lleva los anticipos restados (son créditos): sumarlos de
            # vuelta deja lo que el cliente debe ignorándolos.
            "deuda": saldo + anticipos,
            "anticipos": anticipos,
        }

    def registrar_movimiento(
        self,
        *,
        cliente_id: int,
        tipo: str,
        concepto: str,
        monto: Decimal,
        fecha: date,
        creado_por: int | None,
        # De qué se trata el asiento. Es obligatorio en la práctica —quedó con
        # default `manual` sólo para que un llamador viejo no reviente— y todo
        # el código del sistema lo pasa explícito. `manual` significa "lo cargó
        # una persona a mano", no "no sé".
        naturaleza: str = "manual",
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
        # El concepto es lo único que explica un asiento cuando se lo lee seis
        # meses después. `concepto: str` alcanzaba para Pydantic y `""` pasaba
        # igual, así que un movimiento manual podía entrar por API sin decir de
        # qué era. Ver `PLAN_DINERO.md` §1.5.c.
        if not concepto or not concepto.strip():
            raise ValueError("El movimiento necesita un concepto")
        concepto = concepto.strip()

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
            naturaleza=naturaleza,
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

        # Todo asiento del ledger queda auditado desde acá y no desde cada uno
        # de los diez lugares que generan movimientos: es el único paso por el
        # que pasan todos, así que es el único donde no se puede olvidar.
        auditoria_service.registrar(
            self.db,
            usuario_id=creado_por,
            accion="debitar" if tipo == "debito" else "acreditar",
            entidad_tipo="cuenta_corriente",
            entidad_id=cliente_id,
            descripcion=f"{'Débito' if tipo == 'debito' else 'Crédito'} en cuenta corriente: {concepto}",
            datos_despues={
                "movimiento_id": mov.id,
                "naturaleza": naturaleza,
                "monto": monto,
                "fecha": fecha,
                "condicion": condicion_efectiva,
                "fecha_vencimiento": vencimiento,
                "saldo_posterior": nuevo_saldo,
            },
            monto=monto,
        )
        return mov

    def anular_movimiento(
        self,
        movimiento_id: int,
        motivo: str,
        creado_por: int | None,
        naturaleza: str = "anulacion",
    ) -> MovimientoCuentaCorriente:
        """
        Revierte un asiento con un contra-asiento. El original nunca se edita
        ni se borra: queda marcado `anulado` y enlazado al que lo revirtió.

        `naturaleza` distingue **por qué** se revierte, y no es un detalle
        cosmético:

        - `anulacion` (default) — *"esto estaba mal"*. Un alquiler cargado al
          cliente equivocado, un monto tipeado de más.
        - `bonificacion` — *"esto estaba bien y se lo perdonamos"*. Una multa
          que se le condona, un daño que se decide no cobrar.

        Las dos hacen exactamente lo mismo con la plata. La diferencia es que
        sumar las bonificaciones de un mes contesta *cuánto regalamos*, y
        sumar las anulaciones contesta *cuánto nos equivocamos*. Con una sola
        etiqueta, las dos preguntas devuelven el mismo número y ninguna sirve.
        """
        # Mismo criterio que `editar_vencimiento`: sin roles que restrinjan
        # quién puede anular un asiento, el motivo **es** el control. Un motivo
        # vacío queda escrito en el concepto del contra-asiento y en la
        # auditoría, y convierte las dos cosas en ruido. El frontend ya lo
        # exigía; un POST directo entraba igual. Ver `PLAN_DINERO.md` §1.5.c.
        if not motivo or not motivo.strip():
            raise ValueError("Anular un movimiento requiere un motivo")
        motivo = motivo.strip()

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
            # Un contra-asiento no es "un pago" ni "una multa": es una
            # anulación (o una bonificación), y mezclarlo con la naturaleza del
            # original haría que cualquier suma por naturaleza contara el
            # asiento y su reverso.
            naturaleza=naturaleza,
            concepto=f"Anulación de movimiento #{original.id} ({original.concepto}) — {motivo}",
            monto=original.monto,
            fecha=date.today(),
            saldo_posterior=nuevo_saldo,
            alquiler_id=original.alquiler_id,
            reserva_id=original.reserva_id,
            # Se propagan las mismas FK que el original (menos pago_id, que se
            # desvincula más abajo) para que el historial por multa/daño/echeq/
            # recibo incluya también el contra-asiento, no sólo el movimiento
            # original.
            #
            # `danio_id` faltaba, aunque este comentario decía "las mismas FK":
            # bonificar un daño anulaba el débito y la reversión no aparecía en
            # el historial de ese daño. Ver `PLAN_DINERO.md` §1.5.b.
            echeq_id=original.echeq_id,
            multa_id=original.multa_id,
            recibo_id=original.recibo_id,
            comprobante_id=original.comprobante_id,
            danio_id=original.danio_id,
            creado_por=creado_por,
        )
        self.db.add(contra)
        self.db.flush()

        original.anulado = True
        original.anulado_por_movimiento_id = contra.id
        # Si lo que se anula es el **débito del alquiler**, los anticipos que se
        # habían marcado aplicados contra él quedan colgando: seguirían fuera de
        # "por aplicar" con su crédito vivo en el saldo, y la ficha volvería a
        # decir "a favor". Se sueltan.
        self._soltar_anticipos_aplicados_a(original.id)
        # Y si lo que se anula es el anticipo mismo, su marca deja de tener
        # sentido: ya no hay crédito que aplicar.
        original.aplicado_por_movimiento_id = None
        original.aplicado_en = None
        # Si el original enlazaba a un pago que puede desaparecer (hard
        # delete), se desvincula la FK acá para que quien borre el pago
        # después no choque con una referencia colgada.
        original.pago_id = None
        cc.saldo = nuevo_saldo
        self.db.flush()

        # Anular es la acción que `creado_por` no puede registrar: no nace una
        # fila nueva de la entidad original, se marca la que ya estaba. Sin
        # esto, "¿quién dio de baja el débito de $400.000?" no tiene respuesta.
        auditoria_service.registrar(
            self.db,
            usuario_id=creado_por,
            accion="anular",
            entidad_tipo="cuenta_corriente",
            entidad_id=cc.cliente_id,
            descripcion=(
                f"Anuló el movimiento #{original.id} ({original.concepto}) "
                f"por ${original.monto}. Motivo: {motivo}"
            ),
            datos_antes={
                "movimiento_id": original.id,
                "tipo": original.tipo,
                "monto": original.monto,
                "concepto": original.concepto,
            },
            datos_despues={
                "contra_asiento_id": contra.id,
                "motivo": motivo,
                "saldo_posterior": nuevo_saldo,
            },
            monto=original.monto,
        )
        return contra

    # ── Aplicación de anticipos ─────────────────────────────────────────────

    def anticipos_por_aplicar(self, cliente_id: int) -> list[MovimientoCuentaCorriente]:
        """
        Los créditos de naturaleza `anticipo` que todavía no se consumieron.

        Es plata que entró por algo que no se entregó: una obligación de la
        empresa, no plata a favor del cliente. Ver `desglose`.
        """
        return (
            self.db.query(MovimientoCuentaCorriente)
            .join(
                CuentaCorriente,
                CuentaCorriente.id == MovimientoCuentaCorriente.cuenta_corriente_id,
            )
            .filter(
                CuentaCorriente.cliente_id == cliente_id,
                MovimientoCuentaCorriente.naturaleza == "anticipo",
                MovimientoCuentaCorriente.anulado.is_(False),
                MovimientoCuentaCorriente.aplicado_en.is_(None),
            )
            .order_by(MovimientoCuentaCorriente.id)
            .all()
        )

    def hay_credito_vivo_de_reserva(self, reserva_id: int) -> bool:
        """
        ¿Hay algún crédito no anulado atado a esta reserva, de la naturaleza que
        sea?

        La usa `ReservaService.cancelar` para decidir si tiene que fabricar el
        crédito de la seña o si ya está. Mira **cualquier** naturaleza a
        propósito: el crédito del echeq es `echeq_en_cartera` y no se marca
        aplicado —un papel no es una seña cobrada— pero existe y ya bajó el
        saldo. Ignorarlo haría que la cancelación acreditara la seña dos veces.
        """
        return (
            self.db.query(MovimientoCuentaCorriente.id)
            .filter(
                MovimientoCuentaCorriente.reserva_id == reserva_id,
                MovimientoCuentaCorriente.tipo == "credito",
                MovimientoCuentaCorriente.anulado.is_(False),
            )
            .first()
            is not None
        )

    def aplicar_anticipos_de_reserva(
        self, reserva_id: int, debito_id: int | None
    ) -> list[MovimientoCuentaCorriente]:
        """
        Marca aplicados los anticipos de esta reserva. Lo llama el check-out.

        `debito_id` puede venir en `None`, y es uno de los tres bordes que
        `PLAN_DINERO.md` §4.2 pedía cubrir: **si el auto sale sin precio**, el
        check-out no asienta ningún débito (`if monto_facturado > 0`) y no hay a
        qué apuntar. Sin esto el anticipo quedaría "por aplicar" para siempre y
        `deuda = saldo + anticipos` sobreestimaría la deuda por el anticipo
        entero. Se marca igual: la marca dice *"este anticipo ya se consumió"*,
        y contra qué es información extra, no la condición.

        **El crédito del echeq no se toca**: tiene naturaleza
        `echeq_en_cartera`, no `anticipo`. Un echeq recibido es un papel, no
        plata en la caja, y confundirlos era el tercer borde de §4.2.
        """
        anticipos = (
            self.db.query(MovimientoCuentaCorriente)
            .filter(
                MovimientoCuentaCorriente.reserva_id == reserva_id,
                MovimientoCuentaCorriente.naturaleza == "anticipo",
                MovimientoCuentaCorriente.anulado.is_(False),
                MovimientoCuentaCorriente.aplicado_en.is_(None),
            )
            .all()
        )
        ahora = datetime.utcnow()
        for a in anticipos:
            a.aplicado_por_movimiento_id = debito_id
            a.aplicado_en = ahora
        if anticipos:
            self.db.flush()
        return anticipos

    def _soltar_anticipos_aplicados_a(self, movimiento_id: int) -> None:
        """Deshace las marcas que apuntaban a un movimiento que se acaba de anular."""
        colgados = (
            self.db.query(MovimientoCuentaCorriente)
            .filter(MovimientoCuentaCorriente.aplicado_por_movimiento_id == movimiento_id)
            .all()
        )
        for a in colgados:
            a.aplicado_por_movimiento_id = None
            a.aplicado_en = None

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

        antes = {"fecha_vencimiento": mov.fecha_vencimiento, "condicion": mov.condicion}

        if condicion is not None:
            mov.condicion = condicion
        mov.fecha_vencimiento = fecha_vencimiento
        mov.vencimiento_editado_motivo = motivo
        mov.vencimiento_editado_por = usuario_id
        mov.vencimiento_editado_en = datetime.utcnow()
        self.db.flush()

        cc = self.db.get(CuentaCorriente, mov.cuenta_corriente_id)
        auditoria_service.registrar(
            self.db,
            usuario_id=usuario_id,
            accion="editar",
            entidad_tipo="cuenta_corriente",
            entidad_id=cc.cliente_id if cc else None,
            descripcion=(
                f"Corrió el vencimiento del movimiento #{mov.id} "
                f"({mov.concepto}) a {fecha_vencimiento or 'sin fecha'}. Motivo: {motivo}"
            ),
            datos_antes=antes,
            datos_despues={"fecha_vencimiento": fecha_vencimiento, "condicion": mov.condicion},
            monto=mov.monto,
        )
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
