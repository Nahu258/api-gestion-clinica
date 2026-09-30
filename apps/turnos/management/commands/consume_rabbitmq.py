import json

import pika
from django.core.management.base import BaseCommand

from apps.turnos.eventos import (
    COLA_EVENTOS,
    DUPLICADO,
    PROCESADO,
    parametros_de_conexion,
    procesar_evento,
)


class Command(BaseCommand):
    help = "Consume eventos de RabbitMQ (ej. TurnoAtendido)"

    def handle(self, *args, **options):
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

            try:
                resultado = procesar_evento(evento)
            except Exception as e:
                # Primer fallo: se devuelve a la cola para un reintento.
                # Si ya era una reentrega y vuelve a fallar, se descarta.
                reintentar = not method.redelivered
                self.stdout.write(self.style.ERROR(
                    f"Error procesando {evento.get('tipo')} turno {evento.get('turno_id')}: {e}"
                    f" ({'se reintenta' if reintentar else 'se descarta'})"
                ))
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=reintentar)
                return

            if resultado == PROCESADO:
                self.stdout.write(self.style.SUCCESS(f"Turno {evento.get('turno_id')} marcado como atendido."))
            elif resultado == DUPLICADO:
                self.stdout.write(self.style.WARNING(f"Evento {evento.get('evento_id')} ya fue procesado. Ignorando."))
            ch.basic_ack(delivery_tag=method.delivery_tag)

        channel.basic_consume(queue=COLA_EVENTOS, on_message_callback=callback)

        self.stdout.write(self.style.SUCCESS('Esperando mensajes de RabbitMQ. Para salir presione CTRL+C'))
        channel.start_consuming()
