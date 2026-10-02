"""
core/geo.py — Utilidades de geolocalización.

Implementa la fórmula de Haversine para calcular la distancia en km
entre dos puntos sobre la superficie terrestre dados por (lat, lon).

No depende de PostGIS ni de ninguna librería externa: funciona con
SQLite en desarrollo y con PostgreSQL en producción sin cambios.

Referencia: https://en.wikipedia.org/wiki/Haversine_formula
"""

import math
from decimal import Decimal


# Radio medio de la Tierra en kilómetros (WGS-84)
RADIO_TIERRA_KM: float = 6371.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Devuelve la distancia en kilómetros entre dos puntos geográficos.

    Args:
        lat1, lon1: coordenadas del punto de origen (grados decimales).
        lat2, lon2: coordenadas del punto de destino (grados decimales).

    Returns:
        Distancia en kilómetros como float, redondeada a 2 decimales.

    >>> round(haversine(-27.3621, -55.9009, -27.3676, -55.8977), 1)
    0.7
    """
    # Convertir a radianes
    lat1_r = math.radians(float(lat1))
    lat2_r = math.radians(float(lat2))
    delta_lat = math.radians(float(lat2) - float(lat1))
    delta_lon = math.radians(float(lon2) - float(lon1))

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return round(RADIO_TIERRA_KM * c, 2)


def centros_dentro_de_radio(
    centros,
    lat_usuario: float,
    lon_usuario: float,
    radio_km: float,
) -> list[tuple]:
    """
    Filtra y ordena una lista de objetos CentroEmergencia por distancia.

    Recibe el queryset ya filtrado por tipo/activo y devuelve una lista de
    tuplas (centro, distancia_km) ordenada de más cercano a más lejano,
    solo con los que caen dentro del radio indicado.

    Args:
        centros:       QuerySet de CentroEmergencia.
        lat_usuario:   Latitud del usuario en grados decimales.
        lon_usuario:   Longitud del usuario en grados decimales.
        radio_km:      Radio máximo de búsqueda en kilómetros.

    Returns:
        Lista de (CentroEmergencia, distancia_km) ordenada por distancia ASC.
    """
    resultados = []
    for centro in centros:
        distancia = haversine(
            lat_usuario, lon_usuario,
            float(centro.latitud), float(centro.longitud),
        )
        if distancia <= radio_km:
            resultados.append((centro, distancia))

    resultados.sort(key=lambda par: par[1])
    return resultados
