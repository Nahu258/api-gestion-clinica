"""
EVENTOS ASÍNCRONOS (RabbitMQ) — Módulo Atención de Emergencias.

Reutiliza publicar_evento de apps.turnos.eventos (mismo broker, misma cola).
El evento solicitud.creada notifica a otros sistemas (ej. panel del centro)
que llegó una nueva solicitud de atención urgente.
"""

import logging

from apps.turnos.eventos import publicar_evento  # noqa: reutilizamos el productor

logger = logging.getLogger(__name__)


def publicar_solicitud_creada(solicitud) -> str | None:
    """
    Publica el evento `solicitud.creada` en RabbitMQ.

    Payload:
        solicitud_id:    ID de la SolicitudAtencion creada.
        centro_id:       ID del CentroEmergencia destino.
        modo:            'aviso' | 'solicitud'
        usuario_id:      ID del usuario registrado o null si es invitado.
        nombre_invitado: nombre del invitado (puede ser vacío).
        lat_usuario:     float o null.
        lon_usuario:     float o null.

    Si RabbitMQ no responde, el error queda en el log y la solicitud
    ya guardada no se revierte (mismo patrón que TurnoCreado).
    """
    return publicar_evento(
        tipo="solicitud.creada",
        payload={
            "solicitud_id":   solicitud.pk,
            "centro_id":      solicitud.centro_id,
            "modo":           solicitud.modo,
            "usuario_id":     solicitud.usuario_id,
            "nombre_invitado": solicitud.nombre_invitado,
            "lat_usuario":    float(solicitud.lat_usuario) if solicitud.lat_usuario else None,
            "lon_usuario":    float(solicitud.lon_usuario) if solicitud.lon_usuario else None,
        },
    )
