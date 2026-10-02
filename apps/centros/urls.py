"""
CAPA DE RUTAS — Módulo Centros de Emergencia.

Usa re_path con `/?` al final igual que el módulo turnos.
"""

from django.urls import re_path

from apps.centros.views import CentrosCercanosAPIView

app_name = "centros"

urlpatterns = [
    re_path(
        r"^centros/cercanos/?$",
        CentrosCercanosAPIView.as_view(),
        name="centros-cercanos",
    ),
]
