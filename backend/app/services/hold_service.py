from __future__ import annotations
"""
HoldService — toma, libera y consume el cupo reservado (ítem 61).

**La verificación y la toma tienen que ser una sola operación.** Si se
consulta el cupo y después se inserta el hold en dos pasos separados, dos
requests simultáneos pueden ver "queda 1" al mismo tiempo y tomar los dos. Por
eso `crear()` bloquea la fila de la categoría antes de contar
(`SELECT ... FOR UPDATE`): es la diferencia entre una web que sobrevende y una
que no.
"""
import secrets
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models.categoria import Categoria
from app.models.hold import Hold
from app.services.disponibilidad_service import DisponibilidadService

# Ventana por defecto. Vive en `configuracion` para poder ajustarla sin
# deploy: cuánto tarda realmente un cliente en pagar sólo se sabe midiendo.
CLAVE_MINUTOS = "web.hold_minutos"
MINUTOS_DEFAULT = 20


class HoldService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _minutos(self) -> int:
        from app.services.configuracion_service import ConfiguracionService

        return ConfiguracionService(self.db).get_int(CLAVE_MINUTOS, MINUTOS_DEFAULT)

    def crear(
        self,
        categoria_id: int,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
    ) -> Hold:
        categoria = self.db.get(Categoria, categoria_id)
        if categoria is None or not categoria.activo:
            raise NotFoundError("Categoría", categoria_id)

        # Bloqueo pesimista sobre la categoría: serializa a los que compiten
        # por el mismo cupo sin frenar al resto de la flota.
        self.db.execute(
            select(Categoria.id).where(Categoria.id == categoria_id).with_for_update()
        )

        cupos = DisponibilidadService(self.db).consultar(
            fecha_inicio, hora_inicio, fecha_fin, hora_fin, categoria_ids=[categoria_id]
        )
        disponible = next(
            (c["disponibles"] for c in cupos if c["categoria_id"] == categoria_id), 0
        )
        if disponible < 1:
            raise BusinessRuleError(
                "sin_cupo",
                f"No quedan unidades de {categoria.nombre} para esas fechas",
            )

        hold = Hold(
            token=secrets.token_urlsafe(32),
            categoria_id=categoria_id,
            fecha_inicio=fecha_inicio,
            hora_inicio=hora_inicio,
            fecha_fin=fecha_fin,
            hora_fin=hora_fin,
            expira_en=datetime.utcnow() + timedelta(minutes=self._minutos()),
        )
        self.db.add(hold)
        self.db.flush()
        return hold

    def get_por_token(self, token: str) -> Hold:
        hold = self.db.query(Hold).filter(Hold.token == token).first()
        if not hold:
            raise NotFoundError("Hold", token)
        return hold

    def vigente_o_error(self, token: str) -> Hold:
        hold = self.get_por_token(token)
        if not hold.vigente:
            raise BusinessRuleError(
                "hold_expirado",
                "Se venció el tiempo para completar la reserva. Volvé a elegir el vehículo.",
            )
        return hold

    def extender(self, token: str) -> Hold:
        """
        Renueva la ventana. Se ofrece cuando faltan pocos minutos: es preferible
        darle más tiempo a alguien que está pagando que dejar caer el hold y
        perder la venta.

        Sólo extiende un hold **vigente** — uno vencido ya liberó el cupo y
        alguien más pudo haberlo tomado; revivirlo sería sobrevender.
        """
        hold = self.vigente_o_error(token)
        hold.expira_en = datetime.utcnow() + timedelta(minutes=self._minutos())
        self.db.flush()
        return hold

    def liberar(self, token: str) -> Hold:
        hold = self.get_por_token(token)
        if hold.estado == "vigente":
            hold.estado = "liberado"
            self.db.flush()
        return hold

    def consumir(self, token: str, reserva_id: int) -> Hold:
        """El hold cumplió su función: la reserva existe."""
        hold = self.vigente_o_error(token)
        hold.estado = "consumido"
        hold.reserva_id = reserva_id
        self.db.flush()
        return hold

    def limpiar_vencidos(self, dias: int = 30) -> int:
        """
        Housekeeping, no correctitud: un hold vencido **ya dejó de ocupar** el
        cupo en el mismo instante en que expiró, porque la disponibilidad
        compara contra `expira_en`. Esto sólo evita que la tabla crezca sin
        límite.
        """
        limite = datetime.utcnow() - timedelta(days=dias)
        borrados = (
            self.db.query(Hold)
            .filter(Hold.expira_en < limite, Hold.estado != "consumido")
            .delete(synchronize_session=False)
        )
        self.db.flush()
        return borrados
