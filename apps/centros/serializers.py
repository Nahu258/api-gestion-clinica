"""
CAPA DE SERIALIZACIÓN — Módulo Centros de Emergencia.

Convierte objetos CentroEmergencia + distancia_km a JSON de salida.
El campo `distancia_km` no está en el modelo: se inyecta desde el servicio.
"""

from rest_framework import serializers

from .models import CentroEmergencia


class CentroEmergenciaSerializer(serializers.ModelSerializer):
    """
    Serializer de salida de un CentroEmergencia.

    `distancia_km` es un campo calculado que se recibe como contexto
    externo (no existe en la tabla); se expone redondeado a 2 decimales.
    """

    tipo_legible   = serializers.CharField(source="get_tipo_display", read_only=True)
    distancia_km   = serializers.SerializerMethodField()

    class Meta:
        model  = CentroEmergencia
        fields = [
            "id",
            "nombre",
            "tipo",
            "tipo_legible",
            "direccion",
            "ciudad",
            "telefono",
            "atiende_24h",
            "latitud",
            "longitud",
            "distancia_km",
        ]

    def get_distancia_km(self, obj) -> float | None:
        """
        Devuelve la distancia calculada si fue inyectada en el contexto.

        El contexto se arma en la vista como:
            CentroEmergenciaSerializer(centro, context={"distancia_km": dist})
        """
        return self.context.get("distancia_km")
