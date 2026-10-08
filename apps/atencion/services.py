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


def iniciar_atencion(solicitud_id: int) -> SolicitudAtencion:
    """
    Inicia la atención médica de una solicitud en estado DERIVADO.
    Pasa el estado a EN_ATENCION y actualiza la disponibilidad del médico a EN_ATENCION en Redis.
    """
    solicitud = obtener_solicitud(solicitud_id)
    if solicitud.estado != SolicitudAtencion.Estado.DERIVADO:
        raise ReglaDeNegocioViolada(
            f"No se puede iniciar atención de una solicitud en estado '{solicitud.get_estado_display()}'. Debe estar en DERIVADO."
        )

    solicitud.estado = SolicitudAtencion.Estado.EN_ATENCION
    solicitud.save(update_fields=["estado", "actualizado_en"])

    if solicitud.medico_asignado_id:
        from apps.clinica.disponibilidad import set_disponibilidad_medico
        set_disponibilidad_medico(solicitud.medico_asignado_id, "EN_ATENCION")

    return solicitud


def completar_atencion(
    solicitud_id: int,
    diagnostico: str,
    indicaciones: str = "",
) -> SolicitudAtencion:
    """
    Finaliza la atención médica:
    - Valida que se provea diagnóstico.
    - Pasa a estado ATENDIDO.
    - Registra diagnostico, indicaciones y atendido_en.
    - Restablece disponibilidad del médico a DISPONIBLE en Redis.
    - Publica evento solicitud.atendida en RabbitMQ.
    """
    if not diagnostico or not diagnostico.strip():
        raise DatosInvalidos("Debe proporcionar un diagnóstico médico válido para finalizar la atención.")

    solicitud = obtener_solicitud(solicitud_id)
    if solicitud.estado not in {SolicitudAtencion.Estado.EN_ATENCION, SolicitudAtencion.Estado.DERIVADO}:
        raise ReglaDeNegocioViolada(
            f"No se puede completar una solicitud en estado '{solicitud.get_estado_display()}'."
        )

    solicitud.diagnostico = diagnostico.strip()
    solicitud.indicaciones = (indicaciones or "").strip()
    solicitud.atendido_en = timezone.now()
    solicitud.estado = SolicitudAtencion.Estado.ATENDIDO
    solicitud.save(update_fields=["diagnostico", "indicaciones", "atendido_en", "estado", "actualizado_en"])

    if solicitud.medico_asignado_id:
        from apps.clinica.disponibilidad import set_disponibilidad_medico, get_disponibilidad_medico
        if get_disponibilidad_medico(solicitud.medico_asignado_id) == "EN_ATENCION":
            set_disponibilidad_medico(solicitud.medico_asignado_id, "DISPONIBLE")

    if getattr(settings, "EVENTOS_HABILITADOS", True):
        from apps.atencion.eventos import publicar_solicitud_atendida
        publicar_solicitud_atendida(solicitud)

    return solicitud


def obtener_ficha_clinica(solicitud_id: int) -> dict:
    """
    Devuelve los datos clínicos del episodio actual y el historial previo si el paciente es registrado.
    """
    solicitud = obtener_solicitud(solicitud_id)

    es_invitado = solicitud.es_invitado
    nombre_paciente = ""
    telefono_paciente = ""
    email_paciente = ""

    historial_previo = []

    if not es_invitado and solicitud.usuario_id:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.filter(pk=solicitud.usuario_id).first()
        if user:
            nombre_paciente = (user.get_full_name() or user.username).strip()
            email_paciente = user.email

        previas = (
            SolicitudAtencion.objects.filter(
                usuario_id=solicitud.usuario_id,
                estado=SolicitudAtencion.Estado.ATENDIDO,
            )
            .exclude(pk=solicitud.pk)
            .select_related("centro", "especialidad_asignada", "medico_asignado")
            .order_by("-atendido_en")
        )
        for prev in previas:
            historial_previo.append({
                "id": prev.id,
                "centro_nombre": prev.centro.nombre if prev.centro else "",
                "especialidad_nombre": prev.especialidad_asignada.nombre if prev.especialidad_asignada else "",
                "medico_nombre": prev.medico_asignado.nombre if prev.medico_asignado else "",
                "motivo": prev.motivo,
                "diagnostico": prev.diagnostico,
                "indicaciones": prev.indicaciones,
                "atendido_en": prev.atendido_en,
            })
    else:
        nombre_paciente = solicitud.nombre_invitado or "Invitado"
        telefono_paciente = solicitud.telefono_invitado or ""

    return {
        "id": solicitud.id,
        "estado": solicitud.estado,
        "estado_legible": solicitud.get_estado_display(),
        "creado_en": solicitud.creado_en,
        "modo": solicitud.modo,
        "modo_legible": solicitud.get_modo_display(),
        "motivo": solicitud.motivo,
        "prioridad": solicitud.prioridad,
        "observaciones_triage": solicitud.observaciones_triage,
        "diagnostico": solicitud.diagnostico,
        "indicaciones": solicitud.indicaciones,
        "atendido_en": solicitud.atendido_en,
        "centro_id": solicitud.centro_id,
        "centro_nombre": solicitud.centro.nombre if solicitud.centro else "",
        "especialidad_id": solicitud.especialidad_asignada_id,
        "especialidad_nombre": solicitud.especialidad_asignada.nombre if solicitud.especialidad_asignada else "",
        "medico_id": solicitud.medico_asignado_id,
        "medico_nombre": solicitud.medico_asignado.nombre if solicitud.medico_asignado else "",
        "paciente": {
            "es_invitado": es_invitado,
            "usuario_id": solicitud.usuario_id,
            "nombre": nombre_paciente,
            "telefono": telefono_paciente,
            "email": email_paciente,
        },
        "mensaje": "" if not es_invitado else "Este paciente no posee historial registrado previo.",
        "historial_previo": historial_previo,
    }


def obtener_historial_paciente(usuario_id: int) -> list[dict]:
    """
    Retorna el historial completo de solicitudes y atenciones de un paciente registrado.
    """
    solicitudes = (
        SolicitudAtencion.objects.filter(usuario_id=usuario_id)
        .select_related("centro", "especialidad_asignada", "medico_asignado")
        .order_by("-creado_en")
    )
    resultado = []
    for s in solicitudes:
        resultado.append({
            "id": s.id,
            "estado": s.estado,
            "estado_legible": s.get_estado_display(),
            "modo": s.modo,
            "motivo": s.motivo,
            "prioridad": s.prioridad,
            "diagnostico": s.diagnostico,
            "indicaciones": s.indicaciones,
            "creado_en": s.creado_en,
            "atendido_en": s.atendido_en,
            "centro_id": s.centro_id,
            "centro_nombre": s.centro.nombre if s.centro else "",
            "especialidad_id": s.especialidad_asignada_id,
            "especialidad_nombre": s.especialidad_asignada.nombre if s.especialidad_asignada else "",
            "medico_nombre": s.medico_asignado.nombre if s.medico_asignado else "",
        })
    return resultado

