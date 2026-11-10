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
from apps.atencion.permissions import (
    CanViewFichaClinica,
    IsMedicoAsignadoOAdmin,
    PuedeAccederSolicitud,
)
from apps.atencion.serializers import (
    CompletarAtencionSerializer,
    DerivarSolicitudSerializer,
    SolicitudAtencionSerializer,
    SolicitudEstadoSerializer,
)
from core.exceptions import RecursoNoEncontrado
from core.permissions import IsOperadorCentro, IsPacienteRegistrado


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

        datos = dict(serializer.validated_data)
        # La identidad sale del JWT, nunca del cuerpo de la petición.
        datos["usuario_id"] = request.user.id if request.user.is_authenticated else None
        solicitud = services.crear_solicitud(datos)

        respuesta = SolicitudAtencionSerializer(solicitud).data
        # Único momento en que se entrega el código: el invitado lo necesita
        # para consultar o cancelar su solicitud sin cuenta.
        respuesta["codigo_seguimiento"] = solicitud.codigo_seguimiento
        return Response(
            respuesta,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/v1/atencion/solicitudes/{solicitud.pk}/"},
        )


class SolicitudDetalleAPIView(APIView):
    """
    Recurso individual de una SolicitudAtencion.

    GET   /api/v1/atencion/solicitudes/{id}/   → 200 OK | 404
    PATCH /api/v1/atencion/solicitudes/{id}/   → 200 OK | 400 | 404 | 409

    Acceso con control de propiedad (ver PuedeAccederSolicitud): el JWT del
    dueño, el header X-Codigo-Seguimiento o el personal de la solicitud.
    Sin acceso se responde 404, igual que si el id no existiera.
    """

    permission_classes = [PuedeAccederSolicitud]

    def _obtener_autorizada(self, request: Request, solicitud_id: int):
        solicitud = services.obtener_solicitud(solicitud_id)
        if not PuedeAccederSolicitud().has_object_permission(request, self, solicitud):
            raise RecursoNoEncontrado(f"No existe una solicitud con id {solicitud_id}.")
        return solicitud

    def get(self, request: Request, solicitud_id: int) -> Response:
        solicitud = self._obtener_autorizada(request, solicitud_id)
        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, solicitud_id: int) -> Response:
        solicitud = self._obtener_autorizada(request, solicitud_id)

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


class IniciarAtencionAPIView(APIView):
    """
    POST /api/v1/atencion/solicitudes/{id}/iniciar-atencion/

    Transiciona la solicitud a EN_ATENCION.
    Permiso: Solo el médico asignado o ADMIN.
    """

    permission_classes = [IsMedicoAsignadoOAdmin]

    def post(self, request: Request, solicitud_id: int) -> Response:
        solicitud = services.obtener_solicitud(solicitud_id)
        self.check_object_permissions(request, solicitud)

        solicitud = services.iniciar_atencion(solicitud_id)
        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_200_OK,
        )


class CompletarAtencionAPIView(APIView):
    """
    POST /api/v1/atencion/solicitudes/{id}/completar/

    Cierra la atención médica pasando a ATENDIDO, guarda diagnóstico e indicaciones
    y emite el evento en RabbitMQ.
    Permiso: Solo el médico asignado o ADMIN.
    """

    permission_classes = [IsMedicoAsignadoOAdmin]

    def post(self, request: Request, solicitud_id: int) -> Response:
        solicitud = services.obtener_solicitud(solicitud_id)
        self.check_object_permissions(request, solicitud)

        serializer = CompletarAtencionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        solicitud = services.completar_atencion(
            solicitud_id=solicitud_id,
            diagnostico=serializer.validated_data["diagnostico"],
            indicaciones=serializer.validated_data.get("indicaciones", ""),
        )
        return Response(
            SolicitudAtencionSerializer(solicitud).data,
            status=status.HTTP_200_OK,
        )


class FichaClinicaAPIView(APIView):
    """
    GET /api/v1/atencion/solicitudes/{id}/ficha-clinica/

    Devuelve la información clínica del episodio y antecedentes del paciente si está registrado.
    Permiso: Médico asignado, Operador del centro o ADMIN.
    """

    permission_classes = [CanViewFichaClinica]

    def get(self, request: Request, solicitud_id: int) -> Response:
        solicitud = services.obtener_solicitud(solicitud_id)
        self.check_object_permissions(request, solicitud)

        ficha = services.obtener_ficha_clinica(solicitud_id)
        return Response(ficha, status=status.HTTP_200_OK)


class PacienteHistorialAPIView(APIView):
    """
    GET /api/v1/pacientes/mi-historial/

    Devuelve el historial clínico del paciente registrado autenticado.
    Permiso: Rol PACIENTE o ADMIN (usuarios con cuenta propia).
    """

    permission_classes = [IsPacienteRegistrado]

    def get(self, request: Request) -> Response:
        historial = services.obtener_historial_paciente(request.user.id)
        return Response(historial, status=status.HTTP_200_OK)

