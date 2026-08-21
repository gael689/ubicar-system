from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.cliente import (
    ClienteCreate, ClienteUpdate, ClienteResponse,
    ConductorAdicionalCreate, ConductorAdicionalResponse,
    ClienteContactoCreate, ClienteContactoResponse,
)
from app.services.cliente_service import ClienteService

router = APIRouter(prefix="/clientes", tags=["Clientes"])

def get_cliente_service(db: Session = Depends(get_db)) -> ClienteService:
    return ClienteService(db)

@router.get("")
def list_clientes(
    search: str | None = Query(None, alias="q"),
    tipo: str | None = Query(None),
    frecuente: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    skip = (page - 1) * page_size
    items, total = service.list_clientes(q=search, tipo=tipo, frecuente=frecuente, skip=skip, limit=page_size)
    return paginated(
        data=[ClienteResponse.model_validate(c) for c in items],
        total=total,
        page=page,
        page_size=page_size,
    )

@router.post("", status_code=status.HTTP_201_CREATED)
def create_cliente(
    payload: ClienteCreate,
    service: ClienteService = Depends(get_cliente_service),
    current_user: Usuario = Depends(get_current_user),
):
    # Migración 077: queda registrado quién lo dio de alta. Todo lo que pasa
    # por acá es del mostrador — este endpoint pide autenticación.
    cliente = service.create(payload, usuario_id=current_user.id)
    return ok(ClienteResponse.model_validate(cliente), "Cliente creado")

@router.get("/{cliente_id}")
def get_cliente(
    cliente_id: int,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    cliente = service.get_by_id(cliente_id)
    return ok(ClienteResponse.model_validate(cliente))

@router.patch("/{cliente_id}")
def update_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    cliente = service.update(cliente_id, payload)
    return ok(ClienteResponse.model_validate(cliente), "Cliente actualizado")

@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cliente(
    cliente_id: int,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica."""
    service.deactivate(cliente_id)


# --- Conductores Adicionales ---

@router.get("/{cliente_id}/conductores")
def list_conductores(
    cliente_id: int,
    incluir_inactivos: bool = Query(False, description="Si true, incluye los dados de baja"),
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    conductores = service.get_conductores(cliente_id, incluir_inactivos=incluir_inactivos)
    return ok([ConductorAdicionalResponse.model_validate(c) for c in conductores])

@router.post("/{cliente_id}/conductores", status_code=status.HTTP_201_CREATED)
def add_conductor(
    cliente_id: int,
    payload: ConductorAdicionalCreate,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    conductor = service.add_conductor(cliente_id, payload)
    return ok(ConductorAdicionalResponse.model_validate(conductor), "Conductor adicional agregado")

@router.delete("/{cliente_id}/conductores/{conductor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conductor(
    cliente_id: int,
    conductor_id: int,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica."""
    service.delete_conductor(conductor_id)


# --- Contactos (empresas) ---

@router.get("/{cliente_id}/contactos")
def list_contactos(
    cliente_id: int,
    incluir_inactivos: bool = Query(False, description="Si true, incluye los dados de baja"),
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    contactos = service.get_contactos(cliente_id, incluir_inactivos=incluir_inactivos)
    return ok([ClienteContactoResponse.model_validate(c) for c in contactos])

@router.post("/{cliente_id}/contactos", status_code=status.HTTP_201_CREATED)
def add_contacto(
    cliente_id: int,
    payload: ClienteContactoCreate,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    contacto = service.add_contacto(cliente_id, payload)
    return ok(ClienteContactoResponse.model_validate(contacto), "Contacto agregado")

@router.delete("/{cliente_id}/contactos/{contacto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contacto(
    cliente_id: int,
    contacto_id: int,
    service: ClienteService = Depends(get_cliente_service),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica."""
    service.delete_contacto(contacto_id)
