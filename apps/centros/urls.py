"""
CAPA DE RUTAS — Módulo Centros de Emergencia.

Usa re_path con `/?` al final igual que el módulo turnos.
"""

from django.urls import re_path

from apps.centros.views import CentroDetalleAPIView, CentrosCercanosAPIView

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
]
