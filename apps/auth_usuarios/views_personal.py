"""
Vistas — Gestión de usuarios del personal (operadores y médicos).

Épica 5, issue AE5-02 (#32).

GET    /api/v1/admin/usuarios/                     → listado (rol, centro_id, q, activo)
POST   /api/v1/admin/usuarios/                     → alta con contraseña inicial o generada
GET    /api/v1/admin/usuarios/{id}/                → detalle
PATCH  /api/v1/admin/usuarios/{id}/                → nombre, rol, centro, activo, matrícula
POST   /api/v1/admin/usuarios/{id}/reset-password/ → contraseña temporal nueva

Acceso: ADMIN (todo) u OPERADOR_CENTRO (sólo médicos de su centro).
"""

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auth_usuarios import services_personal as servicio
from apps.auth_usuarios.serializers import (
    ActualizarPersonalSerializer,
    CrearPersonalSerializer,
)
from apps.centros.views_admin import PaginacionAdmin
from core.permissions import IsOperadorCentro


class AdminUsuariosAPIView(APIView):
    permission_classes = [IsOperadorCentro]

    def get(self, request: Request) -> Response:
        qs = servicio.listar_personal(request.user, request.query_params)
        paginador = PaginacionAdmin()
        pagina = paginador.paginate_queryset(qs, request, view=self)
        datos = [servicio.serializar_personal(u) for u in pagina]
        return paginador.get_paginated_response(datos)

    def post(self, request: Request) -> Response:
        serializer = CrearPersonalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        usuario, password_temporal = servicio.crear_personal(
            request.user, serializer.validated_data
        )
        return Response(
            servicio.serializar_personal(usuario, password_temporal),
            status=status.HTTP_201_CREATED,
        )


class AdminUsuarioDetalleAPIView(APIView):
    permission_classes = [IsOperadorCentro]

    def get(self, request: Request, pk: int) -> Response:
        usuario = servicio.obtener_personal(request.user, pk)
        return Response(servicio.serializar_personal(usuario), status=status.HTTP_200_OK)

    def patch(self, request: Request, pk: int) -> Response:
        serializer = ActualizarPersonalSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        usuario = servicio.actualizar_personal(request.user, pk, serializer.validated_data)
        return Response(servicio.serializar_personal(usuario), status=status.HTTP_200_OK)


class AdminUsuarioResetPasswordAPIView(APIView):
    permission_classes = [IsOperadorCentro]

    def post(self, request: Request, pk: int) -> Response:
        usuario, password = servicio.resetear_password(request.user, pk)
        return Response(
            {"id": usuario.pk, "email": usuario.email, "password_temporal": password},
            status=status.HTTP_200_OK,
        )
