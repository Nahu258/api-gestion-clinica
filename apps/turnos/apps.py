from django.apps import AppConfig


class TurnosConfig(AppConfig):
    """Registro de la app 'turnos' dentro del proyecto."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.turnos"
    verbose_name = "Gestion de turnos"
