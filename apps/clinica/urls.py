"""
Rutas del módulo Clínica.
"""

from django.urls import re_path
from apps.clinica.views import (
    CentroGuardiaDetalleAPIView,
    CentroGuardiasAPIView,
    MiDisponibilidadAPIView,
    MisGuardiasAPIView,
    MisSolicitudesMedicoAPIView,
)

app_name = "clinica"

urlpatterns = [
    re_path(
        r"^medicos/mi-disponibilidad/?$",
        MiDisponibilidadAPIView.as_view(),
        name="mi-disponibilidad",
    ),
    re_path(
        r"^medicos/mis-solicitudes/?$",
        MisSolicitudesMedicoAPIView.as_view(),
        name="mis-solicitudes",
    ),
    # Épica 5 — AE5-04: guardias programadas
    re_path(
        r"^medicos/mis-guardias/?$",
        MisGuardiasAPIView.as_view(),
        name="mis-guardias",
    ),
    re_path(
        r"^centros/(?P<centro_id>\d+)/guardias/?$",
        CentroGuardiasAPIView.as_view(),
        name="centro-guardias",
    ),
    re_path(
        r"^centros/(?P<centro_id>\d+)/guardias/(?P<guardia_id>\d+)/?$",
        CentroGuardiaDetalleAPIView.as_view(),
        name="centro-guardia-detalle",
    ),
]
