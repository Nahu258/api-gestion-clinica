from django.contrib import admin
from .models import Paciente, Medico

@admin.register(Paciente)
class PacienteAdmin(admin.ModelAdmin):
    list_display = ("nombre", "dni", "telefono", "obra_social")
    search_fields = ("nombre", "dni")

@admin.register(Medico)
class MedicoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "especialidad")
    list_filter = ("especialidad",)
    search_fields = ("nombre",)
