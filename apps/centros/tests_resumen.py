"""
Tests del resumen general de la red — Épica 5, issue AE5-14 (#44).
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.atencion.models import SolicitudAtencion
from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import AsignacionMedico, CentroEmergencia, CentroEspecialidad, Especialidad
from apps.clinica.disponibilidad import set_disponibilidad_medico
from apps.clinica.models import Medico
from core.redis_client import get_redis

User = get_user_model()
Rol = PerfilExtendido.Rol
URL = "/api/v1/admin/resumen/"


def _usuario(email, rol, centro=None):
    user = User.objects.create_user(username=email, email=email, password="pass")
    PerfilExtendido.objects.create(usuario=user, rol=rol, centro=centro)
    return user


def _centro(nombre, tipo="hospital", activo=True):
    return CentroEmergencia.objects.create(
        nombre=nombre, tipo=tipo, direccion="Calle 1", latitud=-27.37, longitud=-55.9, activo=activo
    )


class ResumenRedTests(APITestCase):
    def setUp(self):
        get_redis().flushall()
        self.completo = _centro("Hospital Completo")
        self.vacio = _centro("Clínica Vacía", tipo="clinica")
        self.bomberos = _centro("Bomberos Centro", tipo="bomberos")
        self.inactivo = _centro("UPA Cerrada", tipo="upa", activo=False)

        esp = Especialidad.objects.create(nombre="Pediatría", codigo="pediatria")
        CentroEspecialidad.objects.create(centro=self.completo, especialidad=esp)
        self.m1 = Medico.objects.create(nombre="Dra. Uno")
        self.m2 = Medico.objects.create(nombre="Dr. Dos")
        for m in (self.m1, self.m2):
            AsignacionMedico.objects.create(medico=m, centro=self.completo, especialidad=esp)
        set_disponibilidad_medico(self.m1.id, "DISPONIBLE")
        set_disponibilidad_medico(self.m2.id, "EN_ATENCION")

        self.admin = _usuario("admin@test.com", Rol.ADMIN)
        self.operador = _usuario("op@test.com", Rol.OPERADOR_CENTRO, centro=self.completo)

        ahora = timezone.now()
        E = SolicitudAtencion.Estado
        for estado, minutos in ((E.PENDIENTE, 10), (E.EN_CAMINO, 30), (E.DERIVADO, 5), (E.EN_ATENCION, 5)):
            s = SolicitudAtencion.objects.create(centro=self.completo, estado=estado)
            SolicitudAtencion.objects.filter(pk=s.pk).update(creado_en=ahora - timedelta(minutes=minutos))
        SolicitudAtencion.objects.create(centro=self.completo, estado=E.ATENDIDO, atendido_en=ahora)
        SolicitudAtencion.objects.create(
            centro=self.completo, estado=E.ATENDIDO, atendido_en=ahora - timedelta(days=2)
        )
        SolicitudAtencion.objects.create(centro=self.inactivo, estado=E.PENDIENTE)

    def _como(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")

    def test_solo_admin(self):
        self._como(self.operador)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.client.credentials()
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_kpis_de_la_red(self):
        self._como(self.admin)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        k = response.data["kpis"]
        self.assertEqual(k["instituciones_activas"], 3)
        self.assertEqual(k["instituciones_inactivas"], 1)
        self.assertEqual(k["medicos_asignados"], 2)
        self.assertEqual(k["medicos_disponibles"], 1)
        # La solicitud del centro inactivo no cuenta
        self.assertEqual(k["solicitudes_pendientes"], 1)
        self.assertEqual(k["solicitudes_en_camino"], 1)
        self.assertEqual(k["solicitudes_derivadas"], 2)
        self.assertEqual(k["atenciones_hoy"], 1)

    def test_estado_de_guardias_por_institucion(self):
        self._como(self.admin)
        guardias = {g["centro_nombre"]: g for g in self.client.get(URL).data["guardias"]}
        # Bomberos no tiene guardia médica: no aparece
        self.assertEqual(set(guardias), {"Hospital Completo", "Clínica Vacía"})
        g = guardias["Hospital Completo"]
        self.assertEqual(g["en_espera"], 2)
        self.assertEqual(g["en_curso"], 2)
        self.assertEqual(g["atendidas_hoy"], 1)
        self.assertEqual(g["medicos"], 2)
        self.assertEqual(g["medicos_disponibles"], 1)
        self.assertEqual(g["espera_promedio_min"], 20)
        self.assertIsNone(guardias["Clínica Vacía"]["espera_promedio_min"])

    def test_alertas_de_configuracion(self):
        self._como(self.admin)
        alertas = {(a["centro_nombre"], a["tipo"]) for a in self.client.get(URL).data["alertas"]}
        self.assertEqual(
            alertas,
            {
                ("Clínica Vacía", "sin_especialidades"),
                ("Clínica Vacía", "sin_medicos"),
                ("Clínica Vacía", "sin_operador"),
            },
        )
