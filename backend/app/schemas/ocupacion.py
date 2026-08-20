"""
Schemas Pydantic para el endpoint de ocupación (calendario).
"""
from datetime import date, time
from pydantic import BaseModel

from app.schemas.reserva import ReservaResponse


class VehiculoOcupacionItem(BaseModel):
    id: int
    patente: str
    marca: str
    modelo: str
    estado: str
    activo: bool
    # La categoría, para poder agrupar las filas y filtrar por gama sin pedir
    # la flota entera aparte. El nombre viaja resuelto porque el calendario no
    # tiene la tabla de categorías a mano y cruzarla en el front obligaría a
    # una segunda consulta sólo para poner un encabezado.
    categoria_id: int | None = None
    categoria_nombre: str | None = None
    model_config = {"from_attributes": True}


class EventoOcupacion(BaseModel):
    id: int
    vehiculo_id: int
    tipo: str  # "reserva" | "alquiler"
    estado: str
    fecha_inicio: date
    hora_inicio: time
    fecha_fin: date
    hora_fin: time
    cliente_nombre: str
    lugar_entrega: str = ""
    lugar_devolucion: str = ""
    precio_total: float | None = None
    notas: str | None = None
    tiene_alquiler: bool = False

    # ── Canal (Fase 1 de la reestructuración) ────────────────────────────────
    # `origen` ya existía en `Reserva` desde la migración 047, indexado, y
    # **nunca llegaba al calendario**: el evento no lo transportaba. Sin esto,
    # una reserva web confirmada es indistinguible de una de mostrador apenas
    # sale de la bandeja, que es justamente el problema que esta fase arregla.
    #
    # Default "mostrador" y no None: un bloqueo de vehículo no tiene canal, y
    # "mostrador" es lo correcto para él —lo carga una persona— además de
    # evitarle al front un caso nulo que no aporta nada.
    origen: str = "mostrador"
    # Quién la cargó. Se resuelve a nombre acá y no en el front porque el
    # calendario no tiene la tabla de usuarios a mano. Vacío para bloqueos y
    # para lo que entró por la web (ahí el front muestra "Sitio web").
    creado_por: str = ""


class FechaEspecialOcupacion(BaseModel):
    """
    Plan de conexión (13/08), cierra C-11: hoy `fechas_especiales` se cargan
    y no se ven en ningún lado del calendario, que es la función #1 que el
    propio modelo se propone (`models/fecha_especial.py`). Va acá, y no como
    un evento por vehículo, porque una temporada de cuatro meses no ocupa una
    fila: es una banda de fondo en el encabezado de días.
    """
    id: int
    nombre: str
    fecha_desde: date
    fecha_hasta: date
    tipo: str
    color: str
    model_config = {"from_attributes": True}


class OcupacionResponse(BaseModel):
    vehiculos: list[VehiculoOcupacionItem]
    eventos: list[EventoOcupacion]
    # Plan de conexión (13/08), cierra C-1/C-7: reservas por categoría, sin
    # auto asignado. No tienen fila de vehículo donde dibujarse —por eso no
    # están en `eventos`— así que van en su propio panel, con toda la
    # información del pedido y del cliente (se reusa `ReservaResponse`
    # entero: es la misma reserva que ya devuelve el resto del sistema, no
    # una vista recortada que se puede quedar desactualizada por su cuenta).
    sin_asignar: list[ReservaResponse] = []
    fechas_especiales: list[FechaEspecialOcupacion] = []
