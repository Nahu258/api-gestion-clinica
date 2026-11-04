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


# ---------------------------------------------------------------------------
# Épica 5 — AE5-02: gestión de usuarios del personal
# ---------------------------------------------------------------------------

ROLES_PERSONAL_GESTIONABLES = [("OPERADOR_CENTRO", "Operador de Centro"), ("MEDICO", "Médico Especialista")]


class CrearPersonalSerializer(serializers.Serializer):
    """Payload de POST /api/v1/admin/usuarios/."""

    email = serializers.EmailField(max_length=150)
    nombre = serializers.CharField(max_length=150)
    rol = serializers.ChoiceField(choices=ROLES_PERSONAL_GESTIONABLES)
    centro_id = serializers.IntegerField(required=False, allow_null=True)
    password = serializers.CharField(
        required=False, allow_blank=True, max_length=128, trim_whitespace=False,
        help_text="Contraseña inicial. Si se omite se genera una temporal.",
    )
    # Sólo para rol MEDICO
    matricula = serializers.CharField(required=False, allow_blank=True, max_length=50, default="")
    medico_id = serializers.IntegerField(
        required=False, allow_null=True,
        help_text="Ficha de médico existente (sin cuenta) a vincular.",
    )
    especialidad_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list,
        help_text="Especialidades activas del centro a asignar al médico.",
    )

    def validate_nombre(self, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("El nombre no puede estar vacío.")
        return valor


class ActualizarPersonalSerializer(serializers.Serializer):
    """Payload de PATCH /api/v1/admin/usuarios/{id}/ (todos opcionales)."""

    nombre = serializers.CharField(required=False, max_length=150)
    rol = serializers.ChoiceField(required=False, choices=ROLES_PERSONAL_GESTIONABLES)
    centro_id = serializers.IntegerField(required=False, allow_null=True)
    activo = serializers.BooleanField(required=False)
    matricula = serializers.CharField(required=False, allow_blank=True, max_length=50)
    medico_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_nombre(self, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("El nombre no puede estar vacío.")
        return valor
