"""
Contrato del adaptador de storage.

LocalStorage es la única implementación por ahora. R2 se agrega el día que
escalemos o se mueva a hosting serverless (ver memoria storage-local-first).
"""
from typing import Protocol


class IStorage(Protocol):
    def upload(self, key: str, content: bytes, content_type: str) -> str:
        """Guarda el contenido bajo `key` y retorna la misma key (idempotente: sobrescribe si existe)."""
        ...

    def delete(self, key: str) -> None:
        """Borra el archivo. No falla si la key no existe."""
        ...

    def public_url(self, key: str) -> str:
        """URL pública/relativa donde el archivo puede ser leído por el frontend."""
        ...
