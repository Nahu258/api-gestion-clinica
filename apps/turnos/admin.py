"""Panel de administracion de Django para la entidad Turno.

Sirve para cargar y revisar datos sin escribir SQL: http://127.0.0.1:8000/admin
"""

from django.contrib import admin

from apps.turnos.models import Turno


@admin.register(Turno)
class TurnoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "fecha_hora",
        "get_paciente",
        "get_medico",
        "estado",
    )
    list_filter = ("estado", "medico_id")
    search_fields = ("paciente_id", "medico_id")

    def get_paciente(self, obj):
        from apps.clinica.services import obtener_paciente
        try:
            p = obtener_paciente(obj.paciente_id)
            return f"{p.nombre} ({p.dni})"
        except: return str(obj.paciente_id)
    get_paciente.short_description = 'Paciente'

    def get_medico(self, obj):
        from apps.clinica.services import obtener_medico
        try:
            return obtener_medico(obj.medico_id).nombre
        except: return str(obj.medico_id)
    get_medico.short_description = 'Medico'
    ordering = ("fecha_hora",)
    date_hierarchy = "fecha_hora"

    # Agrupa los campos del formulario en secciones legibles.
    fieldsets = (
        (
            "Paciente",
            {
                "fields": (
                    "paciente_id",
                )
            },
        ),
        (
            "Turno",
            {
                "fields": (
                    "medico_id",
                    "fecha_hora",
                    "estado",
                    "motivo_consulta",
                )
            },
        ),
        (
            "Historial clinico",
            {
                "fields": ("diagnostico", "indicaciones"),
                "description": "Se completa una vez atendida la consulta.",
            },
        ),
    )
