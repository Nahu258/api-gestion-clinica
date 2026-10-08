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
]


