from django.contrib import admin
from .models import Paciente, Medico, DisponibilidadMedico

@admin.register(Paciente)
class PacienteAdmin(admin.ModelAdmin):
    list_display = ("nombre", "dni", "telefono", "obra_social")
    search_fields = ("nombre", "dni")

@admin.register(Medico)
class MedicoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "matricula", "especialidad")
    list_filter = ("especialidad",)
    search_fields = ("nombre", "matricula")

@admin.register(DisponibilidadMedico)
class DisponibilidadMedicoAdmin(admin.ModelAdmin):
    list_display = ("medico", "centro", "dia_semana", "hora_inicio", "hora_fin", "en_guardia_activa")
    list_filter = ("centro", "dia_semana", "en_guardia_activa")
    search_fields = ("medico__nombre", "centro__nombre")

