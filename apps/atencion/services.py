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

import time
import uuid
from contextlib import contextmanager
from django.utils import timezone
from core.redis_client import redis_o_503
from core.exceptions import ServicioNoDisponible

logger = logging.getLogger(__name__)

# Estados terminales: una vez en estos estados, la solicitud no se puede modificar
ESTADOS_TERMINALES = {SolicitudAtencion.Estado.ATENDIDO, SolicitudAtencion.Estado.CANCELADO}

# Transiciones válidas de estado (Épica 4: DERIVADO y EN_ATENCION)
TRANSICIONES_VALIDAS: dict[str, set[str]] = {
    SolicitudAtencion.Estado.PENDIENTE:  {SolicitudAtencion.Estado.ACEPTADO, SolicitudAtencion.Estado.DERIVADO, SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.ACEPTADO:   {SolicitudAtencion.Estado.DERIVADO, SolicitudAtencion.Estado.EN_CAMINO, SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.EN_CAMINO:  {SolicitudAtencion.Estado.DERIVADO, SolicitudAtencion.Estado.ATENDIDO, SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.DERIVADO:   {SolicitudAtencion.Estado.EN_ATENCION, SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.EN_ATENCION:{SolicitudAtencion.Estado.ATENDIDO, SolicitudAtencion.Estado.CANCELADO},
    SolicitudAtencion.Estado.ATENDIDO:   set(),
    SolicitudAtencion.Estado.CANCELADO:  set(),
}


@contextmanager
def lock_derivacion_medico(medico_id: int):
    """
    Lock en Redis para serializar derivaciones hacia el mismo especialista
    y evitar sobreasignación o carreras concurrentes.
    """
    r = redis_o_503()
    clave = f"lock:derivacion:medico:{medico_id}"
    token = uuid.uuid4().hex
    limite = time.monotonic() + 5.0

    while not r.set(clave, token, nx=True, ex=10):
        if time.monotonic() > limite:
            raise ServicioNoDisponible(
                "El médico seleccionado se encuentra ocupado procesando otra derivación. Reintente en instantes."
            )
        time.sleep(0.05)

    try:
        yield
    finally:
        if r.get(clave) == token:
            r.delete(clave)



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


def derivar_solicitud(
    solicitud_id: int,
    especialidad_id: int,
    medico_id: int,
    usuario_operador=None,
    prioridad: str = "alta",
    observaciones: str = "",
) -> SolicitudAtencion:
    """
    Deriva una SolicitudAtencion a un médico y especialidad seleccionados.
    Protegido por lock en Redis para concurrencia.
    Publica evento solicitud.derivada en RabbitMQ.
    """
    from apps.centros.models import Especialidad
    from apps.clinica.models import Medico
    from apps.clinica.disponibilidad import get_disponibilidad_medico

    try:
        especialidad = Especialidad.objects.get(pk=especialidad_id)
    except Especialidad.DoesNotExist:
        raise DatosInvalidos(f"Especialidad #{especialidad_id} no existe.")

    try:
        medico = Medico.objects.get(pk=medico_id)
    except Medico.DoesNotExist:
        raise DatosInvalidos(f"Médico #{medico_id} no existe.")

    with lock_derivacion_medico(medico.id):
        estado_medico = get_disponibilidad_medico(medico.id)
        if estado_medico == "FUERA_DE_GUARDIA":
            raise ReglaDeNegocioViolada(
                f"El médico {medico.nombre} se encuentra fuera de disponibilidad/guardia."
            )

        solicitud = obtener_solicitud(solicitud_id)

        estados_permitidos_derivacion = {
            SolicitudAtencion.Estado.PENDIENTE,
            SolicitudAtencion.Estado.ACEPTADO,
            SolicitudAtencion.Estado.EN_CAMINO,
        }
        if solicitud.estado not in estados_permitidos_derivacion:
            raise ReglaDeNegocioViolada(
                f"No se puede derivar una solicitud en estado '{solicitud.get_estado_display()}'."
            )

        solicitud.especialidad_asignada = especialidad
        solicitud.medico_asignado = medico
        if usuario_operador and getattr(usuario_operador, "is_authenticated", False):
            solicitud.derivado_por = usuario_operador
        solicitud.fecha_derivacion = timezone.now()
        solicitud.prioridad = prioridad
        solicitud.observaciones_triage = observaciones
        solicitud.estado = SolicitudAtencion.Estado.DERIVADO
        solicitud.save()

        if getattr(settings, "EVENTOS_HABILITADOS", True):
            from apps.atencion.eventos import publicar_solicitud_derivada
            publicar_solicitud_derivada(solicitud)

        return solicitud

