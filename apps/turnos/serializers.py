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

from apps.clinica import services as clinica
from apps.turnos.models import Turno
from core.exceptions import RecursoNoEncontrado


class TurnoListSerializer(serializers.ListSerializer):
    """
    Al serializar un listado, trae todos los pacientes y medicos en 2
    consultas al modulo Clinica en vez de 3 consultas por turno (N+1).
    """

    def to_representation(self, data):
        turnos = list(data.all() if hasattr(data, "all") else data)
        self.child.precargar_referencias(turnos)
        return super().to_representation(turnos)


class TurnoSerializer(serializers.ModelSerializer):
    """Serializer de lectura y escritura de la entidad Turno."""

    # Campos calculados de solo lectura: se completan pidiendo los datos al
    # modulo Clinica (Turnos solo guarda los IDs).
    paciente_nombre = serializers.SerializerMethodField()
    medico_nombre = serializers.SerializerMethodField()
    especialidad_legible = serializers.SerializerMethodField()
    estado_legible = serializers.CharField(
        source="get_estado_display",
        read_only=True,
    )

    class Meta:
        model = Turno
        list_serializer_class = TurnoListSerializer
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
        extra_kwargs = {
            # version es opcional: si el cliente la envia, se usa para el
            # control de concurrencia optimista (409 si quedo desactualizada).
            "version": {"required": False, "min_value": 0},
        }

    # ----- Datos de Clinica (con memoria para no repetir consultas) -----

    def precargar_referencias(self, turnos) -> None:
        self._pacientes = clinica.obtener_pacientes_por_ids(t.paciente_id for t in turnos)
        self._medicos = clinica.obtener_medicos_por_ids(t.medico_id for t in turnos)

    def _paciente(self, paciente_id):
        pacientes = self.__dict__.setdefault("_pacientes", {})
        if paciente_id not in pacientes:
            pacientes.update(clinica.obtener_pacientes_por_ids([paciente_id]))
        return pacientes.get(paciente_id)

    def _medico(self, medico_id):
        medicos = self.__dict__.setdefault("_medicos", {})
        if medico_id not in medicos:
            medicos.update(clinica.obtener_medicos_por_ids([medico_id]))
        return medicos.get(medico_id)

    def get_paciente_nombre(self, obj) -> str:
        paciente = self._paciente(obj.paciente_id)
        return paciente.nombre if paciente else "Desconocido"

    def get_medico_nombre(self, obj) -> str:
        medico = self._medico(obj.medico_id)
        return medico.nombre if medico else "Desconocido"

    def get_especialidad_legible(self, obj) -> str:
        medico = self._medico(obj.medico_id)
        return medico.get_especialidad_display() if medico else "Desconocida"

    # ----- Validaciones de campo: se llaman validate_<nombre_del_campo> -----

    def validate_paciente_id(self, valor: int) -> int:
        try:
            clinica.obtener_paciente(valor)
        except RecursoNoEncontrado:
            raise serializers.ValidationError(f"No existe un paciente con id {valor}.")
        return valor

    def validate_medico_id(self, valor: int) -> int:
        try:
            clinica.obtener_medico(valor)
        except RecursoNoEncontrado:
            raise serializers.ValidationError(f"No existe un medico con id {valor}.")
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

        # Regla 1: si el medico es de especialidad 'otra', hay que describir el motivo.
        medico_id = actual("medico_id", None)
        medico = self._medico(medico_id) if medico_id else None
        if medico and clinica.medico_requiere_motivo(medico) and not (
            actual("motivo_consulta") or ""
        ).strip():
            raise serializers.ValidationError(
                {
                    "motivo_consulta": (
                        "Si la especialidad del medico es 'otra', el motivo de consulta es "
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
