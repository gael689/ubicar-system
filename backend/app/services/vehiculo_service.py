"""
Service de Vehículos. Concentra reglas de dominio.

Reglas:
- Patente única (case-insensitive: se normaliza a upper).
- km_proximo_service = km_actual + km_entre_services si no se provee.
- Baja lógica (activo=false). Nunca borrado físico. Ver memoria regla-nunca-eliminar.
- Reactivación idempotente.
- (Pendiente F3) No se puede dar de baja un vehículo con alquileres activos.
"""
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.exceptions import ConflictError, NotFoundError
from app.models.vehiculo import Vehiculo
from app.repositories.vehiculo_repo import VehiculoRepository
from app.schemas.vehiculo import VehiculoCreate, VehiculoResponse, VehiculoUpdate


class VehiculoService:
    def __init__(self, db: Session, storage: IStorage | None = None):
        self.db = db
        self.repo = VehiculoRepository(db)
        self.storage = storage

    def to_response(self, vehiculo: Vehiculo) -> VehiculoResponse:
        """Serializa a VehiculoResponse calculando foto_url desde foto_key."""
        response = VehiculoResponse.model_validate(vehiculo)
        if vehiculo.foto_key and self.storage is not None:
            response.foto_url = self.storage.public_url(vehiculo.foto_key)
        return response

    def upload_foto(self, vehiculo_id: int, content: bytes, content_type: str, ext: str) -> Vehiculo:
        """Sube foto a storage y persiste foto_key. Sobrescribe la anterior si existe."""
        if self.storage is None:
            raise RuntimeError("VehiculoService.upload_foto requiere storage inyectado")
        vehiculo = self.get(vehiculo_id)
        key = f"vehiculos/{vehiculo.id}/foto.{ext}"
        self.storage.upload(key, content, content_type)
        vehiculo.foto_key = key
        self.db.commit()
        self.db.refresh(vehiculo)
        return vehiculo

    def list(
        self,
        *,
        estado: str | None = None,
        tipo: str | None = None,
        q: str | None = None,
        incluir_inactivos: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Vehiculo], int]:
        return self.repo.list_filtered(
            estado=estado,
            tipo=tipo,
            q=q,
            incluir_inactivos=incluir_inactivos,
            skip=(page - 1) * page_size,
            limit=page_size,
        )

    def get(self, vehiculo_id: int) -> Vehiculo:
        vehiculo = self.repo.get(vehiculo_id)
        if vehiculo is None:
            raise NotFoundError("Vehículo", vehiculo_id)
        return vehiculo

    def create(self, payload: VehiculoCreate) -> Vehiculo:
        patente = payload.patente.strip().upper()
        if self.repo.get_by_patente(patente) is not None:
            raise ConflictError(f"Ya existe un vehículo con patente {patente}")

        data = payload.model_dump()
        data["patente"] = patente
        data["km_proximo_service"] = payload.km_actual + payload.km_entre_services

        vehiculo = Vehiculo(**data)
        self.repo.create(vehiculo)
        self.db.commit()
        self.db.refresh(vehiculo)
        return vehiculo

    def update(self, vehiculo_id: int, payload: VehiculoUpdate) -> Vehiculo:
        vehiculo = self.get(vehiculo_id)

        cambios = payload.model_dump(exclude_unset=True)

        # **Pasar un auto a Uber lo saca de la disponibilidad** (migración
        # 086), y si tiene reservas vivas las deja huérfanas: la reserva sigue
        # existiendo con ese auto asignado, pero el auto ya no es cupo de nada.
        # Es el mismo peligro que la baja lógica, y se trata igual — con la
        # diferencia de que acá no hay `forzar`: para sacarlo igual, primero se
        # mueven las reservas.
        nuevo_destino = cambios.get("destino")
        if (
            nuevo_destino is not None
            and nuevo_destino != vehiculo.destino
            and nuevo_destino != "alquiler"
        ):
            bloqueantes = self.reservas_que_bloquean(vehiculo_id)
            if bloqueantes:
                raise ConflictError(
                    f"{vehiculo.patente} tiene {len(bloqueantes)} reserva(s) sin cerrar. "
                    f"Reasignalas a otro vehículo antes de afectarlo a Uber."
                )

        nuevo_estado = cambios.get("estado")
        if nuevo_estado is not None and nuevo_estado != vehiculo.estado:
            from datetime import datetime
            vehiculo.estado_desde = datetime.utcnow()
        for field, value in cambios.items():
            setattr(vehiculo, field, value)

        self.db.commit()
        self.db.refresh(vehiculo)
        return vehiculo

    def reservas_que_bloquean(self, vehiculo_id: int) -> list:
        """
        Reservas vivas que impiden dar de baja el vehículo sin confirmar.

        No es lo mismo "tiene reservas futuras" que "el auto está afuera": las
        dos requieren decidir algo, pero la segunda es un problema hoy.
        """
        from app.repositories.reserva_repo import ReservaRepo

        return ReservaRepo(self.db).find_activas_para_vehiculo(vehiculo_id)

    def deactivate(self, vehiculo_id: int, forzar: bool = False) -> Vehiculo:
        """
        Baja lógica. NUNCA borra. Idempotente — si ya está inactivo, no falla.

        **Se niega si el vehículo tiene reservas vivas**, salvo que le pasen
        `forzar=True`. Antes no miraba nada: se podía dar de baja un auto que
        estaba circulando con un cliente, y el sistema no decía una palabra.

        No es un bloqueo duro sino un freno: quien quiera hacerlo igual lo hace
        desde `/inactivar` con confirmación explícita, que además muestra qué
        reservas quedan colgadas. El sistema informa, la persona decide — pero
        para decidir hay que enterarse.
        """
        vehiculo = self.get(vehiculo_id)

        if not forzar and vehiculo.activo:
            afectadas = self.reservas_que_bloquean(vehiculo_id)
            if afectadas:
                afuera = sum(1 for r in afectadas if r.estado in ("activa", "vencida"))
                detalle = (
                    f"{len(afectadas)} reserva(s) sin cerrar"
                    + (f", {afuera} con el auto afuera ahora mismo" if afuera else "")
                )
                raise ConflictError(
                    f"vehiculo_con_reservas|El vehículo tiene {detalle}. "
                    "Revisalas y confirmá la baja desde la ficha del vehículo.|"
                    f"{len(afectadas)}"
                )

        vehiculo.activo = False
        self.db.commit()
        self.db.refresh(vehiculo)
        return vehiculo

    def reactivate(self, vehiculo_id: int) -> Vehiculo:
        """Marca activo=true. Idempotente."""
        vehiculo = self.get(vehiculo_id)
        vehiculo.activo = True
        self.db.commit()
        self.db.refresh(vehiculo)
        return vehiculo

    def reorder(self, payload: "VehiculoReorderRequest") -> None:
        """Actualiza el orden de múltiples vehículos."""
        for item in payload.vehiculos:
            vehiculo = self.repo.get(item.id)
            if vehiculo:
                vehiculo.orden = item.orden
        self.db.commit()
