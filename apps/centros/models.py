"""
Modelos del dominio de Centros de Emergencia.

CentroEmergencia representa cualquier servicio de atención urgente:
hospitales, UPAs, SAME, bomberos, comisarías, etc.
Incluye coordenadas geográficas para el cálculo de proximidad.
"""

from django.db import models


class CentroEmergencia(models.Model):
    """
    Punto de atención de emergencias con geolocalización.

    El par (latitud, longitud) permite calcular la distancia desde
    la ubicación del usuario usando la fórmula de Haversine (ver core/geo.py).
    """

    class Tipo(models.TextChoices):
        HOSPITAL  = "hospital",  "Hospital público"
        UPA       = "upa",       "UPA / Sala de primeros auxilios"
        SAME      = "same",      "SAME / Ambulancia"
        BOMBEROS  = "bomberos",  "Bomberos"
        POLICIA   = "policia",   "Policía"
        OTRO      = "otro",      "Otro"

    nombre    = models.CharField(max_length=200, verbose_name="Nombre del centro")
    tipo      = models.CharField(
        max_length=20,
        choices=Tipo.choices,
        default=Tipo.HOSPITAL,
        verbose_name="Tipo de servicio",
    )
    direccion  = models.CharField(max_length=300, verbose_name="Dirección")
    ciudad     = models.CharField(max_length=100, default="Posadas", verbose_name="Ciudad")
    provincia  = models.CharField(max_length=100, default="Misiones", verbose_name="Provincia")
    pais       = models.CharField(max_length=60, default="Argentina", verbose_name="País")

    # Coordenadas geográficas — 7 decimales (~1 cm de precisión)
    latitud    = models.DecimalField(
        max_digits=10, decimal_places=7, verbose_name="Latitud"
    )
    longitud   = models.DecimalField(
        max_digits=10, decimal_places=7, verbose_name="Longitud"
    )

    telefono   = models.CharField(
        max_length=30, blank=True, default="", verbose_name="Teléfono"
    )
    atiende_24h = models.BooleanField(default=True, verbose_name="Atiende 24 horas")
    activo      = models.BooleanField(default=True, verbose_name="Activo")

    creado_en   = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de alta")

    especialidades = models.ManyToManyField(
        "Especialidad",
        through="CentroEspecialidad",
        related_name="centros",
        blank=True,
    )

    class Meta:
        db_table = "centros_emergencia"
        verbose_name = "Centro de emergencia"
        verbose_name_plural = "Centros de emergencia"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.get_tipo_display()}) - {self.ciudad}"


class Especialidad(models.Model):
    """
    Especialidad médica (ej. Pediatría, Traumatología, Cardiología, Clínica Médica).
    """

    nombre = models.CharField(max_length=100, unique=True, verbose_name="Nombre")
    codigo = models.SlugField(max_length=50, unique=True, verbose_name="Código slug")
    descripcion = models.TextField(blank=True, default="", verbose_name="Descripción")
    icono = models.CharField(max_length=50, blank=True, default="", verbose_name="Ícono")

    class Meta:
        db_table = "especialidades"
        verbose_name = "Especialidad"
        verbose_name_plural = "Especialidades"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class CentroEspecialidad(models.Model):
    """
    Relación de un Centro de Emergencia con las Especialidades que ofrece.
    """

    centro = models.ForeignKey(
        CentroEmergencia,
        on_delete=models.CASCADE,
        related_name="centro_especialidades",
        verbose_name="Centro",
    )
    especialidad = models.ForeignKey(
        Especialidad,
        on_delete=models.CASCADE,
        related_name="centros_adheridos",
        verbose_name="Especialidad",
    )
    activo = models.BooleanField(default=True, verbose_name="Activo en este centro")
    creado_en = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de alta")

    class Meta:
        db_table = "centro_especialidades"
        verbose_name = "Especialidad de centro"
        verbose_name_plural = "Especialidades de centros"
        unique_together = ("centro", "especialidad")

    def __str__(self) -> str:
        return f"{self.centro.nombre} — {self.especialidad.nombre}"


class AsignacionMedico(models.Model):
    """
    Asigna un médico a un centro de emergencia y una especialidad específica.
    """

    medico = models.ForeignKey(
        "clinica.Medico",
        on_delete=models.CASCADE,
        related_name="asignaciones_centro",
        verbose_name="Médico",
    )
    centro = models.ForeignKey(
        CentroEmergencia,
        on_delete=models.CASCADE,
        related_name="medicos_asignados",
        verbose_name="Centro",
    )
    especialidad = models.ForeignKey(
        Especialidad,
        on_delete=models.CASCADE,
        related_name="medicos_asignados",
        verbose_name="Especialidad",
    )
    activo = models.BooleanField(default=True, verbose_name="Activo")
    creado_en = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de asignación")

    class Meta:
        db_table = "asignaciones_medicos"
        verbose_name = "Asignación de médico a centro"
        verbose_name_plural = "Asignaciones de médicos a centros"
        unique_together = ("medico", "centro", "especialidad")

    def __str__(self) -> str:
        return f"{self.medico.nombre} en {self.centro.nombre} ({self.especialidad.nombre})"

