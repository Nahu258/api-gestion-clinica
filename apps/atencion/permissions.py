"""
Permisos DRF específicos para el Módulo de Atención de Emergencias.
"""

from rest_framework.permissions import BasePermission
from apps.auth_usuarios.permissions import obtener_rol_usuario


class IsMedicoAsignadoOAdmin(BasePermission):
    """
    Permite la acción solo si el usuario autenticado es el médico asignado a la solicitud
    o cuenta con rol de Administrador.
    """

    message = "Solo el médico especialista asignado a esta solicitud puede gestionar la consulta."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser or request.user.is_staff:
            return True

        rol = obtener_rol_usuario(request.user)
        if rol == "ADMIN":
            return True

        if rol == "MEDICO":
            try:
                perfil = getattr(request.user, "perfil", None)
                if perfil and perfil.medico_id:
                    return perfil.medico_id == obj.medico_asignado_id
            except Exception:
                return False

        return False


class CanViewFichaClinica(BasePermission):
    """
    Permite consultar la ficha clínica a:
    - Médico asignado a la solicitud
    - Operadores del centro asignado a la solicitud
    - Administradores
    """

    message = "No posee permisos para acceder a la ficha clínica de este paciente."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser or request.user.is_staff:
            return True

        rol = obtener_rol_usuario(request.user)
        if rol == "ADMIN":
            return True

        perfil = getattr(request.user, "perfil", None)

        if rol == "OPERADOR_CENTRO":
            if perfil and perfil.centro_id:
                return perfil.centro_id == obj.centro_id
            return False

        if rol == "MEDICO":
            if perfil and perfil.medico_id:
                return perfil.medico_id == obj.medico_asignado_id
            return False

        return False


# ─────────────────────────────────────────────────────────────────────────────
# Prevención de IDOR/BOLA en GET/PATCH /atencion/solicitudes/{id}/
# ─────────────────────────────────────────────────────────────────────────────

HEADER_CODIGO_SEGUIMIENTO = "X-Codigo-Seguimiento"


def _codigo_presentado(request) -> str:
    return request.headers.get(HEADER_CODIGO_SEGUIMIENTO, "") or ""


def es_titular_de_solicitud(request, obj) -> bool:
    """
    El solicitante: el paciente registrado dueño de la solicitud (por JWT) o
    quien presenta el código secreto que recibió al crearla (invitado).
    """
    import hmac  # noqa: PLC0415

    user = request.user
    if user and user.is_authenticated and obj.usuario_id and obj.usuario_id == user.id:
        return True
    codigo = _codigo_presentado(request)
    return bool(codigo) and hmac.compare_digest(codigo, obj.codigo_seguimiento or "")


def es_personal_de_solicitud(request, obj) -> bool:
    """Admin, operador del centro de la solicitud o médico asignado."""
    user = request.user
    if not user or not user.is_authenticated:
        return False
    rol = obtener_rol_usuario(user)
    if rol == "ADMIN":
        return True
    perfil = getattr(user, "perfil", None)
    if rol == "OPERADOR_CENTRO":
        return bool(perfil and perfil.centro_id and perfil.centro_id == obj.centro_id)
    if rol == "MEDICO":
        return bool(perfil and perfil.medico_id and perfil.medico_id == obj.medico_asignado_id)
    return False


class PuedeAccederSolicitud(BasePermission):
    """
    Control de propiedad por objeto (OWASP API1:2023 — BOLA).

    GET:   titular (JWT dueño o código de seguimiento) o personal de la solicitud.
    PATCH: el titular solo puede cancelar; el operador del centro y el admin
           pueden aplicar cualquier transición válida. El médico usa sus
           propios endpoints (iniciar-atencion / completar).

    La vista responde 404 ante una negativa, para no confirmar que el id existe.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return es_titular_de_solicitud(request, obj) or es_personal_de_solicitud(request, obj)

        rol = obtener_rol_usuario(request.user)
        if rol == "ADMIN":
            return True
        if rol == "OPERADOR_CENTRO" and es_personal_de_solicitud(request, obj):
            return True
        if es_titular_de_solicitud(request, obj):
            return request.data.get("estado") == "cancelado"
        return False
