"""
CAPA DE CONTROLADORES (Views) - Traduce HTTP <-> logica de negocio.

Responsabilidad UNICA de esta capa:
  1. Leer la request (query params, body JSON).
  2. Pedirle al serializer que valide.
  3. Delegar el trabajo real a la capa de servicios.
  4. Devolver el codigo de estado HTTP y los headers correctos.

No hay reglas de negocio aca adentro, ni consultas a la base de datos.

Se usa APIView (y no ViewSet) a proposito: asi queda explicito un metodo por
cada verbo HTTP y se ve el status code que devuelve cada caso.
"""

from django.http import FileResponse
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clinica.services import obtener_paciente
from apps.turnos import agenda, services
from apps.turnos.comprobantes import ruta_comprobante
from apps.turnos.idempotencia import ejecutar_una_vez
from apps.turnos.serializers import ReservaTemporalSerializer, TurnoSerializer
from core.exceptions import RecursoNoEncontrado


class TurnoListaAPIView(APIView):
    """
    Coleccion de turnos.

    GET  /api/v1/turnos   -> 200 OK      listado completo
    POST /api/v1/turnos   -> 201 Created recurso creado
                             400 Bad Request si faltan campos o son invalidos
                             409 Conflict  si el profesional ya esta ocupado
    """

    def get(self, request: Request) -> Response:
        # Filtros opcionales:
        #   /api/v1/turnos?estado=pendiente&especialidad=pediatria&buscar=gomez
        turnos = services.listar_turnos(
            estado=request.query_params.get("estado"),
            especialidad=request.query_params.get("especialidad"),
            buscar=request.query_params.get("buscar"),
        )
        serializer = TurnoSerializer(turnos, many=True)
        return Response(
            {"cantidad": len(serializer.data), "resultados": serializer.data},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request) -> Response:
        """
        AE2 - Headers opcionales:
          Idempotency-Key: <uuid>   -> un reintento con la misma clave no duplica el turno.
          Body "reserva_token"      -> confirma un horario apartado con /turnos/reservas-temporales.
        """
        clave = request.headers.get("Idempotency-Key")

        def crear():
            datos = request.data.copy()
            reserva_token = datos.pop("reserva_token", None)
            if isinstance(reserva_token, list):  # form-data devuelve listas
                reserva_token = reserva_token[0] if reserva_token else None

            serializer = TurnoSerializer(data=datos)
            # raise_exception=True => si falla, DRF levanta ValidationError y
            # nuestro handler responde 400 con el detalle por campo.
            serializer.is_valid(raise_exception=True)

            turno = services.crear_turno(serializer.validated_data, reserva_token)
            # 201 Created debe incluir el header Location apuntando al recurso.
            return (
                status.HTTP_201_CREATED,
                TurnoSerializer(turno).data,
                {"Location": f"/api/v1/turnos/{turno.pk}"},
            )

        if not clave:
            estado_http, cuerpo, headers = crear()
            return Response(cuerpo, status=estado_http, headers=headers)

        estado_http, cuerpo, headers, repetido = ejecutar_una_vez(clave, request.data, crear)
        headers = {**headers, "Idempotent-Replay": "true" if repetido else "false"}
        return Response(cuerpo, status=estado_http, headers=headers)


class TurnoDetalleAPIView(APIView):
    """
    Un turno puntual identificado por su id.

    GET    /api/v1/turnos/{id} -> 200 OK / 404 Not Found
    PUT    /api/v1/turnos/{id} -> 200 OK (reemplazo completo) / 400 / 404 / 409
    PATCH  /api/v1/turnos/{id} -> 200 OK (modificacion parcial) / 400 / 404 / 409
    DELETE /api/v1/turnos/{id} -> 204 No Content / 404 / 409
    """

    def get(self, request: Request, turno_id: int) -> Response:
        turno = services.obtener_turno(turno_id)
        return Response(TurnoSerializer(turno).data, status=status.HTTP_200_OK)

    def put(self, request: Request, turno_id: int) -> Response:
        turno = services.obtener_turno(turno_id)
        serializer = TurnoSerializer(turno, data=request.data)
        serializer.is_valid(raise_exception=True)

        turno = services.actualizar_turno(turno, serializer.validated_data)
        return Response(TurnoSerializer(turno).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, turno_id: int) -> Response:
        turno = services.obtener_turno(turno_id)
        serializer = TurnoSerializer(turno, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        turno = services.actualizar_turno(turno, serializer.validated_data)
        return Response(TurnoSerializer(turno).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, turno_id: int) -> Response:
        turno = services.obtener_turno(turno_id)
        services.eliminar_turno(turno)
        # 204 No Content: exito sin cuerpo de respuesta.
        return Response(status=status.HTTP_204_NO_CONTENT)


class HistorialClinicoAPIView(APIView):
    """
    Historial clinico de un paciente: sus consultas ya atendidas.

    GET /api/v1/pacientes/{dni}/historial -> 200 OK / 400 / 404
    """

    def get(self, request: Request, dni: str) -> Response:
        consultas = services.obtener_historial_de_paciente(dni)
        serializer = TurnoSerializer(consultas, many=True)
        return Response(
            {
                "paciente_dni": dni,
                "paciente_nombre": obtener_paciente(consultas[0].paciente_id).nombre if consultas else "Desconocido",
                "cantidad_consultas": len(serializer.data),
                "consultas": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ReservaTemporalAPIView(APIView):
    """
    AE2 - Apartar un horario mientras el paciente completa sus datos.

    POST /api/v1/turnos/reservas-temporales -> 201 {token, expira_en_segundos}
                                               409 si ya esta ocupado o apartado
    """

    def post(self, request: Request) -> Response:
        serializer = ReservaTemporalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reserva = services.reservar_temporalmente(**serializer.validated_data)
        return Response(ReservaTemporalSerializer(reserva).data, status=status.HTTP_201_CREATED)


class ReservaTemporalDetalleAPIView(APIView):
    """
    GET    /api/v1/turnos/reservas-temporales/{token} -> 200 cuanto le queda / 404 vencida
    DELETE /api/v1/turnos/reservas-temporales/{token} -> 204 libera el horario
    """

    def get(self, request: Request, token: str) -> Response:
        reserva = agenda.consultar_reserva_temporal(token)
        if reserva is None:
            raise RecursoNoEncontrado("La reserva temporal no existe o ya vencio.")
        return Response(reserva, status=status.HTTP_200_OK)

    def delete(self, request: Request, token: str) -> Response:
        if not agenda.liberar_reserva_temporal(token):
            raise RecursoNoEncontrado("La reserva temporal no existe o ya vencio.")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ComprobanteAPIView(APIView):
    """
    AE2 - GET /api/v1/turnos/{id}/comprobante -> PDF con QR (lo genera el worker).
    404 si el turno no existe o si el worker todavia no genero el comprobante.
    """

    def get(self, request: Request, turno_id: int):
        services.obtener_turno(turno_id)
        ruta = ruta_comprobante(turno_id)
        if not ruta.exists():
            raise RecursoNoEncontrado(
                "El comprobante todavia no fue generado. Se genera en segundo "
                "plano: reintente en unos segundos."
            )
        return FileResponse(
            open(ruta, "rb"),
            content_type="application/pdf",
            filename=f"turno_{turno_id}.pdf",
        )


class IndiceAPIView(APIView):
    """GET /api/v1 -> mapa de rutas disponibles. Util para la demo en vivo."""

    def get(self, request: Request) -> Response:
        return Response(
            {
                "proyecto": "API de gestion de turnos e historial clinico",
                "version": "v1",
                "endpoints": {
                    "GET    /api/v1/turnos": (
                        "Listado de turnos "
                        "(filtros: ?estado= &especialidad= &buscar=)"
                    ),
                    "POST   /api/v1/turnos": "Registrar un turno",
                    "GET    /api/v1/turnos/{id}": "Obtener un turno por id",
                    "PUT    /api/v1/turnos/{id}": "Reemplazar un turno completo",
                    "PATCH  /api/v1/turnos/{id}": "Modificar campos puntuales",
                    "DELETE /api/v1/turnos/{id}": "Eliminar un turno",
                    "GET    /api/v1/pacientes/{dni}/historial": (
                        "Historial clinico del paciente"
                    ),
                    "POST   /api/v1/turnos/reservas-temporales": (
                        "AE2 - Apartar un horario por 5 minutos"
                    ),
                    "GET    /api/v1/turnos/reservas-temporales/{token}": (
                        "AE2 - Tiempo restante de la reserva temporal"
                    ),
                    "DELETE /api/v1/turnos/reservas-temporales/{token}": (
                        "AE2 - Liberar el horario apartado"
                    ),
                    "GET    /api/v1/turnos/{id}/comprobante": (
                        "AE2 - Comprobante PDF con QR"
                    ),
                    "GET    /api/v1/salud": "AE2 - Estado de base, Redis y RabbitMQ",
                },
            },
            status=status.HTTP_200_OK,
        )
