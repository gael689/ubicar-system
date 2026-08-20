"""
Repositorio de Reservas.
Encapsula todas las queries a la tabla reservas.
"""
from __future__ import annotations

from datetime import datetime, date, time
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from app.models.reserva import Reserva
from app.models.alquiler import Alquiler
from app.domain.enums import EstadoReserva


class ReservaRepo:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Lectura básica ────────────────────────────────────────────────────────

    def get(self, id: int) -> Reserva | None:
        return (
            self.db.query(Reserva)
            .options(
                joinedload(Reserva.vehiculo),
                joinedload(Reserva.cliente),
                joinedload(Reserva.usuario),
            )
            .filter(Reserva.id == id)
            .first()
        )

    def list(
        self,
        estado: str | None = None,
        vehiculo_id: int | None = None,
        cliente_id: int | None = None,
        q: str | None = None,
        fecha: date | None = None,
        origen: str | None = None,
        categoria_id: int | None = None,
        contrato: str | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Reserva], int]:
        from app.models.cliente import Cliente
        from app.models.vehiculo import Vehiculo

        query = self.db.query(Reserva).options(
            joinedload(Reserva.vehiculo),
            joinedload(Reserva.cliente),
        )
        if estado:
            # Multivalor: la pantalla de reservas se mira casi siempre como
            # "lo que está vivo" (pendiente + confirmada + activa), no de a un
            # estado por vez.
            estados = [e.strip() for e in estado.split(",") if e.strip()]
            query = query.filter(Reserva.estado.in_(estados))
        if origen:
            query = query.filter(Reserva.origen.in_([o.strip() for o in origen.split(",") if o.strip()]))
        if categoria_id:
            query = query.filter(Reserva.categoria_id == categoria_id)
        if contrato:
            # `contrato_estado` es una propiedad derivada, no una columna: se
            # traduce a un EXISTS sobre contratos para no traer todas las
            # reservas a Python y filtrarlas después (con la paginación eso
            # daría páginas de tamaños distintos).
            from sqlalchemy import exists
            from app.models.contrato import Contrato

            tiene = exists().where(
                Contrato.reserva_id == Reserva.id,
                Contrato.anulado.is_(False),
                Contrato.activo.is_(True),
            )
            if contrato == "sin_emitir":
                # Sólo las que de verdad necesitan uno: una cancelada no.
                query = query.filter(
                    ~tiene,
                    Reserva.estado.in_(["pendiente", "confirmada", "activa", "vencida", "finalizada"]),
                )
            elif contrato == "emitido":
                query = query.filter(tiene)
            elif contrato == "sin_firmar":
                query = query.filter(
                    exists().where(
                        Contrato.reserva_id == Reserva.id,
                        Contrato.anulado.is_(False),
                        Contrato.activo.is_(True),
                        Contrato.firmado.is_(False),
                    )
                )
        if fecha_desde:
            query = query.filter(Reserva.fecha_fin >= fecha_desde)
        if fecha_hasta:
            query = query.filter(Reserva.fecha_inicio <= fecha_hasta)
        if vehiculo_id:
            query = query.filter(Reserva.vehiculo_id == vehiculo_id)
        if cliente_id:
            query = query.filter(Reserva.cliente_id == cliente_id)
        if fecha:
            query = query.filter(Reserva.fecha_inicio <= fecha, Reserva.fecha_fin >= fecha)
        if q:
            term = f"%{q.strip()}%"
            query = (
                query
                .join(Reserva.cliente)
                .filter(
                    or_(
                        Cliente.nombre_completo.ilike(term),
                        Cliente.dni_cuit.ilike(term),
                    )
                )
            )
        total = query.count()
        items = (
            query.order_by(Reserva.fecha_inicio.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total

    # ── Escritura ─────────────────────────────────────────────────────────────

    def create(self, reserva: Reserva) -> Reserva:
        self.db.add(reserva)
        self.db.flush()  # obtiene ID sin commit
        self.db.refresh(reserva)
        return reserva

    def update(self, reserva: Reserva, **kwargs) -> Reserva:
        for field, value in kwargs.items():
            setattr(reserva, field, value)
        self.db.flush()
        self.db.refresh(reserva)
        return reserva

    # ── Queries de solapamiento ───────────────────────────────────────────────

    def find_solapadas(
        self,
        vehiculo_id: int,
        inicio: datetime,
        fin: datetime,
        estados: list[str] | None = None,
        excluir_id: int | None = None,
    ) -> list[Reserva]:
        """
        Busca reservas que solapan con la ventana [inicio, fin).
        
        La condición de solapamiento es: inicio_reserva < fin AND fin_reserva > inicio.
        Ventanas adyacentes (fin_a == inicio_b) NO solapan.
        
        Args:
            estados: si se provee, filtra por esos estados. Default: confirmada + activa.
            excluir_id: ID a excluir (para edición de reservas existentes).
        """
        if estados is None:
            estados = [EstadoReserva.CONFIRMADA.value, EstadoReserva.ACTIVA.value]

        # Construimos el datetime combinando fecha + hora para comparar
        q = (
            self.db.query(Reserva)
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Reserva.estado.in_(estados),
                # inicio_reserva < fin (propuesta)  AND  fin_reserva > inicio (propuesta)
                # Usamos la representación como datetime para comparar correctamente
                and_(
                    # fecha_inicio + hora_inicio < fin (propuesta)
                    Reserva.fecha_inicio < fin.date(),
                    # fecha_fin + hora_fin > inicio (propuesta)
                    Reserva.fecha_fin > inicio.date(),
                ),
            )
        )
        if excluir_id is not None:
            q = q.filter(Reserva.id != excluir_id)

        return q.all()

    def find_proxima_confirmada(
        self,
        vehiculo_id: int,
        desde: datetime,
        dentro_de_horas: float = 4.0,
    ) -> Reserva | None:
        """
        Busca la próxima reserva confirmada del vehículo que empieza
        dentro de las próximas N horas desde `desde`.
        Usado por el checkin para determinar si el vehículo va a en_transicion.
        """
        from datetime import timedelta
        hasta = desde + timedelta(hours=dentro_de_horas)
        return (
            self.db.query(Reserva)
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Reserva.estado == EstadoReserva.CONFIRMADA.value,
                Reserva.fecha_inicio >= desde.date(),
                Reserva.fecha_inicio < hasta.date(),
            )
            .order_by(Reserva.fecha_inicio)
            .first()
        )

    def count_confirmadas_activas(
        self,
        vehiculo_id: int,
        excluir_id: int | None = None,
    ) -> int:
        """
        Cuenta las reservas confirmadas o activas del vehículo.
        Usado para decidir si el vehículo vuelve a disponible al cancelar.
        """
        q = self.db.query(Reserva).filter(
            Reserva.vehiculo_id == vehiculo_id,
            Reserva.estado.in_([
                EstadoReserva.CONFIRMADA.value,
                EstadoReserva.ACTIVA.value,
                EstadoReserva.VENCIDA.value,
            ]),
        )
        if excluir_id is not None:
            q = q.filter(Reserva.id != excluir_id)
        return q.count()

    def find_activas_para_vehiculo(self, vehiculo_id: int) -> list[Reserva]:
        """
        Reservas pendientes, confirmadas, activas y vencidas de un vehículo.
        Usado en D4 (inactivación de vehículo).
        """
        return (
            self.db.query(Reserva)
            .options(joinedload(Reserva.cliente))
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Reserva.estado.in_([
                    EstadoReserva.PENDIENTE.value,
                    EstadoReserva.CONFIRMADA.value,
                    EstadoReserva.ACTIVA.value,
                    EstadoReserva.VENCIDA.value,
                ]),
            )
            .order_by(Reserva.fecha_inicio)
            .all()
        )

    def find_a_reasignar(self) -> list[Reserva]:
        """
        Reservas de vehículos inactivos que deben reasignarse.
        Vista D4 "Reservas a reasignar".
        """
        from app.models.vehiculo import Vehiculo
        return (
            self.db.query(Reserva)
            .join(Reserva.vehiculo)
            .options(
                joinedload(Reserva.vehiculo),
                joinedload(Reserva.cliente),
            )
            .filter(
                Vehiculo.activo == False,
                Reserva.estado.in_([
                    EstadoReserva.PENDIENTE.value,
                    EstadoReserva.CONFIRMADA.value,
                    EstadoReserva.ACTIVA.value,
                    EstadoReserva.VENCIDA.value,
                ]),
            )
            .all()
        )

    def find_para_ocupacion(
        self,
        fecha_inicio: date,
        fecha_fin: date,
        vehiculo_ids: list[int] | None = None,
    ) -> list[Reserva]:
        """
        Query para el endpoint /ocupacion (calendario).

        **Plan de conexión (13/08), cierra C-1.** Antes filtraba
        `Reserva.vehiculo_id.in_(vehiculo_ids)` a secas: un `IN` nunca
        matchea `NULL`, así que toda reserva por categoría —sin auto
        asignado todavía— quedaba fuera del calendario sin importar su
        estado. Con `or_(..., vehiculo_id.is_(None))` esas reservas se traen
        igual; es el router (`routers/ocupacion.py`) el que las separa en un
        panel aparte, porque sin auto no hay fila de vehículo donde
        dibujarlas.

        También suma los tres estados de la reserva web
        (`pendiente_pago`/`sin_disponibilidad`/`revision_sin_cupo`), que
        antes quedaban explícitamente afuera. Esto es sólo para **mostrarlas**
        — esta query no alimenta ningún cálculo de cupo (eso vive aparte, en
        `DisponibilidadService`), así que ampliar los estados acá no cambia
        qué se puede vender, sólo qué se ve.
        """
        q = (
            self.db.query(Reserva)
            .options(
                joinedload(Reserva.vehiculo),
                joinedload(Reserva.cliente),
                joinedload(Reserva.categoria),
                joinedload(Reserva.alquiler),
                # El calendario muestra quién cargó la reserva (canal visible,
                # Fase 1). Sin este joinedload sería una consulta por fila:
                # el timeline trae 120 días de eventos de golpe.
                joinedload(Reserva.usuario),
            )
            .filter(
                Reserva.fecha_inicio < fecha_fin,
                Reserva.fecha_fin > fecha_inicio,
                Reserva.estado.in_([
                    EstadoReserva.PENDIENTE.value,
                    EstadoReserva.CONFIRMADA.value,
                    EstadoReserva.ACTIVA.value,
                    EstadoReserva.VENCIDA.value,
                    EstadoReserva.FINALIZADA.value,
                    EstadoReserva.PENDIENTE_PAGO.value,
                    EstadoReserva.SIN_DISPONIBILIDAD.value,
                    EstadoReserva.REVISION_SIN_CUPO.value,
                ]),
            )
        )
        if vehiculo_ids:
            q = q.filter(or_(Reserva.vehiculo_id.in_(vehiculo_ids), Reserva.vehiculo_id.is_(None)))
        return q.all()
