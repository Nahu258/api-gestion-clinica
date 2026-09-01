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
        "paciente_nombre",
        "paciente_dni",
        "profesional",
        "especialidad",
        "estado",
    )
    list_filter = ("estado", "especialidad", "profesional")
    search_fields = ("paciente_nombre", "paciente_dni", "profesional")
    ordering = ("fecha_hora",)
    date_hierarchy = "fecha_hora"

    # Agrupa los campos del formulario en secciones legibles.
    fieldsets = (
        (
            "Paciente",
            {
                "fields": (
                    "paciente_nombre",
                    "paciente_dni",
                    "paciente_telefono",
                    "obra_social",
                )
            },
        ),
        (
            "Turno",
            {
                "fields": (
                    "profesional",
                    "especialidad",
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
