"""
CAPA DE DATOS (Modelo) - Define COMO se guarda la informacion.

Un modelo de Django es una clase de Python que representa una tabla de la
base de datos. Cada atributo de clase es una columna. Django genera el SQL
por nosotros a traves de las 'migraciones'.

Dominio: gestion de turnos e historial clinico de un centro medico.
Entidad principal del AE1: Turno.
"""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


class Turno(models.Model):
    """Un turno reservado por un paciente con un profesional de la clinica."""

    def __init__(self, *args, **kwargs):
        # Compatibilidad hacia atras con tests y seeds que pasan datos planos
        paciente_nombre = kwargs.pop("paciente_nombre", None)
        paciente_dni = kwargs.pop("paciente_dni", None)
        paciente_telefono = kwargs.pop("paciente_telefono", "")
        obra_social = kwargs.pop("obra_social", "")
        profesional = kwargs.pop("profesional", None)
        especialidad = kwargs.pop("especialidad", "clinica_medica")

        if paciente_dni and not kwargs.get("paciente_id"):
            from apps.clinica import services as clinica
            paciente = clinica.registrar_paciente(
                dni=paciente_dni,
                nombre=paciente_nombre or "Paciente",
                telefono=paciente_telefono,
                obra_social=obra_social,
            )
            kwargs["paciente_id"] = paciente.id

        if profesional and not kwargs.get("medico_id"):
            from apps.clinica import services as clinica
            medico = clinica.registrar_medico(nombre=profesional, especialidad=especialidad)
            kwargs["medico_id"] = medico.id

        super().__init__(*args, **kwargs)

    # ----- Catalogos (choices): valores cerrados y validados por Django -----

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        CONFIRMADO = "confirmado", "Confirmado"
        EN_ATENCION = "en_atencion", "En atencion"
        ATENDIDO = "atendido", "Atendido"
        CANCELADO = "cancelado", "Cancelado"
        AUSENTE = "ausente", "Paciente ausente"

    # ----- Datos del paciente -----
    paciente_id = models.IntegerField(
        verbose_name="ID del Paciente",
        help_text="Referencia desacoplada al módulo Clínica"
    )

    # ----- Datos de la atencion -----
    medico_id = models.IntegerField(
        verbose_name="ID del Médico",
        help_text="Referencia desacoplada al módulo Clínica"
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
        constraints = [
            # AE2 - Ultima defensa contra la doble reserva: la BASE no permite
            # dos turnos activos del mismo medico a la misma hora, aunque
            # dos pedidos lleguen exactamente juntos. Los cancelados no cuentan.
            models.UniqueConstraint(
                models.F("medico_id"),
                "fecha_hora",
                condition=~Q(estado="cancelado"),
                name="turno_unico_por_medico_y_horario",
            ),
        ]

    def __str__(self) -> str:
        # Lo que se ve en el admin y al imprimir el objeto.
        return (
            f"{self.fecha_hora:%d/%m/%Y %H:%M} - Paciente ID: {self.paciente_id} "
            f"- Medico ID: {self.medico_id}"
        )

    @property
    def ocupa_agenda(self) -> bool:
        """Un turno cancelado ya no ocupa lugar en la agenda del profesional."""
        return self.estado != self.Estado.CANCELADO

    @property
    def tiene_registro_clinico(self) -> bool:
        """Indica si ya se cargo el diagnostico de la consulta."""
        return bool(self.diagnostico.strip())

    @property
    def profesional(self) -> str:
        from apps.clinica import services as clinica
        try:
            return clinica.obtener_medico(self.medico_id).nombre
        except Exception:
            return f"Médico {self.medico_id}"

    @property
    def especialidad(self) -> str:
        from apps.clinica import services as clinica
        try:
            return clinica.obtener_medico(self.medico_id).especialidad
        except Exception:
            return ""

    @property
    def paciente_nombre(self) -> str:
        from apps.clinica import services as clinica
        try:
            return clinica.obtener_paciente(self.paciente_id).nombre
        except Exception:
            return ""

    @property
    def paciente_dni(self) -> str:
        from apps.clinica import services as clinica
        try:
            return clinica.obtener_paciente(self.paciente_id).dni
        except Exception:
            return ""


# Compatibilidad con código y tests de AE1/AE2 que referencian Turno.Especialidad
from apps.clinica.models import Medico
Turno.Especialidad = Medico.Especialidad

