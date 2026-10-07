"""
Permission class IsGuestOrAuthenticated — Épica 2, issue #14.

Acepta CUALQUIERA de estas dos formas de autenticación:
  1. JWT propio (Bearer token via simplejwt)   → usuarios registrados
  2. Header X-Guest-Token: guest_abc123        → invitados con token Redis

Si ninguna de las dos está presente, la request se rechaza con 401.
"""

from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from apps.auth_usuarios.services_invitado import validar_token_invitado


class IsGuestOrAuthenticated(BasePermission):
    """
    Permite el acceso si el usuario:
      - Está autenticado con JWT (usuario registrado), O
      - Presenta un X-Guest-Token válido en el header (invitado)

    Uso en las vistas:
        permission_classes = [IsGuestOrAuthenticated]

    Después de que la permission valida al invitado, podés acceder a los
    datos del invitado con request.guest_data (dict con 'nombre', 'token').
    """

    message = "Se requiere autenticación JWT o un X-Guest-Token válido."

    def has_permission(self, request, view) -> bool:
        # ── 1. Intentar autenticación JWT ─────────────────────────────────────
        if self._es_usuario_jwt_valido(request):
            return True

        # ── 2. Intentar token de invitado ──────────────────────────────────
        guest_token = request.META.get("HTTP_X_GUEST_TOKEN", "").strip()
        if guest_token:
            datos = validar_token_invitado(guest_token)
            if datos is not None:
                # Adjuntamos los datos del invitado a la request para uso en la vista
                request.guest_data = datos
                request.is_guest = True
                return True

        return False

    def _es_usuario_jwt_valido(self, request) -> bool:
        """Retorna True si el header Authorization contiene un JWT válido."""
        try:
            auth = JWTAuthentication()
            user_token = auth.authenticate(request)
            if user_token is not None:
                request.user, _ = user_token
                request.is_guest = False
                return True
        except (InvalidToken, TokenError):
            pass
        return False


def obtener_rol_usuario(user) -> str:
    """Retorna el rol del usuario autenticado."""
    if not user or not user.is_authenticated:
        return ""
    if user.is_superuser or user.is_staff:
        return "ADMIN"
    try:
        if hasattr(user, "perfil") and user.perfil.rol:
            return user.perfil.rol
    except Exception:
        pass
    return "PACIENTE"


class IsAdminUserRole(BasePermission):
    """
    Permite el acceso únicamente a usuarios con rol ADMIN (o superuser/staff).
    """

    message = "Se requiere rol de Administrador para realizar esta acción."

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                obtener_rol_usuario(request.user) == "ADMIN"
                or request.user.is_superuser
                or request.user.is_staff
            )
        )


class IsOperadorCentro(BasePermission):
    """
    Permite el acceso a Operadores de Centro o Administradores.
    """

    message = "Se requiere rol de Operador de Centro o Administrador."

    def has_permission(self, request, view) -> bool:
        rol = obtener_rol_usuario(request.user)
        return bool(
            request.user
            and request.user.is_authenticated
            and (rol in ["OPERADOR_CENTRO", "ADMIN"] or request.user.is_superuser)
        )


class IsMedicoEspecialista(BasePermission):
    """
    Permite el acceso a Médicos Especialistas o Administradores.
    """

    message = "Se requiere rol de Médico Especialista o Administrador."

    def has_permission(self, request, view) -> bool:
        rol = obtener_rol_usuario(request.user)
        return bool(
            request.user
            and request.user.is_authenticated
            and (rol in ["MEDICO", "ADMIN"] or request.user.is_superuser)
        )


class IsPacienteRegistrado(BasePermission):
    """
    Permite el acceso a usuarios registrados con rol PACIENTE.
    Rechaza invitados anónimos y roles no asignados.
    """

    message = "Se requiere estar registrado con una cuenta de paciente."

    def has_permission(self, request, view) -> bool:
        rol = obtener_rol_usuario(request.user)
        return bool(
            request.user
            and request.user.is_authenticated
            and (rol in ["PACIENTE", "ADMIN"] or request.user.is_superuser)
        )


class IsStaffOrOwner(BasePermission):
    """
    Permite el acceso al propietario del recurso o a personal médico/operativo/admin.
    """

    message = "No posee permisos para acceder o modificar este recurso."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        rol = obtener_rol_usuario(request.user)
        if rol in ["ADMIN", "OPERADOR_CENTRO", "MEDICO"] or request.user.is_superuser:
            return True

        if hasattr(obj, "usuario") and obj.usuario == request.user:
            return True
        if (
            hasattr(obj, "paciente")
            and hasattr(obj.paciente, "usuario")
            and obj.paciente.usuario == request.user
        ):
            return True
        if hasattr(obj, "user") and obj.user == request.user:
            return True
        if obj == request.user:
            return True

        return False

