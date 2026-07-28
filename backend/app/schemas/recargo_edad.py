from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator


class RecargoEdadBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    edad_desde: int
    edad_hasta: int | None = None
    monto: Decimal | None = None
    porcentaje: Decimal | None = None
    unidad_cobro: Literal["por_dia", "unico"] = "por_dia"
    categoria_id: int | None = None

    @model_validator(mode="after")
    def _validar(self):
        if self.edad_desde < 0:
            raise ValueError("La edad desde no puede ser negativa")
        if self.edad_hasta is not None and self.edad_hasta < self.edad_desde:
            raise ValueError("La edad hasta no puede ser menor que la edad desde")

        # Un recargo con monto y porcentaje a la vez no tiene una lectura
        # única; sin ninguno de los dos no recarga nada. Se valida acá y hay
        # además un CHECK en la base: la API no es el único camino de escritura.
        tiene_monto = self.monto is not None
        tiene_porcentaje = self.porcentaje is not None
        if tiene_monto == tiene_porcentaje:
            raise ValueError("Cargá un monto fijo o un porcentaje, no los dos ni ninguno")
        if tiene_monto and self.monto <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        if tiene_porcentaje and not (0 < self.porcentaje <= 100):
            raise ValueError("El porcentaje debe estar entre 0 y 100")
        return self


class RecargoEdadCreate(RecargoEdadBase):
    pass


class RecargoEdadUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    edad_desde: int | None = None
    edad_hasta: int | None = None
    monto: Decimal | None = None
    porcentaje: Decimal | None = None
    unidad_cobro: Literal["por_dia", "unico"] | None = None
    categoria_id: int | None = None
    activo: bool | None = None


class RecargoEdadResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    edad_desde: int
    edad_hasta: int | None = None
    monto: Decimal | None = None
    porcentaje: Decimal | None = None
    unidad_cobro: str
    categoria_id: int | None = None
    activo: bool
    created_at: datetime
    model_config = {"from_attributes": True}
