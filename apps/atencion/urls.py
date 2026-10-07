"""
CAPA DE RUTAS — Módulo Atención de Emergencias.
"""

from django.urls import re_path

from apps.atencion.views import (
    DerivarSolicitudAPIView,
    SolicitudDetalleAPIView,
    SolicitudListaAPIView,
)

app_name = "atencion"

urlpatterns = [
    re_path(
        r"^atencion/solicitudes/?$",
        SolicitudListaAPIView.as_view(),
        name="solicitud-lista",
    ),
    re_path(
        r"^atencion/solicitudes/(?P<solicitud_id>\d+)/?$",
        SolicitudDetalleAPIView.as_view(),
        name="solicitud-detalle",
    ),
    re_path(
        r"^atencion/solicitudes/(?P<solicitud_id>\d+)/derivar/?$",
        DerivarSolicitudAPIView.as_view(),
        name="solicitud-derivar",
    ),
]

