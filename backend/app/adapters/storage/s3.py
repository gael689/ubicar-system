"""
S3Storage — almacenamiento en un bucket compatible con S3.

Sirve para **Cloudflare R2**, AWS S3, MinIO o cualquier otro compatible: lo
único que cambia entre ellos es el `endpoint_url`.

**Por qué hace falta para producción.** `LocalStorage` escribe en el disco del
servidor. En un hosting serverless ese disco es efímero: todo lo que se sube
desaparece al reciclarse la instancia — documentos de clientes, PDFs de
comprobantes, **fotos de los partes de daños** y **las firmas de los
contratos**. Justo lo que haría falta el día que hay un reclamo.

R2 es la opción recomendada por una razón concreta: **no cobra egreso**. Un
sistema que muestra fotos de daños y reimprime contratos lee mucho más de lo
que escribe, y en S3 eso se paga por GB servido.

`boto3` ya estaba en las dependencias, así que esto no agrega ninguna.
"""
from __future__ import annotations

import mimetypes
from functools import cached_property


class S3Storage:
    """
    Implementa `IStorage` contra un bucket S3-compatible.

    `public_base_url` es la URL desde la que el navegador lee los archivos. En
    R2 es el dominio público del bucket (o uno propio, tipo
    `archivos.ubicar-rent.com.ar`). Si no se configura, `public_url` devuelve
    una URL firmada temporal — sirve para que nada se rompa, pero conviene
    configurar el dominio: una URL firmada caduca y no se puede guardar.
    """

    def __init__(
        self,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
        endpoint_url: str,
        public_base_url: str = "",
        region: str = "auto",
    ) -> None:
        if not bucket:
            raise ValueError("storage_bucket es obligatorio para el storage S3/R2")
        if not (access_key_id and secret_access_key):
            raise ValueError("Faltan las credenciales del storage (access key / secret)")

        self.bucket = bucket
        self.endpoint_url = endpoint_url or None
        self.public_base_url = public_base_url.rstrip("/")
        self._credenciales = {
            "aws_access_key_id": access_key_id,
            "aws_secret_access_key": secret_access_key,
            "region_name": region,
        }

    @cached_property
    def _cliente(self):
        # El import va acá y no arriba para que el módulo se pueda importar sin
        # boto3 instalado — el arranque no debería depender de una dependencia
        # que quizás no se usa (en desarrollo el storage es local).
        import boto3

        return boto3.client("s3", endpoint_url=self.endpoint_url, **self._credenciales)

    # ── IStorage ──────────────────────────────────────────────────────────

    def upload(self, key: str, content: bytes, content_type: str) -> str:
        key = key.lstrip("/")
        self._cliente.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content,
            ContentType=content_type or self._adivinar_tipo(key),
        )
        return key

    def read(self, key: str) -> bytes:
        respuesta = self._cliente.get_object(Bucket=self.bucket, Key=key.lstrip("/"))
        return respuesta["Body"].read()

    def delete(self, key: str) -> None:
        # S3 no falla si la key no existe, igual que LocalStorage.
        self._cliente.delete_object(Bucket=self.bucket, Key=key.lstrip("/"))

    def public_url(self, key: str) -> str:
        key = key.lstrip("/")
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        # Sin dominio público configurado, una URL firmada por una hora. Es un
        # fallback para que nada quede roto, no la forma de operar: caduca, así
        # que no se puede guardar ni mandar por mail.
        return self._cliente.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=3600,
        )

    @staticmethod
    def _adivinar_tipo(key: str) -> str:
        tipo, _ = mimetypes.guess_type(key)
        return tipo or "application/octet-stream"
