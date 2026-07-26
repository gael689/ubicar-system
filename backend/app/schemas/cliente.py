from datetime import datetime, date
from pydantic import BaseModel, field_validator, model_validator
from typing import Literal, Optional


TipoCliente = Literal["particular", "empresa"]
CondicionIva = Literal["responsable_inscripto", "monotributo", "consumidor_final", "exento"]
CondicionPagoDefault = Literal["contado", "cta_cte_15", "cta_cte_30", "cta_cte_60", "cta_cte_90"]


def _vacio_a_none(v):
    """Trata "" (del formulario web) como ausencia de fecha, no como fecha inválida."""
    if v == "" or v is None:
        return None
    return v


class ConductorAdicionalBase(BaseModel):
    nombre_completo: str
    dni: Optional[str] = None
    licencia_numero: Optional[str] = None
    licencia_vencimiento: date


class ConductorAdicionalCreate(ConductorAdicionalBase):
    pass


class ConductorAdicionalResponse(ConductorAdicionalBase):
    id: int
    cliente_id: int
    activo: bool
    model_config = {"from_attributes": True}


class ClienteContactoBase(BaseModel):
    nombre: str
    puesto: str | None = None
    telefono: str | None = None
    email: str | None = None


class ClienteContactoCreate(ClienteContactoBase):
    pass


class ClienteContactoResponse(ClienteContactoBase):
    id: int
    cliente_id: int
    activo: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class ClienteBase(BaseModel):
    nombre_completo: str
    dni_cuit: str = ""
    telefono: str = ""
    email: str | None = None
    licencia_numero: str | None = None
    # Opcional: el formulario de alta permite crear un cliente (ej. una empresa)
    # sin licencia todavía. Ver CLI-11 en docs/CASOS_DE_USO.md.
    licencia_vencimiento: date | None = None
    licencia_categoria: str | None = None
    tipo: TipoCliente = "particular"
    es_frecuente: bool = False
    notas: str | None = None

    # Datos fiscales (opcionales — se van completando con el tiempo, no
    # bloquean el alta rápida de un cliente).
    razon_social: str | None = None
    condicion_iva: CondicionIva | None = None
    domicilio: str | None = None
    localidad: str | None = None
    provincia: str | None = None
    codigo_postal: str | None = None
    fecha_nacimiento: date | None = None
    licencia_pais: str | None = None
    licencia_desde: date | None = None
    condicion_pago_default: CondicionPagoDefault | None = None

    _licencia_vacia = field_validator("licencia_vencimiento", mode="before")(_vacio_a_none)
    _nacimiento_vacio = field_validator("fecha_nacimiento", mode="before")(_vacio_a_none)
    _licencia_desde_vacia = field_validator("licencia_desde", mode="before")(_vacio_a_none)

    @model_validator(mode='after')
    def check_contact(self) -> 'ClienteBase':
        if not self.telefono and not self.email:
            raise ValueError("Debe proporcionar al menos un teléfono o un email")
        return self


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre_completo: str | None = None
    dni_cuit: str | None = None
    telefono: str | None = None
    email: str | None = None
    licencia_numero: str | None = None
    licencia_vencimiento: date | None = None
    licencia_categoria: str | None = None
    tipo: TipoCliente | None = None
    es_frecuente: bool | None = None
    notas: str | None = None
    activo: bool | None = None
    razon_social: str | None = None
    condicion_iva: CondicionIva | None = None
    domicilio: str | None = None
    localidad: str | None = None
    provincia: str | None = None
    codigo_postal: str | None = None
    fecha_nacimiento: date | None = None
    licencia_pais: str | None = None
    licencia_desde: date | None = None
    condicion_pago_default: CondicionPagoDefault | None = None

    _licencia_vacia = field_validator("licencia_vencimiento", mode="before")(_vacio_a_none)
    _nacimiento_vacio = field_validator("fecha_nacimiento", mode="before")(_vacio_a_none)
    _licencia_desde_vacia = field_validator("licencia_desde", mode="before")(_vacio_a_none)


class ClienteResponse(ClienteBase):
    id: int
    activo: bool
    created_at: datetime
    conductores_adicionales: list[ConductorAdicionalResponse] = []
    contactos: list[ClienteContactoResponse] = []
    model_config = {"from_attributes": True}
