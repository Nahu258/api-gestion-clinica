"""
CAPA DE RUTAS — Módulo Centros de Emergencia.

Usa re_path con `/?` al final igual que el módulo turnos.
"""

from django.urls import re_path

from apps.centros.views import (
    CentroDetalleAPIView,
    CentroEspecialidadDoctoresAPIView,
    CentroEspecialidadesAPIView,
    CentroEspecialistasDisponiblesAPIView,
    CentroSolicitudesAPIView,
    CentrosCercanosAPIView,
)
from apps.centros.views_admin import (
    AdminCentroActivarAPIView,
    AdminCentroDesactivarAPIView,
    AdminCentroDetalleAPIView,
    AdminCentrosAPIView,
)

app_name = "centros"

urlpatterns = [
    re_path(
        r"^centros/cercanos/?$",
        CentrosCercanosAPIView.as_view(),
        name="centros-cercanos",
    ),
    re_path(
        r"^centros/(?P<pk>\d+)/?$",
        CentroDetalleAPIView.as_view(),
        name="centro-detalle",
    ),
    re_path(
        r"^centros/(?P<centro_id>\d+)/especialidades/?$",
        CentroEspecialidadesAPIView.as_view(),
        name="centro-especialidades",
    ),
    re_path(
        r"^centros/(?P<centro_id>\d+)/especialidades/(?P<especialidad_id>\d+)/doctores/?$",
        CentroEspecialidadDoctoresAPIView.as_view(),
        name="centro-especialidad-doctores",
    ),
    re_path(
        r"^centros/(?P<centro_id>\d+)/especialistas-disponibles/?$",
        CentroEspecialistasDisponiblesAPIView.as_view(),
        name="centro-especialistas-disponibles",
    ),
    re_path(
        r"^centros/(?P<centro_id>\d+)/solicitudes/?$",
        CentroSolicitudesAPIView.as_view(),
        name="centro-solicitudes",
    ),
    # Épica 5 — AE5-01: consola del superadmin (gestión de instituciones)
    re_path(
        r"^admin/centros/?$",
        AdminCentrosAPIView.as_view(),
        name="admin-centros",
    ),
    re_path(
        r"^admin/centros/(?P<pk>\d+)/?$",
        AdminCentroDetalleAPIView.as_view(),
        name="admin-centro-detalle",
    ),
    re_path(
        r"^admin/centros/(?P<pk>\d+)/desactivar/?$",
        AdminCentroDesactivarAPIView.as_view(),
        name="admin-centro-desactivar",
    ),
    re_path(
        r"^admin/centros/(?P<pk>\d+)/activar/?$",
        AdminCentroActivarAPIView.as_view(),
        name="admin-centro-activar",
    ),
]


