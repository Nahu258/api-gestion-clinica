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

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        CONFIRMADO = "confirmado", "Confirmado"
        EN_ATENCION = "en_atencion", "En atencion"
        ATENDIDO = "atendido", "Atendido"
        CANCELADO = "cancelado", "Cancelado"
        AUSENTE = "ausente", "Paciente ausente"

    # ----- Datos del paciente -----
    paciente = models.ForeignKey(
        'clinica.Paciente',
        on_delete=models.CASCADE,
        related_name='turnos',
        verbose_name="Paciente"
    )

    # ----- Datos de la atencion -----
    medico = models.ForeignKey(
        'clinica.Medico',
        on_delete=models.CASCADE,
        related_name='turnos',
        verbose_name="Medico que atiende"
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
    
    # ----- Control de Concurrencia (Optimistic Locking) -----
    version = models.IntegerField(default=0)

    class Meta:
        db_table = "turnos"
        ordering = ["fecha_hora"]          # orden por defecto en los listados
        verbose_name = "Turno"
        verbose_name_plural = "Turnos"
        indexes = [
            models.Index(fields=["fecha_hora"]),
            models.Index(fields=["estado"]),
            models.Index(fields=["paciente_id"]),
        ]

    def __str__(self) -> str:
        # Lo que se ve en el admin y al imprimir el objeto.
        return (
            f"{self.fecha_hora:%d/%m/%Y %H:%M} - {self.paciente.nombre} "
            f"(DNI {self.paciente.dni})"
        )

    @property
    def ocupa_agenda(self) -> bool:
        """Un turno cancelado ya no ocupa lugar en la agenda del profesional."""
        return self.estado != self.Estado.CANCELADO

    @property
    def tiene_registro_clinico(self) -> bool:
        """Indica si ya se cargo el diagnostico de la consulta."""
        return bool(self.diagnostico.strip())
