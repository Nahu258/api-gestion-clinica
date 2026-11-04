"""
Serializers del módulo Clínica — Épica 5, issue AE5-04 (#34).
"""

from rest_framework import serializers

from apps.clinica.models import DisponibilidadMedico


class GuardiaSerializer(serializers.Serializer):
    """
    Payload de alta/edición de una guardia programada.

    Horas en formato "HH:MM" (o "HH:MM:SS"); dia_semana 0=Lunes ... 6=Domingo.
    """

    medico_id = serializers.IntegerField()
    dia_semana = serializers.ChoiceField(choices=DisponibilidadMedico.DiaSemana.choices)
    hora_inicio = serializers.TimeField()
    hora_fin = serializers.TimeField()
    en_guardia_activa = serializers.BooleanField(required=False, default=True)
