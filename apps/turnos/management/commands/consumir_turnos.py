"""
AE2 - Worker que consume la cola turnos.comprobantes.

Uso:  python manage.py consumir_turnos
(En docker-compose corre solo, como el servicio `worker`.)
"""

import logging
import time

from django.core.management.base import BaseCommand

from apps.turnos.consumidor import EventoInvalido, procesar_mensaje
from core.eventos import COLA_COMPROBANTES, conectar, declarar_topologia

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Consume eventos TurnoReservado y genera el comprobante PDF con QR."

    def handle(self, *args, **opciones):
        while True:
            try:
                self._consumir()
            except KeyboardInterrupt:
                self.stdout.write("Worker detenido.")
                return
            except Exception as error:  # noqa: BLE001
                # RabbitMQ caido o reiniciando: se reintenta la conexion.
                self.stderr.write(f"Sin conexion con RabbitMQ ({error}). Reintento en 5 s...")
                time.sleep(5)

    def _consumir(self):
        conexion = conectar()
        canal = conexion.channel()
        declarar_topologia(canal)
        # De a un mensaje por vez: no se toma el siguiente hasta confirmar el actual.
        canal.basic_qos(prefetch_count=1)

        def al_recibir(ch, metodo, propiedades, cuerpo):
            try:
                resultado = procesar_mensaje(cuerpo)
                self.stdout.write(f"[{resultado}] {propiedades.message_id}")
                ch.basic_ack(delivery_tag=metodo.delivery_tag)
            except EventoInvalido as error:
                # No tiene sentido reintentar: va directo a la DLQ.
                self.stderr.write(f"[invalido] {error}")
                ch.basic_nack(delivery_tag=metodo.delivery_tag, requeue=False)
            except Exception as error:  # noqa: BLE001
                if metodo.redelivered:
                    # Ya se reintento una vez y volvio a fallar -> DLQ.
                    self.stderr.write(f"[fallo definitivo] {error}")
                    ch.basic_nack(delivery_tag=metodo.delivery_tag, requeue=False)
                else:
                    self.stderr.write(f"[fallo, se reintenta] {error}")
                    ch.basic_nack(delivery_tag=metodo.delivery_tag, requeue=True)

        canal.basic_consume(queue=COLA_COMPROBANTES, on_message_callback=al_recibir)
        self.stdout.write(f"Worker escuchando la cola '{COLA_COMPROBANTES}'...")
        canal.start_consuming()
