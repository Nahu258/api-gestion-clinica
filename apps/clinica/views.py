"""
Vistas del módulo Clínica — Épica 4, issue #23 (AE4-13).
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clinica.disponibilidad import (
    get_disponibilidad_medico,
    set_disponibilidad_medico,
)
from apps.clinica.models import Medico
from core.permissions import IsMedicoEspecialista


class MiDisponibilidadAPIView(APIView):
    """
    GET   /api/v1/medicos/mi-disponibilidad/
          Consulta la disponibilidad en tiempo real y las guardias programadas del médico autenticado.

    PATCH /api/v1/medicos/mi-disponibilidad/
          Actualiza el estado de disponibilidad en Redis (DISPONIBLE, EN_ATENCION, FUERA_DE_GUARDIA).
    """

    permission_classes = [IsAuthenticated, IsMedicoEspecialista]

    def _obtener_medico(self, request: Request) -> Medico | None:
        user = request.user
        if hasattr(user, "perfil") and user.perfil.medico:
            return user.perfil.medico
        medico_id = request.query_params.get("medico_id") or request.data.get("medico_id")
        if medico_id:
            try:
                return Medico.objects.get(pk=medico_id)
            except Medico.DoesNotExist:
                return None
        return None

    def get(self, request: Request) -> Response:
        medico = self._obtener_medico(request)
        if not medico:
            return Response(
                {"error": "El usuario autenticado no tiene una ficha de médico asignada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        estado = get_disponibilidad_medico(medico.id)
        guardias = [
            {
                "id": g.id,
                "centro_id": g.centro_id,
                "centro_nombre": g.centro.nombre,
                "dia_semana": g.dia_semana,
                "dia_nombre": g.get_dia_semana_display(),
                "hora_inicio": g.hora_inicio.strftime("%H:%M"),
                "hora_fin": g.hora_fin.strftime("%H:%M"),
                "en_guardia_activa": g.en_guardia_activa,
            }
            for g in medico.guardias.select_related("centro").all()
        ]

        return Response(
            {
                "medico_id": medico.id,
                "nombre": medico.nombre,
                "matricula": medico.matricula,
                "disponibilidad_actual": estado,
                "guardias": guardias,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request) -> Response:
        medico = self._obtener_medico(request)
        if not medico:
            return Response(
                {"error": "El usuario autenticado no tiene una ficha de médico asignada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        nuevo_estado = request.data.get("estado")
        if not nuevo_estado:
            return Response(
                {"error": "El campo 'estado' es requerido (DISPONIBLE, EN_ATENCION, FUERA_DE_GUARDIA)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            estado_actualizado = set_disponibilidad_medico(medico.id, nuevo_estado)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "medico_id": medico.id,
                "nombre": medico.nombre,
                "disponibilidad_actual": estado_actualizado,
            },
            status=status.HTTP_200_OK,
        )


class MisSolicitudesMedicoAPIView(APIView):
    """
    GET /api/v1/medicos/mis-solicitudes/?estado=DERIVADO,EN_ATENCION

    Devuelve la cola de pacientes derivados y en atención asignados al médico,
    junto con el contador de atenciones finalizadas hoy.
    """

    permission_classes = [IsAuthenticated, IsMedicoEspecialista]

    def get(self, request: Request) -> Response:
        from apps.atencion.models import SolicitudAtencion
        from apps.atencion.serializers import SolicitudAtencionSerializer
        from django.utils import timezone

        user = request.user
        medico_id = None
        if hasattr(user, "perfil") and user.perfil.medico_id:
            medico_id = user.perfil.medico_id
        elif request.query_params.get("medico_id"):
            medico_id = int(request.query_params.get("medico_id"))

        if not medico_id:
            return Response(
                {"error": "El usuario no tiene una ficha de médico asociada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        qs = SolicitudAtencion.objects.filter(medico_asignado_id=medico_id).select_related(
            "centro", "especialidad_asignada", "medico_asignado"
        )

        estado_param = request.query_params.get("estado")
        if estado_param:
            estados = [e.strip() for e in estado_param.split(",") if e.strip()]
            qs = qs.filter(estado__in=estados)

        solicitudes = qs.order_by("-fecha_derivacion", "-creado_en")

        hoy_inicio = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        atendidos_hoy = SolicitudAtencion.objects.filter(
            medico_asignado_id=medico_id,
            estado=SolicitudAtencion.Estado.ATENDIDO,
            atendido_en__gte=hoy_inicio,
        ).count()

        serializer = SolicitudAtencionSerializer(solicitudes, many=True)
        return Response(
            {
                "medico_id": medico_id,
                "atendidos_hoy": atendidos_hoy,
                "solicitudes": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
