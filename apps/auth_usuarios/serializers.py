"""
Serializers de autenticación — Épica 2, issues #13 y #14.

GoogleTokenSerializer: valida el id_token enviado por el frontend.
PerfilUsuarioSerializer: representa el usuario autenticado en GET /auth/me/.
InvitadoSerializer: recibe el nombre opcional del invitado.
"""

from rest_framework import serializers


class GoogleTokenSerializer(serializers.Serializer):
    """Recibe el id_token de Google Identity Services."""

    id_token = serializers.CharField(
        help_text="Token de identidad emitido por Google OAuth2 (JWT firmado por Google)."
    )


class LoginPasswordSerializer(serializers.Serializer):
    """Credenciales para POST /auth/login/."""

    email = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PerfilUsuarioSerializer(serializers.Serializer):
    """
    Representación pública del usuario autenticado.

    Devuelto por GET /api/v1/auth/me/.
    """

    id = serializers.IntegerField()
    email = serializers.EmailField()
    nombre = serializers.CharField()
    foto_url = serializers.URLField(allow_blank=True, default="")
    rol = serializers.CharField(default="PACIENTE")
    centro_id = serializers.IntegerField(allow_null=True, required=False, default=None)
    centro_nombre = serializers.CharField(allow_blank=True, required=False, default="")
    medico_id = serializers.IntegerField(allow_null=True, required=False, default=None)
    medico_nombre = serializers.CharField(allow_blank=True, required=False, default="")
    medico_matricula = serializers.CharField(allow_blank=True, required=False, default="")
    medico_especialidad = serializers.CharField(allow_blank=True, required=False, default="")



class InvitadoSerializer(serializers.Serializer):
    """Recibe el nombre opcional del invitado para POST /auth/invitado/."""

    nombre = serializers.CharField(
        max_length=120,
        required=False,
        default="",
        allow_blank=True,
        help_text="Nombre opcional del invitado. Si no se envía, el invitado es anónimo.",
    )
