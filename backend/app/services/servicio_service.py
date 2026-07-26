from sqlalchemy.orm import Session
from app.models.servicio import Servicio
from app.models.vehiculo import Vehiculo
from app.repositories.servicio_repo import ServicioRepo
from app.schemas.servicio import ServicioCreate, ServicioResponse, ServicioUpdate
from app.core.exceptions import NotFoundError


class ServicioService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ServicioRepo(db)

    def _get_vehiculo(self, vehiculo_id: int) -> Vehiculo:
        v = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id, Vehiculo.activo == True).first()
        if not v:
            raise NotFoundError("vehiculo", vehiculo_id)
        return v

    def list(self, vehiculo_id: int) -> list[Servicio]:
        self._get_vehiculo(vehiculo_id)
        return self.repo.list(vehiculo_id)

    def create(self, vehiculo_id: int, payload: ServicioCreate) -> Servicio:
        vehiculo = self._get_vehiculo(vehiculo_id)
        data = payload.model_dump()
        s = self.repo.create(vehiculo_id, **data)

        # Auto-actualizar km_proximo_service si se indica proximo_km
        if payload.proximo_km is not None:
            vehiculo.km_proximo_service = payload.proximo_km
        elif vehiculo.km_entre_services > 0:
            vehiculo.km_proximo_service = payload.km_realizado + vehiculo.km_entre_services

        self.db.commit()
        self.db.refresh(s)
        return s

    def update(self, servicio_id: int, payload: ServicioUpdate) -> Servicio:
        s = self.repo.get(servicio_id)
        if not s:
            raise NotFoundError("servicio", servicio_id)

        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        s = self.repo.update(s, **data)

        # Si se actualiza proximo_km, sincronizar en vehículo
        if payload.proximo_km is not None:
            vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == s.vehiculo_id).first()
            if vehiculo:
                vehiculo.km_proximo_service = payload.proximo_km

        self.db.commit()
        self.db.refresh(s)
        return s

    def delete(self, servicio_id: int) -> Servicio:
        s = self.repo.get(servicio_id)
        if not s:
            raise NotFoundError("servicio", servicio_id)
        s = self.repo.deactivate(s)
        self.db.commit()
        return s

    def to_response(self, s: Servicio) -> ServicioResponse:
        return ServicioResponse.model_validate(s)
