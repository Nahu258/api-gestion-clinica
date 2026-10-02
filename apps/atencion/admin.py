"""
Admin del módulo Atención de Emergencias.
"""

from django.contrib import admin

from .models import SolicitudAtencion


@admin.register(SolicitudAtencion)
class SolicitudAtencionAdmin(admin.ModelAdmin):
    list_display  = ("id", "centro", "modo", "estado", "es_invitado", "creado_en")
    list_filter   = ("estado", "modo", "centro__tipo")
    search_fields = ("nombre_invitado", "centro__nombre", "motivo")
    ordering      = ("-creado_en",)
    readonly_fields = ("creado_en", "actualizado_en")

    fieldsets = (
        ("Solicitante", {
            "fields": ("usuario_id", "nombre_invitado", "telefono_invitado"),
        }),
        ("Solicitud", {
            "fields": ("centro", "modo", "motivo", "estado"),
        }),
        ("Ubicación del usuario", {
            "fields": ("lat_usuario", "lon_usuario"),
            "classes": ("collapse",),
        }),
        ("Auditoría", {
            "fields": ("creado_en", "actualizado_en"),
            "classes": ("collapse",),
        }),
    )
