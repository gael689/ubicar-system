from __future__ import annotations
"""
ReservaService — orquesta la lógica de negocio de reservas.
Capa transaccional: cruza vehículo, cliente, reserva dentro de transacciones explícitas.
"""
from datetime import datetime, date, time
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError
from app.domain.enums import EstadoReserva, EstadoVehiculo
from app.domain.solapamientos import detectar_solapamientos
from app.domain.precios import AdicionalSolicitado, validar_seleccion_adicionales
from app.domain.tarifas import seleccionar_tarifa, calcular_duracion_dias, calcular_precio_total, TarifaInfo
from app.models.adicional import Adicional, ReservaAdicional
from app.domain.transiciones import (
    estado_tras_confirmar_reserva,
    estado_tras_cancelar_reserva_confirmada,
)
from app.domain.ventana import VentanaReserva
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.cliente import Cliente, ConductorAdicional
from app.models.tarifa import Tarifa
from app.repositories.reserva_repo import ReservaRepo
from app.repositories.alquiler_repo import AlquilerRepo
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.echeq_service import EcheqService


class ReservaService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.reserva_repo = ReservaRepo(db)
        self.alquiler_repo = AlquilerRepo(db)
        self.cc_service = CuentaCorrienteService(db)
        self.echeq_service = EcheqService(db)

    # ── Lectura ───────────────────────────────────────────────────────────────

    def get(self, id: int) -> Reserva:
        reserva = self.reserva_repo.get(id)
        if not reserva:
            raise NotFoundError("Reserva", id)
        return reserva

    def list(
        self,
        estado: str | None = None,
        vehiculo_id: int | None = None,
        cliente_id: int | None = None,
        q: str | None = None,
        fecha=None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Reserva], int]:
        self.sincronizar_estados_por_horario()
        return self.reserva_repo.list(
            estado=estado,
            vehiculo_id=vehiculo_id,
            cliente_id=cliente_id,
            q=q,
            fecha=fecha,
            page=page,
            page_size=page_size,
        )

    def sincronizar_estados_por_horario(self):
        """
        Actualiza el estado de las reservas basándose en el tiempo actual.

        Importante: esta sincronización NUNCA finaliza un alquiler. Sólo un
        check-in real (AlquilerService.checkin) puede pasar una reserva a
        'finalizada'. Antes, pasada la hora de fin la reserva saltaba directo
        a 'finalizada' sin que el auto hubiera vuelto, y como checkin() exige
        estado 'activa', quedaba IMPOSIBLE registrar una devolución tardía.
        Ahora pasa a 'vencida' — el auto sigue afuera, pero el check-in ya
        puede hacerse sobre ese estado (ver AlquilerService.checkin).
        """
        now = datetime.now()
        current_date = now.date()
        current_time = now.time()

        with self.db.begin_nested():
            # Confirmada -> Activa (ya pasó la fecha_inicio + hora_inicio)
            self.db.query(Reserva).filter(
                Reserva.estado == EstadoReserva.CONFIRMADA.value,
                (Reserva.fecha_inicio < current_date) |
                ((Reserva.fecha_inicio == current_date) & (Reserva.hora_inicio <= current_time))
            ).update({"estado": EstadoReserva.ACTIVA.value}, synchronize_session=False)

            # Activa -> Vencida (ya pasó la fecha_fin + hora_fin y no hubo checkin)
            self.db.query(Reserva).filter(
                Reserva.estado == EstadoReserva.ACTIVA.value,
                (Reserva.fecha_fin < current_date) |
                ((Reserva.fecha_fin == current_date) & (Reserva.hora_fin <= current_time))
            ).update({"estado": EstadoReserva.VENCIDA.value}, synchronize_session=False)
        self.db.commit()

    # ── Crear reserva ─────────────────────────────────────────────────────────

    def sincronizar_adicionales(
        self,
        reserva: Reserva,
        solicitados: list[tuple[int, int]] | None,
    ) -> None:
        """
        Deja los adicionales de la reserva igual a `solicitados` — una lista
        de `(adicional_id, cantidad)`. `None` significa "no tocar nada"
        (un PATCH que no menciona adicionales no debe borrarlos); una lista
        vacía sí los saca a todos.

        **El precio se congela acá**, tomando el vigente del catálogo. Las
        líneas que ya existían y siguen pedidas con la misma cantidad **no se
        recrean**: conservan el precio con el que se pactaron, que es todo el
        sentido de congelarlo. Si mañana sube la cobertura full, editar la
        reserva para agregar un GPS no debe reencarecer el seguro.

        **No se puede tocar después del check-out**: en ese momento el
        alquiler ya se facturó como un débito en la cuenta corriente, y
        cambiar los adicionales dejaría el ledger diciendo una cosa y la
        reserva otra.
        """
        if solicitados is None:
            return

        if reserva.alquiler is not None:
            raise BusinessRuleError(
                "reserva_ya_facturada",
                "No se pueden cambiar los adicionales después del check-out: "
                "el alquiler ya se facturó en la cuenta corriente",
            )

        duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
        pedidos = {aid: cant for aid, cant in solicitados}

        if pedidos:
            catalogo = {
                a.id: a
                for a in self.db.query(Adicional)
                .filter(Adicional.id.in_(list(pedidos)), Adicional.activo.is_(True))
                .all()
            }
            faltantes = set(pedidos) - set(catalogo)
            if faltantes:
                raise NotFoundError("Adicional", sorted(faltantes)[0])

            # Las coberturas son excluyentes — se valida en el dominio para
            # que valga igual desde el mostrador y desde la web.
            validar_seleccion_adicionales([
                AdicionalSolicitado(
                    id=a.id, nombre=a.nombre,
                    precio_unitario=Decimal(str(a.precio)),
                    unidad_cobro=a.unidad_cobro, cantidad=pedidos[a.id], grupo=a.grupo,
                )
                for a in catalogo.values()
            ])
            for aid, cantidad in pedidos.items():
                a = catalogo[aid]
                if a.max_cantidad is not None and cantidad > a.max_cantidad:
                    raise BusinessRuleError(
                        "cantidad_excede_maximo",
                        f"'{a.nombre}' admite hasta {a.max_cantidad} unidad(es) por reserva",
                    )
        else:
            catalogo = {}

        existentes = {ra.adicional_id: ra for ra in reserva.adicionales}

        # Sacar lo que ya no está pedido. Es una línea de la reserva, no una
        # entidad de dominio: si el cliente se arrepiente del GPS antes de
        # retirar, la línea desaparece (misma lógica que las fotos de daños).
        for adicional_id, ra in existentes.items():
            if adicional_id not in pedidos:
                reserva.adicionales.remove(ra)

        for adicional_id, cantidad in pedidos.items():
            actual = existentes.get(adicional_id)
            if actual is not None and actual.cantidad == cantidad:
                continue  # sin cambios: conserva su precio congelado
            if actual is not None:
                reserva.adicionales.remove(actual)
            a = catalogo[adicional_id]
            reserva.adicionales.append(
                ReservaAdicional(
                    adicional_id=a.id,
                    cantidad=cantidad,
                    precio_unitario=Decimal(str(a.precio)),
                    unidad_cobro=a.unidad_cobro,
                    subtotal=self._subtotal_adicional(
                        Decimal(str(a.precio)), a.unidad_cobro, cantidad, duracion
                    ),
                )
            )

    @staticmethod
    def _subtotal_adicional(
        precio_unitario: Decimal, unidad_cobro: str, cantidad: int, duracion_dias: int
    ) -> Decimal:
        multiplicador = Decimal(cantidad)
        if unidad_cobro == "por_dia":
            multiplicador *= Decimal(duracion_dias)
        return precio_unitario * multiplicador

    def recalcular_adicionales_por_duracion(self, reserva: Reserva) -> None:
        """
        Reajusta los adicionales `por_dia` cuando cambia la duración.

        Si el alquiler se extiende de 5 a 8 días, el seguro cubre esos 3 días
        más y hay que cobrarlos. **El precio unitario congelado no se toca**:
        lo que cambia es la cantidad de días, no lo que se pactó por día.
        """
        duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
        for ra in reserva.adicionales:
            if ra.unidad_cobro == "por_dia":
                ra.subtotal = self._subtotal_adicional(
                    Decimal(str(ra.precio_unitario)), ra.unidad_cobro, ra.cantidad, duracion
                )

    def _validar_conductor(self, conductor_id: int, cliente_id: int) -> None:
        """El conductor tiene que ser un conductor adicional activo del propio cliente."""
        conductor = (
            self.db.query(ConductorAdicional)
            .filter(ConductorAdicional.id == conductor_id)
            .first()
        )
        if not conductor or not conductor.activo:
            raise NotFoundError("Conductor adicional", conductor_id)
        if conductor.cliente_id != cliente_id:
            raise BusinessRuleError(
                "conductor_no_pertenece_al_cliente",
                "El conductor seleccionado no pertenece al cliente de la reserva",
            )

    def create(
        self,
        vehiculo_id: int,
        cliente_id: int,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        lugar_entrega: str,
        lugar_devolucion: str,
        notas: str | None = None,
        hora_devolucion_acordada: time | None = None,
        late_checkout: bool = False,
        cargo_late_checkout: Decimal = Decimal("0"),
        precio_total: Decimal | None = None,
        # Garantía
        garantia_tipo: str | None = None,
        garantia_monto: Decimal | None = None,
        garantia_tarjeta_numero: str | None = None,
        garantia_tarjeta_vencimiento: str | None = None,
        garantia_tarjeta_titular: str | None = None,
        # Pago
        forma_pago_prevista: str | None = None,
        estado_pago: str = "pendiente",
        anticipo_monto: Decimal | None = None,
        anticipo_fecha: date | None = None,
        anticipo_medio_pago: str | None = None,
        conductor_id: int | None = None,
        con_factura: bool = False,
        descuento_motivo: str | None = None,
        condicion_pago: str = "contado",
        condicion_pago_ancla: str | None = None,
        condicion_pago_fecha_ancla: date | None = None,
        tipo_factura: str | None = None,
        factura_a_nombre_de: str | None = None,
        echeq_banco: str | None = None,
        echeq_numero_cheque: str | None = None,
        echeq_fecha_cobro: date | None = None,
        adicionales: list[tuple[int, int]] | None = None,
        usuario_id: int = 0,
    ) -> tuple[Reserva, list[dict]]:
        """
        Crea una reserva en estado 'pendiente'.

        Returns:
            (reserva, warnings) — warnings son solapamientos con pendientes.

        Raises:
            NotFoundError: vehículo o cliente no existe o está inactivo.
            ConflictError: solapamiento contra reserva confirmada o alquiler activo.
        """
        # 1. Verificar que vehículo y cliente existen y están activos
        vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
        if not vehiculo or not vehiculo.activo:
            raise NotFoundError("Vehículo", vehiculo_id)

        cliente = self.db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente or not cliente.activo:
            raise NotFoundError("Cliente", cliente_id)

        if conductor_id is not None:
            self._validar_conductor(conductor_id, cliente_id)

        # 2. Construir datetime completos para solapamiento
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)

        if inicio_dt >= fin_dt:
            raise BusinessRuleError("fechas_invalidas", "La fecha de fin debe ser posterior a la de inicio")

        # 3. Detectar solapamientos
        ventanas = self._cargar_ventanas(vehiculo_id)
        resultado = detectar_solapamientos(vehiculo_id, inicio_dt, fin_dt, ventanas)

        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|El vehículo tiene una reserva {conflicto.estado} en ese rango|"
                f"{conflicto.id}|{conflicto.estado}|{conflicto.inicio.date()}|{conflicto.fin.date()}"
            )

        # 4. Construir warnings por solapamiento con pendientes
        warnings = [
            {
                "tipo": "solape_con_pendiente",
                "reserva_id": v.id,
                "cliente": v.cliente_nombre,
                "fecha_inicio": str(v.inicio.date()),
                "fecha_fin": str(v.fin.date()),
            }
            for v in resultado.conflictos_advertencia
        ]

        # 5. Hora de devolución acordada: default = hora_inicio (mismo horario del checkout)
        hora_dev = hora_devolucion_acordada or hora_inicio

        # Calcular el precio de lista (el que sale de la tarifa) SIEMPRE que
        # haya una tarifa configurada, exista o no un precio_total manual —
        # es lo único que permite auditar un descuento después (ítem 22).
        tarifa_id = None
        precio_lista: Decimal | None = None
        duracion = calcular_duracion_dias(fecha_inicio, fecha_fin)
        tarifas_info, categoria_id = self._cargar_tarifas_info(vehiculo_id)
        try:
            tarifa = seleccionar_tarifa(duracion, tarifas_info, categoria_id)
            precio_lista = calcular_precio_total(duracion, tarifa)
            tarifa_id = tarifa.id
        except BusinessRuleError:
            pass

        if precio_total is None:
            precio_total = precio_lista

        # Condición de pago: si no es "contado", el ancla es obligatoria — no
        # hay default implícito (antes se contaba siempre desde el checkout
        # sin que nadie lo hubiera decidido).
        if condicion_pago != "contado":
            if condicion_pago_ancla not in ("checkout", "checkin", "fecha_especifica"):
                raise BusinessRuleError(
                    "ancla_requerida",
                    "Con una condición de pago a plazo hay que indicar a partir de cuándo se cuentan los días "
                    "(check-out, check-in, u otra fecha).",
                )
            if condicion_pago_ancla == "fecha_especifica" and not condicion_pago_fecha_ancla:
                raise BusinessRuleError(
                    "fecha_ancla_requerida",
                    "Falta la fecha a partir de la cual se cuenta el plazo de pago.",
                )

        descuento_autorizado_por = None
        if precio_lista is not None and precio_total is not None and precio_total != precio_lista:
            if not descuento_motivo or not descuento_motivo.strip():
                raise BusinessRuleError(
                    "descuento_sin_motivo",
                    f"El precio cargado (${precio_total}) difiere del precio de lista "
                    f"(${precio_lista}) — hace falta un motivo para la diferencia",
                )
            descuento_autorizado_por = usuario_id

        # 6. Crear reserva (ya CONFIRMADA directamente)
        with self.db.begin_nested():
            reserva = Reserva(
                vehiculo_id=vehiculo_id,
                cliente_id=cliente_id,
                conductor_id=conductor_id,
                fecha_inicio=fecha_inicio,
                hora_inicio=hora_inicio,
                fecha_fin=fecha_fin,
                hora_fin=hora_fin,
                lugar_entrega=lugar_entrega,
                lugar_devolucion=lugar_devolucion,
                notas=notas,
                hora_devolucion_acordada=hora_dev,
                late_checkout=late_checkout,
                cargo_late_checkout=cargo_late_checkout,
                precio_total=precio_total,
                precio_lista=precio_lista,
                descuento_motivo=descuento_motivo,
                descuento_autorizado_por=descuento_autorizado_por,
                con_factura=con_factura,
                condicion_pago=condicion_pago,
                condicion_pago_ancla=condicion_pago_ancla if condicion_pago != "contado" else None,
                condicion_pago_fecha_ancla=condicion_pago_fecha_ancla if condicion_pago_ancla == "fecha_especifica" else None,
                tipo_factura=tipo_factura if con_factura else None,
                factura_a_nombre_de=factura_a_nombre_de if con_factura else None,
                echeq_banco=echeq_banco,
                echeq_numero_cheque=echeq_numero_cheque,
                echeq_fecha_cobro=echeq_fecha_cobro,
                tarifa_aplicada_id=tarifa_id,
                garantia_tipo=garantia_tipo,
                garantia_monto=garantia_monto,
                garantia_tarjeta_numero=garantia_tarjeta_numero,
                garantia_tarjeta_vencimiento=garantia_tarjeta_vencimiento,
                garantia_tarjeta_titular=garantia_tarjeta_titular,
                forma_pago_prevista=forma_pago_prevista,
                estado_pago=estado_pago,
                anticipo_monto=anticipo_monto,
                anticipo_fecha=anticipo_fecha,
                anticipo_medio_pago=anticipo_medio_pago,
                estado=EstadoReserva.CONFIRMADA.value,
                usuario_id=usuario_id,
            )
            self.reserva_repo.create(reserva)

            # Si el medio de pago (previsto, o el del anticipo ya cobrado) es
            # "echeq", se crea el Echeq vinculado a esta reserva — puede
            # quedar "pendiente de completar" (banco/número/fecha en None),
            # no es obligatorio cargarlo todo ahora. Sólo genera el crédito
            # en cuenta corriente si hubo un cobro real ya hecho (anticipo o
            # pagado) — si es sólo la forma de pago prevista a futuro, el
            # echeq queda como borrador sin mover el saldo todavía.
            hubo_cobro_ahora = estado_pago != "pendiente"
            es_echeq = forma_pago_prevista == "echeq" or (hubo_cobro_ahora and anticipo_medio_pago == "echeq")
            if es_echeq:
                monto_echeq = anticipo_monto if (hubo_cobro_ahora and anticipo_monto) else precio_total
                if monto_echeq:
                    self.echeq_service.crear_recibido(
                        cliente_id=cliente_id,
                        contraparte=cliente.nombre_completo,
                        monto=Decimal(str(monto_echeq)),
                        fecha_emision=anticipo_fecha if (hubo_cobro_ahora and anticipo_fecha) else date.today(),
                        creado_por=usuario_id,
                        banco=echeq_banco,
                        numero_cheque=echeq_numero_cheque,
                        fecha_cobro=echeq_fecha_cobro,
                        reserva_id=reserva.id,
                        generar_credito=hubo_cobro_ahora,
                    )

            # Adicionales contratados (coberturas y extras). Van fuera de
            # precio_total: se suman recién al facturar, igual que
            # cargo_late_checkout. Ver Reserva.total_adicionales.
            self.sincronizar_adicionales(reserva, adicionales)

            # Actualizar estado del vehículo a reservado si corresponde
            nuevo_estado = estado_tras_confirmar_reserva(
                EstadoVehiculo(vehiculo.estado)
            )
            if nuevo_estado.value != vehiculo.estado:
                vehiculo.estado = nuevo_estado.value

        self.db.refresh(reserva)
        return reserva, warnings

    # ── Actualizar reserva (solo pendiente) ───────────────────────────────────

    def update(
        self,
        id: int,
        usuario_id: int,
        vehiculo_id: int | None = None,
        conductor_id: int | None = None,
        fecha_inicio: date | None = None,
        hora_inicio: time | None = None,
        fecha_fin: date | None = None,
        hora_fin: time | None = None,
        lugar_entrega: str | None = None,
        lugar_devolucion: str | None = None,
        notas: str | None = None,
        precio_total: Decimal | None = None,
        # Pago
        forma_pago_prevista: str | None = None,
        estado_pago: str | None = None,
        anticipo_monto: Decimal | None = None,
        anticipo_fecha: date | None = None,
        anticipo_medio_pago: str | None = None,
        adicionales: list[tuple[int, int]] | None = None,
    ) -> tuple[Reserva, list[dict]]:
        """Actualiza una reserva en estado pendiente, confirmada, activa o vencida (D8).

        Activa/vencida se permiten porque después del checkout el operador
        sigue necesitando editar (agregar una nota, ajustar el lugar de
        devolución, etc.) — igual que `AlquilerService.extender()` ya permite
        esos dos estados por la misma razón."""
        reserva = self.get(id)

        ESTADOS_EDITABLES = (
            EstadoReserva.PENDIENTE.value,
            EstadoReserva.CONFIRMADA.value,
            EstadoReserva.ACTIVA.value,
            EstadoReserva.VENCIDA.value,
        )
        if reserva.estado not in ESTADOS_EDITABLES:
            raise ConflictError(f"estado_invalido|No se puede modificar una reserva en estado '{reserva.estado}'")

        # Si es confirmada, no se puede cambiar cliente
        # (vehiculo_id y fechas sí, según D8)

        if conductor_id is not None:
            self._validar_conductor(conductor_id, reserva.cliente_id)

        # Usar valores actuales si no se proveen
        v_id = vehiculo_id or reserva.vehiculo_id
        f_inicio = fecha_inicio or reserva.fecha_inicio
        h_inicio = hora_inicio or reserva.hora_inicio
        f_fin = fecha_fin or reserva.fecha_fin
        h_fin = hora_fin or reserva.hora_fin

        inicio_dt = datetime.combine(f_inicio, h_inicio)
        fin_dt = datetime.combine(f_fin, h_fin)

        if inicio_dt >= fin_dt:
            raise BusinessRuleError("fechas_invalidas", "La fecha de fin debe ser posterior a la de inicio")

        # Re-verificar solapamiento con el nuevo rango/vehículo
        ventanas = self._cargar_ventanas(v_id)
        resultado = detectar_solapamientos(v_id, inicio_dt, fin_dt, ventanas, excluir_id=id)

        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|Conflicto en el nuevo rango|{conflicto.id}|{conflicto.estado}"
            )

        warnings = [
            {"tipo": "solape_con_pendiente", "reserva_id": v.id}
            for v in resultado.conflictos_advertencia
        ]

        with self.db.begin_nested():
            kwargs = {}
            if vehiculo_id is not None:
                kwargs["vehiculo_id"] = vehiculo_id
            if conductor_id is not None:
                kwargs["conductor_id"] = conductor_id
            if fecha_inicio is not None:
                kwargs["fecha_inicio"] = fecha_inicio
            if hora_inicio is not None:
                kwargs["hora_inicio"] = hora_inicio
            if fecha_fin is not None:
                kwargs["fecha_fin"] = fecha_fin
            if hora_fin is not None:
                kwargs["hora_fin"] = hora_fin
            if lugar_entrega is not None:
                kwargs["lugar_entrega"] = lugar_entrega
            if lugar_devolucion is not None:
                kwargs["lugar_devolucion"] = lugar_devolucion
            if notas is not None:
                kwargs["notas"] = notas
            if precio_total is not None:
                kwargs["precio_total"] = precio_total
            if forma_pago_prevista is not None:
                kwargs["forma_pago_prevista"] = forma_pago_prevista
            if estado_pago is not None:
                kwargs["estado_pago"] = estado_pago
            if anticipo_monto is not None:
                kwargs["anticipo_monto"] = anticipo_monto
            if anticipo_fecha is not None:
                kwargs["anticipo_fecha"] = anticipo_fecha
            if anticipo_medio_pago is not None:
                kwargs["anticipo_medio_pago"] = anticipo_medio_pago
            self.reserva_repo.update(reserva, **kwargs)

            # Los adicionales se sincronizan después de aplicar las fechas
            # nuevas: si la reserva se alargó, los que se cobran por día
            # tienen que rendir la duración nueva, no la vieja.
            self.sincronizar_adicionales(reserva, adicionales)
            if (fecha_inicio is not None or fecha_fin is not None) and reserva.adicionales:
                self.recalcular_adicionales_por_duracion(reserva)

        self.db.refresh(reserva)
        return reserva, warnings

    # ── Confirmar reserva ─────────────────────────────────────────────────────

    def confirmar(self, id: int, usuario_id: int) -> Reserva:
        """
        Confirma una reserva pendiente.
        Re-verifica solapamientos (puede haber cambiado desde el create).
        Actualiza estado del vehículo si corresponde.
        """
        reserva = self.get(id)
        if reserva.estado != EstadoReserva.PENDIENTE.value:
            raise ConflictError(f"estado_invalido|Solo se pueden confirmar reservas pendientes (estado actual: {reserva.estado})")

        # Re-verificar solapamiento al momento de confirmar
        inicio_dt = datetime.combine(reserva.fecha_inicio, reserva.hora_inicio)
        fin_dt = datetime.combine(reserva.fecha_fin, reserva.hora_fin)
        ventanas = self._cargar_ventanas(reserva.vehiculo_id)
        resultado = detectar_solapamientos(
            reserva.vehiculo_id, inicio_dt, fin_dt, ventanas, excluir_id=id
        )
        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|No se puede confirmar: hay una reserva {conflicto.estado} solapada|{conflicto.id}"
            )

        # Usar el precio manual si existe, sino calcularlo
        if reserva.precio_total is not None:
            precio = reserva.precio_total
            tarifa_id = reserva.tarifa_aplicada_id
        else:
            # Calcular tarifa y precio total
            duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
            tarifas_info, categoria_id = self._cargar_tarifas_info(reserva.vehiculo_id)
            try:
                tarifa = seleccionar_tarifa(duracion, tarifas_info, categoria_id)
                precio = calcular_precio_total(duracion, tarifa)
                tarifa_id = tarifa.id
            except BusinessRuleError:
                # Si no hay tarifa configurada, igualmente se confirma pero sin precio
                tarifa_id = None
                precio = None

        # Marcar otras reservas pendientes solapadas como bloqueadas_por_solape
        for v in resultado.conflictos_advertencia:
            reserva_pendiente = self.reserva_repo.get(v.id)
            if reserva_pendiente:
                self.reserva_repo.update(reserva_pendiente, bloqueada_por_solape=True)

        with self.db.begin_nested():
            # Cambiar estado de la reserva
            self.reserva_repo.update(
                reserva,
                estado=EstadoReserva.CONFIRMADA.value,
                tarifa_aplicada_id=tarifa_id,
                precio_total=precio,
            )
            # Actualizar estado del vehículo
            vehiculo = reserva.vehiculo
            nuevo_estado = estado_tras_confirmar_reserva(
                EstadoVehiculo(vehiculo.estado)
            )
            if nuevo_estado.value != vehiculo.estado:
                vehiculo.estado = nuevo_estado.value

        self.db.refresh(reserva)
        return reserva

    # ── Cancelar reserva ──────────────────────────────────────────────────────

    def cancelar(self, id: int, usuario_id: int, motivo: str) -> Reserva:
        """
        Cancela una reserva pendiente o confirmada.

        D-11: la seña (anticipo) no se devuelve — si había una cargada, se
        registra como ingreso (débito por cancelación + crédito por lo ya
        cobrado, que se cancelan entre sí en el saldo pero quedan en el
        historial de la cuenta corriente). Motivo obligatorio.
        """
        reserva = self.get(id)
        if reserva.estado not in (EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value):
            raise ConflictError(f"estado_invalido|No se puede cancelar una reserva en estado '{reserva.estado}'")
        if not motivo or not motivo.strip():
            raise BusinessRuleError("motivo_requerido", "Cancelar una reserva requiere un motivo")

        era_confirmada = reserva.estado == EstadoReserva.CONFIRMADA.value

        with self.db.begin_nested():
            if reserva.anticipo_monto and reserva.anticipo_monto > 0:
                fecha_hoy = date.today()
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    concepto=f"Cancelación de reserva #{reserva.id} — seña retenida (no reembolsable)",
                    monto=reserva.anticipo_monto,
                    fecha=fecha_hoy,
                    creado_por=usuario_id,
                    reserva_id=reserva.id,
                )
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    concepto=f"Seña ya abonada — reserva #{reserva.id} ({reserva.anticipo_medio_pago or 'medio no especificado'})",
                    monto=reserva.anticipo_monto,
                    fecha=reserva.anticipo_fecha or fecha_hoy,
                    creado_por=usuario_id,
                    reserva_id=reserva.id,
                )

            self.reserva_repo.update(reserva, estado=EstadoReserva.CANCELADA.value, motivo_cancelacion=motivo)

            # Actualizar estado del vehículo si era confirmada
            if era_confirmada:
                otras = self.reserva_repo.count_confirmadas_activas(
                    reserva.vehiculo_id, excluir_id=id
                )
                vehiculo = reserva.vehiculo
                nuevo_estado = estado_tras_cancelar_reserva_confirmada(
                    EstadoVehiculo(vehiculo.estado),
                    tiene_otras_reservas_confirmadas=(otras > 0),
                )
                if nuevo_estado.value != vehiculo.estado:
                    vehiculo.estado = nuevo_estado.value

        self.db.refresh(reserva)
        return reserva

    # ── Inactivación de vehículo con reservas (D4) ────────────────────────────

    def get_reservas_afectadas_por_inactivacion(self, vehiculo_id: int) -> list[Reserva]:
        """Dry-run: lista reservas que se verían afectadas por inactivar el vehículo."""
        return self.reserva_repo.find_activas_para_vehiculo(vehiculo_id)

    def reasignar(self, reserva_id: int, nuevo_vehiculo_id: int, usuario_id: int) -> tuple[Reserva, list[dict]]:
        """
        Reasigna una reserva a otro vehículo (D4).
        Solo para reservas pendientes o confirmadas.
        Re-verifica solapamientos en el vehículo destino.
        """
        reserva = self.get(reserva_id)
        if reserva.estado not in (EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value):
            raise ConflictError(f"estado_invalido|No se puede reasignar una reserva en estado '{reserva.estado}'")

        nuevo_vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == nuevo_vehiculo_id).first()
        if not nuevo_vehiculo or not nuevo_vehiculo.activo:
            raise NotFoundError("Vehículo destino", nuevo_vehiculo_id)

        inicio_dt = datetime.combine(reserva.fecha_inicio, reserva.hora_inicio)
        fin_dt = datetime.combine(reserva.fecha_fin, reserva.hora_fin)
        ventanas = self._cargar_ventanas(nuevo_vehiculo_id)
        resultado = detectar_solapamientos(nuevo_vehiculo_id, inicio_dt, fin_dt, ventanas)

        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|Conflicto en vehículo destino|{conflicto.id}|{conflicto.estado}"
            )

        warnings = [
            {"tipo": "solape_con_pendiente", "reserva_id": v.id}
            for v in resultado.conflictos_advertencia
        ]

        with self.db.begin_nested():
            self.reserva_repo.update(reserva, vehiculo_id=nuevo_vehiculo_id)

        self.db.refresh(reserva)
        return reserva, warnings

    def get_reservas_a_reasignar(self) -> list[Reserva]:
        """Vista D4: reservas de vehículos inactivos que necesitan reasignación."""
        return self.reserva_repo.find_a_reasignar()

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _cargar_ventanas(self, vehiculo_id: int) -> list[VentanaReserva]:
        """Carga ventanas de reservas existentes para el vehículo."""
        reservas = self.reserva_repo.list(vehiculo_id=vehiculo_id, page=1, page_size=9999)[0]
        ventanas = []
        for r in reservas:
            # "vencida" ocupa el vehículo tanto como "activa": el auto sigue afuera.
            if r.estado in ("pendiente", "confirmada", "activa", "vencida"):
                ventanas.append(
                    VentanaReserva(
                        id=r.id,
                        vehiculo_id=r.vehiculo_id,
                        inicio=datetime.combine(r.fecha_inicio, r.hora_inicio),
                        fin=datetime.combine(r.fecha_fin, r.hora_fin),
                        estado=r.estado,
                        cliente_nombre=r.cliente.nombre_completo if r.cliente else "",
                    )
                )
        return ventanas

    def _cargar_tarifas_info(self, vehiculo_id: int) -> tuple[list[TarifaInfo], int | None]:
        """Carga las tarifas activas relevantes para el vehículo: las suyas
        específicas, las de su categoría (si tiene una asignada), y las
        generales. Devuelve (tarifas, categoria_id_del_vehiculo)."""
        vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
        categoria_id = vehiculo.categoria_id if vehiculo else None

        tarifas = (
            self.db.query(Tarifa)
            .filter(
                Tarifa.activo == True,
                (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None)),
            )
            .all()
        )
        from app.domain.enums import TipoTarifa
        tarifas_info = [
            TarifaInfo(
                id=t.id,
                tipo=TipoTarifa(t.tipo),
                monto=Decimal(str(t.monto)),
                vehiculo_id=t.vehiculo_id,
                categoria_id=t.categoria_id,
            )
            for t in tarifas
        ]
        return tarifas_info, categoria_id
