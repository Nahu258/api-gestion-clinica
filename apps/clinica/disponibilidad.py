"""
Lógica de tracking de disponibilidad en tiempo real con Redis — Épica 4, issue #23 (AE4-13).

Estados posibles:
  - DISPONIBLE: Listo para recibir derivaciones del centro.
  - EN_ATENCION: Atendiendo a un paciente en consulta.
  - FUERA_DE_GUARDIA: No disponible / fuera de turno.
"""

from datetime import datetime
from django.utils import timezone

from core.redis_client import get_redis
from apps.clinica.models import DisponibilidadMedico, Medico
from apps.centros.models import AsignacionMedico

CLAVE_REDIS_DISPONIBILIDAD = "medico:{medico_id}:disponibilidad"
ESTADOS_VALIDOS = {"DISPONIBLE", "EN_ATENCION", "FUERA_DE_GUARDIA"}


def set_disponibilidad_medico(medico_id: int, estado: str) -> str:
    """
    Actualiza el estado de disponibilidad en Redis inmediatamente.
    """
    estado_upper = estado.upper().strip()
    if estado_upper not in ESTADOS_VALIDOS:
        raise ValueError(f"Estado '{estado}' no válido. Opciones: {list(ESTADOS_VALIDOS)}")

    r = get_redis()
    clave = CLAVE_REDIS_DISPONIBILIDAD.format(medico_id=medico_id)
    r.set(clave, estado_upper)
    return estado_upper


def get_disponibilidad_medico(medico_id: int, ahora: datetime | None = None) -> str:
    """
    Consulta la disponibilidad del médico. Si no existe en Redis,
    la infiere a partir de su horario de guardia programado en BD.
    """
    r = get_redis()
    clave = CLAVE_REDIS_DISPONIBILIDAD.format(medico_id=medico_id)
    valor = r.get(clave)

    if valor:
        return str(valor)

    # Si no está en Redis, inferir de la base de datos
    estado_inferido = inferir_disponibilidad_de_bd(medico_id, ahora=ahora)
    r.set(clave, estado_inferido)
    return estado_inferido


def inferir_disponibilidad_de_bd(medico_id: int, ahora: datetime | None = None) -> str:
    """
    Verifica si el médico tiene una guardia activa en el día y horario actual.
    Retorna DISPONIBLE si coincide con guardia activa, sino FUERA_DE_GUARDIA.
    """
    if ahora is None:
        ahora = timezone.localtime()

    dia_actual = ahora.weekday()  # 0=Lunes, 6=Domingo
    hora_actual = ahora.time()

    tiene_guardia = DisponibilidadMedico.objects.filter(
        medico_id=medico_id,
        dia_semana=dia_actual,
        hora_inicio__lte=hora_actual,
        hora_fin__gte=hora_actual,
        en_guardia_activa=True,
    ).exists()

    return "DISPONIBLE" if tiene_guardia else "FUERA_DE_GUARDIA"


def listar_especialistas_disponibles_centro(
    centro_id: int, especialidad_id: int | None = None
) -> list[dict]:
    """
    Obtiene los médicos asignados a un centro (y opcionalmente a una especialidad),
    junto con su disponibilidad en Redis en tiempo real.
    Ordena con prioridad a los médicos con estado DISPONIBLE.
    """
    query = AsignacionMedico.objects.filter(
        centro_id=centro_id, activo=True
    ).select_related("medico", "especialidad")

    if especialidad_id:
        query = query.filter(especialidad_id=especialidad_id)

    medicos_vistos = set()
    resultados = []

    for asignacion in query:
        med = asignacion.medico
        if med.id in medicos_vistos:
            continue
        medicos_vistos.add(med.id)

        estado = get_disponibilidad_medico(med.id)
        es_prioritario = (estado == "DISPONIBLE")

        resultados.append(
            {
                "id": med.id,
                "nombre": med.nombre,
                "matricula": med.matricula,
                "especialidad_id": asignacion.especialidad.id,
                "especialidad": asignacion.especialidad.nombre,
                "disponibilidad": estado,
                "prioritario_para_derivar": es_prioritario,
            }
        )

    # Ordenar: primero DISPONIBLE (0), luego EN_ATENCION (1), luego FUERA_DE_GUARDIA (2)
    prioridad_map = {"DISPONIBLE": 0, "EN_ATENCION": 1, "FUERA_DE_GUARDIA": 2}
    resultados.sort(key=lambda x: (prioridad_map.get(x["disponibilidad"], 3), x["nombre"]))

    return resultados
