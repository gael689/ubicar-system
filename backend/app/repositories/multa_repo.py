from datetime import date
from sqlalchemy.orm import Session
from app.models.multa import Multa


class MultaRepo:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, id: int) -> Multa | None:
        return self.db.query(Multa).filter(Multa.id == id, Multa.activo == True).first()

    def list(
        self,
        cliente_id: int | None = None,
        vehiculo_id: int | None = None,
        estado: str | None = None,
        patente: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Multa], int]:
        q = self.db.query(Multa).filter(Multa.activo == True)
        if cliente_id:
            q = q.filter(Multa.cliente_id == cliente_id)
        if vehiculo_id:
            q = q.filter(Multa.vehiculo_id == vehiculo_id)
        if estado:
            q = q.filter(Multa.estado == estado)
        if patente:
            q = q.filter(Multa.patente.ilike(f"%{patente}%"))
        total = q.count()
        items = q.order_by(Multa.fecha_infraccion.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return items, total

    def create(self, data: dict) -> Multa:
        multa = Multa(**data)
        self.db.add(multa)
        self.db.flush()
        return multa

    def update(self, multa: Multa, data: dict) -> Multa:
        for k, v in data.items():
            if v is not None:
                setattr(multa, k, v)
        self.db.flush()
        return multa

    def deactivate(self, multa: Multa) -> None:
        multa.activo = False
        self.db.flush()
