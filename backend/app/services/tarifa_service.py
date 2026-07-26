"""
Service de Tarifas.

Regla central: solo una tarifa `activa` por (vehiculo, tipo). Crear una nueva del
mismo tipo desactiva automáticamente la anterior (que queda como histórico).
"""
from datetime import date

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.tarifa import Tarifa
from app.repositories.tarifa_repo import TarifaRepository
from app.repositories.vehiculo_repo import VehiculoRepository
from app.schemas.tarifa import TarifaCreate, TarifaUpdate


class TarifaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TarifaRepository(db)
        self.vehiculo_repo = VehiculoRepository(db)

    def list(self, vehiculo_id: int, incluir_inactivas: bool = False) -> list[Tarifa]:
        if self.vehiculo_repo.get(vehiculo_id) is None:
            raise NotFoundError("Vehículo", vehiculo_id)
        return self.repo.list_by_vehiculo(vehiculo_id, incluir_inactivas=incluir_inactivas)

    def get(self, tarifa_id: int) -> Tarifa:
        tarifa = self.repo.get(tarifa_id)
        if tarifa is None:
            raise NotFoundError("Tarifa", tarifa_id)
        return tarifa

    def create_for_vehiculo(self, vehiculo_id: int, payload: TarifaCreate) -> Tarifa:
        if self.vehiculo_repo.get(vehiculo_id) is None:
            raise NotFoundError("Vehículo", vehiculo_id)

        # Desactiva la activa del mismo tipo si existe (histórico).
        anterior = self.repo.get_activa_por_tipo(vehiculo_id, payload.tipo)
        if anterior is not None:
            anterior.activo = False

        tarifa = Tarifa(
            vehiculo_id=vehiculo_id,
            tipo=payload.tipo,
            monto=payload.monto,
            activo=True,
            vigencia_desde=payload.vigencia_desde or date.today(),
        )
        self.repo.create(tarifa)
        self.db.commit()
        self.db.refresh(tarifa)
        return tarifa

    def update(self, tarifa_id: int, payload: TarifaUpdate) -> Tarifa:
        tarifa = self.get(tarifa_id)
        cambios = payload.model_dump(exclude_unset=True)
        for field, value in cambios.items():
            setattr(tarifa, field, value)
        self.db.commit()
        self.db.refresh(tarifa)
        return tarifa

    def deactivate(self, tarifa_id: int) -> Tarifa:
        """Baja lógica. NUNCA borra."""
        tarifa = self.get(tarifa_id)
        tarifa.activo = False
        self.db.commit()
        self.db.refresh(tarifa)
        return tarifa
