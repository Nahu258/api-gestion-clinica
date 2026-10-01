"""
CAPA DE SERVICIOS (Logica de negocio) - El "que hace" el sistema.

Reglas de esta capa:
  * NO conoce HTTP: no recibe `request` ni devuelve `Response`.
  * Recibe y devuelve objetos/diccionarios de Python.
  * Cuando algo esta mal, levanta una excepcion de dominio
    (RecursoNoEncontrado, ReglaDeNegocioViolada). La traduccion a codigos
    HTTP la hace core/exceptions.py.
  * Los datos de pacientes y medicos pertenecen al modulo Clinica: se piden
    a apps.clinica.services, nunca se leen sus tablas desde aca.

Gracias a esto, la misma logica sirve para la API REST, para un comando de
consola o para un test, sin tocar una linea.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F, Q, QuerySet
from django.utils import timezone

from apps.clinica import services as clinica
from apps.clinica.services import (
    buscar_medicos_ids_por_especialidad,
    buscar_medicos_ids_por_nombre,
    buscar_pacientes_ids_por_dni,
    buscar_pacientes_ids_por_nombre,
    especialidades_validas,
    obtener_paciente,
    obtener_paciente_por_dni,
)
from apps.turnos import agenda
from apps.turnos.eventos import publicar_evento
from apps.turnos.models import Turno
from core import eventos
from core.exceptions import DatosInvalidos, RecursoNoEncontrado, ReglaDeNegocioViolada

logger = logging.getLogger(__name__)

# Regla de negocio: cada consulta ocupa 20 minutos de la agenda del profesional.
DURACION_DE_LA_CONSULTA = timedelta(minutes=20)

# El historial solo cambia cuando se atiende un turno: se cachea 1 hora y se
# invalida explicitamente en ese momento.
TTL_HISTORIAL = 60 * 60


def listar_turnos(
    estado: str | None = None,
    especialidad: str | None = None,
    buscar: str | None = None,
) -> QuerySet[Turno]:
    """
    Devuelve todos los turnos, con filtros opcionales.

    :param estado: filtra por estado exacto (pendiente, confirmado, ...).
    :param especialidad: filtra por la especialidad del medico.
    :param buscar: texto libre sobre nombre o DNI del paciente, o nombre del medico.
    """
    turnos = Turno.objects.all()

    if estado:
        if estado not in Turno.Estado.values:
            raise DatosInvalidos(
                f"El estado '{estado}' no es valido. "
                f"Valores permitidos: {', '.join(Turno.Estado.values)}."
            )
        turnos = turnos.filter(estado=estado)

    if especialidad:
        validas = especialidades_validas()
        if especialidad not in validas:
            raise DatosInvalidos(
                f"La especialidad '{especialidad}' no es valida. "
                f"Valores permitidos: {', '.join(validas)}."
            )
        turnos = turnos.filter(medico_id__in=buscar_medicos_ids_por_especialidad(especialidad))

    if buscar:
        pacientes_ids = buscar_pacientes_ids_por_nombre(buscar) + buscar_pacientes_ids_por_dni(buscar)
        medicos_ids = buscar_medicos_ids_por_nombre(buscar)

        turnos = turnos.filter(
            Q(paciente_id__in=pacientes_ids)
            | Q(medico_id__in=medicos_ids)
        )

    return turnos


def obtener_turno(turno_id: int) -> Turno:
    """Busca un turno por id o levanta RecursoNoEncontrado (-> 404)."""
    try:
        return Turno.objects.get(pk=turno_id)
    except Turno.DoesNotExist:
        raise RecursoNoEncontrado(f"No existe un turno con id {turno_id}.")


def obtener_historial_de_paciente(dni: str) -> QuerySet[Turno]:
    """
    Devuelve el historial clinico de un paciente: sus turnos ya atendidos,
    del mas reciente al mas antiguo. Se cachea en Redis.
    """
    dni = (dni or "").strip().replace(".", "")
    if not dni.isdigit():
        raise DatosInvalidos("El DNI del paciente solo puede contener numeros.")

    # Validamos que el paciente exista pidiendoselo al modulo Clinica.
    paciente = obtener_paciente_por_dni(dni)

    cache_key = _clave_historial(dni)
    historial_ids = _cache_get(cache_key)
    cache_disponible = historial_ids is not CACHE_NO_DISPONIBLE

    if cache_disponible and historial_ids is not None:
        return Turno.objects.filter(id__in=historial_ids).order_by("-fecha_hora")

    historial = Turno.objects.filter(
        paciente_id=paciente.id,
        estado=Turno.Estado.ATENDIDO,
    ).order_by("-fecha_hora")

    if not historial.exists():
        raise RecursoNoEncontrado(
            f"No hay consultas atendidas registradas para el DNI {dni}."
        )

    # Si la lectura ya fallo, no se intenta escribir: seria esperar otro
    # timeout para nada.
    if cache_disponible:
        _cache_set(cache_key, list(historial.values_list("id", flat=True)), TTL_HISTORIAL)

    return historial


def reservar_temporalmente(profesional: str, fecha_hora) -> dict:
    """
    AE2 - Aparta un horario por unos minutos (Redis con TTL).
    Primero se verifica que no este ya ocupado en la base.
    """
    medicos = buscar_medicos_ids_por_nombre(profesional)
    if medicos:
        _verificar_agenda_libre(medico_id=medicos[0], fecha_hora=fecha_hora, excluir_id=None)

    reserva = agenda.crear_reserva_temporal(profesional, fecha_hora)
    return {"profesional": profesional, "fecha_hora": fecha_hora, **reserva}


def crear_turno(datos_validados: dict, reserva_token: str | None = None) -> Turno:
    """
    Aplica las reglas de negocio y persiste un turno nuevo.

    AE2 - Control de concurrencia en tres capas:
      1. Lock en Redis por profesional: serializa los pedidos que compiten
         por la misma agenda, asi la verificacion y el guardado no se mezclan.
      2. Reserva temporal: si el horario esta apartado por otra persona, 409.
      3. Restriccion unica en la base (ultima defensa): aunque todo lo
         anterior fallara, la base rechaza el duplicado -> 409.
    """
    datos = dict(datos_validados)
    datos.pop("version", None)  # la version la administra el sistema

    medico_id = datos["medico_id"]
    fecha_hora = datos["fecha_hora"]

    try:
        medico = clinica.obtener_medico(medico_id)
        profesional_nombre = medico.nombre
    except Exception:
        medico = None
        profesional_nombre = str(medico_id)

    with agenda.lock_de_agenda(profesional_nombre):
        clave_hold = agenda.verificar_reserva_temporal(
            profesional_nombre, fecha_hora, reserva_token
        )
        _verificar_agenda_libre(
            medico_id=medico_id,
            fecha_hora=fecha_hora,
            excluir_id=None,
        )
        try:
            with transaction.atomic():
                turno = Turno.objects.create(**datos)
        except IntegrityError:
            raise ReglaDeNegocioViolada(
                f"El profesional ya tiene un turno el {fecha_hora:%d/%m/%Y %H:%M}."
            )
        agenda.borrar_hold(clave_hold, reserva_token)

    # 1. Evento de clinica TurnoCreado
    publicar_evento(
        "TurnoCreado",
        {
            "turno_id": turno.id,
            "paciente_id": turno.paciente_id,
            "medico_id": turno.medico_id,
            "fecha_hora": turno.fecha_hora.isoformat(),
        },
    )

    # 2. Evento TurnoReservado en RabbitMQ para comprobante PDF con QR en segundo plano
    evento_pdf = eventos.armar_evento("TurnoReservado", datos_del_evento(turno))
    transaction.on_commit(
        lambda: eventos.publicar(eventos.RK_TURNO_RESERVADO, evento_pdf)
    )

    return turno


def datos_del_evento(turno: Turno) -> dict:
    paciente = clinica.obtener_paciente(turno.paciente_id) if turno.paciente_id else None
    medico = clinica.obtener_medico(turno.medico_id) if turno.medico_id else None
    return {
        "turno_id": turno.pk,
        "paciente_nombre": paciente.nombre if paciente else "Desconocido",
        "paciente_dni": paciente.dni if paciente else "",
        "profesional": medico.nombre if medico else f"Médico {turno.medico_id}",
        "especialidad": medico.especialidad if medico else "",
        "especialidad_legible": medico.get_especialidad_display() if medico else "",
        "fecha_hora": turno.fecha_hora.isoformat(),
    }


def actualizar_turno(turno: Turno, datos_validados: dict, publicar_eventos: bool = True) -> Turno:
    """
    Modifica un turno existente respetando las reglas de negocio.

    `publicar_eventos=False` lo usa el consumidor de RabbitMQ: aplica un
    TurnoAtendido recibido y no tiene sentido volver a publicarlo.

    Control de concurrencia optimista: el UPDATE solo se aplica si la fila
    sigue en la `version` que se leyo (la enviada por el cliente o, si no
    envio ninguna, la que tenia el turno al cargarlo). Si otra request la
    cambio en el medio, el UPDATE no afecta filas y se responde 409.
    """
    if turno.estado == Turno.Estado.ATENDIDO:
        raise ReglaDeNegocioViolada(
            "Un turno ya atendido no puede modificarse: su registro clinico "
            "forma parte del historial del paciente."
        )

    datos = dict(datos_validados)
    version_esperada = datos.pop("version", turno.version)
    if version_esperada != turno.version:
        raise _conflicto_de_version()

    nuevo_medico_id = datos.get("medico_id", turno.medico_id)
    nueva_fecha = datos.get("fecha_hora", turno.fecha_hora)
    nuevo_estado = datos.get("estado", turno.estado)

    if nuevo_estado == Turno.Estado.CANCELADO:
        for campo, valor in datos_validados.items():
            setattr(turno, campo, valor)
        turno.save()
        return turno

    try:
        medico = clinica.obtener_medico(nuevo_medico_id)
        profesional_nombre = medico.nombre
    except Exception:
        profesional_nombre = str(nuevo_medico_id)

    # AE2: mover un turno tambien compite por la agenda -> lock en Redis
    with agenda.lock_de_agenda(profesional_nombre):
        _verificar_agenda_libre(
            medico_id=nuevo_medico_id,
            fecha_hora=nueva_fecha,
            excluir_id=turno.pk,
        )

        # UPDATE turnos SET ..., version = version + 1 WHERE id = ? AND version = ?
        filas = Turno.objects.filter(pk=turno.pk, version=version_esperada).update(
            **datos,
            version=F("version") + 1,
            actualizado_en=timezone.now(),
        )
        if filas == 0:
            raise _conflicto_de_version()

        turno.refresh_from_db()

        # Solo se llega aca si el turno NO estaba atendido: el evento se publica
        # una unica vez, en la transicion a 'atendido'.
        if turno.estado == Turno.Estado.ATENDIDO:
            paciente = obtener_paciente(turno.paciente_id)
            if paciente:
                _cache_delete(_clave_historial(paciente.dni))
            if publicar_eventos:
                publicar_evento(
                    "TurnoAtendido",
                    {
                        "turno_id": turno.id,
                        "paciente_id": turno.paciente_id,
                        "diagnostico": turno.diagnostico,
                        "indicaciones": turno.indicaciones,
                    },
                )

    return turno


def eliminar_turno(turno: Turno) -> None:
    """Borra un turno del sistema."""
    if turno.estado == Turno.Estado.EN_ATENCION:
        raise ReglaDeNegocioViolada(
            "No se puede eliminar un turno que esta en atencion. "
            "Finalice la consulta o cancelela primero."
        )
    if turno.estado == Turno.Estado.ATENDIDO:
        raise ReglaDeNegocioViolada(
            "No se puede eliminar un turno atendido: forma parte del "
            "historial clinico del paciente."
        )
    turno.delete()


# ---------------------------------------------------------------------------
# Funciones auxiliares privadas (el guion bajo indica "uso interno")
# ---------------------------------------------------------------------------
def _verificar_agenda_libre(medico_id: int, fecha_hora, excluir_id: int | None) -> None:
    """
    Levanta ReglaDeNegocioViolada (-> 409) si ESE medico ya tiene un
    turno solapado. Dos medicos distintos si pueden atender a la
    misma hora: la clinica tiene varios consultorios.
    """
    desde = fecha_hora - DURACION_DE_LA_CONSULTA + timedelta(seconds=1)
    hasta = fecha_hora + DURACION_DE_LA_CONSULTA - timedelta(seconds=1)

    solapados = (
        Turno.objects.filter(
            medico_id=medico_id,
            fecha_hora__range=(desde, hasta),
        )
        .exclude(estado=Turno.Estado.CANCELADO)
    )
    if excluir_id is not None:
        solapados = solapados.exclude(pk=excluir_id)

    if solapados.exists():
        minutos = int(DURACION_DE_LA_CONSULTA.total_seconds() // 60)
        raise ReglaDeNegocioViolada(
            f"El medico ya tiene un turno dentro de los {minutos} minutos "
            f"de {fecha_hora:%d/%m/%Y %H:%M}. Elija otro horario o profesional."
        )


def _conflicto_de_version() -> ReglaDeNegocioViolada:
    return ReglaDeNegocioViolada(
        "El turno fue modificado por otro profesional mientras lo editaba. "
        "Recargue el turno y vuelva a intentarlo."
    )


def _clave_historial(dni: str) -> str:
    return f"historial_paciente_{dni}"


# La cache es una optimizacion: si Redis no responde, se sigue contra la base
# en lugar de devolver un 500.
CACHE_NO_DISPONIBLE = object()


def _cache_get(clave: str):
    """Devuelve el valor, None si no esta, o CACHE_NO_DISPONIBLE si Redis fallo."""
    try:
        return cache.get(clave)
    except Exception:
        logger.warning("Cache no disponible al leer %s", clave, exc_info=True)
        return CACHE_NO_DISPONIBLE


def _cache_set(clave: str, valor, ttl: int) -> None:
    try:
        cache.set(clave, valor, ttl)
    except Exception:
        logger.warning("Cache no disponible al escribir %s", clave, exc_info=True)


def _cache_delete(clave: str) -> None:
    try:
        cache.delete(clave)
    except Exception:
        # Sin invalidacion, el historial puede quedar viejo hasta su TTL (1 h).
        logger.error("No se pudo invalidar %s en la cache", clave, exc_info=True)
