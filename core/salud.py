"""
AE2 - Chequeo de salud de la infraestructura.

GET /api/v1/salud  -> dice si la API llega a la base, a Redis y a RabbitMQ.
Sirve para demostrar que los contenedores estan levantados y conectados.
"""

import pika
import redis
from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view
from rest_framework.response import Response


def _chequear(funcion) -> str:
    try:
        funcion()
        return "ok"
    except Exception as error:  # noqa: BLE001 - queremos informar cualquier falla
        return f"error: {error.__class__.__name__}"


def _base_de_datos():
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")


def _redis():
    redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2).ping()


def _rabbitmq():
    parametros = pika.URLParameters(settings.RABBITMQ_URL)
    parametros.socket_timeout = 2
    parametros.connection_attempts = 1
    pika.BlockingConnection(parametros).close()


@api_view(["GET"])
def salud(request):
    estado = {
        "base_de_datos": _chequear(_base_de_datos),
        "motor": connection.vendor,
        "redis": _chequear(_redis),
        "rabbitmq": _chequear(_rabbitmq),
    }
    todo_ok = all(v == "ok" for k, v in estado.items() if k != "motor")
    return Response(estado, status=200 if todo_ok else 503)
