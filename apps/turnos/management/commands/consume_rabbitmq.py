import json
import pika
from django.core.management.base import BaseCommand
from django.core.cache import cache
from apps.turnos.services import obtener_turno, actualizar_turno
from apps.turnos.models import Turno

class Command(BaseCommand):
    help = 'Consume eventos de RabbitMQ (ej. TurnoAtendido)'

    def handle(self, *args, **options):
        connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
        channel = connection.channel()

        channel.queue_declare(queue='eventos_clinica', durable=True)

        def callback(ch, method, properties, body):
            evento = json.loads(body)
            tipo_evento = evento.get("tipo")
            
            if tipo_evento == "TurnoAtendido":
                turno_id = evento.get("turno_id")
                diagnostico = evento.get("diagnostico", "")
                indicaciones = evento.get("indicaciones", "")
                
                # Idempotencia usando Redis
                evento_id = evento.get("evento_id", f"turno_atendido_{turno_id}")
                cache_key = f"procesado_{evento_id}"
                
                if cache.get(cache_key):
                    self.stdout.write(self.style.WARNING(f"Evento {evento_id} ya fue procesado. Ignorando."))
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    return
                
                try:
                    turno = obtener_turno(turno_id)
                    # Si ya estaba atendido, también lo consideramos idempotente
                    if turno.estado != Turno.Estado.ATENDIDO:
                        actualizar_turno(turno, {
                            "estado": Turno.Estado.ATENDIDO,
                            "diagnostico": diagnostico,
                            "indicaciones": indicaciones
                        })
                    
                    # Marcar como procesado por 24 horas
                    cache.set(cache_key, True, timeout=60*60*24)
                    self.stdout.write(self.style.SUCCESS(f"Turno {turno_id} marcado como atendido."))
                    
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error procesando turno {turno_id}: {e}"))
                    
            ch.basic_ack(delivery_tag=method.delivery_tag)

        channel.basic_consume(queue='eventos_clinica', on_message_callback=callback)

        self.stdout.write(self.style.SUCCESS('Esperando mensajes de RabbitMQ. Para salir presione CTRL+C'))
        channel.start_consuming()
