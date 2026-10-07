from django.contrib import admin

from apps.auth_usuarios.models import PerfilExtendido


@admin.register(PerfilExtendido)
class PerfilExtendidoAdmin(admin.ModelAdmin):
    list_display = ("usuario", "rol", "centro", "medico", "creado_en")
    list_filter = ("rol", "centro")
    search_fields = ("usuario__email", "usuario__username", "medico__nombre", "centro__nombre")
    readonly_fields = ("creado_en", "actualizado_en")

