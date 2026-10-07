"""
Modelos de la app auth_usuarios — Épica 2, issue #13.

PerfilExtendido: tabla 1-a-1 con el User de Django para guardar
foto_url y cualquier dato extra que no entre en el modelo estándar.
"""

from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class PerfilExtendido(models.Model):
    """
    Perfil extendido del usuario registrado.

    Relacionado 1-a-1 con User de Django. Se crea automáticamente
    la primera vez que el usuario se loguea con Google.
    """

    class Rol(models.TextChoices):
        ADMIN = "ADMIN", "Administrador"
        OPERADOR_CENTRO = "OPERADOR_CENTRO", "Operador de Centro"
        MEDICO = "MEDICO", "Médico Especialista"
        PACIENTE = "PACIENTE", "Paciente"

    usuario = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="perfil",
        verbose_name="Usuario",
    )
    rol = models.CharField(
        max_length=20,
        choices=Rol.choices,
        default=Rol.PACIENTE,
        verbose_name="Rol en la plataforma",
        help_text="Rol de acceso para control de permisos (RBAC).",
    )
    centro = models.ForeignKey(
        "centros.CentroEmergencia",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="perfiles",
        verbose_name="Centro asignado",
        help_text="Centro de emergencia al que está asignado el operador o médico.",
    )
    medico = models.ForeignKey(
        "clinica.Medico",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="perfiles",
        verbose_name="Médico asignado",
        help_text="Ficha del médico si el rol es MEDICO.",
    )
    foto_url = models.URLField(
        blank=True,
        default="",
        verbose_name="URL de foto de perfil",
        help_text="Provista por Google al autenticarse.",
    )
    creado_en = models.DateTimeField(auto_now_add=True, verbose_name="Creado en")
    actualizado_en = models.DateTimeField(auto_now=True, verbose_name="Actualizado en")

    class Meta:
        db_table = "perfiles_extendidos"
        verbose_name = "Perfil extendido"
        verbose_name_plural = "Perfiles extendidos"

    def __str__(self) -> str:
        return f"Perfil de {self.usuario.email} [{self.rol}]"

