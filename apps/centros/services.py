"""
CAPA DE LÓGICA DE NEGOCIO — Módulo Centros de Emergencia.

Esta capa NO sabe qué es HTTP. No recibe `request` ni devuelve `Response`.
Toda la lógica de filtrado y proximidad geográfica vive acá.
"""

from core.exceptions import DatosInvalidos
from core.geo import centros_dentro_de_radio
from .models import CentroEmergencia


# Límites de validación de parámetros
RADIO_KM_DEFAULT: float = 10.0
RADIO_KM_MAX: float = 50.0
LAT_MIN, LAT_MAX = -90.0, 90.0
LON_MIN, LON_MAX = -180.0, 180.0

# Tipos válidos para el filtro (mismos valores que el modelo)
TIPOS_VALIDOS = {t.value for t in CentroEmergencia.Tipo}


def buscar_centros_cercanos(
    lat: float,
    lon: float,
    radio_km: float = RADIO_KM_DEFAULT,
    tipo: str | None = None,
) -> list[tuple]:
    """
    Devuelve los centros de emergencia activos dentro del radio indicado,
    ordenados por distancia al punto (lat, lon).

    Args:
        lat:      Latitud del usuario en grados decimales.
        lon:      Longitud del usuario en grados decimales.
        radio_km: Radio de búsqueda en km (default 10, máximo 50).
        tipo:     Filtro opcional por tipo de centro (ej. 'hospital').

    Returns:
        Lista de tuplas (CentroEmergencia, distancia_km).

    Raises:
        DatosInvalidos: si lat/lon están fuera de rango, radio es inválido
                        o el tipo no existe en el catálogo.
    """
    _validar_coordenadas(lat, lon)
    _validar_radio(radio_km)
    if tipo:
        _validar_tipo(tipo)

    qs = CentroEmergencia.objects.filter(activo=True)
    if tipo:
        qs = qs.filter(tipo=tipo)

    return centros_dentro_de_radio(qs, lat, lon, radio_km)


# ---------------------------------------------------------------------------
# Validaciones internas
# ---------------------------------------------------------------------------

def _validar_coordenadas(lat: float, lon: float) -> None:
    if not (LAT_MIN <= lat <= LAT_MAX):
        raise DatosInvalidos(
            f"'lat' debe estar entre {LAT_MIN} y {LAT_MAX}. Recibido: {lat}."
        )
    if not (LON_MIN <= lon <= LON_MAX):
        raise DatosInvalidos(
            f"'lon' debe estar entre {LON_MIN} y {LON_MAX}. Recibido: {lon}."
        )


def _validar_radio(radio_km: float) -> None:
    if radio_km <= 0:
        raise DatosInvalidos(
            f"'radio_km' debe ser mayor que 0. Recibido: {radio_km}."
        )
    if radio_km > RADIO_KM_MAX:
        raise DatosInvalidos(
            f"'radio_km' no puede superar {RADIO_KM_MAX} km. Recibido: {radio_km}."
        )


def _validar_tipo(tipo: str) -> None:
    if tipo not in TIPOS_VALIDOS:
        validos = ", ".join(sorted(TIPOS_VALIDOS))
        raise DatosInvalidos(
            f"Tipo '{tipo}' no reconocido. Tipos válidos: {validos}."
        )


# ---------------------------------------------------------------------------
# Épica 5 — AE5-01: gestión de instituciones
# ---------------------------------------------------------------------------

def centros_con_conteos():
    """
    Queryset de TODOS los centros (incluye inactivos) anotado con:
      - n_especialidades_activas: especialidades vinculadas y activas.
      - n_medicos_asignados: médicos distintos con asignación activa.
      - n_operadores: cuentas OPERADOR_CENTRO activas del centro.
    """
    from django.db.models import Count, Q  # noqa: PLC0415

    return CentroEmergencia.objects.annotate(
        n_especialidades_activas=Count(
            "centro_especialidades",
            filter=Q(centro_especialidades__activo=True),
            distinct=True,
        ),
        n_medicos_asignados=Count(
            "medicos_asignados__medico",
            filter=Q(medicos_asignados__activo=True),
            distinct=True,
        ),
        n_operadores=Count(
            "perfiles",
            filter=Q(perfiles__rol="OPERADOR_CENTRO", perfiles__usuario__is_active=True),
            distinct=True,
        ),
    )


def filtrar_centros_admin(params) -> "QuerySet":
    """
    Aplica los filtros del listado de administración.

    Filtros: q (nombre o dirección), tipo, ciudad, activo (true/false).
    """
    from django.db.models import Q  # noqa: PLC0415

    qs = centros_con_conteos()

    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(nombre__icontains=q) | Q(direccion__icontains=q))

    tipo = (params.get("tipo") or "").strip()
    if tipo:
        _validar_tipo(tipo)
        qs = qs.filter(tipo=tipo)

    ciudad = (params.get("ciudad") or "").strip()
    if ciudad:
        qs = qs.filter(ciudad__iexact=ciudad)

    activo = params.get("activo")
    if activo not in (None, ""):
        qs = qs.filter(activo=_parsear_bool(activo, "activo"))

    return qs.order_by("nombre", "id")


def obtener_centro_admin(centro_id: int) -> CentroEmergencia:
    """Devuelve el centro (activo o no) con sus conteos, o 404."""
    from core.exceptions import RecursoNoEncontrado  # noqa: PLC0415

    centro = centros_con_conteos().filter(pk=centro_id).first()
    if centro is None:
        raise RecursoNoEncontrado(f"No existe un centro con id {centro_id}.")
    return centro


def cambiar_estado_centro(centro_id: int, activo: bool) -> CentroEmergencia:
    """Baja/alta lógica: nunca se borra el centro (preserva historial)."""
    centro = obtener_centro_admin(centro_id)
    if centro.activo != activo:
        centro.activo = activo
        centro.save(update_fields=["activo"])
    return centro


def _parsear_bool(valor, nombre: str) -> bool:
    texto = str(valor).strip().lower()
    if texto in {"true", "1", "si", "sí", "yes"}:
        return True
    if texto in {"false", "0", "no"}:
        return False
    raise DatosInvalidos(f"'{nombre}' debe ser true o false. Recibido: '{valor}'.")


# ---------------------------------------------------------------------------
# Épica 5 — AE5-14: resumen general de la red (consola del superadmin)
# ---------------------------------------------------------------------------

# Las alertas y el estado de guardias se calculan sólo para centros de salud
# con guardia propia: bomberos, policía o SAME no tienen especialidades ni
# plantel, y marcarlos como "sin médicos" sería ruido.
TIPOS_CON_GUARDIA = ("hospital", "clinica", "upa")

ESTADOS_EN_ESPERA = ("pendiente", "aceptado", "en_camino")
ESTADOS_EN_CURSO = ("derivado", "en_atencion")


def resumen_de_la_red(ahora=None) -> dict:
    """
    KPIs globales, estado de guardia por institución y alertas de configuración.

    `medicos_disponibles` es None (global y por centro) si Redis no responde.
    """
    from collections import defaultdict  # noqa: PLC0415

    from django.db.models import Count, Q  # noqa: PLC0415
    from django.utils import timezone  # noqa: PLC0415

    from apps.atencion.models import SolicitudAtencion  # noqa: PLC0415
    from apps.centros.models import AsignacionMedico  # noqa: PLC0415
    from apps.centros.services_plantel import _estados_en_tiempo_real  # noqa: PLC0415

    ahora = ahora or timezone.now()
    inicio_dia = timezone.localtime(ahora).replace(hour=0, minute=0, second=0, microsecond=0)

    centros = list(centros_con_conteos().filter(activo=True).order_by("nombre"))
    inactivas = CentroEmergencia.objects.filter(activo=False).count()

    # Médicos con asignación activa en centros activos, agrupados por centro
    medicos_por_centro = defaultdict(set)
    for centro_id, medico_id in AsignacionMedico.objects.filter(
        activo=True, centro__activo=True
    ).values_list("centro_id", "medico_id"):
        medicos_por_centro[centro_id].add(medico_id)
    todos_los_medicos = set().union(*medicos_por_centro.values()) if medicos_por_centro else set()
    estados = _estados_en_tiempo_real(todos_los_medicos)

    # Solicitudes abiertas de centros activos
    abiertas = list(
        SolicitudAtencion.objects.filter(
            centro__activo=True, estado__in=ESTADOS_EN_ESPERA + ESTADOS_EN_CURSO
        ).values("centro_id", "estado", "creado_en")
    )
    atendidas_hoy = dict(
        SolicitudAtencion.objects.filter(estado="atendido", atendido_en__gte=inicio_dia)
        .order_by()
        .values_list("centro_id")
        .annotate(n=Count("id"))
    )

    por_centro = defaultdict(lambda: {"espera": [], "curso": 0})
    for s in abiertas:
        if s["estado"] in ESTADOS_EN_ESPERA:
            por_centro[s["centro_id"]]["espera"].append(s["creado_en"])
        else:
            por_centro[s["centro_id"]]["curso"] += 1

    def contar(*estados_):
        return sum(1 for s in abiertas if s["estado"] in estados_)

    guardias = []
    alertas = []
    for c in centros:
        if c.tipo not in TIPOS_CON_GUARDIA:
            continue
        medicos = medicos_por_centro.get(c.id, set())
        espera = por_centro[c.id]["espera"]
        promedio = (
            round(sum((ahora - t).total_seconds() for t in espera) / len(espera) / 60)
            if espera else None
        )
        guardias.append(
            {
                "centro_id": c.id,
                "centro_nombre": c.nombre,
                "tipo": c.tipo,
                "en_espera": len(espera),
                "en_curso": por_centro[c.id]["curso"],
                "atendidas_hoy": atendidas_hoy.get(c.id, 0),
                "medicos": len(medicos),
                "medicos_disponibles": (
                    None if estados is None
                    else sum(1 for m in medicos if estados.get(m) == "DISPONIBLE")
                ),
                "espera_promedio_min": promedio,
            }
        )

        faltantes = []
        if not c.n_especialidades_activas:
            faltantes.append(("sin_especialidades", "No tiene especialidades activas."))
        if not medicos:
            faltantes.append(("sin_medicos", "No tiene médicos asignados."))
        if not c.n_operadores:
            faltantes.append(("sin_operador", "No tiene un administrador asignado."))
        for tipo, mensaje in faltantes:
            alertas.append(
                {"centro_id": c.id, "centro_nombre": c.nombre, "tipo": tipo, "mensaje": mensaje}
            )

    return {
        "generado_en": ahora,
        "kpis": {
            "instituciones_activas": len(centros),
            "instituciones_inactivas": inactivas,
            "medicos_disponibles": (
                None if estados is None
                else sum(1 for e in estados.values() if e == "DISPONIBLE")
            ),
            "medicos_asignados": len(todos_los_medicos),
            "solicitudes_pendientes": contar("pendiente", "aceptado"),
            "solicitudes_en_camino": contar("en_camino"),
            "solicitudes_derivadas": contar(*ESTADOS_EN_CURSO),
            "atenciones_hoy": sum(atendidas_hoy.values()),
        },
        "guardias": sorted(guardias, key=lambda g: (-g["en_espera"], g["centro_nombre"])),
        "alertas": alertas,
    }
