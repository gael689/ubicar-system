from app.adapters.storage.interface import IStorage
from app.adapters.storage.local import LocalStorage

from app.adapters.storage.s3 import S3Storage

__all__ = ["IStorage", "LocalStorage", "S3Storage"]
