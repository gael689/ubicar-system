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

# ─── Qué se sirve por el dominio público y qué no ────────────────────────────
#
# El dominio público de un bucket **no pide credenciales**: quien conoce la
# clave, se baja el archivo. Y las claves de los contratos son predecibles
# (`contratos/7/firma.png`), así que publicarlas equivale a dejar las firmas y
# los contratos escaneados al alcance de cualquiera que cuente del 1 en
# adelante.
#
# Por eso la regla es al revés de lo intuitivo: **público sólo lo que tiene que
# ser público**, que son las fotos del catálogo —las muestra el sitio a
# visitantes sin login, no hay nada que proteger—. Todo lo demás sale con URL
# firmada, que vence.
#
# Si mañana hace falta publicar otro prefijo, se agrega acá y queda a la vista
# en el diff. Al revés —una lista de lo privado— un prefijo nuevo nacería
# público por olvido, que es exactamente cómo se filtran estas cosas.
PREFIJOS_PUBLICOS = ("categorias/",)

# Una hora. Alcanza de sobra para abrir un documento o imprimir un contrato, y
# limita la ventana de un link que se comparte por error.
SEGUNDOS_URL_FIRMADA = 3600


def es_publica(key: str) -> bool:
    """¿Esta clave se puede servir por el dominio público del bucket?"""
    return key.lstrip("/").startswith(PREFIJOS_PUBLICOS)


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
        """
        La URL con la que el navegador lee este archivo.

        **Depende de qué archivo sea** (ver `PREFIJOS_PUBLICOS`):

        - Fotos del catálogo → el dominio público del bucket. Son permanentes,
          se cachean en el CDN y no pasan por la API.
        - Todo lo demás —contratos, firmas, documentos de clientes, fotos de
          daños— → **URL firmada que vence en una hora**. Caduca a propósito:
          no se puede guardar ni indexar, y un link filtrado deja de servir.
        """
        key = key.lstrip("/")
        if self.public_base_url and es_publica(key):
            return f"{self.public_base_url}/{key}"
        return self._cliente.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=SEGUNDOS_URL_FIRMADA,
        )

    @staticmethod
    def _adivinar_tipo(key: str) -> str:
        tipo, _ = mimetypes.guess_type(key)
        return tipo or "application/octet-stream"
