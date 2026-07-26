"""
Repositorio base genérico con operaciones CRUD comunes.
Cada repositorio concreto hereda de este y puede sobreescribir o extender.
"""
from typing import Generic, TypeVar, Type
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], db: Session):
        self.model = model
        self.db = db

    def get(self, id: int) -> ModelType | None:
        return self.db.get(self.model, id)

    def get_all(self, skip: int = 0, limit: int = 100) -> list[ModelType]:
        stmt = select(self.model).offset(skip).limit(limit)
        return list(self.db.execute(stmt).scalars().all())

    def create(self, obj: ModelType) -> ModelType:
        self.db.add(obj)
        self.db.flush()  # obtener el id sin hacer commit
        self.db.refresh(obj)
        return obj

    def delete(self, obj: ModelType) -> None:
        self.db.delete(obj)
        self.db.flush()
