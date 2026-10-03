"""
Vistas de autenticación — Épica 2, issues #13 y #14.

POST /api/v1/auth/google/    → intercambia id_token de Google por JWT propio
POST /api/v1/auth/refresh/   → renueva el access_token con el refresh_token
GET  /api/v1/auth/me/        → devuelve el perfil del usuario autenticado
POST /api/v1/auth/invitado/  → genera token de invitado temporal (Redis)
"""

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios import services
from apps.auth_usuarios import services_invitado
from apps.auth_usuarios.serializers import (
    GoogleTokenSerializer,
    InvitadoSerializer,
    PerfilUsuarioSerializer,
)

logger = logging.getLogger(__name__)


class GoogleLoginAPIView(APIView):
    """
    POST /api/v1/auth/google/

    Recibe el id_token de Google Identity Services, lo verifica,
    crea o recupera el usuario y devuelve JWT propios.

    Body:
        { "id_token": "<JWT de Google>" }

    Respuestas:
        201 Created  → { access_token, refresh_token, token_type, usuario }
        400          → id_token ausente
        401          → id_token inválido o expirado
    """

    def post(self, request: Request) -> Response:
        serializer = GoogleTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = services.autenticar_con_google(
                serializer.validated_data["id_token"]
            )
        except services.TokenGoogleInvalidoError as exc:
            logger.warning("Intento de login con token Google inválido: %s", exc)
            return Response(
                {"error": "Token de Google inválido o expirado.", "detalle": str(exc)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(resultado, status=status.HTTP_201_CREATED)


class RefreshTokenAPIView(APIView):
    """
    POST /api/v1/auth/refresh/

    Renueva el access_token usando el refresh_token.

    Body:
        { "refresh": "<refresh_token>" }

    Respuestas:
        200  → { access_token }
        401  → refresh_token inválido o expirado
    """

    def post(self, request: Request) -> Response:
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"error": "El campo 'refresh' es requerido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            nuevo_access = str(token.access_token)
        except (TokenError, InvalidToken) as exc:
            return Response(
                {"error": "Refresh token inválido o expirado.", "detalle": str(exc)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response({"access_token": nuevo_access}, status=status.HTTP_200_OK)


class MeAPIView(APIView):
    """
    GET /api/v1/auth/me/

    Devuelve el perfil del usuario autenticado.
    Requiere header: Authorization: Bearer <access_token>

    Respuestas:
        200  → { id, email, nombre, foto_url }
        401  → sin token o token inválido
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        foto_url = ""

        # Intentar obtener foto_url desde PerfilExtendido si existe
        try:
            foto_url = user.perfil.foto_url
        except Exception:  # noqa: BLE001
            pass

        datos = {
            "id": user.pk,
            "email": user.email,
            "nombre": f"{user.first_name} {user.last_name}".strip() or user.username,
            "foto_url": foto_url,
        }

        serializer = PerfilUsuarioSerializer(datos)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InvitadoLoginAPIView(APIView):
    """
    POST /api/v1/auth/invitado/

    Genera un token de invitado temporal almacenado en Redis (TTL 2h).
    No requiere registro ni contraseña.

    Body (opcional):
        { "nombre": "Juan" }

    Respuestas:
        201 Created  → { token, expira_en, nombre }
        503          → Redis no disponible
    """

    def post(self, request: Request) -> Response:
        serializer = InvitadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        nombre = serializer.validated_data.get("nombre", "")

        try:
            resultado = services_invitado.crear_token_invitado(nombre=nombre)
        except Exception as exc:  # noqa: BLE001
            logger.error("Error al crear token de invitado en Redis: %s", exc)
            return Response(
                {"error": "No se pudo crear el token de invitado. Intentá de nuevo."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(resultado, status=status.HTTP_201_CREATED)
