import json
import logging
import os

import pika
from django.core.management.base import BaseCommand

from apps.turnos.eventos import (
    COLA_EVENTOS,
    DUPLICADO,
    PROCESADO,
    SIN_CAMBIOS,
    parametros_de_conexion,
    procesar_evento,
)
from prometheus_client import start_http_server

from core import metricas
from core.observabilidad import contexto_de_traza, span

logger = logging.getLogger("emergenciaya.consumidor")


class Command(BaseCommand):
    help = "Consume eventos de RabbitMQ (ej. TurnoAtendido)"

    def handle(self, *args, **options):
        # AE4: este proceso expone sus propias métricas para Prometheus.
        start_http_server(int(os.environ.get("METRICS_PORT", "8001")))
        connection = pika.BlockingConnection(parametros_de_conexion())
        channel = connection.channel()

        channel.queue_declare(queue=COLA_EVENTOS, durable=True)
        # De a un mensaje por vez: no se toma el siguiente hasta confirmar este.
        channel.basic_qos(prefetch_count=1)

        def callback(ch, method, properties, body):
            try:
                evento = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Mensaje malformado: reintentarlo no lo arregla. Se descarta.
                self.stdout.write(self.style.ERROR(f"Mensaje invalido descartado: {body!r}"))
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return

            # AE4: se retoma la traza de la petición que publicó el evento.
            with contexto_de_traza(properties.correlation_id or evento.get("trace_id")):
                self._procesar(ch, method, evento)

        channel.basic_consume(queue=COLA_EVENTOS, on_message_callback=callback)

        self.stdout.write(self.style.SUCCESS('Esperando mensajes de RabbitMQ. Para salir presione CTRL+C'))
        channel.start_consuming()

    def _procesar(self, ch, method, evento):
        try:
            with span("consumidor.procesar", tipo=evento.get("tipo")):
                resultado = procesar_evento(evento)
        except Exception as e:
            # Primer fallo: se devuelve a la cola para un reintento.
            # Si ya era una reentrega y vuelve a fallar, se descarta.
            reintentar = not method.redelivered
            self.stdout.write(self.style.ERROR(
                f"Error procesando {evento.get('tipo')} turno {evento.get('turno_id')}: {e}"
                f" ({'se reintenta' if reintentar else 'se descarta'})"
            ))
            metricas.eventos_consumidos.labels("consumidor", "reintento" if reintentar else "descartado").inc()
            logger.error("Error procesando %s: %s", evento.get("tipo"), e,
                         extra={"tipo": evento.get("tipo"), "reintento": reintentar})
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=reintentar)
            return

        metricas.eventos_consumidos.labels("consumidor", resultado).inc()
        logger.info("Evento %s: %s", evento.get("tipo"), resultado,
                    extra={"tipo": evento.get("tipo"), "evento_id": evento.get("evento_id"), "resultado": resultado})

        if resultado == PROCESADO:
            self.stdout.write(self.style.SUCCESS(f"Turno {evento.get('turno_id')} marcado como atendido."))
        elif resultado == SIN_CAMBIOS:
            self.stdout.write(f"Turno {evento.get('turno_id')} ya estaba atendido. Sin cambios.")
        elif resultado == DUPLICADO:
            self.stdout.write(self.style.WARNING(f"Evento {evento.get('evento_id')} ya fue procesado. Ignorando."))
        ch.basic_ack(delivery_tag=method.delivery_tag)
