"""
CAPA DE CONTROLADORES — Módulo Centros de Emergencia.

Responsabilidad única: leer query params, delegar a services, devolver
el código HTTP y el JSON correctos. Sin lógica de negocio acá adentro.
"""

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import DatosInvalidos
from apps.centros import services
from apps.centros.serializers import CentroEmergenciaSerializer


class CentrosCercanosAPIView(APIView):
    """
    Búsqueda de centros de emergencia por proximidad geográfica.

    GET /api/v1/centros/cercanos/?lat=<float>&lon=<float>[&radio_km=<float>][&tipo=<str>]

    Parámetros de query:
        lat       (requerido) Latitud del usuario, ej. -27.3621
        lon       (requerido) Longitud del usuario, ej. -55.9009
        radio_km  (opcional)  Radio de búsqueda en km. Default: 10. Máximo: 50.
        tipo      (opcional)  Tipo de centro: hospital | upa | same | bomberos | policia | otro

    Respuestas:
        200 OK      Lista de centros dentro del radio, ordenados por distancia.
        400 Bad Request si lat/lon faltan o son inválidos, radio fuera de rango
                        o tipo no reconocido.
    """

    def get(self, request: Request) -> Response:
        lat, lon, radio_km, tipo = self._parsear_params(request)

        resultados = services.buscar_centros_cercanos(
            lat=lat,
            lon=lon,
            radio_km=radio_km,
            tipo=tipo,
        )

        datos = [
            CentroEmergenciaSerializer(centro, context={"distancia_km": distancia}).data
            for centro, distancia in resultados
        ]

        return Response(
            {"cantidad": len(datos), "resultados": datos},
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Helpers privados
    # ------------------------------------------------------------------

    def _parsear_params(self, request: Request) -> tuple:
        """
        Extrae y convierte los query params. Lanza DatosInvalidos (→ 400)
        si alguno obligatorio falta o no es un número válido.
        """
        lat_raw = request.query_params.get("lat")
        lon_raw = request.query_params.get("lon")
        radio_raw = request.query_params.get("radio_km", "10")
        tipo = request.query_params.get("tipo") or None

        if lat_raw is None:
            raise DatosInvalidos("El parámetro 'lat' es obligatorio.")
        if lon_raw is None:
            raise DatosInvalidos("El parámetro 'lon' es obligatorio.")

        try:
            lat = float(lat_raw)
        except ValueError:
            raise DatosInvalidos(f"'lat' debe ser un número decimal. Recibido: '{lat_raw}'.")

        try:
            lon = float(lon_raw)
        except ValueError:
            raise DatosInvalidos(f"'lon' debe ser un número decimal. Recibido: '{lon_raw}'.")

        try:
            radio_km = float(radio_raw)
        except ValueError:
            raise DatosInvalidos(f"'radio_km' debe ser un número decimal. Recibido: '{radio_raw}'.")

        return lat, lon, radio_km, tipo
