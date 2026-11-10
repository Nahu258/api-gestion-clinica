"""
AE2 - Publicacion de eventos de dominio en RabbitMQ.

Topologia:
  exchange  clinica.eventos (topic, durable)
     └── routing key turno.reservado ──> cola turnos.comprobantes
                                          └── si falla ──> turnos.comprobantes.dlq

Formato de todos los eventos:
  {
    "event_id":    "uuid",          <- clave para que el consumidor sea idempotente
    "tipo":        "TurnoReservado",
    "version":     1,
    "ocurrido_en": "2026-10-01T10:00:00+00:00",
    "datos":       {...}
  }
"""

import json
import logging
import uuid

import pika
from django.conf import settings
from django.utils import timezone

from core import metricas
from core.observabilidad import span, trace_id_actual
from core.resiliencia import CircuitoAbierto, circuito_rabbitmq, llamada_protegida, resolver_con_timeout

logger = logging.getLogger(__name__)

EXCHANGE = "clinica.eventos"
COLA_COMPROBANTES = "turnos.comprobantes"
COLA_COMPROBANTES_DLQ = "turnos.comprobantes.dlq"
RK_TURNO_RESERVADO = "turno.reservado"


def conectar() -> pika.BlockingConnection:
    parametros = pika.URLParameters(settings.RABBITMQ_URL)
    parametros.socket_timeout = 3
    parametros.connection_attempts = 1
    resolver_con_timeout(parametros.host, parametros.port)
    return pika.BlockingConnection(parametros)


def declarar_topologia(canal) -> None:
    """Crea exchange, cola y cola de mensajes fallidos (si ya existen, no hace nada)."""
    canal.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
    canal.queue_declare(queue=COLA_COMPROBANTES_DLQ, durable=True)
    canal.queue_declare(
        queue=COLA_COMPROBANTES,
        durable=True,
        arguments={
            # Si el consumidor rechaza un mensaje, va a la DLQ en vez de perderse.
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": COLA_COMPROBANTES_DLQ,
        },
    )
    canal.queue_bind(
        queue=COLA_COMPROBANTES, exchange=EXCHANGE, routing_key=RK_TURNO_RESERVADO
    )


def armar_evento(tipo: str, datos: dict) -> dict:
    return {
        "event_id": str(uuid.uuid4()),
        "tipo": tipo,
        "version": 1,
        "ocurrido_en": timezone.now().isoformat(),
        "trace_id": trace_id_actual.get(),  # AE4: correlación con la petición de origen
        "datos": datos,
    }


def publicar(routing_key: str, evento: dict) -> bool:
    """
    Publica el evento. Si RabbitMQ esta caido NO rompe la reserva: el turno
    ya quedo guardado, se registra el error en el log y se devuelve False.

    AE4 - Resiliencia: socket_timeout de 3 s, 2 intentos con backoff y
    circuit breaker compartido con el resto de los productores.
    (Mejora posible: patron outbox para reintentar la publicacion.)
    """
    if not settings.EVENTOS_HABILITADOS:
        return False

    def _publicar():
        conexion = conectar()
        try:
            canal = conexion.channel()
            declarar_topologia(canal)
            canal.basic_publish(
                exchange=EXCHANGE,
                routing_key=routing_key,
                body=json.dumps(evento),
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # persistente: sobrevive a un reinicio de RabbitMQ
                    message_id=evento["event_id"],
                    correlation_id=evento.get("trace_id"),
                    type=evento["tipo"],
                ),
            )
        finally:
            conexion.close()

    try:
        with span("rabbitmq.publicar", tipo=evento["tipo"]):
            llamada_protegida(circuito_rabbitmq, _publicar)
    except CircuitoAbierto:
        metricas.eventos_publicados.labels(evento["tipo"], "circuito_abierto").inc()
        logger.warning("Evento %s no publicado: circuito de RabbitMQ abierto", evento["tipo"])
        return False
    except Exception:  # noqa: BLE001
        metricas.eventos_publicados.labels(evento["tipo"], "error").inc()
        logger.exception("No se pudo publicar el evento %s", evento["tipo"])
        return False
    metricas.eventos_publicados.labels(evento["tipo"], "ok").inc()
    logger.info("Evento %s publicado (%s)", evento["tipo"], evento["event_id"])
    return True
