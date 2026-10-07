"""
Admin del módulo Centros de Emergencia.

Registra CentroEmergencia en el panel /admin con listado
filtrando por nombre, tipo y ciudad, tal como pide la issue #8.
"""

from django.contrib import admin

from .models import AsignacionMedico, CentroEmergencia, CentroEspecialidad, Especialidad


@admin.register(CentroEmergencia)
class CentroEmergenciaAdmin(admin.ModelAdmin):
    list_display  = ("nombre", "tipo", "ciudad", "telefono", "atiende_24h", "activo")
    list_filter   = ("tipo", "ciudad", "atiende_24h", "activo")
    search_fields = ("nombre", "ciudad", "direccion")
    ordering      = ("nombre",)
    readonly_fields = ("creado_en",)

    fieldsets = (
        ("Identificación", {
            "fields": ("nombre", "tipo", "activo"),
        }),
        ("Ubicación", {
            "fields": ("direccion", "ciudad", "provincia", "pais", "latitud", "longitud"),
        }),
        ("Contacto y disponibilidad", {
            "fields": ("telefono", "atiende_24h"),
        }),
        ("Auditoría", {
            "fields": ("creado_en",),
            "classes": ("collapse",),
        }),
    )


@admin.register(Especialidad)
class EspecialidadAdmin(admin.ModelAdmin):
    list_display = ("nombre", "codigo", "icono")
    search_fields = ("nombre", "codigo")
    prepopulated_fields = {"codigo": ("nombre",)}


@admin.register(CentroEspecialidad)
class CentroEspecialidadAdmin(admin.ModelAdmin):
    list_display = ("centro", "especialidad", "activo", "creado_en")
    list_filter = ("centro", "especialidad", "activo")
    search_fields = ("centro__nombre", "especialidad__nombre")


@admin.register(AsignacionMedico)
class AsignacionMedicoAdmin(admin.ModelAdmin):
    list_display = ("medico", "centro", "especialidad", "activo", "creado_en")
    list_filter = ("centro", "especialidad", "activo")
    search_fields = ("medico__nombre", "centro__nombre", "especialidad__nombre")

