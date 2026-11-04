"""
CAPA DE CONTROLADORES — Consola del superadmin: gestión de instituciones.

Épica 5, issue AE5-01 (#31).

GET    /api/v1/admin/centros/                    → listado paginado (incluye inactivos)
POST   /api/v1/admin/centros/                    → alta de institución
GET    /api/v1/admin/centros/{id}/               → detalle completo
PATCH  /api/v1/admin/centros/{id}/               → edición parcial
POST   /api/v1/admin/centros/{id}/desactivar/    → baja lógica
POST   /api/v1/admin/centros/{id}/activar/       → reactivación

Todos los endpoints exigen rol ADMIN (o superuser/staff).
"""

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.centros import services
from apps.centros.serializers import CentroAdminSerializer
from core.permissions import IsAdminUserRole


class PaginacionAdmin(PageNumberPagination):
    """Paginación de las consolas: ?page=N&page_size=M (máx. 100)."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminCentrosAPIView(APIView):
    """Listado y alta de instituciones."""

    permission_classes = [IsAdminUserRole]

    def get(self, request: Request) -> Response:
        qs = services.filtrar_centros_admin(request.query_params)
        paginador = PaginacionAdmin()
        pagina = paginador.paginate_queryset(qs, request, view=self)
        datos = CentroAdminSerializer(pagina, many=True).data
        return paginador.get_paginated_response(datos)

    def post(self, request: Request) -> Response:
        serializer = CentroAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        centro = serializer.save()
        centro = services.obtener_centro_admin(centro.pk)
        return Response(CentroAdminSerializer(centro).data, status=status.HTTP_201_CREATED)


class AdminCentroDetalleAPIView(APIView):
    """Detalle y edición parcial de una institución (activa o no)."""

    permission_classes = [IsAdminUserRole]

    def get(self, request: Request, pk: int) -> Response:
        centro = services.obtener_centro_admin(pk)
        return Response(CentroAdminSerializer(centro).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, pk: int) -> Response:
        centro = services.obtener_centro_admin(pk)
        serializer = CentroAdminSerializer(centro, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        centro = services.obtener_centro_admin(pk)
        return Response(CentroAdminSerializer(centro).data, status=status.HTTP_200_OK)


class AdminCentroDesactivarAPIView(APIView):
    """Baja lógica: el centro deja de aparecer en búsquedas públicas."""

    permission_classes = [IsAdminUserRole]

    def post(self, request: Request, pk: int) -> Response:
        centro = services.cambiar_estado_centro(pk, activo=False)
        return Response(CentroAdminSerializer(centro).data, status=status.HTTP_200_OK)


class AdminCentroActivarAPIView(APIView):
    """Reactiva un centro dado de baja."""

    permission_classes = [IsAdminUserRole]

    def post(self, request: Request, pk: int) -> Response:
        centro = services.cambiar_estado_centro(pk, activo=True)
        return Response(CentroAdminSerializer(centro).data, status=status.HTTP_200_OK)


class AdminResumenAPIView(APIView):
    """
    GET /api/v1/admin/resumen/ — Épica 5, AE5-14 (#44).

    KPIs de la red, estado de guardia por institución y alertas de
    configuración (centros sin especialidades, médicos u operador).
    """

    permission_classes = [IsAdminUserRole]

    def get(self, request: Request) -> Response:
        return Response(services.resumen_de_la_red(), status=status.HTTP_200_OK)
