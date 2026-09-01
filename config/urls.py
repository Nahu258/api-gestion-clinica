"""
CAPA DE RUTAS (nivel proyecto) - Tabla de ruteo principal.

Este archivo solo reparte: el prefijo /api/v1/ se delega al modulo de rutas
de cada app. Asi, agregar un recurso nuevo (ej. clientes) es agregar una
linea aca y un urls.py en la app correspondiente.
"""

from django.contrib import admin
from django.urls import include, path, re_path

from apps.turnos.views import IndiceAPIView

urlpatterns = [
    # Panel de administracion de Django
    path("admin/", admin.site.urls),

    # Indice de la API (mapa de rutas)
    re_path(r"^api/v1/?$", IndiceAPIView.as_view(), name="api-indice"),

    # Recursos de la version 1 de la API
    path("api/v1/", include("apps.turnos.urls")),
]

# Handlers globales (activos cuando DEBUG=False)
handler404 = "core.handlers.pagina_no_encontrada"
handler500 = "core.handlers.error_del_servidor"
