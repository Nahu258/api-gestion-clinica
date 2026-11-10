"""
AE2 - Worker que consume la cola turnos.comprobantes.

Uso:  python manage.py consumir_turnos
(En docker-compose corre solo, como el servicio `worker`.)
"""

import logging
import os
import time

from django.core.management.base import BaseCommand

from prometheus_client import start_http_server

from apps.turnos.consumidor import EventoInvalido, procesar_mensaje
from core import metricas
from core.eventos import COLA_COMPROBANTES, conectar, declarar_topologia
from core.observabilidad import contexto_de_traza, span

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Consume eventos TurnoReservado y genera el comprobante PDF con QR."

    def handle(self, *args, **opciones):
        # AE4: este proceso expone sus propias métricas para Prometheus.
        start_http_server(int(os.environ.get("METRICS_PORT", "8002")))
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
            # AE4: el correlation_id del mensaje es el trace_id de la petición de origen.
            with contexto_de_traza(propiedades.correlation_id):
                self._procesar(ch, metodo, propiedades, cuerpo)

        canal.basic_consume(queue=COLA_COMPROBANTES, on_message_callback=al_recibir)
        self.stdout.write(f"Worker escuchando la cola '{COLA_COMPROBANTES}'...")
        canal.start_consuming()

    def _procesar(self, ch, metodo, propiedades, cuerpo):
        try:
            with span("worker.comprobante", evento_id=propiedades.message_id):
                resultado = procesar_mensaje(cuerpo)
            metricas.eventos_consumidos.labels("worker", str(resultado)).inc()
            logger.info("Comprobante: %s", resultado, extra={"evento_id": propiedades.message_id})
            self.stdout.write(f"[{resultado}] {propiedades.message_id}")
            ch.basic_ack(delivery_tag=metodo.delivery_tag)
        except EventoInvalido as error:
            # No tiene sentido reintentar: va directo a la DLQ.
            metricas.eventos_consumidos.labels("worker", "invalido").inc()
            logger.error("Mensaje invalido: %s", error)
            self.stderr.write(f"[invalido] {error}")
            ch.basic_nack(delivery_tag=metodo.delivery_tag, requeue=False)
        except Exception as error:  # noqa: BLE001
            if metodo.redelivered:
                # Ya se reintento una vez y volvio a fallar -> DLQ.
                metricas.eventos_consumidos.labels("worker", "dlq").inc()
                logger.error("Fallo definitivo, mensaje a la DLQ: %s", error)
                self.stderr.write(f"[fallo definitivo] {error}")
                ch.basic_nack(delivery_tag=metodo.delivery_tag, requeue=False)
            else:
                metricas.eventos_consumidos.labels("worker", "reintento").inc()
                logger.warning("Fallo, se reintenta: %s", error)
                self.stderr.write(f"[fallo, se reintenta] {error}")
                ch.basic_nack(delivery_tag=metodo.delivery_tag, requeue=True)

