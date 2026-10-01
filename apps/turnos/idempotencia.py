"""
AE2 - Idempotencia de POST /api/v1/turnos con el header Idempotency-Key.

Problema: el cliente manda el POST, se corta la conexion antes de recibir
la respuesta y reintenta. Sin control, se crean DOS turnos.

Solucion: el cliente genera una clave unica por operacion (un UUID) y la
manda en el header. El servidor guarda en Redis el resultado asociado a esa
clave durante 24 h:

  * Misma clave + mismo body  -> devuelve la respuesta guardada, no crea nada.
  * Misma clave + otro body   -> 422 (la clave se esta reutilizando mal).
  * Misma clave todavia en proceso (dos pedidos simultaneos) -> 409.
"""

import hashlib
import json

from core.exceptions import DatosNoProcesables, ReglaDeNegocioViolada
from core.redis_client import redis_o_503

TTL_RESULTADO = 24 * 60 * 60
TTL_EN_PROCESO = 60


def _huella(datos) -> str:
    if hasattr(datos, "dict"):
        datos = datos.dict()
    return hashlib.sha256(
        json.dumps(datos, sort_keys=True, default=str).encode()
    ).hexdigest()


def ejecutar_una_vez(clave: str, datos, operacion):
    """
    Ejecuta `operacion()` una sola vez por clave.
    `operacion` devuelve (status_code, cuerpo, headers).
    Devuelve (status_code, cuerpo, headers, es_repeticion).
    """
    r = redis_o_503()
    clave_redis = f"idempotencia:turnos:{clave}"
    huella = _huella(datos)

    tomada = r.set(
        clave_redis,
        json.dumps({"estado": "en_proceso", "huella": huella}),
        nx=True,
        ex=TTL_EN_PROCESO,
    )

    if not tomada:
        guardado = json.loads(r.get(clave_redis) or "{}")
        if guardado.get("huella") != huella:
            raise DatosNoProcesables(
                "La Idempotency-Key ya se uso con otros datos. "
                "Genere una clave nueva para cada operacion distinta."
            )
        if guardado.get("estado") == "en_proceso":
            raise ReglaDeNegocioViolada(
                "Ya hay un pedido en proceso con esta Idempotency-Key."
            )
        return guardado["status"], guardado["cuerpo"], guardado["headers"], True

    try:
        estado_http, cuerpo, headers = operacion()
    except Exception:
        # Si fallo (400, 409...) se libera la clave: el cliente puede corregir y reintentar.
        r.delete(clave_redis)
        raise

    r.set(
        clave_redis,
        json.dumps(
            {
                "estado": "completado",
                "huella": huella,
                "status": estado_http,
                "cuerpo": cuerpo,
                "headers": headers,
            },
            default=str,
        ),
        ex=TTL_RESULTADO,
    )
    return estado_http, cuerpo, headers, False
