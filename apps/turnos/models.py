"""
CAPA DE DATOS (Modelo) - Define COMO se guarda la informacion.

Un modelo de Django es una clase de Python que representa una tabla de la
base de datos. Cada atributo de clase es una columna. Django genera el SQL
por nosotros a traves de las 'migraciones'.

Dominio: gestion de turnos e historial clinico de un centro medico.
Entidad principal del AE1: Turno.
"""

from django.db import models


class Turno(models.Model):
    """Un turno reservado por un paciente con un profesional de la clinica."""

    # ----- Catalogos (choices): valores cerrados y validados por Django -----
    class Especialidad(models.TextChoices):
        CLINICA_MEDICA = "clinica_medica", "Clinica medica"
        PEDIATRIA = "pediatria", "Pediatria"
        CARDIOLOGIA = "cardiologia", "Cardiologia"
        TRAUMATOLOGIA = "traumatologia", "Traumatologia"
        GINECOLOGIA = "ginecologia", "Ginecologia"
        OTRA = "otra", "Otra"

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        CONFIRMADO = "confirmado", "Confirmado"
        EN_ATENCION = "en_atencion", "En atencion"
        ATENDIDO = "atendido", "Atendido"
        CANCELADO = "cancelado", "Cancelado"
        AUSENTE = "ausente", "Paciente ausente"

    # ----- Datos del paciente -----
    paciente_nombre = models.CharField(
        max_length=120,
        verbose_name="Nombre y apellido del paciente",
    )
    paciente_dni = models.CharField(
        max_length=10,
        verbose_name="DNI del paciente",
    )
    paciente_telefono = models.CharField(
        max_length=30,
        verbose_name="Telefono de contacto",
    )
    obra_social = models.CharField(
        max_length=80,
        blank=True,
        default="",
        verbose_name="Obra social o prepaga",
    )

    # ----- Datos de la atencion -----
    profesional = models.CharField(
        max_length=120,
        verbose_name="Profesional que atiende",
    )
    especialidad = models.CharField(
        max_length=20,
        choices=Especialidad.choices,
        default=Especialidad.CLINICA_MEDICA,
    )
    fecha_hora = models.DateTimeField(
        verbose_name="Fecha y hora del turno",
    )
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.PENDIENTE,
    )
    motivo_consulta = models.TextField(
        blank=True,
        default="",
        verbose_name="Motivo de la consulta",
    )

    # ----- Historial clinico: se completa despues de la atencion -----
    diagnostico = models.TextField(
        blank=True,
        default="",
        verbose_name="Diagnostico registrado",
    )
    indicaciones = models.TextField(
        blank=True,
        default="",
        verbose_name="Indicaciones y tratamiento",
    )

    # ----- Auditoria: los completa Django solo -----
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "turnos"
        ordering = ["fecha_hora"]          # orden por defecto en los listados
        verbose_name = "Turno"
        verbose_name_plural = "Turnos"
        indexes = [
            models.Index(fields=["fecha_hora"]),
            models.Index(fields=["estado"]),
            models.Index(fields=["paciente_dni"]),
        ]

    def __str__(self) -> str:
        # Lo que se ve en el admin y al imprimir el objeto.
        return (
            f"{self.fecha_hora:%d/%m/%Y %H:%M} - {self.paciente_nombre} "
            f"(DNI {self.paciente_dni})"
        )

    @property
    def ocupa_agenda(self) -> bool:
        """Un turno cancelado ya no ocupa lugar en la agenda del profesional."""
        return self.estado != self.Estado.CANCELADO

    @property
    def tiene_registro_clinico(self) -> bool:
        """Indica si ya se cargo el diagnostico de la consulta."""
        return bool(self.diagnostico.strip())
