"""
CAPA DE CONTROLADORES — Especialidades y plantel médico por institución.

Épica 5, issue AE5-03 (#33).

Catálogo global (alta/edición sólo ADMIN; lectura ADMIN u operadores):
    GET/POST  /api/v1/especialidades/
    GET/PATCH /api/v1/especialidades/{id}/

Por centro (ADMIN u OPERADOR_CENTRO del mismo centro):
    PATCH     /api/v1/centros/{id}/especialidades/{esp_id}/   → activo (+ forzar)
    GET       /api/v1/centros/{id}/medicos/                   → plantel agrupado por médico
    GET/PATCH /api/v1/centros/{id}/medicos/{medico_id}/       → datos y asignaciones
    GET       /api/v1/medicos/buscar/?matricula=|email=       → vincular médico existente
"""

from django.db.models import Q
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.centros import services_plantel as plantel
from apps.centros.serializers import (
    ActualizarEspecialidadCentroSerializer,
    ActualizarMedicoPlantelSerializer,
    EspecialidadCatalogoSerializer,
)
from core.exceptions import cuerpo_de_error
from core.permissions import IsAdminOOperadorDelCentro, IsAdminUserRole, IsOperadorCentro


class EspecialidadesCatalogoAPIView(APIView):
    """Catálogo global de especialidades."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminUserRole()]
        return [IsOperadorCentro()]

    def get(self, request: Request) -> Response:
        qs = plantel.catalogo_con_conteos()
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(codigo__icontains=q))
        return Response(EspecialidadCatalogoSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        serializer = EspecialidadCatalogoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        especialidad = serializer.save()
        especialidad = plantel.obtener_especialidad_catalogo(especialidad.pk)
        return Response(
            EspecialidadCatalogoSerializer(especialidad).data, status=status.HTTP_201_CREATED
        )


class EspecialidadCatalogoDetalleAPIView(APIView):
    """Detalle (con los centros donde está vinculada) y edición del catálogo."""

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsAdminUserRole()]
        return [IsOperadorCentro()]

    def get(self, request: Request, pk: int) -> Response:
        especialidad = plantel.obtener_especialidad_catalogo(pk)
        datos = EspecialidadCatalogoSerializer(especialidad).data
        datos["centros_detalle"] = plantel.centros_de_especialidad(especialidad)
        return Response(datos, status=status.HTTP_200_OK)

    def patch(self, request: Request, pk: int) -> Response:
        especialidad = plantel.obtener_especialidad_catalogo(pk)
        serializer = EspecialidadCatalogoSerializer(especialidad, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        especialidad = plantel.obtener_especialidad_catalogo(pk)
        return Response(EspecialidadCatalogoSerializer(especialidad).data, status=status.HTTP_200_OK)


class CentroEspecialidadDetalleAPIView(APIView):
    """Habilita o deshabilita una especialidad en el centro."""

    permission_classes = [IsAdminOOperadorDelCentro]

    def patch(self, request: Request, centro_id: int, especialidad_id: int) -> Response:
        centro = plantel.obtener_centro(centro_id)
        serializer = ActualizarEspecialidadCentroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        vinculo, conflicto = plantel.cambiar_estado_especialidad_centro(
            centro, especialidad_id, activo=datos["activo"], forzar=datos["forzar"]
        )
        if conflicto:
            return Response(
                cuerpo_de_error(
                    codigo="DERIVACIONES_ABIERTAS",
                    mensaje=(
                        f"La especialidad tiene {conflicto['derivaciones_abiertas']} paciente(s) "
                        "derivado(s) o en atención. Cerralos o confirmá con 'forzar'."
                    ),
                    detalles=conflicto,
                ),
                status=status.HTTP_409_CONFLICT,
            )

        esp = vinculo.especialidad
        return Response(
            {
                "id": esp.id,
                "nombre": esp.nombre,
                "codigo": esp.codigo,
                "descripcion": esp.descripcion,
                "icono": esp.icono,
                "activo": vinculo.activo,
            },
            status=status.HTTP_200_OK,
        )


class CentroMedicosAPIView(APIView):
    """Plantel médico del centro (incluye médicos y asignaciones inactivas)."""

    permission_classes = [IsAdminOOperadorDelCentro]

    def get(self, request: Request, centro_id: int) -> Response:
        centro = plantel.obtener_centro(centro_id)
        resultados = plantel.plantel_del_centro(centro, request.query_params)
        return Response(
            {"centro_id": centro.id, "cantidad": len(resultados), "resultados": resultados},
            status=status.HTTP_200_OK,
        )


class CentroMedicoDetalleAPIView(APIView):
    """Detalle y edición de un médico del plantel."""

    permission_classes = [IsAdminOOperadorDelCentro]

    def get(self, request: Request, centro_id: int, medico_id: int) -> Response:
        centro = plantel.obtener_centro(centro_id)
        medico = plantel.obtener_medico_del_centro(centro, medico_id)
        return Response(plantel.detalle_medico_plantel(centro, medico), status=status.HTTP_200_OK)

    def patch(self, request: Request, centro_id: int, medico_id: int) -> Response:
        centro = plantel.obtener_centro(centro_id)
        medico = plantel.obtener_medico_del_centro(centro, medico_id)
        serializer = ActualizarMedicoPlantelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plantel.actualizar_medico_plantel(centro, medico, serializer.validated_data)
        return Response(plantel.detalle_medico_plantel(centro, medico), status=status.HTTP_200_OK)


class BuscarMedicoAPIView(APIView):
    """
    GET /api/v1/medicos/buscar/?matricula=MP 1234  |  ?email=medico@...

    Coincidencia exacta, para "Vincular médico existente" (AE5-11).
    Acceso: ADMIN u OPERADOR_CENTRO.
    """

    permission_classes = [IsOperadorCentro]

    def get(self, request: Request) -> Response:
        resultados = plantel.buscar_medico_existente(
            matricula=request.query_params.get("matricula", ""),
            email=request.query_params.get("email", ""),
        )
        return Response({"cantidad": len(resultados), "resultados": resultados}, status=status.HTTP_200_OK)
