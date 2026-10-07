"""
Rutas del módulo Clínica.
"""

from django.urls import re_path
from apps.clinica.views import MiDisponibilidadAPIView

app_name = "clinica"

urlpatterns = [
    re_path(
        r"^medicos/mi-disponibilidad/?$",
        MiDisponibilidadAPIView.as_view(),
        name="mi-disponibilidad",
    ),
]
