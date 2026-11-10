"""
EVENTOS ASINCRONICOS (RabbitMQ) del modulo Turnos.

  * publicar_evento: PRODUCTOR. Lo usa la capa de servicios despues de
    persistir un cambio (TurnoCreado, TurnoAtendido).
  * procesar_evento: logica del CONSUMIDOR, sin nada de pika, para poder
    probarla en un test. El comando `consume_rabbitmq` solo la envuelve.

Contrato de los mensajes (JSON, cola durable `eventos_clinica`):

    {"evento_id": "<uuid>", "tipo": "TurnoAtendido", "turno_id": 12,
     "diagnostico": "...", "indicaciones": "..."}
"""

import json
import logging
import uuid

import pika
from django.conf import settings
from django.core.cache import cache

from core import metricas
from core.exceptions import DatosInvalidos
from core.observabilidad import span, trace_id_actual
from core.resiliencia import CircuitoAbierto, circuito_rabbitmq, llamada_protegida, resolver_con_timeout

logger = logging.getLogger(__name__)

COLA_EVENTOS = "eventos_clinica"
# Cuanto tiempo se recuerda que un evento ya fue procesado.
TTL_EVENTO_PROCESADO = 60 * 60 * 24


def parametros_de_conexion() -> pika.URLParameters:
    return pika.URLParameters(settings.RABBITMQ_URL)


def parametros_de_publicacion() -> pika.URLParameters:
    """
    Para PUBLICAR desde una petición HTTP: timeouts cortos y un solo intento
    de conexión. Los reintentos los maneja core.resiliencia (con backoff) y el
    circuit breaker corta en seco si RabbitMQ está caído, así un aviso nunca
    espera los ~6 s que tardaría pika con sus reintentos por defecto.
    """
    parametros = pika.URLParameters(settings.RABBITMQ_URL)
    parametros.socket_timeout = 2
    parametros.blocked_connection_timeout = 2
    parametros.connection_attempts = 1
    return parametros


def publicar_evento(tipo: str, payload: dict) -> str | None:
    """
    Publica un evento persistente en RabbitMQ y devuelve su evento_id.

    AE4 - Resiliencia: 2 intentos con backoff dentro de un circuit breaker.
    Si el broker no responde, se registra el error y se devuelve None: la
    operacion principal (que ya se guardo) no falla por un efecto secundario.
    El evento lleva el trace_id de la petición que lo originó (correlación).
    """
    mensaje = {
        "evento_id": str(uuid.uuid4()),
        "tipo": tipo,
        "trace_id": trace_id_actual.get(),
        **payload,
    }

    def _publicar():
        parametros = parametros_de_publicacion()
        resolver_con_timeout(parametros.host, parametros.port)
        conexion = pika.BlockingConnection(parametros)
        try:
            canal = conexion.channel()
            canal.queue_declare(queue=COLA_EVENTOS, durable=True)
            canal.basic_publish(
                exchange="",
                routing_key=COLA_EVENTOS,
                body=json.dumps(mensaje),
                properties=pika.BasicProperties(
                    delivery_mode=pika.spec.PERSISTENT_DELIVERY_MODE,
                    content_type="application/json",
                    message_id=mensaje["evento_id"],
                    correlation_id=mensaje["trace_id"],
                    type=tipo,
                ),
            )
        finally:
            conexion.close()

    try:
        with span("rabbitmq.publicar", tipo=tipo):
            llamada_protegida(circuito_rabbitmq, _publicar)
    except CircuitoAbierto:
        metricas.eventos_publicados.labels(tipo, "circuito_abierto").inc()
        logger.warning("Evento %s no publicado: circuito de RabbitMQ abierto", tipo, extra={"tipo": tipo})
        return None
    except Exception:
        # Mejora posible: tabla outbox para reintentar la publicacion mas tarde.
        metricas.eventos_publicados.labels(tipo, "error").inc()
        logger.exception("No se pudo publicar el evento %s", tipo, extra={"tipo": tipo})
        return None
    metricas.eventos_publicados.labels(tipo, "ok").inc()
    logger.info("Evento %s publicado", tipo, extra={"tipo": tipo, "evento_id": mensaje["evento_id"]})
    return mensaje["evento_id"]


# ---------------------------------------------------------------------------
# Consumidor
# ---------------------------------------------------------------------------
PROCESADO = "procesado"
SIN_CAMBIOS = "sin_cambios"
DUPLICADO = "duplicado"
IGNORADO = "ignorado"


def procesar_evento(evento: dict) -> str:
    """
    Aplica un evento recibido de la cola. Es idempotente: el mismo evento
    entregado dos veces produce el efecto una sola vez.

    Devuelve PROCESADO (se aplico), SIN_CAMBIOS (el turno ya estaba
    atendido, ej. lo cerro la propia API), DUPLICADO o IGNORADO. Si falla, levanta la excepcion
    y libera la marca para que un reintento pueda volver a procesarlo.
    """
    if evento.get("tipo") != "TurnoAtendido":
        return IGNORADO

    turno_id = evento.get("turno_id")
    evento_id = evento.get("evento_id") or f"turno_atendido_{turno_id}"
    clave = f"procesado_{evento_id}"

    # cache.add es atomico (SET NX en Redis): solo UN consumidor gana la marca.
    if not cache.add(clave, True, timeout=TTL_EVENTO_PROCESADO):
        return DUPLICADO

    try:
        aplicado = _aplicar_turno_atendido(turno_id, evento)
    except Exception:
        cache.delete(clave)
        raise
    return PROCESADO if aplicado else SIN_CAMBIOS


def _aplicar_turno_atendido(turno_id, evento: dict) -> bool:
    """Marca el turno como atendido. Devuelve False si ya lo estaba."""
    # Import local: services importa este modulo para publicar.
    from apps.turnos.models import Turno
    from apps.turnos.services import actualizar_turno, obtener_turno

    turno = obtener_turno(turno_id)
    # Segunda barrera: si ya esta atendido (ej. lo cerro la propia API),
    # no hay nada que aplicar.
    if turno.estado == Turno.Estado.ATENDIDO:
        return False

    # Misma regla que la API: no hay turno atendido sin diagnostico.
    if not (evento.get("diagnostico") or "").strip():
        raise DatosInvalidos(f"El evento TurnoAtendido del turno {turno_id} no trae diagnostico.")

    actualizar_turno(
        turno,
        {
            "estado": Turno.Estado.ATENDIDO,
            "diagnostico": evento.get("diagnostico", ""),
            "indicaciones": evento.get("indicaciones", ""),
        },
        publicar_eventos=False,
    )
    return True
