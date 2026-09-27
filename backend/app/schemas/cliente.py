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
    # **Opcional desde la migración 100.** Era `date` a secas y el formulario lo
    # mandaba vacío: 422, el conductor no se guardaba y la pantalla no decía
    # nada. Es la causa raíz de "cargué el conductor y no salió en el contrato".
    licencia_vencimiento: Optional[date] = None
    # El recargo por edad (D-38) mira la edad de quien maneja. El campo existe
    # en el modelo desde la migración 044, pero no salía en la respuesta: la
    # pantalla de reservas no podía estimar el mismo precio que el backend.
    fecha_nacimiento: Optional[date] = None
    # La cláusula 2.h del contrato lo pide para autorizar a un conductor.
    domicilio: Optional[str] = None

    _vencimiento_vacio = field_validator("licencia_vencimiento", mode="before")(_vacio_a_none)
    _nacimiento_vacio = field_validator("fecha_nacimiento", mode="before")(_vacio_a_none)

    @field_validator("nombre_completo")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El conductor necesita un nombre")
        return v.strip()

    @field_validator("dni", "licencia_numero", "domicilio", mode="before")
    @classmethod
    def _texto_vacio_a_none(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v


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

    # Representante de la empresa (migración 100). Sólo para `tipo='empresa'`.
    representante_nombre: str | None = None
    representante_dni: str | None = None
    representante_cargo: str | None = None
    representante_telefono: str | None = None
    representante_email: str | None = None

    _licencia_vacia = field_validator("licencia_vencimiento", mode="before")(_vacio_a_none)
    _nacimiento_vacio = field_validator("fecha_nacimiento", mode="before")(_vacio_a_none)
    _licencia_desde_vacia = field_validator("licencia_desde", mode="before")(_vacio_a_none)

    @model_validator(mode='after')
    def check_contact(self) -> 'ClienteBase':
        if not self.telefono and not self.email:
            raise ValueError("Debe proporcionar al menos un teléfono o un email")
        return self


class ClienteCreate(ClienteBase):
    # **El cliente y sus conductores en una sola llamada** (plan 27/09, A3).
    # Antes la pantalla creaba el cliente y después, aparte, cada conductor:
    # si el conductor fallaba el cliente ya existía, y reintentar creaba un
    # duplicado. Ahora es una transacción: entra todo o no entra nada.
    conductores: list[ConductorAdicionalCreate] = []


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
    representante_nombre: str | None = None
    representante_dni: str | None = None
    representante_cargo: str | None = None
    representante_telefono: str | None = None
    representante_email: str | None = None

    _licencia_vacia = field_validator("licencia_vencimiento", mode="before")(_vacio_a_none)
    _nacimiento_vacio = field_validator("fecha_nacimiento", mode="before")(_vacio_a_none)
    _licencia_desde_vacia = field_validator("licencia_desde", mode="before")(_vacio_a_none)


class ClienteResponse(ClienteBase):
    id: int
    activo: bool
    created_at: datetime
    # Migración 077: de dónde vino el cliente y quién lo dio de alta. Sin
    # esto, alguien que se registró solo desde el sitio se ve en su ficha
    # exactamente igual que uno cargado a mano.
    origen: str = "mostrador"
    # `None` cuando vino de la web, a propósito: el alta la ejecuta el usuario
    # "Sistema" y ese nombre no le dice nada a nadie. La propiedad la resuelve
    # el modelo.
    creado_por_nombre: str | None = None
    conductores_adicionales: list[ConductorAdicionalResponse] = []
    contactos: list[ClienteContactoResponse] = []
    model_config = {"from_attributes": True}
