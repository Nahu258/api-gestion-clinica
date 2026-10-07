from django.db import models

class Medico(models.Model):
    class Especialidad(models.TextChoices):
        CLINICA_MEDICA = "clinica_medica", "Clinica medica"
        PEDIATRIA = "pediatria", "Pediatria"
        CARDIOLOGIA = "cardiologia", "Cardiologia"
        TRAUMATOLOGIA = "traumatologia", "Traumatologia"
        GINECOLOGIA = "ginecologia", "Ginecologia"
        OTRA = "otra", "Otra"

    nombre = models.CharField(max_length=120, verbose_name="Nombre y apellido del medico")
    matricula = models.CharField(
        max_length=50, blank=True, default="", verbose_name="Matrícula médica"
    )
    especialidad = models.CharField(
        max_length=20,
        choices=Especialidad.choices,
        default=Especialidad.CLINICA_MEDICA,
    )

    class Meta:
        db_table = "medicos"
        verbose_name = "Medico"
        verbose_name_plural = "Medicos"

    def __str__(self):
        return f"{self.nombre} ({self.get_especialidad_display()})"


class Paciente(models.Model):
    nombre = models.CharField(max_length=120, verbose_name="Nombre y apellido del paciente")
    dni = models.CharField(max_length=10, unique=True, verbose_name="DNI del paciente")
    telefono = models.CharField(max_length=30, verbose_name="Telefono de contacto")
    obra_social = models.CharField(max_length=80, blank=True, default="", verbose_name="Obra social o prepaga")

    class Meta:
        db_table = "pacientes"
        verbose_name = "Paciente"
        verbose_name_plural = "Pacientes"

    def __str__(self):
        return f"{self.nombre} - DNI {self.dni}"


class DisponibilidadMedico(models.Model):
    """
    Horario de guardia programada del médico en un centro de emergencia.
    """

    class DiaSemana(models.IntegerChoices):
        LUNES = 0, "Lunes"
        MARTES = 1, "Martes"
        MIERCOLES = 2, "Miércoles"
        JUEVES = 3, "Jueves"
        VIERNES = 4, "Viernes"
        SABADO = 5, "Sábado"
        DOMINGO = 6, "Domingo"

    medico = models.ForeignKey(
        Medico,
        on_delete=models.CASCADE,
        related_name="guardias",
        verbose_name="Médico",
    )
    centro = models.ForeignKey(
        "centros.CentroEmergencia",
        on_delete=models.CASCADE,
        related_name="guardias_programadas",
        verbose_name="Centro de emergencia",
    )
    dia_semana = models.SmallIntegerField(
        choices=DiaSemana.choices,
        verbose_name="Día de la semana (0=Lunes, 6=Domingo)",
        help_text="0=Lunes, 1=Martes, ..., 6=Domingo",
    )
    hora_inicio = models.TimeField(verbose_name="Hora de inicio de guardia")
    hora_fin = models.TimeField(verbose_name="Hora de fin de guardia")
    en_guardia_activa = models.BooleanField(
        default=True,
        verbose_name="En guardia activa programada",
    )

    class Meta:
        db_table = "disponibilidad_medicos"
        verbose_name = "Disponibilidad / Guardia de médico"
        verbose_name_plural = "Disponibilidades / Guardias de médicos"
        ordering = ["dia_semana", "hora_inicio"]

    def __str__(self):
        dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        dia_txt = dias[self.dia_semana] if 0 <= self.dia_semana < 7 else str(self.dia_semana)
        return f"{self.medico.nombre} en {self.centro.nombre} ({dia_txt} {self.hora_inicio}-{self.hora_fin})"

