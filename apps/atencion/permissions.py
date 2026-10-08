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
