"""
Rutas de la app auth_usuarios — Épica 2, issues #13 y #14.

POST   /api/v1/auth/google/    → GoogleLoginAPIView
POST   /api/v1/auth/login/     → PasswordLoginAPIView
POST   /api/v1/auth/refresh/   → RefreshTokenAPIView
GET    /api/v1/auth/me/        → MeAPIView
POST   /api/v1/auth/invitado/  → InvitadoLoginAPIView
"""

from django.urls import path, re_path

from apps.auth_usuarios.views import (
    GoogleLoginAPIView,
    InvitadoLoginAPIView,
    MeAPIView,
    PasswordLoginAPIView,
    RefreshTokenAPIView,
)
from apps.auth_usuarios.views_personal import (
    AdminUsuarioDetalleAPIView,
    AdminUsuarioResetPasswordAPIView,
    AdminUsuariosAPIView,
)

urlpatterns = [
    # Épica 5 — AE5-02: gestión de usuarios del personal
    re_path(r"^admin/usuarios/?$", AdminUsuariosAPIView.as_view(), name="admin-usuarios"),
    re_path(
        r"^admin/usuarios/(?P<pk>\d+)/?$",
        AdminUsuarioDetalleAPIView.as_view(),
        name="admin-usuario-detalle",
    ),
    re_path(
        r"^admin/usuarios/(?P<pk>\d+)/reset-password/?$",
        AdminUsuarioResetPasswordAPIView.as_view(),
        name="admin-usuario-reset-password",
    ),
    path("auth/google/", GoogleLoginAPIView.as_view(), name="auth-google"),
    path("auth/login/", PasswordLoginAPIView.as_view(), name="auth-login"),
    path("auth/refresh/", RefreshTokenAPIView.as_view(), name="auth-refresh"),
    path("auth/me/", MeAPIView.as_view(), name="auth-me"),
    path("auth/invitado/", InvitadoLoginAPIView.as_view(), name="auth-invitado"),
]
