from sqlalchemy.orm import Session
from app.models.servicio import Servicio


class ServicioRepo:
    def __init__(self, db: Session):
        self.db = db

    def list(self, vehiculo_id: int, solo_activos: bool = True) -> list[Servicio]:
        q = self.db.query(Servicio).filter(Servicio.vehiculo_id == vehiculo_id)
        if solo_activos:
            q = q.filter(Servicio.activo == True)
        return q.order_by(Servicio.fecha.desc(), Servicio.id.desc()).all()

    def get(self, servicio_id: int) -> Servicio | None:
        return self.db.query(Servicio).filter(Servicio.id == servicio_id, Servicio.activo == True).first()

    def create(self, vehiculo_id: int, **kwargs) -> Servicio:
        s = Servicio(vehiculo_id=vehiculo_id, **kwargs)
        self.db.add(s)
        self.db.flush()
        return s

    def update(self, s: Servicio, **kwargs) -> Servicio:
        for k, v in kwargs.items():
            if v is not None:
                setattr(s, k, v)
        self.db.flush()
        return s

    def deactivate(self, s: Servicio) -> Servicio:
        s.activo = False
        self.db.flush()
        return s
