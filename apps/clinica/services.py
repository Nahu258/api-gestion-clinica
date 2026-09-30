"""
CAPA DE SERVICIOS del modulo Clinica - Unica puerta de entrada a Paciente y Medico.

Los demas modulos (ej. Turnos) NO importan los modelos de Clinica ni leen sus
tablas: piden lo que necesitan a traves de estas funciones. Asi, si Clinica
pasa a ser un servicio aparte con su propia base, solo cambia este archivo
(por un cliente HTTP) y el resto del sistema sigue igual.
"""

from .models import Paciente, Medico
from core.exceptions import RecursoNoEncontrado


# ----- Pacientes -----
def obtener_paciente(paciente_id: int) -> Paciente:
    try:
        return Paciente.objects.get(id=paciente_id)
    except Paciente.DoesNotExist:
        raise RecursoNoEncontrado(f"No se encontró el paciente con ID {paciente_id}")


def obtener_paciente_por_dni(dni: str) -> Paciente:
    try:
        return Paciente.objects.get(dni=dni)
    except Paciente.DoesNotExist:
        raise RecursoNoEncontrado(f"No se encontró el paciente con DNI {dni}")


def obtener_pacientes_por_ids(ids) -> dict[int, Paciente]:
    """Trae varios pacientes en UNA consulta. Evita el problema N+1 al listar."""
    return Paciente.objects.in_bulk(set(ids))


def buscar_pacientes_ids_por_nombre(texto: str) -> list[int]:
    return list(
        Paciente.objects.filter(nombre__icontains=texto).values_list("id", flat=True)
    )


def buscar_pacientes_ids_por_dni(texto: str) -> list[int]:
    return list(Paciente.objects.filter(dni__icontains=texto).values_list("id", flat=True))


def registrar_paciente(dni: str, nombre: str, telefono: str, obra_social: str = "") -> Paciente:
    """Devuelve el paciente con ese DNI; si no existe, lo crea."""
    paciente, _ = Paciente.objects.get_or_create(
        dni=dni,
        defaults={"nombre": nombre, "telefono": telefono, "obra_social": obra_social},
    )
    return paciente


# ----- Medicos -----
def obtener_medico(medico_id: int) -> Medico:
    try:
        return Medico.objects.get(id=medico_id)
    except Medico.DoesNotExist:
        raise RecursoNoEncontrado(f"No se encontró el médico con ID {medico_id}")


def obtener_medicos_por_ids(ids) -> dict[int, Medico]:
    """Trae varios medicos en UNA consulta. Evita el problema N+1 al listar."""
    return Medico.objects.in_bulk(set(ids))


def buscar_medicos_ids_por_nombre(texto: str) -> list[int]:
    return list(Medico.objects.filter(nombre__icontains=texto).values_list("id", flat=True))


def especialidades_validas() -> list[str]:
    return list(Medico.Especialidad.values)


def buscar_medicos_ids_por_especialidad(especialidad: str) -> list[int]:
    return list(
        Medico.objects.filter(especialidad=especialidad).values_list("id", flat=True)
    )


def medico_requiere_motivo(medico: Medico) -> bool:
    """Regla heredada de AE1: la especialidad 'otra' exige describir el motivo."""
    return medico.especialidad == Medico.Especialidad.OTRA


def registrar_medico(nombre: str, especialidad: str) -> Medico:
    """Devuelve el medico con ese nombre y especialidad; si no existe, lo crea."""
    medico, _ = Medico.objects.get_or_create(nombre=nombre, especialidad=especialidad)
    return medico
