from django.contrib import admin

from apps.auth_usuarios.models import PerfilExtendido


@admin.register(PerfilExtendido)
class PerfilExtendidoAdmin(admin.ModelAdmin):
    list_display = ("usuario", "foto_url", "creado_en")
    search_fields = ("usuario__email", "usuario__username")
    readonly_fields = ("creado_en", "actualizado_en")
