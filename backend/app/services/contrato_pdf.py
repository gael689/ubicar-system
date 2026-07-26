from typing import Any


def generar_contrato_pdf(datos: dict[str, Any]) -> bytes:
    """Genera el PDF del contrato de alquiler."""
    # TODO: implementar con WeasyPrint o reportlab
    raise NotImplementedError("Generación de PDF pendiente de implementación")


def generar_link_prellenado(alquiler_id: int, base_url: str) -> str:
    """Genera el link para que el cliente complete el contrato online."""
    import secrets
    token = secrets.token_urlsafe(32)
    return f"{base_url}/contratos/firmar/{token}"
