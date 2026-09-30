"""
CAPA DE VALIDACION (Serializers) - Traduce JSON <-> objetos Python.

Un serializer hace dos cosas:
  1. Serializar:   Turno (objeto) -> dict listo para devolver como JSON.
  2. Deserializar: JSON entrante  -> valida campos -> datos limpios.

Si la validacion falla, DRF levanta ValidationError y core/exceptions.py la
convierte en un 400 Bad Request con el detalle de cada campo.
"""

from django.utils import timezone
from rest_framework import serializers

from apps.turnos.models import Turno


class TurnoSerializer(serializers.ModelSerializer):
    """Serializer de lectura y escritura de la entidad Turno."""

    # Campos calculados de solo lectura: etiquetas legibles para el front.
    especialidad_legible = serializers.SerializerMethodField()
    estado_legible = serializers.CharField(
        source="get_estado_display",
        read_only=True,
    )
    paciente_nombre = serializers.SerializerMethodField()
    medico_nombre = serializers.SerializerMethodField()


    class Meta:
        model = Turno
        fields = [
            "id",
            "paciente_id",
            "medico_id",
            "paciente_nombre",
            "medico_nombre",
            "especialidad_legible",
            "fecha_hora",
            "estado",
            "estado_legible",
            "motivo_consulta",
            "diagnostico",
            "indicaciones",
            "creado_en",
            "actualizado_en",
            "version",
        ]
        read_only_fields = ["id", "creado_en", "actualizado_en"]
    # ----- Validaciones de campo: se llaman validate_<nombre_del_campo> -----

    def get_especialidad_legible(self, obj) -> str:
        from apps.clinica.services import obtener_medico
        try:
            medico = obtener_medico(obj.medico_id)
            return medico.get_especialidad_display()
        except Exception:
            return "Desconocida"

    def get_paciente_nombre(self, obj) -> str:
        from apps.clinica.services import obtener_paciente
        try:
            paciente = obtener_paciente(obj.paciente_id)
            return paciente.nombre
        except Exception:
            return "Desconocido"

    def get_medico_nombre(self, obj) -> str:
        from apps.clinica.services import obtener_medico
        try:
            medico = obtener_medico(obj.medico_id)
            return medico.nombre
        except Exception:
            return "Desconocido"

    def validate_fecha_hora(self, valor):
        # En una creacion (self.instance is None) exigimos fecha futura.
        # Al editar un turno viejo no forzamos la regla.
        if self.instance is None and valor <= timezone.now():
            raise serializers.ValidationError(
                "La fecha y hora del turno debe ser posterior al momento actual."
            )
        return valor

    # ----- Validacion a nivel del objeto completo (varios campos juntos) -----

    def validate(self, datos: dict) -> dict:
        def actual(campo, por_defecto=""):
            """Valor enviado o, si no vino, el que ya tiene el turno."""
            return datos.get(campo, getattr(self.instance, campo, por_defecto))

        # Regla 1: ya no aplica la especialidad "otra" porque viene del medico.


        # Regla 2: no se puede marcar un turno como atendido sin diagnostico.
        if actual("estado") == Turno.Estado.ATENDIDO and not (
            actual("diagnostico") or ""
        ).strip():
            raise serializers.ValidationError(
                {
                    "diagnostico": (
                        "Para marcar el turno como 'atendido' hay que registrar "
                        "el diagnostico en el historial clinico."
                    )
                }
            )

        return datos
