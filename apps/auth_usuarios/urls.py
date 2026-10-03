"""
Rutas de la app auth_usuarios — Épica 2, issues #13 y #14.

POST   /api/v1/auth/google/    → GoogleLoginAPIView
POST   /api/v1/auth/refresh/   → RefreshTokenAPIView
GET    /api/v1/auth/me/        → MeAPIView
POST   /api/v1/auth/invitado/  → InvitadoLoginAPIView
"""

from django.urls import path

from apps.auth_usuarios.views import (
    GoogleLoginAPIView,
    InvitadoLoginAPIView,
    MeAPIView,
    RefreshTokenAPIView,
)

urlpatterns = [
    path("auth/google/", GoogleLoginAPIView.as_view(), name="auth-google"),
    path("auth/refresh/", RefreshTokenAPIView.as_view(), name="auth-refresh"),
    path("auth/me/", MeAPIView.as_view(), name="auth-me"),
    path("auth/invitado/", InvitadoLoginAPIView.as_view(), name="auth-invitado"),
]
