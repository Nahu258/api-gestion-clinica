"""
CAPA DE LÓGICA DE NEGOCIO — Especialidades y plantel médico por institución.

Épica 5, issue AE5-03 (#33).

- Catálogo global de especialidades (lo administra el superadmin).
- Especialidades que ofrece cada centro (CentroEspecialidad, baja lógica).
- Plantel médico del centro (AsignacionMedico, baja lógica).

Sobre `Medico.especialidad` (TextChoices heredado del AE1): queda DEPRECADO.
La especialidad real sale de AsignacionMedico; el campo se mantiene sólo por
compatibilidad y se deriva de la primera asignación activa del médico
(ver `sincronizar_especialidad_legacy`).
"""

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from rest_framework.exceptions import ValidationError

from apps.centros.models import (
    AsignacionMedico,
    CentroEmergencia,
    CentroEspecialidad,
    Especialidad,
)
from core.exceptions import RecursoNoEncontrado

ESTADOS_DERIVACION_ABIERTA = ("derivado", "en_atencion")


# ---------------------------------------------------------------------------
# Catálogo global
# ---------------------------------------------------------------------------

def catalogo_con_conteos():
    """Especialidades con cantidad de centros que la ofrecen y de médicos asignados."""
    return Especialidad.objects.annotate(
        n_centros=Count(
            "centros_adheridos",
            filter=Q(centros_adheridos__activo=True, centros_adheridos__centro__activo=True),
            distinct=True,
        ),
        n_medicos=Count(
            "medicos_asignados__medico",
            filter=Q(medicos_asignados__activo=True),
            distinct=True,
        ),
    ).order_by("nombre")


def obtener_especialidad_catalogo(especialidad_id: int) -> Especialidad:
    especialidad = catalogo_con_conteos().filter(pk=especialidad_id).first()
    if especialidad is None:
        raise RecursoNoEncontrado(f"No existe una especialidad con id {especialidad_id}.")
    return especialidad


def centros_de_especialidad(especialidad: Especialidad) -> list[dict]:
    """Dónde está vinculada la especialidad (para "Ver centros")."""
    return [
        {
            "centro_id": ce.centro_id,
            "centro_nombre": ce.centro.nombre,
            "centro_activo": ce.centro.activo,
            "activo": ce.activo,
        }
        for ce in especialidad.centros_adheridos.select_related("centro").order_by("centro__nombre")
    ]


# ---------------------------------------------------------------------------
# Especialidades del centro
# ---------------------------------------------------------------------------

def obtener_centro(centro_id: int, solo_activos: bool = False) -> CentroEmergencia:
    qs = CentroEmergencia.objects.filter(pk=centro_id)
    if solo_activos:
        qs = qs.filter(activo=True)
    centro = qs.first()
    if centro is None:
        raise RecursoNoEncontrado(f"Centro de emergencia #{centro_id} no encontrado o inactivo.")
    return centro


def especialidades_del_centro_gestion(centro: CentroEmergencia) -> list[dict]:
    """
    Todas las especialidades vinculadas al centro (activas e inactivas) con
    cantidad de médicos, médicos disponibles ahora y derivaciones abiertas.
    """
    from apps.atencion.models import SolicitudAtencion  # noqa: PLC0415

    vinculos = (
        CentroEspecialidad.objects.filter(centro=centro)
        .select_related("especialidad")
        .order_by("especialidad__nombre")
    )
    abiertas = dict(
        SolicitudAtencion.objects.filter(centro=centro, estado__in=ESTADOS_DERIVACION_ABIERTA)
        .order_by()
        .values_list("especialidad_asignada_id")
        .annotate(n=Count("id"))
    )
    medicos_por_esp: dict[int, set[int]] = {}
    for esp_id, med_id in AsignacionMedico.objects.filter(
        centro=centro, activo=True
    ).values_list("especialidad_id", "medico_id"):
        medicos_por_esp.setdefault(esp_id, set()).add(med_id)

    estados = _estados_en_tiempo_real({m for ids in medicos_por_esp.values() for m in ids})

    resultado = []
    for vinculo in vinculos:
        esp = vinculo.especialidad
        medicos = medicos_por_esp.get(esp.id, set())
        disponibles = (
            None if estados is None
            else sum(1 for m in medicos if estados.get(m) == "DISPONIBLE")
        )
        resultado.append(
            {
                "id": esp.id,
                "nombre": esp.nombre,
                "codigo": esp.codigo,
                "descripcion": esp.descripcion,
                "icono": esp.icono,
                "activo": vinculo.activo,
                "medicos": len(medicos),
                "medicos_disponibles": disponibles,
                "derivaciones_abiertas": abiertas.get(esp.id, 0),
            }
        )
    return resultado


def vincular_especialidad(centro: CentroEmergencia, especialidad: Especialidad) -> CentroEspecialidad:
    vinculo, _ = CentroEspecialidad.objects.get_or_create(centro=centro, especialidad=especialidad)
    if not vinculo.activo:
        vinculo.activo = True
        vinculo.save(update_fields=["activo"])
    return vinculo


def derivaciones_abiertas(centro: CentroEmergencia, especialidad_id: int):
    from apps.atencion.models import SolicitudAtencion  # noqa: PLC0415

    return SolicitudAtencion.objects.filter(
        centro=centro,
        especialidad_asignada_id=especialidad_id,
        estado__in=ESTADOS_DERIVACION_ABIERTA,
    ).order_by("id")


def cambiar_estado_especialidad_centro(
    centro: CentroEmergencia, especialidad_id: int, activo: bool, forzar: bool = False
) -> tuple[CentroEspecialidad | None, dict | None]:
    """
    Activa/desactiva una especialidad del centro.

    Devuelve (vinculo, None) si se aplicó, o (None, conflicto) si hay
    derivaciones abiertas y no se pidió `forzar` (la vista responde 409).
    """
    vinculo = CentroEspecialidad.objects.filter(
        centro=centro, especialidad_id=especialidad_id
    ).select_related("especialidad").first()
    if vinculo is None:
        raise RecursoNoEncontrado(
            f"La especialidad #{especialidad_id} no está vinculada a {centro.nombre}."
        )

    if not activo and vinculo.activo and not forzar:
        abiertas = list(derivaciones_abiertas(centro, especialidad_id).values("id", "estado"))
        if abiertas:
            return None, {
                "derivaciones_abiertas": len(abiertas),
                "solicitudes": abiertas,
                "sugerencia": "Reenviá con 'forzar': true para desactivarla igualmente.",
            }

    if vinculo.activo != activo:
        vinculo.activo = activo
        vinculo.save(update_fields=["activo"])
    return vinculo, None


def filtrar_especialidades_inactivas(query, centro_id: int):
    """
    Excluye de un queryset de AsignacionMedico las especialidades que el
    centro desactivó. Si no hay vínculo CentroEspecialidad (datos legados),
    la asignación se considera vigente.
    """
    desactivada = CentroEspecialidad.objects.filter(
        centro_id=centro_id, especialidad_id=OuterRef("especialidad_id"), activo=False
    )
    return query.exclude(Exists(desactivada))


# ---------------------------------------------------------------------------
# Plantel médico
# ---------------------------------------------------------------------------

def plantel_del_centro(centro: CentroEmergencia, params) -> list[dict]:
    """
    Médicos del centro agrupados por médico, con sus especialidades
    (incluye asignaciones inactivas). Un médico pertenece al centro si tiene
    alguna asignación allí o si su cuenta (PerfilExtendido) apunta al centro.

    Filtros: especialidad_id, activo (true/false), q (nombre o matrícula).
    """
    from apps.centros.services import _parsear_bool  # noqa: PLC0415
    from apps.clinica.models import Medico  # noqa: PLC0415

    medicos = (
        Medico.objects.filter(
            Q(asignaciones_centro__centro=centro) | Q(perfiles__centro=centro)
        )
        .distinct()
        .order_by("nombre", "id")
    )

    q = (params.get("q") or "").strip()
    if q:
        medicos = medicos.filter(Q(nombre__icontains=q) | Q(matricula__icontains=q))

    asignaciones: dict[int, list] = {}
    for a in (
        AsignacionMedico.objects.filter(centro=centro, medico__in=medicos)
        .select_related("especialidad")
        .order_by("especialidad__nombre")
    ):
        asignaciones.setdefault(a.medico_id, []).append(a)

    cuentas = _cuentas_por_medico(medicos)

    resultado = [_serializar_medico_plantel(m, asignaciones.get(m.id, []), cuentas.get(m.id)) for m in medicos]

    esp_raw = (params.get("especialidad_id") or "").strip()
    if esp_raw:
        if not esp_raw.isdigit():
            raise ValidationError({"especialidad_id": ["Debe ser un número entero."]})
        esp_id = int(esp_raw)
        resultado = [
            m for m in resultado
            if any(e["especialidad_id"] == esp_id and e["activo"] for e in m["especialidades"])
        ]

    activo_raw = params.get("activo")
    if activo_raw not in (None, ""):
        activo = _parsear_bool(activo_raw, "activo")
        resultado = [m for m in resultado if m["activo"] == activo]

    return resultado


def obtener_medico_del_centro(centro: CentroEmergencia, medico_id: int):
    from apps.clinica.models import Medico  # noqa: PLC0415

    medico = (
        Medico.objects.filter(pk=medico_id)
        .filter(Q(asignaciones_centro__centro=centro) | Q(perfiles__centro=centro))
        .distinct()
        .first()
    )
    if medico is None:
        raise RecursoNoEncontrado(f"El médico #{medico_id} no pertenece a {centro.nombre}.")
    return medico


def detalle_medico_plantel(centro: CentroEmergencia, medico) -> dict:
    asignaciones = list(
        AsignacionMedico.objects.filter(centro=centro, medico=medico)
        .select_related("especialidad")
        .order_by("especialidad__nombre")
    )
    from apps.clinica.models import Medico  # noqa: PLC0415

    cuenta = _cuentas_por_medico(Medico.objects.filter(pk=medico.pk)).get(medico.pk)
    return _serializar_medico_plantel(medico, asignaciones, cuenta)


def actualizar_medico_plantel(centro: CentroEmergencia, medico, datos: dict):
    """
    Edita nombre/matrícula y las asignaciones del médico EN ESTE centro.

      - especialidad_ids: conjunto final de especialidades activas (alta de las
        nuevas, baja lógica de las que no vienen). Deben estar activas en el centro.
      - activo=False: baja del centro (desactiva todas sus asignaciones).
      - activo=True sin especialidad_ids: reactiva sus asignaciones previas.
    """
    with transaction.atomic():
        campos = []
        if "nombre" in datos:
            medico.nombre = datos["nombre"]
            campos.append("nombre")
        if "matricula" in datos:
            medico.matricula = datos["matricula"]
            campos.append("matricula")
        if campos:
            medico.save(update_fields=campos)
            if "nombre" in datos:
                _sincronizar_nombre_cuenta(medico)

        asignaciones = AsignacionMedico.objects.filter(centro=centro, medico=medico)

        if datos.get("activo") is False:
            asignaciones.update(activo=False)
        elif "especialidad_ids" in datos:
            ids = list(dict.fromkeys(datos["especialidad_ids"]))
            validar_especialidades_activas(centro, ids)
            asignaciones.exclude(especialidad_id__in=ids).update(activo=False)
            for esp_id in ids:
                asignacion, _ = AsignacionMedico.objects.get_or_create(
                    medico=medico, centro=centro, especialidad_id=esp_id
                )
                if not asignacion.activo:
                    asignacion.activo = True
                    asignacion.save(update_fields=["activo"])
        elif datos.get("activo") is True:
            habilitadas = CentroEspecialidad.objects.filter(
                centro=centro, activo=True
            ).values_list("especialidad_id", flat=True)
            asignaciones.filter(especialidad_id__in=habilitadas).update(activo=True)

        sincronizar_especialidad_legacy(medico)

    return medico


def validar_especialidades_activas(centro: CentroEmergencia, ids: list[int]) -> None:
    habilitadas = set(
        CentroEspecialidad.objects.filter(
            centro=centro, especialidad_id__in=ids, activo=True
        ).values_list("especialidad_id", flat=True)
    )
    faltantes = [i for i in ids if i not in habilitadas]
    if faltantes:
        raise ValidationError(
            {"especialidad_ids": [f"Las especialidades {faltantes} no están activas en {centro.nombre}."]}
        )


def sincronizar_especialidad_legacy(medico) -> None:
    """Deriva `Medico.especialidad` (deprecado) de la primera asignación activa."""
    primera = (
        medico.asignaciones_centro.filter(activo=True)
        .select_related("especialidad")
        .order_by("creado_en", "id")
        .first()
    )
    if primera is None:
        return
    valor = especialidad_legacy(primera.especialidad)
    if medico.especialidad != valor:
        medico.especialidad = valor
        medico.save(update_fields=["especialidad"])


def especialidad_legacy(especialidad: Especialidad) -> str:
    """Mapea una Especialidad del catálogo al TextChoices heredado de Medico."""
    from apps.clinica.models import Medico  # noqa: PLC0415

    codigo = especialidad.codigo.replace("-", "_").lower()
    validos = {c.value for c in Medico.Especialidad}
    return codigo if codigo in validos else Medico.Especialidad.OTRA


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------

def _estados_en_tiempo_real(medico_ids: set[int]) -> dict[int, str] | None:
    """Estado Redis de cada médico; None si Redis no responde."""
    from apps.clinica.disponibilidad import get_disponibilidad_medico  # noqa: PLC0415

    try:
        return {m: get_disponibilidad_medico(m) for m in medico_ids}
    except Exception:  # noqa: BLE001 — Redis caído no debe romper la consola
        return None


def _cuentas_por_medico(medicos) -> dict[int, dict]:
    from apps.auth_usuarios.models import PerfilExtendido  # noqa: PLC0415

    cuentas = {}
    for perfil in PerfilExtendido.objects.filter(medico__in=medicos).select_related("usuario"):
        cuentas[perfil.medico_id] = {
            "usuario_id": perfil.usuario_id,
            "email": perfil.usuario.email,
            "activo": perfil.usuario.is_active,
        }
    return cuentas


def _serializar_medico_plantel(medico, asignaciones: list, cuenta: dict | None) -> dict:
    especialidades = [
        {
            "asignacion_id": a.id,
            "especialidad_id": a.especialidad_id,
            "nombre": a.especialidad.nombre,
            "activo": a.activo,
        }
        for a in asignaciones
    ]
    return {
        "id": medico.id,
        "nombre": medico.nombre,
        "matricula": medico.matricula,
        "activo": any(e["activo"] for e in especialidades),
        "especialidades": especialidades,
        "cuenta": cuenta,
    }


def _sincronizar_nombre_cuenta(medico) -> None:
    """Si el médico tiene cuenta, mantiene el nombre del User alineado."""
    for perfil in medico.perfiles.select_related("usuario"):
        usuario = perfil.usuario
        partes = medico.nombre.strip().split(" ", 1)
        usuario.first_name = partes[0]
        usuario.last_name = partes[1].strip() if len(partes) > 1 else ""
        usuario.save(update_fields=["first_name", "last_name"])
