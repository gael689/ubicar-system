"""
Sube al bucket todo lo que hoy vive en el disco local.

Se corre **una sola vez**, antes de cambiar `STORAGE_PROVIDER` a `r2` en
produccion. Las `archivo_key` guardadas en la base **no cambian**: son las
mismas rutas relativas en los dos storages, asi que no hay que migrar ni una
fila.

    python -m scripts.migrar_storage_a_blob            # sube
    python -m scripts.migrar_storage_a_blob --verificar # solo compara

Es idempotente: subir dos veces sobrescribe con lo mismo.
"""
import mimetypes
import sys
from pathlib import Path

from app.adapters.storage import S3Storage
from app.config import settings


def destino() -> S3Storage:
    if not settings.storage_bucket:
        raise SystemExit("Falta STORAGE_BUCKET")
    if not (settings.storage_access_key_id and settings.storage_secret_access_key):
        raise SystemExit("Faltan las credenciales del storage")
    return S3Storage(
        bucket=settings.storage_bucket,
        access_key_id=settings.storage_access_key_id,
        secret_access_key=settings.storage_secret_access_key,
        endpoint_url=settings.storage_endpoint_url,
        public_base_url=settings.storage_public_base_url,
    )


def archivos_locales() -> list[tuple[str, Path]]:
    base = Path(settings.storage_path).resolve()
    if not base.exists():
        return []
    return [
        (str(f.relative_to(base)).replace("\\", "/"), f)
        for f in base.rglob("*")
        if f.is_file()
    ]


def main() -> None:
    solo_verificar = "--verificar" in sys.argv
    archivos = archivos_locales()

    if not archivos:
        print(f"No hay archivos en {settings.storage_path}. Nada que migrar.")
        return

    total_bytes = sum(f.stat().st_size for _, f in archivos)
    print(f"{len(archivos)} archivo(s), {total_bytes / 1024 / 1024:.1f} MB")
    print(f"Bucket destino: {settings.storage_bucket}\n")

    blob = destino()
    subidos = fallidos = 0

    for key, ruta in archivos:
        if solo_verificar:
            try:
                blob.read(key)
                print(f"  OK    {key}")
            except Exception:
                print(f"  FALTA {key}")
                fallidos += 1
            continue

        try:
            tipo, _ = mimetypes.guess_type(key)
            blob.upload(key, ruta.read_bytes(), tipo or "application/octet-stream")
            print(f"  subido {key}")
            subidos += 1
        except Exception as e:
            print(f"  ERROR  {key}: {str(e)[:120]}")
            fallidos += 1

    print()
    if solo_verificar:
        print(f"Faltan en el bucket: {fallidos}" if fallidos else "Todo presente en el bucket.")
    else:
        print(f"Subidos: {subidos} | Errores: {fallidos}")
        if not fallidos:
            print("\nListo. Ya se puede poner STORAGE_PROVIDER=r2.")
            print("**No borres el disco local hasta verificar con --verificar**")
            print("y haber probado la aplicacion apuntando al bucket.")


if __name__ == "__main__":
    main()
