"""
Repositorio de Vehículos.
Solo queries SQLAlchemy — sin lógica de negocio.
"""
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from app.models.vehiculo import Vehiculo
from app.models.tarifa import Tarifa
from app.repositories.base import BaseRepository


class VehiculoRepository(BaseRepository[Vehiculo]):
    def __init__(self, db: Session):
        super().__init__(Vehiculo, db)

    def list_filtered(
        self,
        *,
        estado: str | None = None,
        tipo: str | None = None,
        q: str | None = None,
        incluir_inactivos: bool = False,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[Vehiculo], int]:
        """Retorna (lista, total) con filtros opcionales. Por defecto oculta inactivos."""
        stmt = select(Vehiculo)

        if not incluir_inactivos:
            stmt = stmt.where(Vehiculo.activo == True)
        if estado:
            stmt = stmt.where(Vehiculo.estado == estado)
        if tipo:
            stmt = stmt.where(Vehiculo.tipo == tipo)
        if q:
            term = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    Vehiculo.patente.ilike(term),
                    Vehiculo.marca.ilike(term),
                    Vehiculo.modelo.ilike(term),
                )
            )

        total = self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        ).scalar_one()

        stmt = stmt.order_by(Vehiculo.orden.asc(), Vehiculo.marca, Vehiculo.modelo).offset(skip).limit(limit)
        items = list(self.db.execute(stmt).scalars().all())
        return items, total

    def get_by_patente(self, patente: str) -> Vehiculo | None:
        stmt = select(Vehiculo).where(Vehiculo.patente == patente)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_tarifas_activas(self, vehiculo_id: int) -> list[Tarifa]:
        """Retorna las tarifas activas del vehículo."""
        stmt = (
            select(Tarifa)
            .where(Tarifa.vehiculo_id == vehiculo_id, Tarifa.activo == True)
            .order_by(Tarifa.vigencia_desde.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_tarifas_generales(self) -> list[Tarifa]:
        """Retorna las tarifas generales (sin vehiculo_id) activas."""
        stmt = (
            select(Tarifa)
            .where(Tarifa.vehiculo_id == None, Tarifa.activo == True)
            .order_by(Tarifa.vigencia_desde.desc())
        )
        return list(self.db.execute(stmt).scalars().all())
