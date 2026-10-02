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

    class Meta:
        db_table = "centros_emergencia"
        verbose_name = "Centro de emergencia"
        verbose_name_plural = "Centros de emergencia"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.get_tipo_display()}) - {self.ciudad}"
