"""
core/permissions.py - Re-export de permisos DRF para la plataforma.
"""

from apps.auth_usuarios.permissions import (
    IsGuestOrAuthenticated,
    IsAdminUserRole,
    IsOperadorCentro,
    IsMedicoEspecialista,
    IsPacienteRegistrado,
    IsStaffOrOwner,
    obtener_rol_usuario,
)

from apps.atencion.permissions import (
    IsMedicoAsignadoOAdmin,
    CanViewFichaClinica,
)

__all__ = [
    "IsGuestOrAuthenticated",
    "IsAdminUserRole",
    "IsOperadorCentro",
    "IsMedicoEspecialista",
    "IsPacienteRegistrado",
    "IsStaffOrOwner",
    "obtener_rol_usuario",
    "IsMedicoAsignadoOAdmin",
    "CanViewFichaClinica",
]
