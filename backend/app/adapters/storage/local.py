"""
LocalStorage: escribe archivos en el filesystem bajo settings.storage_path.
En Docker la carpeta se bind-montea al host para persistir entre reinicios.
"""
from pathlib import Path


class LocalStorage:
    def __init__(self, base_path: str, public_prefix: str = "/static"):
        self.base = Path(base_path).resolve()
        self.base.mkdir(parents=True, exist_ok=True)
        self.public_prefix = public_prefix.rstrip("/")

    def _path(self, key: str) -> Path:
        key = key.lstrip("/")
        target = (self.base / key).resolve()
        # Anti path traversal: target tiene que estar dentro de base.
        if self.base not in target.parents and target != self.base:
            raise ValueError(f"key inválida: {key}")
        return target

    def upload(self, key: str, content: bytes, content_type: str) -> str:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return key

    def delete(self, key: str) -> None:
        target = self._path(key)
        if target.exists():
            target.unlink()

    def public_url(self, key: str) -> str:
        return f"{self.public_prefix}/{key.lstrip('/')}"
