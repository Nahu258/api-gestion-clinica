"""
Migración inicial de la app auth_usuarios.

Crea la tabla perfiles_extendidos para almacenar foto_url
y otros datos extras del usuario registrado via Google OAuth2.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PerfilExtendido",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "foto_url",
                    models.URLField(
                        blank=True,
                        default="",
                        help_text="Provista por Google al autenticarse.",
                        verbose_name="URL de foto de perfil",
                    ),
                ),
                (
                    "creado_en",
                    models.DateTimeField(auto_now_add=True, verbose_name="Creado en"),
                ),
                (
                    "actualizado_en",
                    models.DateTimeField(auto_now=True, verbose_name="Actualizado en"),
                ),
                (
                    "usuario",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="perfil",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Usuario",
                    ),
                ),
            ],
            options={
                "verbose_name": "Perfil extendido",
                "verbose_name_plural": "Perfiles extendidos",
                "db_table": "perfiles_extendidos",
            },
        ),
    ]
