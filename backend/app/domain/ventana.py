from __future__ import annotations
"""
Dataclass Ventana — representa un rango temporal ocupado.
Sin dependencias externas. Se usa en solapamientos, repos y services.
"""
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Ventana:
    """Rango temporal con inicio y fin."""
    inicio: datetime
    fin: datetime

    def __post_init__(self) -> None:
        if self.inicio >= self.fin:
            raise ValueError(f"inicio ({self.inicio}) debe ser anterior a fin ({self.fin})")

    def solapa_con(self, otra: "Ventana") -> bool:
        """True si las dos ventanas se superponen en algún punto."""
        return self.inicio < otra.fin and self.fin > otra.inicio


@dataclass(frozen=True)
class VentanaReserva:
    """Ventana enriquecida con metadata de la reserva/alquiler."""
    id: int
    vehiculo_id: int
    inicio: datetime
    fin: datetime
    estado: str  # estado de la reserva o alquiler
    cliente_nombre: str = ""
    tipo: str = "reserva"  # "reserva" | "alquiler"
