"""
CAPA DE SERVICIOS (Logica de negocio) - El "que hace" el sistema.

Reglas de esta capa:
  * NO conoce HTTP: no recibe `request` ni devuelve `Response`.
  * Recibe y devuelve objetos/diccionarios de Python.
  * Cuando algo esta mal, levanta una excepcion de dominio
    (RecursoNoEncontrado, ReglaDeNegocioViolada). La traduccion a codigos
    HTTP la hace core/exceptions.py.

Gracias a esto, la misma logica sirve para la API REST, para un comando de
consola o para un test, sin tocar una linea.
"""

from datetime import timedelta

from django.db.models import Q, QuerySet
from django.core.cache import cache
import json
import pika

from apps.turnos.models import Turno
from apps.clinica.services import (
    obtener_paciente, obtener_paciente_por_dni, 
    buscar_pacientes_ids_por_nombre, buscar_medicos_ids_por_nombre
)
from core.exceptions import DatosInvalidos, RecursoNoEncontrado, ReglaDeNegocioViolada

# Regla de negocio: cada consulta ocupa 20 minutos de la agenda del profesional.
DURACION_DE_LA_CONSULTA = timedelta(minutes=20)


def listar_turnos(
    estado: str | None = None,
    especialidad: str | None = None,
    buscar: str | None = None,
) -> QuerySet[Turno]:
    """
    Devuelve todos los turnos, con filtros opcionales.

    :param estado: filtra por estado exacto (pendiente, confirmado, ...).
    :param especialidad: filtra por especialidad medica.
    :param buscar: texto libre sobre paciente, DNI o profesional.
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
        if especialidad not in Turno.Especialidad.values:
            raise DatosInvalidos(
                f"La especialidad '{especialidad}' no es valida. "
                f"Valores permitidos: {', '.join(Turno.Especialidad.values)}."
            )
        turnos = turnos.filter(especialidad=especialidad)

    if buscar:
        pacientes_ids = buscar_pacientes_ids_por_nombre(buscar)
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

    # Validamos que el paciente exista llamando al otro servicio
    paciente = obtener_paciente_por_dni(dni)

    cache_key = f"historial_paciente_{dni}"
    historial_ids = cache.get(cache_key)

    if historial_ids is not None:
        # Recuperar de DB manteniendo orden
        return Turno.objects.filter(id__in=historial_ids).order_by("-fecha_hora")

    historial = Turno.objects.filter(
        paciente_id=paciente.id,
        estado=Turno.Estado.ATENDIDO,
    ).order_by("-fecha_hora")

    if not historial.exists():
        raise RecursoNoEncontrado(
            f"No hay consultas atendidas registradas para el DNI {dni}."
        )

    # Guardar en cache por 1 hora
    cache.set(cache_key, list(historial.values_list('id', flat=True)), 60 * 60)

    return historial


def crear_turno(datos_validados: dict) -> Turno:
    """Aplica las reglas de negocio y persiste un turno nuevo."""
    _verificar_agenda_libre(
        medico_id=datos_validados.get("medico_id"),
        fecha_hora=datos_validados["fecha_hora"],
        excluir_id=None,
    )
    turno = Turno.objects.create(**datos_validados)
    _publicar_evento("TurnoCreado", {"turno_id": turno.id})
    return turno


def actualizar_turno(turno: Turno, datos_validados: dict) -> Turno:
    """Modifica un turno existente respetando las reglas de negocio."""
    if "diagnostico" in datos_validados or "indicaciones" in datos_validados:
        version_enviada = datos_validados.get("version")
        if version_enviada is not None and version_enviada != turno.version:
            raise ReglaDeNegocioViolada(
                "El diagnostico fue editado por otro profesional simultaneamente. "
                "Por favor, recargue la pagina y vuelva a intentarlo."
            )
        turno.version += 1

    nuevo_medico_id = datos_validados.get("medico_id", turno.medico_id)
    nueva_fecha = datos_validados.get("fecha_hora", turno.fecha_hora)
    nuevo_estado = datos_validados.get("estado", turno.estado)

    if nuevo_estado != Turno.Estado.CANCELADO:
        _verificar_agenda_libre(
            medico_id=nuevo_medico_id,
            fecha_hora=nueva_fecha,
            excluir_id=turno.pk,
        )

    for campo, valor in datos_validados.items():
        if campo != "version":
            setattr(turno, campo, valor)
    turno.save()

    if turno.estado == Turno.Estado.ATENDIDO:
        paciente = obtener_paciente(turno.paciente_id)
        cache.delete(f"historial_paciente_{paciente.dni}")
        _publicar_evento("TurnoAtendido", {"turno_id": turno.id, "diagnostico": turno.diagnostico})

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
def _verificar_agenda_libre(medico_id: int | None, fecha_hora, excluir_id: int | None) -> None:
    """
    Levanta ReglaDeNegocioViolada (-> 409) si ESE profesional ya tiene un
    turno solapado. Dos profesionales distintos si pueden atender a la
    misma hora: la clinica tiene varios consultorios.
    """
    if not medico_id:
        return

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

def _publicar_evento(tipo: str, payload: dict):
    """
    Publica un evento en RabbitMQ demostrando comunicación asíncrona (Productor).
    """
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
        channel = connection.channel()
        channel.queue_declare(queue='eventos_clinica', durable=True)
        
        mensaje = payload.copy()
        mensaje['tipo'] = tipo
        
        channel.basic_publish(
            exchange='',
            routing_key='eventos_clinica',
            body=json.dumps(mensaje),
            properties=pika.BasicProperties(
                delivery_mode=pika.spec.PERSISTENT_DELIVERY_MODE
            )
        )
        connection.close()
    except Exception as e:
        # En un sistema real se deberia hacer retries o guardar en tabla de outbox
        print(f"Error publicando evento {tipo}: {e}")
