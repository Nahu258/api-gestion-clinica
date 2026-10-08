"""
Comando de seedeo para la Épica 4:
- Especialidades médicas (Traumatología, Clínica Médica, Pediatría, Cardiología)
- Asignación de especialidades a centros de Posadas
- Asignación de doctores con matrícula
- Disponibilidad en Redis (DISPONIBLE)
- Usuarios de prueba para Operador de Centro y Médico Especialista
- Solicitudes de emergencia de prueba para la bandeja de guardia
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.centros.models import CentroEmergencia, Especialidad, CentroEspecialidad, AsignacionMedico
from apps.clinica.models import Medico
from apps.clinica.disponibilidad import set_disponibilidad_medico
from apps.auth_usuarios.models import PerfilExtendido
from apps.atencion.models import SolicitudAtencion

User = get_user_model()


class Command(BaseCommand):
    help = "Carga datos de prueba de la Épica 4 (especialidades, médicos, usuarios de prueba y cola de guardia)"

    def handle(self, *args, **options):
        self.stdout.write("Cargando datos de prueba para la Épica 4...")

        # 1. Especialidades
        especialidades_data = [
            ("Traumatología", "traumatologia", "Atención de fracturas, esguinces y lesiones osteoarticulares", "bone"),
            ("Clínica Médica", "clinica-medica", "Medicina general de adultos y urgencias clínicas", "stethoscope"),
            ("Pediatría", "pediatria", "Urgencias infantiles y neonatales", "baby"),
            ("Cardiología", "cardiologia", "Urgencias cardiovasculares y dolor precordial", "heart"),
        ]

        esps_creadas = {}
        for nombre, codigo, desc, icono in especialidades_data:
            esp, _ = Especialidad.objects.get_or_create(
                codigo=codigo,
                defaults={"nombre": nombre, "descripcion": desc, "icono": icono},
            )
            esps_creadas[codigo] = esp

        # 2. Centros principales
        centro_samic = CentroEmergencia.objects.filter(nombre__icontains="Madariaga").first() or CentroEmergencia.objects.first()

        if centro_samic:
            for esp in esps_creadas.values():
                CentroEspecialidad.objects.get_or_create(centro=centro_samic, especialidad=esp, defaults={"activo": True})

        # 3. Médicos con matrícula
        medicos_data = [
            ("Dra. Laura Benitez", "MN45812", Medico.Especialidad.PEDIATRIA, esps_creadas["pediatria"]),
            ("Dr. Martin Aguirre", "MN38921", Medico.Especialidad.TRAUMATOLOGIA, esps_creadas["traumatologia"]),
            ("Dra. Carla Ibarra", "MN51230", Medico.Especialidad.CLINICA_MEDICA, esps_creadas["clinica-medica"]),
            ("Dr. Nicolas Ferreyra", "MN42119", Medico.Especialidad.CARDIOLOGIA, esps_creadas["cardiologia"]),
        ]

        medicos_creados = []
        for nombre, matricula, esp_enum, esp_obj in medicos_data:
            medico, _ = Medico.objects.get_or_create(
                nombre=nombre,
                defaults={"matricula": matricula, "especialidad": esp_enum, "activo": True},
            )
            medico.matricula = matricula
            medico.save()

            if centro_samic:
                AsignacionMedico.objects.get_or_create(
                    medico=medico,
                    centro=centro_samic,
                    especialidad=esp_obj,
                    defaults={"activo": True},
                )

            # Poner disponible en Redis
            set_disponibilidad_medico(medico.id, "DISPONIBLE")
            medicos_creados.append(medico)

        # 4. Usuario de Prueba: OPERADOR DE CENTRO
        user_operador, created_op = User.objects.get_or_create(
            username="operador@madariaga.com",
            defaults={"email": "operador@madariaga.com", "first_name": "Operador", "last_name": "SAMIC"},
        )
        if created_op:
            user_operador.set_password("operador123")
            user_operador.save()

        perfil_op, _ = PerfilExtendido.objects.get_or_create(usuario=user_operador)
        perfil_op.rol = PerfilExtendido.Rol.OPERADOR_CENTRO
        perfil_op.centro = centro_samic
        perfil_op.save()

        # 5. Usuario de Prueba: MÉDICO ESPECIALISTA (Dr. Martin Aguirre - Traumatología)
        user_medico, created_med = User.objects.get_or_create(
            username="doctor@madariaga.com",
            defaults={"email": "doctor@madariaga.com", "first_name": "Dr. Martin", "last_name": "Aguirre"},
        )
        if created_med:
            user_medico.set_password("doctor123")
            user_medico.save()

        medico_aguirre = medicos_creados[1] if len(medicos_creados) > 1 else medicos_creados[0]
        perfil_med, _ = PerfilExtendido.objects.get_or_create(usuario=user_medico)
        perfil_med.rol = PerfilExtendido.Rol.MEDICO
        perfil_med.medico = medico_aguirre
        perfil_med.centro = centro_samic
        perfil_med.save()

        # 6. Solicitudes de Emergencia de Prueba para el Panel de Centro
        if centro_samic:
            SolicitudAtencion.objects.get_or_create(
                centro=centro_samic,
                motivo="Caída en la vía pública con dolor intenso y deformidad en muñeca derecha.",
                defaults={
                    "modo": SolicitudAtencion.Modo.SOLICITUD,
                    "nombre_invitado": "Carlos Ramírez",
                    "telefono_invitado": "3764-123456",
                    "estado": SolicitudAtencion.Estado.PENDIENTE,
                    "prioridad": "alta",
                },
            )

            SolicitudAtencion.objects.get_or_create(
                centro=centro_samic,
                motivo="Paciente pediátrico con dificultad respiratoria y fiebre alta 39°C.",
                defaults={
                    "modo": SolicitudAtencion.Modo.AVISO,
                    "nombre_invitado": "Familia Gómez",
                    "telefono_invitado": "3764-987654",
                    "estado": SolicitudAtencion.Estado.ACEPTADO,
                    "prioridad": "urgente",
                },
            )

        self.stdout.write(self.style.SUCCESS("¡Datos de prueba de Épica 4 cargados exitosamente!"))
        self.stdout.write("  - Usuario Operador: operador@madariaga.com (clave: operador123)")
        self.stdout.write("  - Usuario Médico:   doctor@madariaga.com   (clave: doctor123)")
