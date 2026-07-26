"""
Schemas para el historial de un vehículo.

En F1 retorna gastos + documentos. En F3 se sumará el array `alquileres`
sin breaking change para el frontend.
"""
from pydantic import BaseModel

from app.schemas.documento import DocumentoResponse
from app.schemas.gasto import GastoResponse
from app.schemas.tarifa import TarifaResponse


class HistorialVehiculoResponse(BaseModel):
    vehiculo_id: int
    gastos: list[GastoResponse]
    documentos: list[DocumentoResponse]
    tarifas: list[TarifaResponse]
    alquileres: list[dict] = []  # placeholder hasta F3
