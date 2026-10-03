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
