from django.shortcuts import get_object_or_404
from .models import Paciente, Medico
from core.exceptions import RecursoNoEncontrado

def obtener_paciente(paciente_id: int):
    try:
        return Paciente.objects.get(id=paciente_id)
    except Paciente.DoesNotExist:
        raise RecursoNoEncontrado(f"No se encontró el paciente con ID {paciente_id}")

def obtener_paciente_por_dni(dni: str):
    try:
        return Paciente.objects.get(dni=dni)
    except Paciente.DoesNotExist:
        raise RecursoNoEncontrado(f"No se encontró el paciente con DNI {dni}")

def obtener_medico(medico_id: int):
    try:
        return Medico.objects.get(id=medico_id)
    except Medico.DoesNotExist:
        raise RecursoNoEncontrado(f"No se encontró el médico con ID {medico_id}")

def buscar_pacientes_ids_por_nombre(texto: str) -> list[int]:
    return list(Paciente.objects.filter(nombre__icontains=texto).values_list('id', flat=True))

def buscar_medicos_ids_por_nombre(texto: str) -> list[int]:
    return list(Medico.objects.filter(nombre__icontains=texto).values_list('id', flat=True))
