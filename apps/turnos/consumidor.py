"""
AE2 - Logica del consumidor del evento TurnoReservado.

Separada del comando para poder testearla sin RabbitMQ.

IDEMPOTENCIA DEL CONSUMIDOR: RabbitMQ garantiza "al menos una vez". Si el
worker genera el PDF pero se cae antes de mandar el ack, RabbitMQ vuelve a
entregar el MISMO mensaje. Para no procesarlo dos veces se registra cada
event_id en Redis con SET NX: si ya estaba, se descarta.
"""

import json
import logging

from core.redis_client import get_redis
from apps.turnos.comprobantes import generar_comprobante

logger = logging.getLogger(__name__)

TTL_EVENTO_PROCESADO = 7 * 24 * 60 * 60


class EventoInvalido(Exception):
    pass


def procesar_mensaje(cuerpo: bytes | str) -> str:
    """
    Devuelve "procesado" o "duplicado".
    Levanta EventoInvalido si el mensaje no se puede interpretar.
    """
    try:
        evento = json.loads(cuerpo)
        event_id = evento["event_id"]
        datos = evento["datos"]
        tipo = evento["tipo"]
    except (ValueError, KeyError, TypeError) as error:
        raise EventoInvalido(f"Mensaje mal formado: {error}") from error

    if tipo != "TurnoReservado":
        raise EventoInvalido(f"Tipo de evento no soportado: {tipo}")

    r = get_redis()
    clave = f"evento:procesado:{event_id}"
    if not r.set(clave, "1", nx=True, ex=TTL_EVENTO_PROCESADO):
        logger.info("Evento %s ya procesado: se descarta", event_id)
        return "duplicado"

    try:
        ruta = generar_comprobante(datos)
    except Exception:
        # Si fallo, se borra la marca para que un reintento pueda procesarlo.
        r.delete(clave)
        raise

    logger.info("Comprobante generado: %s", ruta)
    return "procesado"
