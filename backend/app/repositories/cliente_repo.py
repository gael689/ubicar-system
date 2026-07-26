"""
Repositorio de Clientes.
Solo queries SQLAlchemy — sin lógica de negocio.
"""
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, ConductorAdicional
from app.repositories.base import BaseRepository


class ClienteRepository(BaseRepository[Cliente]):
    def __init__(self, db: Session):
        super().__init__(Cliente, db)

    def list_filtered(
        self,
        *,
        q: str | None = None,
        tipo: str | None = None,
        frecuente: bool | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[Cliente], int]:
        """Retorna (lista, total) con filtros. Siempre oculta inactivos por regla de negocio general en listados."""
        stmt = select(Cliente).where(Cliente.activo == True)

        if tipo:
            stmt = stmt.where(Cliente.tipo == tipo)
        if frecuente is not None:
            stmt = stmt.where(Cliente.es_frecuente == frecuente)
        if q:
            term = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    Cliente.nombre_completo.ilike(term),
                    Cliente.dni_cuit.ilike(term),
                    Cliente.telefono.ilike(term),
                    Cliente.email.ilike(term),
                )
            )

        total = self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        ).scalar_one()

        stmt = stmt.order_by(Cliente.nombre_completo).offset(skip).limit(limit)
        items = list(self.db.execute(stmt).scalars().all())
        return items, total

    def get_by_dni(self, dni_cuit: str) -> Cliente | None:
        stmt = select(Cliente).where(Cliente.dni_cuit == dni_cuit)
        return self.db.execute(stmt).scalar_one_or_none()

    def add_conductor(self, conductor: ConductorAdicional) -> ConductorAdicional:
        self.db.add(conductor)
        self.db.commit()
        self.db.refresh(conductor)
        return conductor

    def get_conductor(self, conductor_id: int) -> ConductorAdicional | None:
        stmt = select(ConductorAdicional).where(ConductorAdicional.id == conductor_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_conductores_by_cliente(self, cliente_id: int) -> list[ConductorAdicional]:
        stmt = select(ConductorAdicional).where(ConductorAdicional.cliente_id == cliente_id).order_by(ConductorAdicional.nombre_completo)
        return list(self.db.execute(stmt).scalars().all())

    def delete_conductor(self, conductor: ConductorAdicional) -> None:
        self.db.delete(conductor)
        self.db.commit()
