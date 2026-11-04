"""
CAPA DE SERIALIZACIÓN — Módulo Centros de Emergencia.

Convierte objetos CentroEmergencia + distancia_km a JSON de salida.
El campo `distancia_km` no está en el modelo: se inyecta desde el servicio.
"""

from rest_framework import serializers

from .models import CentroEmergencia, Especialidad


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


class EspecialidadSerializer(serializers.ModelSerializer):
    """Serializer para el modelo Especialidad."""

    class Meta:
        model = Especialidad
        fields = ["id", "nombre", "codigo", "descripcion", "icono"]


class DoctorEspecialidadSerializer(serializers.Serializer):
    """Representación de un doctor asignado a un centro y especialidad."""

    id = serializers.IntegerField(source="medico.id")
    nombre = serializers.CharField(source="medico.nombre")
    matricula = serializers.CharField(source="medico.matricula")
    especialidad = serializers.CharField(source="especialidad.nombre")
    activo = serializers.BooleanField()


class CrearEspecialidadCentroSerializer(serializers.Serializer):
    """Payload para POST /api/v1/centros/{id}/especialidades/"""

    especialidad_id = serializers.IntegerField(required=False)
    nombre = serializers.CharField(required=False, max_length=100)
    codigo = serializers.CharField(required=False, max_length=50)
    descripcion = serializers.CharField(required=False, allow_blank=True, default="")
    icono = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("especialidad_id") and not (attrs.get("nombre") and attrs.get("codigo")):
            raise serializers.ValidationError(
                "Debe proporcionar 'especialidad_id' de una especialidad existente, o 'nombre' y 'codigo' para una nueva."
            )
        return attrs


class AsignarDoctorSerializer(serializers.Serializer):
    """Payload para POST /api/v1/centros/{id}/especialidades/{especialidad_id}/doctores/"""

    medico_id = serializers.IntegerField(required=False)
    nombre = serializers.CharField(required=False, max_length=120)
    matricula = serializers.CharField(required=False, max_length=50, default="", allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("medico_id") and not attrs.get("nombre"):
            raise serializers.ValidationError(
                "Debe proporcionar 'medico_id' de un médico existente, o 'nombre' para registrar uno nuevo."
            )
        return attrs



# ---------------------------------------------------------------------------
# Épica 5 — AE5-01: gestión de instituciones (consola del superadmin)
# ---------------------------------------------------------------------------

class CentroAdminSerializer(serializers.ModelSerializer):
    """
    Representación completa de un centro para la consola del superadmin.

    Sirve tanto de entrada (POST/PATCH) como de salida. Los conteos se
    calculan con annotate() en el servicio; si el queryset no los trae
    (ej. recién creado) se devuelven en 0.
    """

    tipo_legible = serializers.CharField(source="get_tipo_display", read_only=True)
    latitud = serializers.DecimalField(
        max_digits=10, decimal_places=7, min_value=-90, max_value=90
    )
    longitud = serializers.DecimalField(
        max_digits=10, decimal_places=7, min_value=-180, max_value=180
    )
    especialidades_activas = serializers.SerializerMethodField()
    medicos_asignados = serializers.SerializerMethodField()
    operadores = serializers.SerializerMethodField()

    class Meta:
        model = CentroEmergencia
        fields = [
            "id",
            "nombre",
            "tipo",
            "tipo_legible",
            "direccion",
            "ciudad",
            "provincia",
            "pais",
            "latitud",
            "longitud",
            "telefono",
            "atiende_24h",
            "activo",
            "creado_en",
            "especialidades_activas",
            "medicos_asignados",
            "operadores",
        ]
        read_only_fields = ["id", "activo", "creado_en"]

    def validate_nombre(self, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("El nombre no puede estar vacío.")
        return valor

    def validate_direccion(self, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("La dirección no puede estar vacía.")
        return valor

    def get_especialidades_activas(self, obj) -> int:
        return getattr(obj, "n_especialidades_activas", 0)

    def get_medicos_asignados(self, obj) -> int:
        return getattr(obj, "n_medicos_asignados", 0)

    def get_operadores(self, obj) -> int:
        return getattr(obj, "n_operadores", 0)
