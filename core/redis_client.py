"""
AE2 - Acceso unico a Redis.

Todo el proyecto pide la conexion por aca. En los tests se usa un Redis
en memoria (fakeredis) para no depender de que el contenedor este levantado.
"""

from functools import lru_cache

import redis
from django.conf import settings

from core.exceptions import ServicioNoDisponible


@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    if settings.REDIS_URL.startswith("fakeredis://"):
        import fakeredis

        return fakeredis.FakeRedis(decode_responses=True)
    return redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


def redis_o_503() -> redis.Redis:
    """Devuelve el cliente y traduce una caida de Redis a un 503 claro."""
    cliente = get_redis()
    try:
        cliente.ping()
    except redis.exceptions.RedisError:
        raise ServicioNoDisponible(
            "Redis no esta disponible. No se pueden procesar reservas en este momento."
        )
    return cliente
