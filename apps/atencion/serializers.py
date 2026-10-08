"""
CAPA DE SERIALIZACIÓN — Módulo Atención de Emergencias.

SolicitudAtencionSerializer: validación de entrada y formato de salida.
SolicitudEstadoSerializer:   solo para PATCH /solicitudes/{id}/ (cambio de estado).
"""

from rest_framework import serializers

from apps.centros.models import CentroEmergencia
from .models import SolicitudAtencion


class SolicitudAtencionSerializer(serializers.ModelSerializer):
    """
    Serializer de creación (POST) y lectura (GET) de SolicitudAtencion.

    Entrada (POST):
        centro_id     int       requerido
        modo          str       requerido ('aviso' | 'solicitud')
        motivo        str       opcional
        usuario_id    int       opcional (null = invitado)
        nombre_invitado str     opcional
        telefono_invitado str   opcional
        lat_usuario   float     opcional
        lon_usuario   float     opcional

    Salida (GET):
        Todos los campos anteriores + campos de solo lectura:
        id, estado, estado_legible, modo_legible, centro_nombre, centro_telefono, centro_direccion, creado_en, actualizado_en.
    """

    # Campos de solo lectura calculados
    estado_legible   = serializers.CharField(source="get_estado_display", read_only=True)
    modo_legible     = serializers.CharField(source="get_modo_display",   read_only=True)
    centro_nombre    = serializers.CharField(source="centro.nombre",      read_only=True)
    centro_telefono  = serializers.CharField(source="centro.telefono",    read_only=True)
    centro_direccion = serializers.CharField(source="centro.direccion",   read_only=True)

    # modo es requerido en creación (el modelo tiene default pero la API lo exige)
    modo = serializers.ChoiceField(choices=SolicitudAtencion.Modo.choices)

    # centro_id: campo de escritura que valida que el centro exista y esté activo.
    # Se expone también en la salida como entero (no como URL).
    centro_id = serializers.PrimaryKeyRelatedField(
        queryset=CentroEmergencia.objects.filter(activo=True),
        source="centro",
        write_only=False,
    )

    especialidad_nombre = serializers.CharField(source="especialidad_asignada.nombre", read_only=True)
    medico_nombre       = serializers.CharField(source="medico_asignado.nombre",       read_only=True)

    class Meta:
        model  = SolicitudAtencion
        fields = [
            "id",
            "centro_id",
            "centro_nombre",
            "centro_telefono",
            "centro_direccion",
            "modo",
            "modo_legible",
            "motivo",
            "estado",
            "estado_legible",
            "usuario_id",
            "nombre_invitado",
            "telefono_invitado",
            "especialidad_asignada",
            "especialidad_nombre",
            "medico_asignado",
            "medico_nombre",
            "fecha_derivacion",
            "prioridad",
            "observaciones_triage",
            "lat_usuario",
            "lon_usuario",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = ["id", "estado", "creado_en", "actualizado_en"]

    def to_representation(self, instance):
        """Sobreescribimos para que centro_id muestre el ID en la salida."""
        rep = super().to_representation(instance)
        rep["centro_id"] = instance.centro_id
        rep["especialidad_id"] = instance.especialidad_asignada_id
        rep["medico_id"] = instance.medico_asignado_id
        return rep


class SolicitudEstadoSerializer(serializers.Serializer):
    """
    Serializer mínimo para PATCH: solo acepta el campo `estado`.
    La validación de la transición la hace services.actualizar_estado.
    """

    estado = serializers.ChoiceField(choices=SolicitudAtencion.Estado.choices)


class DerivarSolicitudSerializer(serializers.Serializer):
    """
    Serializer para POST /api/v1/atencion/solicitudes/{id}/derivar/
    """

    especialidad_id = serializers.IntegerField()
    medico_id = serializers.IntegerField()
    prioridad = serializers.CharField(required=False, default="alta")
    observaciones = serializers.CharField(required=False, allow_blank=True, default="")


class CompletarAtencionSerializer(serializers.Serializer):
    """
    Serializer para POST /api/v1/atencion/solicitudes/{id}/completar/
    """

    diagnostico = serializers.CharField(
        required=True,
        allow_blank=False,
        min_length=3,
        error_messages={
            "required": "El diagnóstico médico es obligatorio.",
            "blank": "El diagnóstico médico no puede estar vacío.",
        },
    )
    indicaciones = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

