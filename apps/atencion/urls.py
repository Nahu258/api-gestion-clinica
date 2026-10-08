"""
CAPA DE RUTAS — Módulo Atención de Emergencias.
"""

from django.urls import re_path

from apps.atencion.views import (
    CompletarAtencionAPIView,
    DerivarSolicitudAPIView,
    FichaClinicaAPIView,
    IniciarAtencionAPIView,
    PacienteHistorialAPIView,
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
    re_path(
        r"^atencion/solicitudes/(?P<solicitud_id>\d+)/iniciar-atencion/?$",
        IniciarAtencionAPIView.as_view(),
        name="solicitud-iniciar-atencion",
    ),
    re_path(
        r"^atencion/solicitudes/(?P<solicitud_id>\d+)/completar/?$",
        CompletarAtencionAPIView.as_view(),
        name="solicitud-completar",
    ),
    re_path(
        r"^atencion/solicitudes/(?P<solicitud_id>\d+)/ficha-clinica/?$",
        FichaClinicaAPIView.as_view(),
        name="solicitud-ficha-clinica",
    ),
    re_path(
        r"^pacientes/mi-historial/?$",
        PacienteHistorialAPIView.as_view(),
        name="paciente-historial",
    ),
]
