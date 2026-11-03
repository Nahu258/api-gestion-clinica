"""
Tests del login con email y contraseña (POST /api/v1/auth/login/).

Cubre:
  - Credenciales válidas devuelven JWT con el rol y el centro del perfil.
  - Contraseña incorrecta o usuario inactivo devuelven 401.
  - Faltan campos devuelve 400.
  - La solicitud hecha como invitado se vincula a la cuenta al loguearse.
  - /auth/me/ incluye los nombres del centro y del médico.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.atencion.models import SolicitudAtencion
from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import AsignacionMedico, CentroEmergencia, Especialidad
from apps.clinica.models import Medico

User = get_user_model()


class PasswordLoginTests(APITestCase):
    URL = "/api/v1/auth/login/"

    def setUp(self):
        self.centro = CentroEmergencia.objects.create(
            nombre="Sanatorio Boratti",
            tipo=CentroEmergencia.Tipo.CLINICA,
            direccion="Av. Mitre 2330, Posadas",
            latitud=-27.3735314,
            longitud=-55.9001254,
        )
        self.medico = Medico.objects.create(nombre="Dra. Lucía Kovalski", matricula="MP 5317")
        cardio = Especialidad.objects.create(nombre="Cardiología", codigo="cardiologia")
        AsignacionMedico.objects.create(medico=self.medico, centro=self.centro, especialidad=cardio)

        self.user = User.objects.create_user(
            username="lucia.kovalski@boratti.com.ar",
            email="lucia.kovalski@boratti.com.ar",
            password="Medico2026!",
            first_name="Lucía",
            last_name="Kovalski",
        )
        PerfilExtendido.objects.create(
            usuario=self.user,
            rol=PerfilExtendido.Rol.MEDICO,
            centro=self.centro,
            medico=self.medico,
        )

    def test_credenciales_validas_devuelven_jwt_con_rol(self):
        res = self.client.post(
            self.URL, {"email": "Lucia.Kovalski@boratti.com.ar", "password": "Medico2026!"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access_token", res.data)
        self.assertIn("refresh_token", res.data)
        self.assertEqual(res.data["usuario"]["rol"], "MEDICO")
        self.assertEqual(res.data["usuario"]["centro_nombre"], "Sanatorio Boratti")
        self.assertEqual(res.data["usuario"]["medico_especialidad"], "Cardiología")

    def test_password_incorrecta_devuelve_401(self):
        res = self.client.post(self.URL, {"email": self.user.email, "password": "otra"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_usuario_inactivo_devuelve_401(self):
        self.user.is_active = False
        self.user.save()
        res = self.client.post(self.URL, {"email": self.user.email, "password": "Medico2026!"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_faltan_campos_devuelve_400(self):
        res = self.client.post(self.URL, {"email": self.user.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_vincula_solicitud_de_invitado(self):
        solicitud = SolicitudAtencion.objects.create(centro=self.centro, nombre_invitado="Lucía")
        res = self.client.post(
            self.URL,
            {"email": self.user.email, "password": "Medico2026!", "solicitud_id": solicitud.pk},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.usuario_id, self.user.pk)

    def test_me_incluye_centro_y_medico(self):
        token = self.client.post(
            self.URL, {"email": self.user.email, "password": "Medico2026!"}, format="json"
        ).data["access_token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["centro_nombre"], "Sanatorio Boratti")
        self.assertEqual(res.data["medico_nombre"], "Dra. Lucía Kovalski")
