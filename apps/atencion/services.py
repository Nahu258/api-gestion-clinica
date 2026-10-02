"""
CAPA DE LÓGICA DE NEGOCIO — Módulo Atención de Emergencias.

No conoce HTTP. No recibe `request` ni devuelve `Response`.
Cuando algo está mal, levanta excepciones de dominio de core/exceptions.py.
"""

import logging

from django.conf import settings

from apps.centros.models import CentroEmergencia
from apps.atencion.models import SolicitudAtencion
from core.exceptions import DatosInvalidos, RecursoNoEncontrado, ReglaDeNegocioViolada

logger = logging.getLogger(__name__)

# Estados terminales: una vez en estos estados, la solicitud no se puede modificar
ESTADOS_TERMINALES = {SolicitudAtencion.Estado.ATENDIDO, SolicitudAtencion.Estado.CANCELADO}

# Transiciones válidas de estado
TRANSICIONES_VALIDAS: dict[str, set[str]] = {
    SolicitudAtencion.Estado.PENDIENTE:  {SolicitudAtencion.Estado.ACEPTADO,  SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.ACEPTADO:   {SolicitudAtencion.Estado.EN_CAMINO, SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.EN_CAMINO:  {SolicitudAtencion.Estado.ATENDIDO,  SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.ATENDIDO:   set(),
    SolicitudAtencion.Estado.CANCELADO:  set(),
}


def crear_solicitud(datos: dict) -> SolicitudAtencion:
    """
    Crea una nueva SolicitudAtencion y publica el evento solicitud.creada.

    Args:
        datos: dict con claves:
            centro_id     (int, requerido)
            modo          (str, requerido: 'aviso' | 'solicitud')
            motivo        (str, opcional)
            usuario_id    (int, opcional — None si es invitado)
            nombre_invitado (str, opcional)
            telefono_invitado (str, opcional)
            lat_usuario   (float, opcional)
            lon_usuario   (float, opcional)

    Returns:
        La instancia SolicitudAtencion recién creada.

    Raises:
        DatosInvalidos: si centro_id no existe o modo es inválido.
    """
    # El serializer usa source="centro" en PrimaryKeyRelatedField → el dato
    # validado llega como el objeto CentroEmergencia directamente.
    # Soportamos también el dict crudo {centro_id: int} para llamadas internas.
    centro_raw = datos.get("centro") or datos.get("centro_id")
    if isinstance(centro_raw, CentroEmergencia):
        centro = centro_raw if centro_raw.activo else None
        if centro is None:
            raise DatosInvalidos(f"El centro '{centro_raw.nombre}' no está activo.")
    else:
        centro = _obtener_centro(centro_raw)

    solicitud = SolicitudAtencion.objects.create(
        centro=centro,
        modo=datos.get("modo", SolicitudAtencion.Modo.SOLICITUD),
        motivo=datos.get("motivo", ""),
        usuario_id=datos.get("usuario_id"),
        nombre_invitado=datos.get("nombre_invitado", ""),
        telefono_invitado=datos.get("telefono_invitado", ""),
        lat_usuario=datos.get("lat_usuario"),
        lon_usuario=datos.get("lon_usuario"),
    )

    if getattr(settings, "EVENTOS_HABILITADOS", True):
        from apps.atencion.eventos import publicar_solicitud_creada
        publicar_solicitud_creada(solicitud)

    return solicitud


def obtener_solicitud(solicitud_id: int) -> SolicitudAtencion:
    """
    Devuelve una SolicitudAtencion por ID.

    Raises:
        RecursoNoEncontrado: si no existe.
    """
    try:
        return SolicitudAtencion.objects.select_related("centro").get(pk=solicitud_id)
    except SolicitudAtencion.DoesNotExist:
        raise RecursoNoEncontrado(f"No existe una solicitud con id {solicitud_id}.")


def actualizar_estado(solicitud: SolicitudAtencion, nuevo_estado: str) -> SolicitudAtencion:
    """
    Cambia el estado de la solicitud respetando las transiciones válidas.

    Args:
        solicitud:    Instancia actual.
        nuevo_estado: El estado destino.

    Returns:
        La instancia actualizada.

    Raises:
        ReglaDeNegocioViolada: si la transición no está permitida.
        DatosInvalidos:        si el estado destino no es un valor válido.
    """
    estados_validos = {e.value for e in SolicitudAtencion.Estado}
    if nuevo_estado not in estados_validos:
        raise DatosInvalidos(
            f"Estado '{nuevo_estado}' no es válido. "
            f"Opciones: {', '.join(sorted(estados_validos))}."
        )

    permitidos = TRANSICIONES_VALIDAS.get(solicitud.estado, set())
    if nuevo_estado not in permitidos:
        raise ReglaDeNegocioViolada(
            f"No se puede pasar de '{solicitud.get_estado_display()}' "
            f"a '{nuevo_estado}'. "
            f"Transiciones permitidas: {', '.join(sorted(permitidos)) or 'ninguna'}."
        )

    solicitud.estado = nuevo_estado
    solicitud.save(update_fields=["estado", "actualizado_en"])
    return solicitud


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _obtener_centro(centro_id: int) -> CentroEmergencia:
    try:
        return CentroEmergencia.objects.get(pk=centro_id, activo=True)
    except CentroEmergencia.DoesNotExist:
        raise DatosInvalidos(
            f"No existe un centro activo con id {centro_id}."
        )
