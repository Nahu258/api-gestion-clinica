"""
Capa de servicios — Guardias programadas (cronograma de médicos por centro).

Épica 5, issue AE5-04 (#34).

Reglas:
  - El médico debe tener una asignación activa en el centro.
  - hora_fin > hora_inicio. Las guardias que cruzan la medianoche NO se
    soportan en un solo bloque: se cargan como dos (ej. lunes 20:00-23:59 y
    martes 00:00-08:00). Así la inferencia de disponibilidad por día/hora
    (clinica.disponibilidad) sigue siendo correcta.
  - Un médico no puede tener dos guardias solapadas el mismo día, en ningún
    centro (no puede estar en dos lugares a la vez). Bloques contiguos
    (uno termina 14:00 y el otro empieza 14:00) se permiten.
"""

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from apps.centros.models import AsignacionMedico, CentroEmergencia
from apps.clinica.models import DisponibilidadMedico, Medico
from core.exceptions import DatosInvalidos, RecursoNoEncontrado

FORMATO_HORA = "%H:%M"


def cronograma_del_centro(centro: CentroEmergencia, params) -> list[dict]:
    """Guardias del centro. Filtros: medico_id, especialidad_id, dia_semana."""
    qs = DisponibilidadMedico.objects.filter(centro=centro).select_related("medico", "centro")

    medico_id = _entero_opcional(params, "medico_id")
    if medico_id is not None:
        qs = qs.filter(medico_id=medico_id)

    especialidad_id = _entero_opcional(params, "especialidad_id")
    if especialidad_id is not None:
        qs = qs.filter(
            medico__asignaciones_centro__centro=centro,
            medico__asignaciones_centro__especialidad_id=especialidad_id,
            medico__asignaciones_centro__activo=True,
        ).distinct()

    dia = _entero_opcional(params, "dia_semana")
    if dia is not None:
        qs = qs.filter(dia_semana=dia)

    guardias = list(qs.order_by("dia_semana", "hora_inicio", "medico__nombre"))
    especialidades = _especialidades_por_medico(centro, {g.medico_id for g in guardias})
    return [serializar_guardia(g, especialidades.get(g.medico_id, [])) for g in guardias]


def guardias_del_medico(medico: Medico) -> list[dict]:
    guardias = (
        DisponibilidadMedico.objects.filter(medico=medico)
        .select_related("centro")
        .order_by("dia_semana", "hora_inicio")
    )
    return [serializar_guardia(g) for g in guardias]


def obtener_guardia(centro: CentroEmergencia, guardia_id: int) -> DisponibilidadMedico:
    guardia = (
        DisponibilidadMedico.objects.filter(pk=guardia_id, centro=centro)
        .select_related("medico", "centro")
        .first()
    )
    if guardia is None:
        raise RecursoNoEncontrado(f"No existe la guardia #{guardia_id} en {centro.nombre}.")
    return guardia


def crear_guardia(centro: CentroEmergencia, datos: dict) -> DisponibilidadMedico:
    medico = _obtener_medico(datos["medico_id"])
    guardia = DisponibilidadMedico(
        medico=medico,
        centro=centro,
        dia_semana=datos["dia_semana"],
        hora_inicio=datos["hora_inicio"],
        hora_fin=datos["hora_fin"],
        en_guardia_activa=datos.get("en_guardia_activa", True),
    )
    _validar(guardia)
    guardia.save()
    return guardia


def actualizar_guardia(guardia: DisponibilidadMedico, datos: dict) -> DisponibilidadMedico:
    if "medico_id" in datos:
        guardia.medico = _obtener_medico(datos["medico_id"])
    for campo in ("dia_semana", "hora_inicio", "hora_fin", "en_guardia_activa"):
        if campo in datos:
            setattr(guardia, campo, datos[campo])
    _validar(guardia)
    guardia.save()
    return guardia


def serializar_guardia(guardia: DisponibilidadMedico, especialidades: list | None = None) -> dict:
    datos = {
        "id": guardia.id,
        "medico_id": guardia.medico_id,
        "medico_nombre": guardia.medico.nombre,
        "centro_id": guardia.centro_id,
        "centro_nombre": guardia.centro.nombre,
        "dia_semana": guardia.dia_semana,
        "dia_nombre": guardia.get_dia_semana_display(),
        "hora_inicio": guardia.hora_inicio.strftime(FORMATO_HORA),
        "hora_fin": guardia.hora_fin.strftime(FORMATO_HORA),
        "en_guardia_activa": guardia.en_guardia_activa,
    }
    if especialidades is not None:
        datos["especialidades"] = especialidades
    return datos


# ---------------------------------------------------------------------------
# Validaciones
# ---------------------------------------------------------------------------

def _validar(guardia: DisponibilidadMedico) -> None:
    if guardia.hora_fin <= guardia.hora_inicio:
        raise ValidationError(
            {
                "hora_fin": [
                    "La hora de fin debe ser posterior a la de inicio. Para una guardia "
                    "que cruza la medianoche cargá dos bloques (ej. 20:00-23:59 y "
                    "00:00-08:00 del día siguiente)."
                ]
            }
        )

    asignado = AsignacionMedico.objects.filter(
        medico=guardia.medico, centro=guardia.centro, activo=True
    ).exists()
    if not asignado:
        raise ValidationError(
            {"medico_id": [f"{guardia.medico.nombre} no está asignado a {guardia.centro.nombre}."]}
        )

    solapadas = (
        DisponibilidadMedico.objects.filter(
            medico=guardia.medico,
            dia_semana=guardia.dia_semana,
        )
        .filter(Q(hora_inicio__lt=guardia.hora_fin) & Q(hora_fin__gt=guardia.hora_inicio))
        .exclude(pk=guardia.pk)
        .select_related("centro", "medico")
        .order_by("hora_inicio")
    )
    if solapadas.exists():
        conflictos = [serializar_guardia(g) for g in solapadas]
        primera = conflictos[0]
        raise DatosInvalidos(
            f"{guardia.medico.nombre} ya tiene guardia el {primera['dia_nombre']} de "
            f"{primera['hora_inicio']} a {primera['hora_fin']} en {primera['centro_nombre']}.",
            detalles={"solapamiento": conflictos},
        )


def _obtener_medico(medico_id: int) -> Medico:
    medico = Medico.objects.filter(pk=medico_id).first()
    if medico is None:
        raise ValidationError({"medico_id": [f"No existe un médico con id {medico_id}."]})
    return medico


def _especialidades_por_medico(centro: CentroEmergencia, medico_ids: set[int]) -> dict[int, list]:
    resultado: dict[int, list] = {}
    for a in (
        AsignacionMedico.objects.filter(centro=centro, medico_id__in=medico_ids, activo=True)
        .select_related("especialidad")
        .order_by("especialidad__nombre")
    ):
        resultado.setdefault(a.medico_id, []).append(
            {"id": a.especialidad_id, "nombre": a.especialidad.nombre}
        )
    return resultado


def _entero_opcional(params, nombre: str) -> int | None:
    valor = (params.get(nombre) or "").strip()
    if not valor:
        return None
    if not valor.isdigit():
        raise ValidationError({nombre: ["Debe ser un número entero."]})
    return int(valor)
