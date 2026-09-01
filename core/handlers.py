"""
Handlers globales de Django para rutas inexistentes y errores del servidor.

Ojo: Django solo usa estos handlers cuando DEBUG=False. Con DEBUG=True
muestra sus paginas de depuracion (que son mas utiles mientras se programa).
"""

from django.http import JsonResponse

from core.exceptions import cuerpo_de_error


def pagina_no_encontrada(request, exception=None):
    """handler404 - la URL pedida no coincide con ninguna ruta."""
    return JsonResponse(
        cuerpo_de_error(
            codigo="RUTA_NO_ENCONTRADA",
            mensaje=f"La ruta '{request.path}' no existe en esta API.",
            detalles={"sugerencia": "Consulte el mapa de rutas en GET /api/v1"},
        ),
        status=404,
        json_dumps_params={"ensure_ascii": False},
    )


def error_del_servidor(request):
    """handler500 - red de contencion final."""
    return JsonResponse(
        cuerpo_de_error(
            codigo="ERROR_INTERNO",
            mensaje="Ocurrio un error inesperado en el servidor.",
        ),
        status=500,
        json_dumps_params={"ensure_ascii": False},
    )
