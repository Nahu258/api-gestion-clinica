"""
CAPA DE RUTAS (URLs) del modulo turnos.

Se usa re_path con `/?` al final para que la API acepte tanto
/api/v1/turnos como /api/v1/turnos/ y no dependa de un redirect.
"""

from django.urls import re_path

from apps.turnos.views import (
    ComprobanteAPIView,
    HistorialClinicoAPIView,
    ReservaTemporalAPIView,
    ReservaTemporalDetalleAPIView,
    TurnoDetalleAPIView,
    TurnoListaAPIView,
)

app_name = "turnos"

urlpatterns = [
    re_path(
        r"^turnos/?$",
        TurnoListaAPIView.as_view(),
        name="turno-lista",
    ),
    re_path(
        r"^turnos/(?P<turno_id>\d+)/?$",
        TurnoDetalleAPIView.as_view(),
        name="turno-detalle",
    ),
    # AE2
    re_path(
        r"^turnos/reservas-temporales/?$",
        ReservaTemporalAPIView.as_view(),
        name="reserva-temporal",
    ),
    re_path(
        r"^turnos/reservas-temporales/(?P<token>[0-9a-f]{32})/?$",
        ReservaTemporalDetalleAPIView.as_view(),
        name="reserva-temporal-detalle",
    ),
    re_path(
        r"^turnos/(?P<turno_id>\d+)/comprobante/?$",
        ComprobanteAPIView.as_view(),
        name="turno-comprobante",
    ),
    re_path(
        r"^pacientes/(?P<dni>\d+)/historial/?$",
        HistorialClinicoAPIView.as_view(),
        name="paciente-historial",
    ),
]
