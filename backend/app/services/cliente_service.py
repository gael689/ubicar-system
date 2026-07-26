from sqlalchemy.orm import Session
from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError
from app.models.cliente import Cliente, ConductorAdicional
from app.repositories.cliente_repo import ClienteRepository
from app.schemas.cliente import ClienteCreate, ClienteUpdate, ConductorAdicionalCreate


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

    def create(self, data: ClienteCreate) -> Cliente:
        # Validar DNI único
        if self.repo.get_by_dni(data.dni_cuit):
            raise ConflictError(f"Ya existe un cliente con el DNI/CUIT {data.dni_cuit}")
            
        cliente = Cliente(**data.model_dump())
        return self.repo.create(cliente)

    def update(self, id: int, data: ClienteUpdate) -> Cliente:
        cliente = self.get_by_id(id)

        update_data = data.model_dump(exclude_none=True)

        # Validar DNI/CUIT único si lo están cambiando
        nuevo_dni = update_data.get("dni_cuit")
        if nuevo_dni and nuevo_dni != cliente.dni_cuit:
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

    def get_conductores(self, cliente_id: int) -> list[ConductorAdicional]:
        self.get_by_id(cliente_id) # Verifica que el cliente exista
        return self.repo.get_conductores_by_cliente(cliente_id)

    def add_conductor(self, cliente_id: int, data: ConductorAdicionalCreate) -> ConductorAdicional:
        self.get_by_id(cliente_id) # Verifica que el cliente exista
        
        conductor = ConductorAdicional(
            cliente_id=cliente_id,
            **data.model_dump()
        )
        return self.repo.add_conductor(conductor)

    def delete_conductor(self, conductor_id: int) -> None:
        conductor = self.repo.get_conductor(conductor_id)
        if not conductor:
            raise NotFoundError(f"Conductor adicional con ID {conductor_id} no encontrado")
        self.repo.delete_conductor(conductor)
