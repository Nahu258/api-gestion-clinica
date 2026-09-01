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
    especialidad_legible = serializers.CharField(
        source="get_especialidad_display",
        read_only=True,
    )
    estado_legible = serializers.CharField(
        source="get_estado_display",
        read_only=True,
    )

    class Meta:
        model = Turno
        fields = [
            "id",
            "paciente_nombre",
            "paciente_dni",
            "paciente_telefono",
            "obra_social",
            "profesional",
            "especialidad",
            "especialidad_legible",
            "fecha_hora",
            "estado",
            "estado_legible",
            "motivo_consulta",
            "diagnostico",
            "indicaciones",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = ["id", "creado_en", "actualizado_en"]
        extra_kwargs = {
            # allow_blank=False => mandar "" tambien es un 400.
            "paciente_nombre": {"allow_blank": False},
            "paciente_dni": {"allow_blank": False},
            "paciente_telefono": {"allow_blank": False},
            "profesional": {"allow_blank": False},
        }

    # ----- Validaciones de campo: se llaman validate_<nombre_del_campo> -----

    def validate_paciente_nombre(self, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 3:
            raise serializers.ValidationError(
                "El nombre del paciente debe tener al menos 3 caracteres."
            )
        return valor

    def validate_paciente_dni(self, valor: str) -> str:
        # Se normaliza: se quitan puntos y espacios (12.345.678 -> 12345678).
        valor = valor.strip().replace(".", "").replace(" ", "")
        if not valor.isdigit():
            raise serializers.ValidationError(
                "El DNI solo puede contener numeros (ej. 40123456)."
            )
        if not (7 <= len(valor) <= 8):
            raise serializers.ValidationError(
                "El DNI debe tener 7 u 8 digitos."
            )
        return valor

    def validate_paciente_telefono(self, valor: str) -> str:
        valor = valor.strip()
        digitos = [c for c in valor if c.isdigit()]
        if len(digitos) < 6:
            raise serializers.ValidationError(
                "El telefono debe contener al menos 6 digitos."
            )
        return valor

    def validate_profesional(self, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 3:
            raise serializers.ValidationError(
                "El nombre del profesional debe tener al menos 3 caracteres."
            )
        return valor

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

        # Regla 1: si la especialidad es 'otra', hay que describir el motivo.
        if actual("especialidad") == Turno.Especialidad.OTRA and not (
            actual("motivo_consulta") or ""
        ).strip():
            raise serializers.ValidationError(
                {
                    "motivo_consulta": (
                        "Si la especialidad es 'otra', el motivo de consulta es "
                        "obligatorio para derivar al profesional correcto."
                    )
                }
            )

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
