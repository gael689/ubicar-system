"""
Excepciones de dominio del sistema.
Un middleware en main.py las traduce a HTTPException con el status code apropiado.
"""


class NotFoundError(Exception):
    """Entidad no encontrada."""

    def __init__(self, entity: str, id: int | str):
        self.entity = entity
        self.id = id
        super().__init__(f"{entity} con id={id} no encontrado")


class ConflictError(Exception):
    """Conflicto de datos: solapamientos, duplicados, unicidad."""

    def __init__(self, message: str):
        super().__init__(message)


class BusinessRuleError(Exception):
    """Violación de regla de negocio: transición inválida, contrato faltante, etc."""

    def __init__(self, rule: str, message: str):
        self.rule = rule
        super().__init__(f"[{rule}] {message}")


class UnauthorizedError(Exception):
    """Acción no permitida para el usuario actual."""

    def __init__(self, reason: str = "No autorizado"):
        super().__init__(reason)
