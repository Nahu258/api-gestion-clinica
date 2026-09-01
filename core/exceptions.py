"""
CAPA TRANSVERSAL - Excepciones de dominio y formato unico de error.

Idea central: la capa de servicios NO sabe nada de HTTP. Cuando algo sale mal
levanta una excepcion de negocio (ej. RecursoNoEncontrado) y ESTE archivo se
encarga de traducirla al codigo de estado HTTP correcto y a un JSON con
siempre la misma forma:

    {
      "error": {
        "codigo":   "RECURSO_NO_ENCONTRADO",
        "mensaje":  "No existe un turno con id 99.",
        "detalles": {}
      }
    }
"""

from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as manejador_por_defecto_drf


# ---------------------------------------------------------------------------
# Excepciones propias del dominio
# ---------------------------------------------------------------------------
class ErrorDeAplicacion(APIException):
    """Base de todos los errores controlados del proyecto."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    codigo = "ERROR_INTERNO"
    default_detail = "Ocurrio un error inesperado."


class RecursoNoEncontrado(ErrorDeAplicacion):
    """404 - Se pidio un recurso por id y no existe."""

    status_code = status.HTTP_404_NOT_FOUND
    codigo = "RECURSO_NO_ENCONTRADO"
    default_detail = "El recurso solicitado no existe."


class DatosInvalidos(ErrorDeAplicacion):
    """400 - El payload recibido no cumple las reglas de validacion."""

    status_code = status.HTTP_400_BAD_REQUEST
    codigo = "DATOS_INVALIDOS"
    default_detail = "Los datos enviados no son validos."


class ReglaDeNegocioViolada(ErrorDeAplicacion):
    """409 - El pedido es sintacticamente valido pero rompe una regla."""

    status_code = status.HTTP_409_CONFLICT
    codigo = "CONFLICTO"
    default_detail = "La operacion viola una regla de negocio."


# ---------------------------------------------------------------------------
# Constructor del cuerpo de error
# ---------------------------------------------------------------------------
def cuerpo_de_error(codigo: str, mensaje: str, detalles=None) -> dict:
    """Arma el diccionario de error con la estructura estandarizada."""
    return {
        "error": {
            "codigo": codigo,
            "mensaje": mensaje,
            "detalles": detalles or {},
        }
    }


# Mapa: codigo de estado HTTP -> codigo interno legible
CODIGOS_POR_ESTADO = {
    400: "DATOS_INVALIDOS",
    401: "NO_AUTENTICADO",
    403: "SIN_PERMISOS",
    404: "RECURSO_NO_ENCONTRADO",
    405: "METODO_NO_PERMITIDO",
    409: "CONFLICTO",
    415: "TIPO_DE_CONTENIDO_NO_SOPORTADO",
    500: "ERROR_INTERNO",
}

MENSAJES_POR_ESTADO = {
    400: "Los datos enviados no son validos.",
    404: "El recurso solicitado no existe.",
    405: "El metodo HTTP no esta permitido para esta ruta.",
    409: "La operacion viola una regla de negocio.",
    415: "El Content-Type enviado no esta soportado.",
}


def manejador_de_excepciones(exc, context):
    """
    Handler de DRF. Se ejecuta ante CUALQUIER excepcion levantada dentro de
    una vista de DRF y devuelve el error con nuestro formato unificado.

    Devolver None significa "no se como manejar esto": DRF vuelve a levantar
    la excepcion y la atrapa el middleware de 500.
    """
    respuesta = manejador_por_defecto_drf(exc, context)

    if respuesta is None:
        # Excepcion no prevista -> la maneja core.middleware (500).
        return None

    estado = respuesta.status_code

    # 1) Errores de validacion del serializer -> 400 con el detalle por campo.
    if isinstance(exc, ValidationError):
        respuesta.data = cuerpo_de_error(
            codigo="DATOS_INVALIDOS",
            mensaje="Los datos enviados no son validos. Revise los campos indicados.",
            detalles=exc.detail,
        )
        return respuesta

    # 2) Http404 de Django (ej. get_object_or_404).
    if isinstance(exc, Http404):
        respuesta.data = cuerpo_de_error(
            codigo="RECURSO_NO_ENCONTRADO",
            mensaje=str(exc) or MENSAJES_POR_ESTADO[404],
        )
        return respuesta

    # 3) Excepciones propias del dominio.
    if isinstance(exc, ErrorDeAplicacion):
        respuesta.data = cuerpo_de_error(
            codigo=exc.codigo,
            mensaje=str(exc.detail),
        )
        return respuesta

    # 4) Cualquier otro error conocido por DRF (405, 401, 403, 415...).
    respuesta.data = cuerpo_de_error(
        codigo=CODIGOS_POR_ESTADO.get(estado, "ERROR"),
        mensaje=MENSAJES_POR_ESTADO.get(estado, str(getattr(exc, "detail", exc))),
    )
    return respuesta
