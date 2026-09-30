"""
Comando propio: carga pacientes, medicos y turnos de ejemplo para poder
demostrar la API. Pacientes y medicos se registran a traves de los servicios
del modulo Clinica (su dueno); Turnos solo guarda los IDs.

Uso:
    python manage.py seed_turnos
    python manage.py seed_turnos --limpiar   (borra los turnos existentes)
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.clinica.services import registrar_medico, registrar_paciente
from apps.turnos.models import Turno

class ESP:
    """Valores de Medico.Especialidad (el catalogo es del modulo Clinica)."""

    CLINICA_MEDICA = "clinica_medica"
    PEDIATRIA = "pediatria"
    CARDIOLOGIA = "cardiologia"
    TRAUMATOLOGIA = "traumatologia"


# (nombre, dni, telefono, obra_social, profesional, especialidad, estado, motivo)
EJEMPLOS = [
    (
        "Maria Gomez", "30111222", "3764-551122", "IOSFA",
        "Dra. Laura Benitez", ESP.CLINICA_MEDICA,
        Turno.Estado.CONFIRMADO, "Control anual y analisis de rutina.",
    ),
    (
        "Juan Perez", "28999444", "3764-778899", "OSDE 210",
        "Dr. Martin Aguirre", ESP.TRAUMATOLOGIA,
        Turno.Estado.PENDIENTE, "Dolor lumbar persistente hace dos semanas.",
    ),
    (
        "Sofia Duarte", "45222333", "3764-224466", "Swiss Medical",
        "Dra. Carla Ibarra", ESP.PEDIATRIA,
        Turno.Estado.PENDIENTE, "Control de crecimiento, 6 anios.",
    ),
    (
        "Diego Ramirez", "26555777", "3764-993311", "PAMI",
        "Dr. Nicolas Ferreyra", ESP.CARDIOLOGIA,
        Turno.Estado.CONFIRMADO, "Seguimiento de hipertension.",
    ),
]

# Consultas ya atendidas: sirven para demostrar GET /pacientes/{dni}/historial
HISTORIAL = [
    (
        "Maria Gomez", "30111222", "3764-551122", "IOSFA",
        "Dra. Laura Benitez", ESP.CLINICA_MEDICA,
        "Cuadro gripal.", "Faringitis viral.",
        "Reposo 48 hs, ibuprofeno 400 mg cada 8 hs, abundante liquido.",
    ),
    (
        "Maria Gomez", "30111222", "3764-551122", "IOSFA",
        "Dr. Nicolas Ferreyra", ESP.CARDIOLOGIA,
        "Palpitaciones ocasionales.", "Taquicardia sinusal sin hallazgos patologicos.",
        "Reducir consumo de cafeina. Control en 6 meses.",
    ),
]


class Command(BaseCommand):
    help = "Carga turnos e historial clinico de ejemplo en la base de datos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limpiar",
            action="store_true",
            help="Elimina todos los turnos antes de cargar los ejemplos.",
        )

    def handle(self, *args, **opciones):
        if opciones["limpiar"]:
            borrados, _ = Turno.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Turnos eliminados: {borrados}"))

        creados = self._crear_agenda_futura()
        creados += self._crear_historial_pasado()

        self.stdout.write(self.style.SUCCESS(f"Turnos de ejemplo creados: {creados}"))
        self.stdout.write("Proba ahora:")
        self.stdout.write("  GET http://127.0.0.1:8000/api/v1/turnos")
        self.stdout.write("  GET http://127.0.0.1:8000/api/v1/pacientes/30111222/historial")

    def _crear_agenda_futura(self) -> int:
        """Turnos pendientes/confirmados, a partir de manana a las 9."""
        base = (timezone.localtime() + timedelta(days=1)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )

        creados = 0
        for indice, datos in enumerate(EJEMPLOS):
            nombre, dni, tel, obra, profesional, especialidad, estado, motivo = datos
            paciente = registrar_paciente(dni=dni, nombre=nombre, telefono=tel, obra_social=obra)
            medico = registrar_medico(nombre=profesional, especialidad=especialidad)
            fecha_hora = base + timedelta(minutes=30 * indice)

            if Turno.objects.filter(
                medico_id=medico.id, fecha_hora=fecha_hora
            ).exists():
                continue

            Turno.objects.create(
                paciente_id=paciente.id,
                medico_id=medico.id,
                estado=estado,
                fecha_hora=fecha_hora,
                motivo_consulta=motivo,
            )
            creados += 1
        return creados

    def _crear_historial_pasado(self) -> int:
        """Consultas ya atendidas, en meses anteriores."""
        creados = 0
        for indice, datos in enumerate(HISTORIAL):
            nombre, dni, tel, obra, profesional, especialidad, motivo, diag, indic = datos
            paciente = registrar_paciente(dni=dni, nombre=nombre, telefono=tel, obra_social=obra)
            medico = registrar_medico(nombre=profesional, especialidad=especialidad)
            fecha_hora = timezone.localtime() - timedelta(days=45 * (indice + 1))
            fecha_hora = fecha_hora.replace(hour=10, minute=0, second=0, microsecond=0)

            if Turno.objects.filter(
                medico_id=medico.id, fecha_hora=fecha_hora
            ).exists():
                continue

            Turno.objects.create(
                paciente_id=paciente.id,
                medico_id=medico.id,
                estado=Turno.Estado.ATENDIDO,
                fecha_hora=fecha_hora,
                motivo_consulta=motivo,
                diagnostico=diag,
                indicaciones=indic,
            )
            creados += 1
        return creados
