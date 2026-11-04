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
