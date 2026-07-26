"""
Helpers para construir respuestas HTTP consistentes.
Toda respuesta exitosa usa el envelope { data, message, success }.
"""
from typing import Any


def ok(data: Any, message: str = "OK") -> dict:
    """Respuesta estándar para una sola entidad o resultado."""
    return {"data": data, "message": message, "success": True}


def paginated(
    data: list,
    total: int,
    page: int,
    page_size: int,
    message: str = "OK",
) -> dict:
    """Respuesta paginada para listados."""
    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "success": True,
        "message": message,
    }
