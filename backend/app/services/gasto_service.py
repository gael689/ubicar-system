"""
Service de Gastos del vehículo.

Regla específica: cuando el gasto es tipo='service' y trae km_al_momento, el
vehículo se actualiza:
- km_actual = max(km_actual, km_al_momento)
- km_proximo_service = km_al_momento + vehiculo.km_entre_services

Doc F1 sección B1.6: gastos en F1 son borrado físico (no entidad auditada).
"""
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.gasto import Gasto
from app.models.vehiculo import Vehiculo
from app.repositories.gasto_repo import GastoRepository
from app.repositories.vehiculo_repo import VehiculoRepository
from app.schemas.gasto import GastoCreate, GastoUpdate


class GastoService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = GastoRepository(db)
        self.vehiculo_repo = VehiculoRepository(db)

    def list(
        self,
        vehiculo_id: int,
        *,
        tipo: str | None = None,
        fecha_desde: str | None = None,
        fecha_hasta: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Gasto], int]:
        if self.vehiculo_repo.get(vehiculo_id) is None:
            raise NotFoundError("Vehículo", vehiculo_id)
        return self.repo.list_by_vehiculo(
            vehiculo_id,
            tipo=tipo, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
            skip=(page - 1) * page_size, limit=page_size,
        )

    def get(self, gasto_id: int) -> Gasto:
        gasto = self.repo.get(gasto_id)
        if gasto is None:
            raise NotFoundError("Gasto", gasto_id)
        return gasto

    def create_for_vehiculo(self, vehiculo_id: int, payload: GastoCreate) -> Gasto:
        vehiculo = self.vehiculo_repo.get(vehiculo_id)
        if vehiculo is None:
            raise NotFoundError("Vehículo", vehiculo_id)

        gasto = Gasto(
            vehiculo_id=vehiculo_id,
            tipo=payload.tipo,
            descripcion=payload.descripcion,
            monto=payload.monto,
            medio_pago=payload.medio_pago,
            fecha=payload.fecha.isoformat(),
            proveedor=payload.proveedor,
            km_al_momento=payload.km_al_momento,
            notas=payload.notas,
        )
        self.repo.create(gasto)
        self._apply_service_side_effects(vehiculo, gasto)
        self.db.commit()
        self.db.refresh(gasto)
        return gasto

    def update(self, gasto_id: int, payload: GastoUpdate) -> Gasto:
        gasto = self.get(gasto_id)
        cambios = payload.model_dump(exclude_unset=True)
        for field, value in cambios.items():
            if field == "fecha" and value is not None:
                value = value.isoformat()
            setattr(gasto, field, value)

        # Si quedó como service con km, re-evaluar (idempotente).
        if gasto.tipo == "service" and gasto.km_al_momento:
            vehiculo = self.vehiculo_repo.get(gasto.vehiculo_id)
            if vehiculo is not None:
                self._apply_service_side_effects(vehiculo, gasto)

        self.db.commit()
        self.db.refresh(gasto)
        return gasto

    def delete(self, gasto_id: int) -> None:
        """Borrado físico autorizado para gastos en F1 (no es entidad auditada)."""
        gasto = self.get(gasto_id)
        self.repo.delete(gasto)
        self.db.commit()

    @staticmethod
    def _apply_service_side_effects(vehiculo: Vehiculo, gasto: Gasto) -> None:
        if gasto.tipo != "service" or not gasto.km_al_momento:
            return
        if gasto.km_al_momento > vehiculo.km_actual:
            vehiculo.km_actual = gasto.km_al_momento
        vehiculo.km_proximo_service = gasto.km_al_momento + vehiculo.km_entre_services
