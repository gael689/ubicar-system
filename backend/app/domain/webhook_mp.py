"""
La firma del webhook de Mercado Pago (header `x-signature`).

**Esto no es lo que impide que alguien confirme una reserva sin pagar.** De eso
se encarga el diseño del webhook: del aviso sólo se saca un número de pago, y
el monto y el estado se vuelven a leer contra la API de Mercado Pago con
nuestro token (ver `PagoWebService.procesar_webhook`). Un aviso inventado no
consigue nada aunque pase la firma.

Lo que sí hace es cerrar la puerta a que cualquiera nos haga consultar la API
de MP a discreción con ids inventados, y darle al endpoint una forma de
distinguir un aviso real de ruido.

El formato es el que ya está andando en producción en el proyecto de JLI
(`supabase/functions/_shared/mp.ts`), replicado acá tal cual:

    x-signature: ts=1700000000,v1=<hmac-sha256 en hexa>
    manifiesto:  id:{data.id};request-id:{x-request-id};ts:{ts};

Dos detalles que no se pueden deducir leyendo el header y que cuestan una
tarde si se descubren solos:

1. **El `data.id` sale del query string**, no del cuerpo. MP manda los dos y
   firma el de la URL. Cuando no viene en la URL se cae al del cuerpo.
2. **Va en minúsculas.** Los ids de pago son numéricos y no cambia nada, pero
   los de otros recursos son alfanuméricos y ahí sí.

No se valida la antigüedad del `ts`. Mercado Pago reintenta durante horas y
firma cada reintento; poner una tolerancia sólo agrega una forma nueva de
descartar un pago legítimo.
"""
from __future__ import annotations

import hashlib
import hmac


def parsear_x_signature(header: str | None) -> tuple[str | None, str | None]:
    """El header partido en `(ts, v1)`. `(None, None)` si no se entiende."""
    if not header:
        return None, None
    partes: dict[str, str] = {}
    for trozo in header.split(","):
        clave, _, valor = trozo.partition("=")
        if valor:
            partes[clave.strip()] = valor.strip()
    return partes.get("ts"), partes.get("v1")


def manifiesto(data_id: str, request_id: str, ts: str) -> str:
    """La cadena que Mercado Pago firma. El punto y coma final es parte."""
    return f"id:{(data_id or '').lower()};request-id:{request_id or ''};ts:{ts or ''};"


def firma_valida(
    *,
    secreto: str,
    x_signature: str | None,
    x_request_id: str | None,
    data_id: str | None,
) -> bool:
    """
    ¿El aviso lo mandó Mercado Pago?

    **Sin secreto configurado devuelve `True`.** Es deliberado: la validación
    es una mejora sobre un endpoint que ya era seguro, y arrancar a rechazar
    avisos porque falta una variable de entorno significaría que ninguna
    reserva se confirma más. El que enciende la validación es el secreto.
    """
    if not secreto:
        return True
    ts, v1 = parsear_x_signature(x_signature)
    if not ts or not v1 or not data_id:
        return False

    esperado = hmac.new(
        secreto.encode("utf-8"),
        manifiesto(data_id, x_request_id or "", ts).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    # `compare_digest` y no `==`: comparar hexa carácter a carácter filtra por
    # tiempo cuánto prefijo acertó quien lo intenta.
    return hmac.compare_digest(esperado, v1)
