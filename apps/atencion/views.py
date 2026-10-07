"""
CAPA DE CONTROLADORES — Módulo Atención de Emergencias.

POST   /api/v1/atencion/solicitudes/        → 201 Created
GET    /api/v1/atencion/solicitudes/{id}/   → 200 OK
PATCH  /api/v1/atencion/solicitudes/{id}/   → 200 OK (solo cambia estado)
"""

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.atencion import services
from apps.atencion.serializers import (
    DerivarSolicitudSerializer,
    SolicitudAtencionSerializer,
    SolicitudEstadoSerializer,
)
from core.permissions import IsOperadorCentro


class SolicitudListaAPIView(APIView):
    """
    Colección de solicitudes de atención.

    POST /api/v1/atencion/solicitudes/
        201 Created  + header Location si todo OK.
        400 Bad Request si faltan campos o el centro no existe.
    """

    def post(self, request: Request) -> Response:
        serializer = SolicitudAtencionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        solicitud = services.crear_solicitud(serializer.validated_data)

        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/v1/atencion/solicitudes/{solicitud.pk}/"},
        )


class SolicitudDetalleAPIView(APIView):
    """
    Recurso individual de una SolicitudAtencion.

    GET   /api/v1/atencion/solicitudes/{id}/   → 200 OK | 404
    PATCH /api/v1/atencion/solicitudes/{id}/   → 200 OK | 400 | 404 | 409
    """

    def get(self, request: Request, solicitud_id: int) -> Response:
        solicitud = services.obtener_solicitud(solicitud_id)
        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, solicitud_id: int) -> Response:
        solicitud = services.obtener_solicitud(solicitud_id)

        serializer = SolicitudEstadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        solicitud = services.actualizar_estado(
            solicitud, serializer.validated_data["estado"]
        )
        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_200_OK,
        )


class DerivarSolicitudAPIView(APIView):
    """
    POST /api/v1/atencion/solicitudes/{id}/derivar/

    Deriva la solicitud de atención a un especialista y médico asignado.
    Permisos: Solo OPERADOR_CENTRO o ADMIN.
    """

    permission_classes = [IsOperadorCentro]

    def post(self, request: Request, solicitud_id: int) -> Response:
        serializer = DerivarSolicitudSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        solicitud = services.derivar_solicitud(
            solicitud_id=solicitud_id,
            especialidad_id=datos["especialidad_id"],
            medico_id=datos["medico_id"],
            usuario_operador=request.user,
            prioridad=datos.get("prioridad", "alta"),
            observaciones=datos.get("observaciones", ""),
        )

        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_200_OK,
        )

