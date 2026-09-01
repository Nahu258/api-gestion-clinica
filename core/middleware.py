"""
CAPA TRANSVERSAL - Middleware de manejo centralizado de errores.

Un middleware es codigo que envuelve a TODAS las vistas. Django le avisa
cuando una vista revienta con una excepcion que nadie atrapo, y si el metodo
process_exception devuelve una respuesta, Django usa esa respuesta.

Requisito de la consigna: ante fallos imprevistos devolver un JSON
estructurado con 500 Internal Server Error (y no el HTML de error de Django).
"""

import logging
import traceback
import uuid

from django.conf import settings
from django.http import JsonResponse

from core.exceptions import cuerpo_de_error

logger = logging.getLogger("core.errores")


class ManejadorCentralizadoDeErroresMiddleware:
    """Convierte cualquier excepcion no controlada en un JSON 500."""

    def __init__(self, get_response):
        # Se ejecuta UNA sola vez, al levantar el servidor.
        self.get_response = get_response

    def __call__(self, request):
        # Se ejecuta en CADA request. Aca simplemente dejamos pasar.
        return self.get_response(request)

    def process_exception(self, request, exception):
        """Se ejecuta solo si una vista levanto una excepcion no controlada."""
        # Solo interceptamos rutas de la API: el admin y el resto mantienen
        # el comportamiento normal de Django.
        if not request.path.startswith("/api/"):
            return None

        # Id de incidente: se loguea y se devuelve para poder rastrear el error.
        id_incidente = uuid.uuid4().hex[:12]

        logger.error(
            "[%s] %s %s -> %s: %s\n%s",
            id_incidente,
            request.method,
            request.path,
            type(exception).__name__,
            exception,
            traceback.format_exc(),
        )

        detalles = {"id_incidente": id_incidente}
        if settings.DEBUG:
            # En desarrollo mostramos la causa; en produccion nunca.
            detalles["excepcion"] = type(exception).__name__
            detalles["mensaje_tecnico"] = str(exception)

        return JsonResponse(
            cuerpo_de_error(
                codigo="ERROR_INTERNO",
                mensaje="Ocurrio un error inesperado en el servidor.",
                detalles=detalles,
            ),
            status=500,
            json_dumps_params={"ensure_ascii": False},
        )
