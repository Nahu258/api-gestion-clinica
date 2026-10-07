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
