"""
Serializers de autenticación — Épica 2, issue #13.

GoogleTokenSerializer: valida el id_token enviado por el frontend.
PerfilUsuarioSerializer: representa el usuario autenticado en GET /auth/me/.
"""

from rest_framework import serializers


class GoogleTokenSerializer(serializers.Serializer):
    """Recibe el id_token de Google Identity Services."""

    id_token = serializers.CharField(
        help_text="Token de identidad emitido por Google OAuth2 (JWT firmado por Google)."
    )


class PerfilUsuarioSerializer(serializers.Serializer):
    """
    Representación pública del usuario autenticado.

    Devuelto por GET /api/v1/auth/me/.
    """

    id = serializers.IntegerField()
    email = serializers.EmailField()
    nombre = serializers.CharField()
    foto_url = serializers.URLField(allow_blank=True)
