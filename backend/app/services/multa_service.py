"""
MultaService — lógica de gestión de multas/infracciones.
El flujo principal: buscar quién tenía el auto en la fecha/hora de la infracción,
luego crear la multa vinculada al cliente y alquiler responsable.
"""
from datetime import date, time, datetime
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.alquiler import Alquiler
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.cliente import Cliente
from app.repositories.multa_repo import MultaRepo
from app.schemas.multa import MultaCreate, MultaUpdate, BusquedaMultaResponse


class MultaService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = MultaRepo(db)

    def buscar_responsable(
        self,
        patente: str,
        fecha_infraccion: date,
        hora_infraccion: time | None = None,
    ) -> BusquedaMultaResponse:
        """
        Dado patente + fecha (+ hora opcional), cruza con el historial de alquileres
        para encontrar quién tenía el vehículo en ese momento.
        """
        vehiculo = (
            self.db.query(Vehiculo)
            .filter(Vehiculo.patente.ilike(patente.strip()))
            .first()
        )

        if not vehiculo:
            return BusquedaMultaResponse(
                encontrado=False,
                patente=patente.upper(),
                fecha_infraccion=fecha_infraccion,
                hora_infraccion=hora_infraccion,
            )

        # Busca alquileres del vehículo que cubran la fecha de infracción
        alquileres = (
            self.db.query(Alquiler)
            .join(Reserva, Alquiler.reserva_id == Reserva.id)
            .filter(
                Reserva.vehiculo_id == vehiculo.id,
                Reserva.fecha_inicio <= fecha_infraccion,
                Reserva.fecha_fin >= fecha_infraccion,
            )
            .order_by(Alquiler.id.desc())
            .all()
        )

        if not alquileres:
            return BusquedaMultaResponse(
                encontrado=False,
                patente=patente.upper(),
                fecha_infraccion=fecha_infraccion,
                hora_infraccion=hora_infraccion,
            )

        # Toma el alquiler más relevante (el más reciente que cubra la fecha)
        alquiler = alquileres[0]
        reserva = alquiler.reserva
        cliente = self.db.query(Cliente).filter(Cliente.id == reserva.cliente_id).first()

        return BusquedaMultaResponse(
            encontrado=True,
            patente=patente.upper(),
            fecha_infraccion=fecha_infraccion,
            hora_infraccion=hora_infraccion,
            alquiler_id=alquiler.id,
            cliente_id=cliente.id if cliente else None,
            cliente_nombre=cliente.nombre_completo if cliente else None,
            cliente_dni=cliente.dni_cuit if cliente else None,
            contrato_numero=reserva.id,
            fecha_checkout=alquiler.checkout_fecha,
            fecha_checkin=alquiler.checkin_fecha,
        )

    def crear(self, payload: MultaCreate):
        data = payload.model_dump(exclude_none=False)
        # Normaliza patente
        data["patente"] = data["patente"].upper().strip()
        return self.repo.create(data)

    def get(self, id: int):
        multa = self.repo.get(id)
        if not multa:
            raise NotFoundError("Multa", id)
        return multa

    def list(self, **kwargs):
        return self.repo.list(**kwargs)

    def actualizar(self, id: int, payload: MultaUpdate):
        multa = self.get(id)
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        return self.repo.update(multa, data)

    def eliminar(self, id: int) -> None:
        multa = self.get(id)
        self.repo.deactivate(multa)
