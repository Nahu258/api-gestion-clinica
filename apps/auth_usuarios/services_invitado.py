"""
Modo invitado con token temporal en Redis — Épica 2, issue #14.

Endpoint:
    POST /api/v1/auth/invitado/
      Body: { "nombre": "Juan" }  # opcional
      Response: { "token": "guest_abc123", "expira_en": "..." }

El token es un UUID almacenado en Redis: guest:{uuid} con TTL 7200 s (2h).
El permission class IsGuestOrAuthenticated acepta tanto JWT como el
header X-Guest-Token.
"""

import logging
import uuid
from datetime import timedelta

import redis as redis_lib
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# TTL del token de invitado: 2 horas
GUEST_TOKEN_TTL_SEGUNDOS = 7200
GUEST_TOKEN_PREFIX = "guest:"


def _get_redis_client():
    """
    Devuelve un cliente de Redis configurado con la URL del proyecto.

    Soporta fakeredis:// para los tests (configurado en settings.py cuando
    sys.argv[1] == 'test').
    """
    url = settings.REDIS_URL

    if url.startswith("fakeredis://"):
        try:
            import fakeredis
            return fakeredis.FakeRedis(decode_responses=True)
        except ImportError:
            raise RuntimeError(
                "fakeredis no está instalado. Agrégalo a requirements.txt."
            )

    return redis_lib.from_url(url, decode_responses=True)


def crear_token_invitado(nombre: str = "") -> dict:
    """
    Genera un token de invitado, lo guarda en Redis con TTL de 2h y lo devuelve.

    Parámetros:
        nombre (str): Nombre opcional del invitado.

    Retorna:
        {
            "token": "guest_<uuid>",
            "expira_en": "2026-10-01T21:00:00Z",
            "nombre": "Juan",
        }

    Lanza:
        redis.RedisError si no se puede conectar a Redis.
    """
    token_id = uuid.uuid4().hex
    token = f"guest_{token_id}"
    redis_key = f"{GUEST_TOKEN_PREFIX}{token}"
    expira_en = timezone.now() + timedelta(seconds=GUEST_TOKEN_TTL_SEGUNDOS)

    cliente = _get_redis_client()
    datos = {"nombre": nombre, "token": token}
    # Guardamos el token con TTL (ex=segundos)
    cliente.hset(redis_key, mapping=datos)
    cliente.expire(redis_key, GUEST_TOKEN_TTL_SEGUNDOS)

    logger.info("Token de invitado creado: %s (expira: %s)", token, expira_en.isoformat())

    return {
        "token": token,
        "expira_en": expira_en.isoformat(),
        "nombre": nombre,
    }


def validar_token_invitado(token: str) -> dict | None:
    """
    Verifica si un token de invitado es válido en Redis.

    Retorna los datos del invitado si el token existe y no expiró.
    Retorna None si el token no existe o expiró.

    Parámetros:
        token (str): El token a validar (debe empezar con "guest_").
    """
    if not token or not token.startswith("guest_"):
        return None

    redis_key = f"{GUEST_TOKEN_PREFIX}{token}"

    try:
        cliente = _get_redis_client()
        datos = cliente.hgetall(redis_key)
        if not datos:
            return None
        return datos
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error al validar token de invitado en Redis: %s", exc)
        return None
