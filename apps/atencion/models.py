"""
Modelos del dominio de Atención de Emergencias.

SolicitudAtencion reemplaza a Turno en el flujo urgente: el usuario
avisa que va en camino o pide ser atendido sin un horario fijo.
Soporta tanto usuarios registrados (usuario_id) como invitados
(nombre_invitado + telefono_invitado, usuario_id=None).
"""

from django.db import models

from apps.centros.models import CentroEmergencia


class SolicitudAtencion(models.Model):
    """
    Solicitud de atención urgente en un centro de emergencia.

    Campos de identidad del solicitante:
      - usuario_id: ID del usuario registrado (None si es invitado).
      - nombre_invitado / telefono_invitado: datos del invitado (opcionales).

    Campos de ubicación:
      - lat_usuario / lon_usuario: coordenadas del usuario al momento de
        crear la solicitud (permiten calcular la distancia real al centro).
    """

    class Modo(models.TextChoices):
        AVISO     = "aviso",     "Voy en camino"
        SOLICITUD = "solicitud", "Solicitar turno urgente"

    class Estado(models.TextChoices):
        PENDIENTE  = "pendiente",  "Pendiente"
        ACEPTADO   = "aceptado",   "Aceptado por el centro"
        EN_CAMINO  = "en_camino",  "Paciente en camino"
        DERIVADO   = "derivado",   "Derivado a especialista"
        EN_ATENCION = "en_atencion", "En atención médica"
        ATENDIDO   = "atendido",   "Atendido"
        CANCELADO  = "cancelado",  "Cancelado"

    # ── Quién solicita ──────────────────────────────────────────────────────
    # null = invitado (sin cuenta)
    usuario_id       = models.IntegerField(
        null=True, blank=True,
        verbose_name="ID de usuario registrado",
    )
    nombre_invitado  = models.CharField(
        max_length=120, blank=True, default="",
        verbose_name="Nombre del invitado",
    )
    telefono_invitado = models.CharField(
        max_length=30, blank=True, default="",
        verbose_name="Teléfono del invitado",
    )

    # ── Dónde ───────────────────────────────────────────────────────────────
    centro = models.ForeignKey(
        CentroEmergencia,
        on_delete=models.PROTECT,
        related_name="solicitudes",
        verbose_name="Centro de emergencia",
    )

    # ── Cómo y por qué ──────────────────────────────────────────────────────
    modo   = models.CharField(
        max_length=10,
        choices=Modo.choices,
        default=Modo.SOLICITUD,
        verbose_name="Modo de solicitud",
    )
    motivo = models.TextField(
        blank=True, default="",
        verbose_name="Motivo breve",
    )
    estado = models.CharField(
        max_length=15,
        choices=Estado.choices,
        default=Estado.PENDIENTE,
        verbose_name="Estado",
    )

    # ── Derivación y Triage (Épica 4) ───────────────────────────────────────
    especialidad_asignada = models.ForeignKey(
        "centros.Especialidad",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="solicitudes_derivadas",
        verbose_name="Especialidad asignada",
    )
    medico_asignado = models.ForeignKey(
        "clinica.Medico",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="solicitudes_derivadas",
        verbose_name="Médico asignado",
    )
    derivado_por = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="solicitudes_derivadas_operador",
        verbose_name="Operador que derivó",
    )
    fecha_derivacion = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Fecha de derivación",
    )
    prioridad = models.CharField(
        max_length=20,
        default="media",
        verbose_name="Prioridad de triage",
    )
    observaciones_triage = models.TextField(
        blank=True,
        default="",
        verbose_name="Observaciones de triage",
    )

    # ── Ficha Médica y Cierre (Épica 4) ─────────────────────────────────────
    diagnostico = models.TextField(
        blank=True,
        default="",
        verbose_name="Diagnóstico médico",
    )
    indicaciones = models.TextField(
        blank=True,
        default="",
        verbose_name="Indicaciones médicas",
    )
    atendido_en = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Fecha y hora de atención",
    )


    # ── Ubicación del usuario ───────────────────────────────────────────────
    lat_usuario = models.DecimalField(
        max_digits=10, decimal_places=7,
        null=True, blank=True,
        verbose_name="Latitud del usuario",
    )
    lon_usuario = models.DecimalField(
        max_digits=10, decimal_places=7,
        null=True, blank=True,
        verbose_name="Longitud del usuario",
    )

    # ── Auditoría ───────────────────────────────────────────────────────────
    creado_en      = models.DateTimeField(auto_now_add=True, verbose_name="Creado en")
    actualizado_en = models.DateTimeField(auto_now=True,     verbose_name="Actualizado en")

    class Meta:
        db_table = "solicitudes_atencion"
        verbose_name = "Solicitud de atención"
        verbose_name_plural = "Solicitudes de atención"
        ordering = ["-creado_en"]

    def __str__(self) -> str:
        solicitante = (
            f"usuario {self.usuario_id}" if self.usuario_id
            else (self.nombre_invitado or "invitado")
        )
        return f"Solicitud #{self.pk} — {solicitante} → {self.centro.nombre} [{self.get_estado_display()}]"

    @property
    def es_invitado(self) -> bool:
        """True si la solicitud fue creada por un usuario sin cuenta."""
        return self.usuario_id is None
