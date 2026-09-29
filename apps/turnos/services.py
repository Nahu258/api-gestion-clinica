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

from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet

from apps.turnos import agenda
from apps.turnos.models import Turno
from core import eventos
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
        turnos = turnos.filter(
            Q(paciente_nombre__icontains=buscar)
            | Q(paciente_dni__icontains=buscar)
            | Q(profesional__icontains=buscar)
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
    del mas reciente al mas antiguo.
    """
    dni = (dni or "").strip().replace(".", "")
    if not dni.isdigit():
        raise DatosInvalidos("El DNI del paciente solo puede contener numeros.")

    historial = Turno.objects.filter(
        paciente_dni=dni,
        estado=Turno.Estado.ATENDIDO,
    ).order_by("-fecha_hora")

    if not historial.exists():
        raise RecursoNoEncontrado(
            f"No hay consultas atendidas registradas para el DNI {dni}."
        )

    return historial


def reservar_temporalmente(profesional: str, fecha_hora) -> dict:
    """
    AE2 - Aparta un horario por unos minutos (Redis con TTL).
    Primero se verifica que no este ya ocupado en la base.
    """
    _verificar_agenda_libre(profesional=profesional, fecha_hora=fecha_hora, excluir_id=None)
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
    profesional = datos_validados["profesional"]
    fecha_hora = datos_validados["fecha_hora"]

    with agenda.lock_de_agenda(profesional):
        clave_hold = agenda.verificar_reserva_temporal(profesional, fecha_hora, reserva_token)
        _verificar_agenda_libre(profesional=profesional, fecha_hora=fecha_hora, excluir_id=None)
        try:
            with transaction.atomic():
                turno = Turno.objects.create(**datos_validados)
        except IntegrityError:
            raise ReglaDeNegocioViolada(
                f"{profesional} ya tiene un turno el {fecha_hora:%d/%m/%Y %H:%M}."
            )
        agenda.borrar_hold(clave_hold, reserva_token)

    # El evento se publica recien cuando la transaccion quedo confirmada:
    # nunca se avisa de un turno que despues no existe.
    evento = eventos.armar_evento("TurnoReservado", datos_del_evento(turno))
    transaction.on_commit(
        lambda: eventos.publicar(eventos.RK_TURNO_RESERVADO, evento)
    )
    return turno


def datos_del_evento(turno: Turno) -> dict:
    return {
        "turno_id": turno.pk,
        "paciente_nombre": turno.paciente_nombre,
        "paciente_dni": turno.paciente_dni,
        "profesional": turno.profesional,
        "especialidad": turno.especialidad,
        "especialidad_legible": turno.get_especialidad_display(),
        "fecha_hora": turno.fecha_hora.isoformat(),
    }


def actualizar_turno(turno: Turno, datos_validados: dict) -> Turno:
    """Modifica un turno existente respetando las reglas de negocio."""
    if turno.estado == Turno.Estado.ATENDIDO:
        raise ReglaDeNegocioViolada(
            "Un turno ya atendido no puede modificarse: su registro clinico "
            "forma parte del historial del paciente."
        )

    nuevo_profesional = datos_validados.get("profesional", turno.profesional)
    nueva_fecha = datos_validados.get("fecha_hora", turno.fecha_hora)
    nuevo_estado = datos_validados.get("estado", turno.estado)

    if nuevo_estado == Turno.Estado.CANCELADO:
        for campo, valor in datos_validados.items():
            setattr(turno, campo, valor)
        turno.save()
        return turno

    # AE2: mover un turno tambien compite por la agenda -> mismo lock.
    with agenda.lock_de_agenda(nuevo_profesional):
        _verificar_agenda_libre(
            profesional=nuevo_profesional,
            fecha_hora=nueva_fecha,
            excluir_id=turno.pk,
        )
        for campo, valor in datos_validados.items():
            setattr(turno, campo, valor)
        try:
            with transaction.atomic():
                turno.save()
        except IntegrityError:
            raise ReglaDeNegocioViolada(
                f"{nuevo_profesional} ya tiene un turno el {nueva_fecha:%d/%m/%Y %H:%M}."
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
def _verificar_agenda_libre(profesional: str, fecha_hora, excluir_id: int | None) -> None:
    """
    Levanta ReglaDeNegocioViolada (-> 409) si ESE profesional ya tiene un
    turno solapado. Dos profesionales distintos si pueden atender a la
    misma hora: la clinica tiene varios consultorios.
    """
    desde = fecha_hora - DURACION_DE_LA_CONSULTA + timedelta(seconds=1)
    hasta = fecha_hora + DURACION_DE_LA_CONSULTA - timedelta(seconds=1)

    solapados = (
        Turno.objects.filter(
            profesional__iexact=(profesional or "").strip(),
            fecha_hora__range=(desde, hasta),
        )
        .exclude(estado=Turno.Estado.CANCELADO)
    )
    if excluir_id is not None:
        solapados = solapados.exclude(pk=excluir_id)

    if solapados.exists():
        minutos = int(DURACION_DE_LA_CONSULTA.total_seconds() // 60)
        raise ReglaDeNegocioViolada(
            f"{profesional} ya tiene un turno dentro de los {minutos} minutos "
            f"de {fecha_hora:%d/%m/%Y %H:%M}. Elija otro horario o profesional."
        )
