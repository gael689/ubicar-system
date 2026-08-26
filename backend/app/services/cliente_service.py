from sqlalchemy.orm import Session
from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError
from app.domain.enums import MARCA_PENDIENTE
from app.models.cliente import Cliente, ConductorAdicional, ClienteContacto
from app.repositories.cliente_repo import ClienteRepository
from app.schemas.cliente import ClienteCreate, ClienteUpdate, ConductorAdicionalCreate, ClienteContactoCreate


def _es_dni_real(dni: str | None) -> bool:
    """
    Si este valor es un documento contra el que tiene sentido buscar duplicados.

    **`A COMPLETAR` no es un DNI: es la ausencia de uno**, y lo mismo un campo
    vacío. Tratarlos como documentos rompía el alta rápida del mostrador: la
    primera funcionaba y la segunda moría con *"Ya existe un cliente con el
    DNI/CUIT A COMPLETAR"*, porque el marcador que deja el formulario es
    siempre el mismo. Dos fichas sin documento cargado no son un duplicado.

    El marcador se conserva tal cual —no se guarda vacío— porque es lo que hace
    que la campana `cliente_sin_completar` las siga reclamando hasta que
    alguien las complete. Sin DNI no se puede emitir un contrato, y eso se
    descubre el día de la entrega si nadie avisa antes.
    """
    return bool(dni) and dni.strip() != MARCA_PENDIENTE


class ClienteService:
    def __init__(self, db: Session):
        self.repo = ClienteRepository(db)

    def list_clientes(
        self,
        q: str | None = None,
        tipo: str | None = None,
        frecuente: bool | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[Cliente], int]:
        return self.repo.list_filtered(q=q, tipo=tipo, frecuente=frecuente, skip=skip, limit=limit)

    def get_by_id(self, id: int) -> Cliente:
        cliente = self.repo.get(id)
        if not cliente:
            raise NotFoundError(f"Cliente con ID {id} no encontrado")
        return cliente

    def create(self, data: ClienteCreate, usuario_id: int | None = None) -> Cliente:
        # Validar DNI único — sólo si hay un DNI.
        if _es_dni_real(data.dni_cuit) and self.repo.get_by_dni(data.dni_cuit):
            raise ConflictError(f"Ya existe un cliente con el DNI/CUIT {data.dni_cuit}")


        # Migración 077: todo lo que entra por acá es del mostrador — este
        # service sólo lo alcanza alguien autenticado. El alta web tiene su
        # propio camino (`PagoWebService`) y se marca `web` allá.
        cliente = Cliente(**data.model_dump(), origen="mostrador", creado_por=usuario_id)
        return self.repo.create(cliente)

    def update(self, id: int, data: ClienteUpdate) -> Cliente:
        cliente = self.get_by_id(id)

        update_data = data.model_dump(exclude_none=True)

        # Validar DNI/CUIT único si lo están cambiando. Volver a poner el
        # marcador de pendiente —o dejarlo— no es cambiar a un DNI ocupado.
        nuevo_dni = update_data.get("dni_cuit")
        if _es_dni_real(nuevo_dni) and nuevo_dni != cliente.dni_cuit:
            existente = self.repo.get_by_dni(nuevo_dni)
            if existente and existente.id != cliente.id:
                raise ConflictError(f"Ya existe un cliente con el DNI/CUIT {nuevo_dni}")

        for field, value in update_data.items():
            setattr(cliente, field, value)

        self.repo.db.commit()
        self.repo.db.refresh(cliente)
        return cliente

    def deactivate(self, id: int) -> Cliente:
        cliente = self.get_by_id(id)

        # No permitir dar de baja un cliente con reservas/alquileres en curso
        # (pendiente, confirmada, activa o vencida — el auto puede estar afuera).
        from app.models.reserva import Reserva
        tiene_reservas_activas = (
            self.repo.db.query(Reserva)
            .filter(
                Reserva.cliente_id == id,
                Reserva.estado.in_(["pendiente", "confirmada", "activa", "vencida"]),
            )
            .first()
            is not None
        )
        if tiene_reservas_activas:
            raise BusinessRuleError(
                "cliente_con_reservas_activas",
                "No se puede dar de baja un cliente con reservas o alquileres en curso",
            )

        cliente.activo = False
        self.repo.db.commit()
        self.repo.db.refresh(cliente)
        return cliente

    # --- Conductores Adicionales ---

    def get_conductores(self, cliente_id: int, incluir_inactivos: bool = False) -> list[ConductorAdicional]:
        self.get_by_id(cliente_id) # Verifica que el cliente exista
        return self.repo.get_conductores_by_cliente(cliente_id, incluir_inactivos=incluir_inactivos)

    def add_conductor(self, cliente_id: int, data: ConductorAdicionalCreate) -> ConductorAdicional:
        self.get_by_id(cliente_id) # Verifica que el cliente exista

        conductor = ConductorAdicional(
            cliente_id=cliente_id,
            **data.model_dump()
        )
        return self.repo.add_conductor(conductor)

    def delete_conductor(self, conductor_id: int) -> None:
        """Baja lógica. NUNCA borra (ver regla-nunca-eliminar)."""
        conductor = self.repo.get_conductor(conductor_id)
        if not conductor:
            raise NotFoundError(f"Conductor adicional con ID {conductor_id} no encontrado")
        self.repo.deactivate_conductor(conductor)

    # --- Contactos (empresas) ---

    def get_contactos(self, cliente_id: int, incluir_inactivos: bool = False) -> list[ClienteContacto]:
        self.get_by_id(cliente_id)
        return self.repo.get_contactos_by_cliente(cliente_id, incluir_inactivos=incluir_inactivos)

    def add_contacto(self, cliente_id: int, data: ClienteContactoCreate) -> ClienteContacto:
        self.get_by_id(cliente_id)
        contacto = ClienteContacto(cliente_id=cliente_id, **data.model_dump())
        return self.repo.add_contacto(contacto)

    def delete_contacto(self, contacto_id: int) -> None:
        contacto = self.repo.get_contacto(contacto_id)
        if not contacto:
            raise NotFoundError(f"Contacto con ID {contacto_id} no encontrado")
        self.repo.deactivate_contacto(contacto)
