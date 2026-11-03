"""
Comando de seedeo para la demo completa de roles.

Carga sobre el Sanatorio Boratti (Av. Mitre 2330, Posadas):
  - Administrador global de la plataforma (rol ADMIN).
  - Administración del sanatorio (rol OPERADOR_CENTRO asignado al Boratti).
  - Seis médicos con especialidades distintas, guardias semanales y
    disponibilidad en Redis.
  - Ocho pacientes registrados con historial de atenciones cerradas.
  - Una guardia en curso: pendientes, aceptadas, derivadas, una en atención
    y atenciones cerradas hoy, para que todos los paneles muestren datos.

Es idempotente: vuelve a crear las solicitudes de la demo en cada corrida
y deja intactas las que hayan creado otros usuarios.

Uso:
    python manage.py seed_demo
"""

from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from redis.exceptions import RedisError

from apps.atencion.models import SolicitudAtencion
from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import (
    AsignacionMedico,
    CentroEmergencia,
    CentroEspecialidad,
    Especialidad,
)
from apps.clinica.disponibilidad import set_disponibilidad_medico
from apps.clinica.models import DisponibilidadMedico, Medico, Paciente

User = get_user_model()
E = Medico.Especialidad
S = SolicitudAtencion.Estado
M = SolicitudAtencion.Modo

PASSWORD_ADMIN = "Admin2026!"
PASSWORD_CENTRO = "Boratti2026!"
PASSWORD_MEDICO = "Medico2026!"
PASSWORD_PACIENTE = "Paciente2026!"

# (codigo, nombre, descripcion, icono)
ESPECIALIDADES = [
    ("clinica-medica", "Clínica Médica", "Medicina general de adultos y urgencias clínicas", "stethoscope"),
    ("cardiologia", "Cardiología", "Urgencias cardiovasculares y dolor precordial", "heart"),
    ("traumatologia", "Traumatología", "Fracturas, esguinces y lesiones osteoarticulares", "bone"),
    ("pediatria", "Pediatría", "Urgencias infantiles y neonatales", "baby"),
    ("ginecologia", "Ginecología y Obstetricia", "Urgencias ginecológicas y controles de embarazo", "gender-female"),
    ("cirugia-general", "Cirugía General", "Abdomen agudo y heridas que requieren cirugía", "scissors"),
]

# clave: (email, nombre, apellido, titulo, matricula, enum, codigo_esp, estado_redis, guardias)
# guardias: lista de (dia_semana, hora_inicio, hora_fin); 0 = lunes
MEDICOS = {
    "sosa": (
        "federico.sosa@boratti.com.ar", "Federico", "Sosa Benítez", "Dr.", "MP 4821",
        E.CLINICA_MEDICA, "clinica-medica", "DISPONIBLE",
        [(0, "08:00", "20:00"), (2, "08:00", "20:00"), (4, "08:00", "20:00"), (6, "00:00", "08:00")],
    ),
    "kovalski": (
        "lucia.kovalski@boratti.com.ar", "Lucía", "Kovalski", "Dra.", "MP 5317",
        E.CARDIOLOGIA, "cardiologia", "DISPONIBLE",
        [(1, "08:00", "20:00"), (3, "08:00", "20:00"), (5, "08:00", "14:00")],
    ),
    "rios": (
        "gustavo.rios@boratti.com.ar", "Gustavo", "Ríos Duarte", "Dr.", "MP 3954",
        E.TRAUMATOLOGIA, "traumatologia", "DISPONIBLE",
        [(0, "20:00", "23:59"), (1, "00:00", "08:00"), (3, "20:00", "23:59"), (5, "14:00", "23:59")],
    ),
    "ferreyra": (
        "natalia.ferreyra@boratti.com.ar", "Natalia", "Ferreyra Acosta", "Dra.", "MP 6102",
        E.PEDIATRIA, "pediatria", "EN_ATENCION",
        [(1, "08:00", "20:00"), (2, "08:00", "20:00"), (6, "08:00", "20:00")],
    ),
    "szychowski": (
        "paula.szychowski@boratti.com.ar", "Paula", "Szychowski", "Dra.", "MP 5568",
        E.GINECOLOGIA, "ginecologia", "DISPONIBLE",
        [(0, "08:00", "14:00"), (3, "08:00", "20:00"), (4, "14:00", "23:59")],
    ),
    "baez": (
        "ramiro.baez@boratti.com.ar", "Ramiro", "Báez", "Dr.", "MP 4470",
        E.OTRA, "cirugia-general", "FUERA_DE_GUARDIA",
        [(2, "20:00", "23:59"), (5, "00:00", "08:00"), (6, "08:00", "20:00")],
    ),
}

# clave: (email, nombre, apellido, dni, telefono, obra_social)
PACIENTES = {
    "camila": ("camila.benitez@gmail.com", "Camila", "Benítez", "35874120", "3764-418230", "OSDE"),
    "jorge": ("jorge.szymanski@gmail.com", "Jorge Luis", "Szymanski", "14230987", "3764-602115", "IPS Misiones"),
    "rocio": ("rocio.alegre@gmail.com", "Rocío", "Alegre", "40112563", "3764-775902", "Swiss Medical"),
    "hector": ("hector.duarte@gmail.com", "Héctor Fabián", "Duarte", "25698441", "3764-230874", "OSECAC"),
    "valentina": ("valentina.mereles@gmail.com", "Valentina", "Mereles", "45330218", "3764-881347", "IPS Misiones"),
    "ana": ("ana.krawczuk@gmail.com", "Ana María", "Krawczuk", "6512874", "3764-415590", "PAMI"),
    "matias": ("matias.encina@gmail.com", "Matías", "Encina", "29874511", "3764-529966", "Sancor Salud"),
    "silvina": ("silvina.godoy@gmail.com", "Silvina", "Godoy", "31447802", "3764-367120", "OSDE"),
}

# Atenciones cerradas de meses anteriores.
# (paciente, centro, medico, fecha "YYYY-MM-DD HH:MM", prioridad, motivo, diagnostico, indicaciones)
# centro: "boratti" o "madariaga"; medico: clave de MEDICOS o "aguirre" (seed_epica4).
HISTORIAL = [
    ("camila", "boratti", "sosa", "2026-03-14 22:40", "media",
     "Fiebre de 38,5 °C, dolor de garganta y malestar general desde hace 2 días.",
     "Faringoamigdalitis aguda bacteriana.",
     "Amoxicilina 500 mg cada 8 h por 10 días. Ibuprofeno 400 mg cada 8 h si hay dolor o fiebre. Control en 72 h si persiste la fiebre."),
    ("camila", "boratti", "szychowski", "2026-08-02 10:15", "alta",
     "Dolor pélvico intenso en el costado derecho, de inicio súbito.",
     "Quiste ovárico funcional derecho, sin signos de torsión en la ecografía.",
     "Ketorolac 10 mg cada 8 h por 3 días. Ecografía de control en 6 semanas. Volver de inmediato si el dolor aumenta o aparece fiebre."),
    ("jorge", "boratti", "kovalski", "2025-11-20 17:05", "urgente",
     "Dolor opresivo en el pecho de 20 minutos al subir escaleras.",
     "Angina de pecho estable. ECG sin cambios agudos, troponina negativa.",
     "Aspirina 100 mg por día. Atenolol 25 mg por día. Nitroglicerina sublingual ante dolor. Ergometría en 7 días."),
    ("jorge", "boratti", "sosa", "2026-06-09 09:30", "alta",
     "Dolor de cabeza en la nuca y presión de 180/110 medida en la farmacia.",
     "Crisis hipertensiva sin daño de órgano blanco.",
     "Enalapril 10 mg cada 12 h. Dieta con poca sal. Control de presión diario y registro por 2 semanas."),
    ("jorge", "boratti", "kovalski", "2026-10-21 19:50", "urgente",
     "Palpitaciones y falta de aire estando en reposo.",
     "Fibrilación auricular paroxística, revertida con amiodarona.",
     "Apixabán 5 mg cada 12 h. Holter de 24 h. Control con cardiología en 10 días."),
    ("rocio", "boratti", "rios", "2026-05-18 21:10", "media",
     "Torcedura de tobillo izquierdo jugando al vóley, no puede apoyar el pie.",
     "Esguince de tobillo izquierdo grado II. Radiografía sin fractura.",
     "Bota Walker por 3 semanas. Hielo 20 minutos cada 4 h. Ibuprofeno 600 mg cada 12 h por 5 días. Kinesiología al retirar la bota."),
    ("hector", "boratti", "baez", "2026-01-07 03:25", "urgente",
     "Dolor abdominal que empezó en el ombligo y ahora está abajo a la derecha, con náuseas.",
     "Apendicitis aguda. Apendicectomía laparoscópica sin complicaciones.",
     "Alta a las 48 h. Cefalexina 500 mg cada 6 h por 7 días. Sin esfuerzos por 3 semanas. Control de la herida en 7 días."),
    ("hector", "madariaga", "aguirre", "2026-09-30 15:45", "alta",
     "Corte profundo en la mano derecha con una amoladora.",
     "Herida cortante en la palma derecha sin compromiso de tendones. Sutura con 6 puntos.",
     "Curación diaria. Retiro de puntos en 10 días. Se aplicó refuerzo de vacuna antitetánica."),
    ("valentina", "boratti", "sosa", "2026-04-25 06:20", "media",
     "Vómitos y diarrea desde la madrugada, no tolera líquidos.",
     "Gastroenteritis aguda con deshidratación leve.",
     "Hidratación endovenosa en guardia. Sales de rehidratación oral. Dieta blanda por 48 h."),
    ("valentina", "boratti", "sosa", "2026-09-12 11:05", "media",
     "Mareos y un desmayo breve en clase.",
     "Síncope vasovagal. ECG y glucemia normales.",
     "Tomar abundante líquido. Evitar estar mucho tiempo de pie en ayunas. Consultar si se repite."),
    ("ana", "madariaga", "aguirre", "2025-12-28 08:40", "alta",
     "Caída en el baño, dolor en la cadera derecha.",
     "Contusión de cadera derecha. Radiografía sin fractura.",
     "Paracetamol 1 g cada 8 h. Reposo relativo y uso de bastón. Revisar barrales y antideslizante en el baño."),
    ("ana", "boratti", "sosa", "2026-07-15 18:30", "alta",
     "Tos con catarro y fiebre de 38 °C desde hace 4 días.",
     "Neumonía adquirida en la comunidad, lóbulo inferior derecho.",
     "Amoxicilina con ácido clavulánico 875 mg cada 12 h por 7 días. Control clínico en 48 h. Queda pendiente la vacuna antineumocócica."),
    ("ana", "boratti", "kovalski", "2026-10-26 16:10", "alta",
     "Hinchazón en las dos piernas y cansancio al caminar.",
     "Insuficiencia cardíaca descompensada leve.",
     "Furosemida 40 mg por la mañana. Menos sal y líquidos. Pesarse todos los días. Control en 5 días."),
    ("matias", "boratti", "rios", "2026-02-11 13:00", "media",
     "Dolor lumbar intenso después de levantar una caja pesada.",
     "Lumbalgia mecánica aguda sin signos neurológicos.",
     "Diclofenac 75 mg cada 12 h por 5 días. Calor local. No levantar peso por 2 semanas."),
    ("silvina", "boratti", "ferreyra", "2026-06-30 23:15", "alta",
     "Consulta por su hijo Tomás, 4 años: fiebre de 39 °C y dolor de oído.",
     "Otitis media aguda derecha.",
     "Amoxicilina 80 mg/kg/día en 3 tomas por 7 días. Paracetamol según peso si hay fiebre. Control con pediatra en 48 h."),
    ("silvina", "boratti", "ferreyra", "2026-09-03 02:50", "alta",
     "Tomás, 4 años: tos seca, silbido en el pecho y dificultad para respirar de noche.",
     "Bronquitis obstructiva leve. Saturación 96 %.",
     "Salbutamol con aerocámara, 2 disparos cada 6 h por 5 días. Control en 48 h. Volver si respira con esfuerzo."),
]

# Guardia en curso en el Boratti.
# (paciente o None, (nombre_invitado, telefono) o None, modo, estado, prioridad,
#  minutos_desde_creacion, medico, motivo, observaciones_triage)
GUARDIA_ACTUAL = [
    (None, ("Familia Núñez", "3764-208113"), M.AVISO, S.PENDIENTE, "urgente", 2, None,
     "Mi hija de 2 años tiene fiebre de 39,5 y convulsionó durante un minuto. Vamos en camino.", ""),
    (None, ("Ricardo Ojeda", "3764-512870"), M.SOLICITUD, S.PENDIENTE, "alta", 4, None,
     "Dolor de pecho que se va al brazo izquierdo y transpiración fría. Tengo 58 años.", ""),
    ("matias", None, M.AVISO, S.PENDIENTE, "media", 9, None,
     "Me corté el antebrazo con un vidrio y sangra bastante. Llego en auto en 10 minutos.", ""),
    ("valentina", None, M.SOLICITUD, S.ACEPTADO, "media", 22, None,
     "Dolor en la parte baja del abdomen y ardor al orinar desde ayer.", ""),
    ("jorge", None, M.SOLICITUD, S.DERIVADO, "urgente", 11, "kovalski",
     "Volvieron las palpitaciones y me siento mareado.",
     "FC 128 irregular en admisión. TA 100/60. Fibrilación auricular hace 6 días."),
    (None, ("Esteban Kaminski", "3764-339071"), M.SOLICITUD, S.DERIVADO, "alta", 17, "rios",
     "Me caí de la moto, tengo la muñeca derecha hinchada y me duele mucho.",
     "Deformidad en muñeca derecha, pulso distal presente. No perdió el conocimiento."),
    ("rocio", None, M.SOLICITUD, S.DERIVADO, "alta", 26, "sosa",
     "Fiebre alta y dolor de cabeza muy fuerte desde ayer, me molesta la luz.",
     "Temperatura 38,9 °C. Sin rigidez de nuca en el examen inicial."),
    (None, ("Lorena Vera", "3764-640257"), M.AVISO, S.EN_ATENCION, "urgente", 35, "ferreyra",
     "Mi bebé de 8 meses vomita todo y está muy decaído.",
     "Mucosas secas, llanto sin lágrimas. Peso 8,1 kg."),
]

# Atenciones cerradas hoy en el Boratti.
# (paciente o None, invitado o None, medico, horas_atras, prioridad, motivo, diagnostico, indicaciones)
CERRADAS_HOY = [
    (None, ("Mónica Fleitas", "3764-701448"), "szychowski", 2, "urgente",
     "Sangrado vaginal con un embarazo de 10 semanas.",
     "Amenaza de aborto. Ecografía con embrión vivo y latidos presentes.",
     "Reposo relativo. Progesterona 200 mg vía vaginal por la noche. Ecografía de control en 7 días."),
    (None, ("Brian Acosta", "3764-115093"), "rios", 3, "media",
     "Golpe en la rodilla izquierda jugando al fútbol.",
     "Contusión de rodilla izquierda, sin lesión de ligamentos al examen.",
     "Hielo, reposo y vendaje. Ibuprofeno 400 mg cada 8 h por 3 días."),
    ("hector", None, "sosa", 5, "alta",
     "Ronchas en todo el cuerpo después de comer mariscos.",
     "Urticaria aguda por alimentos, sin compromiso respiratorio.",
     "Loratadina 10 mg por día durante 5 días. Evitar mariscos. Volver de inmediato si se hinchan los labios o falta el aire."),
]


class Command(BaseCommand):
    help = "Carga la demo completa del Sanatorio Boratti: admin, médicos, pacientes e historiales."

    @transaction.atomic
    def handle(self, *args, **options):
        call_command("seed_centros", stdout=self.stdout)
        call_command("seed_epica4", stdout=self.stdout)

        boratti = CentroEmergencia.objects.get(nombre="Sanatorio Boratti")
        madariaga = CentroEmergencia.objects.filter(nombre__icontains="Madariaga", activo=True).first()
        centros = {"boratti": boratti, "madariaga": madariaga}

        especialidades = self._especialidades(boratti)
        self._admin_global()
        self._admin_centro(boratti)
        medicos = self._medicos(boratti, especialidades)
        medicos["aguirre"] = Medico.objects.filter(nombre__icontains="Aguirre").first()
        pacientes = self._pacientes()

        self._limpiar_solicitudes_demo(boratti, pacientes)
        n_hist = self._historial(pacientes, medicos, centros)
        n_guardia = self._guardia_actual(boratti, pacientes, medicos)

        self.stdout.write(self.style.SUCCESS(
            f"\nDemo Boratti lista: {len(medicos) - 1} médicos, {len(pacientes)} pacientes, "
            f"{n_hist} atenciones históricas, {n_guardia} solicitudes en la guardia de hoy."
        ))

    # ── Catálogo ────────────────────────────────────────────────────────────

    def _especialidades(self, centro):
        resultado = {}
        for codigo, nombre, descripcion, icono in ESPECIALIDADES:
            esp, _ = Especialidad.objects.get_or_create(
                codigo=codigo,
                defaults={"nombre": nombre, "descripcion": descripcion, "icono": icono},
            )
            CentroEspecialidad.objects.update_or_create(
                centro=centro, especialidad=esp, defaults={"activo": True}
            )
            resultado[codigo] = esp
        return resultado

    # ── Usuarios ────────────────────────────────────────────────────────────

    def _usuario(self, email, nombre, apellido, password, rol, centro=None, medico=None, staff=False):
        user, _ = User.objects.get_or_create(username=email, defaults={"email": email})
        user.email = email
        user.first_name = nombre
        user.last_name = apellido
        user.is_staff = staff
        user.is_superuser = staff
        user.is_active = True
        user.set_password(password)
        user.save()

        perfil, _ = PerfilExtendido.objects.get_or_create(usuario=user)
        perfil.rol = rol
        perfil.centro = centro
        perfil.medico = medico
        perfil.save()
        return user

    def _admin_global(self):
        self._usuario(
            "admin@emergenciaya.com.ar", "Administración", "EmergenciaYA",
            PASSWORD_ADMIN, PerfilExtendido.Rol.ADMIN, staff=True,
        )

    def _admin_centro(self, boratti):
        self._usuario(
            "administracion@boratti.com.ar", "Mariela", "Kowalczuk",
            PASSWORD_CENTRO, PerfilExtendido.Rol.OPERADOR_CENTRO, centro=boratti,
        )

    def _medicos(self, boratti, especialidades):
        resultado = {}
        for clave, (email, nombre, apellido, titulo, matricula, enum, codigo, estado, guardias) in MEDICOS.items():
            medico, _ = Medico.objects.update_or_create(
                matricula=matricula,
                defaults={"nombre": f"{titulo} {nombre} {apellido}", "especialidad": enum},
            )
            AsignacionMedico.objects.update_or_create(
                medico=medico, centro=boratti, especialidad=especialidades[codigo],
                defaults={"activo": True},
            )

            DisponibilidadMedico.objects.filter(medico=medico, centro=boratti).delete()
            for dia, inicio, fin in guardias:
                DisponibilidadMedico.objects.create(
                    medico=medico,
                    centro=boratti,
                    dia_semana=dia,
                    hora_inicio=time.fromisoformat(inicio),
                    hora_fin=time.fromisoformat(fin),
                    en_guardia_activa=True,
                )

            try:
                set_disponibilidad_medico(medico.id, estado)
            except RedisError:
                self.stdout.write(self.style.WARNING(f"  Redis no disponible: {medico.nombre} sin estado en vivo"))
            self._usuario(
                email, nombre, apellido, PASSWORD_MEDICO,
                PerfilExtendido.Rol.MEDICO, centro=boratti, medico=medico,
            )
            resultado[clave] = medico
        return resultado

    def _pacientes(self):
        resultado = {}
        for clave, (email, nombre, apellido, dni, telefono, obra_social) in PACIENTES.items():
            user = self._usuario(email, nombre, apellido, PASSWORD_PACIENTE, PerfilExtendido.Rol.PACIENTE)
            Paciente.objects.update_or_create(
                dni=dni,
                defaults={"nombre": f"{nombre} {apellido}", "telefono": telefono, "obra_social": obra_social},
            )
            resultado[clave] = user
        return resultado

    # ── Solicitudes ─────────────────────────────────────────────────────────

    def _limpiar_solicitudes_demo(self, boratti, pacientes):
        invitados = [g[1][0] for g in GUARDIA_ACTUAL if g[1]]
        invitados += [c[1][0] for c in CERRADAS_HOY if c[1]]
        SolicitudAtencion.objects.filter(usuario_id__in=[u.id for u in pacientes.values()]).delete()
        SolicitudAtencion.objects.filter(centro=boratti, nombre_invitado__in=invitados).delete()

    def _crear(self, centro, paciente, invitado, modo, estado, prioridad, medico, motivo,
               creado, observaciones="", diagnostico="", indicaciones="", atendido=None):
        solicitud = SolicitudAtencion.objects.create(
            centro=centro,
            usuario_id=paciente.id if paciente else None,
            nombre_invitado=invitado[0] if invitado else "",
            telefono_invitado=invitado[1] if invitado else "",
            modo=modo,
            estado=estado,
            prioridad=prioridad,
            motivo=motivo,
            medico_asignado=medico,
            especialidad_asignada=self._especialidad_de(medico, centro),
            observaciones_triage=observaciones,
            diagnostico=diagnostico,
            indicaciones=indicaciones,
        )
        derivado = creado + timedelta(minutes=4) if medico else None
        # creado_en/actualizado_en son auto_now: se fijan con update() para que la historia tenga fechas reales
        SolicitudAtencion.objects.filter(pk=solicitud.pk).update(
            creado_en=creado,
            actualizado_en=atendido or derivado or creado,
            fecha_derivacion=derivado,
            atendido_en=atendido,
        )

    def _especialidad_de(self, medico, centro):
        if not medico:
            return None
        asignacion = AsignacionMedico.objects.filter(medico=medico, centro=centro).select_related("especialidad").first()
        if asignacion is None:
            asignacion = AsignacionMedico.objects.filter(medico=medico).select_related("especialidad").first()
        return asignacion.especialidad if asignacion else None

    def _historial(self, pacientes, medicos, centros):
        tz = timezone.get_current_timezone()
        for clave, centro, medico, fecha, prioridad, motivo, diagnostico, indicaciones in HISTORIAL:
            creado = timezone.make_aware(datetime.strptime(fecha, "%Y-%m-%d %H:%M"), tz)
            self._crear(
                centros[centro] or centros["boratti"], pacientes[clave], None, M.SOLICITUD, S.ATENDIDO,
                prioridad, medicos[medico], motivo, creado,
                diagnostico=diagnostico, indicaciones=indicaciones,
                atendido=creado + timedelta(minutes=55),
            )
        return len(HISTORIAL)

    def _guardia_actual(self, boratti, pacientes, medicos):
        ahora = timezone.now()
        inicio_dia = ahora.replace(hour=0, minute=1, second=0, microsecond=0)

        for clave, invitado, modo, estado, prioridad, minutos, medico, motivo, obs in GUARDIA_ACTUAL:
            self._crear(
                boratti, pacientes.get(clave), invitado, modo, estado, prioridad,
                medicos.get(medico), motivo, ahora - timedelta(minutes=minutos), observaciones=obs,
            )

        for clave, invitado, medico, horas, prioridad, motivo, diagnostico, indicaciones in CERRADAS_HOY:
            atendido = max(ahora - timedelta(hours=horas), inicio_dia + timedelta(minutes=50))
            self._crear(
                boratti, pacientes.get(clave), invitado, M.SOLICITUD, S.ATENDIDO, prioridad,
                medicos[medico], motivo, atendido - timedelta(minutes=50),
                diagnostico=diagnostico, indicaciones=indicaciones, atendido=atendido,
            )

        return len(GUARDIA_ACTUAL) + len(CERRADAS_HOY)
