"""
Tests para Especialidades por Centro y Asignación de Doctores — Épica 4, issue #22 (AE4-12).
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import AsignacionMedico, CentroEmergencia, CentroEspecialidad, Especialidad
from apps.clinica.models import Medico

User = get_user_model()


class EspecialidadesPorCentroTests(APITestCase):
    def setUp(self):
        # Centro de prueba
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital SAMIC Madariaga",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Av. López Torres 1177",
            latitud=-27.371,
            longitud=-55.891,
        )

        # Especialidades
        self.pediatria = Especialidad.objects.create(
            nombre="Pediatría",
            codigo="pediatria",
            descripcion="Atención médica infantil",
            icono="baby",
        )
        self.trauma = Especialidad.objects.create(
            nombre="Traumatología",
            codigo="traumatologia",
            descripcion="Huesos y articulaciones",
            icono="bone",
        )

        # Vincular especialidades al centro
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=self.pediatria)
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=self.trauma)

        # Médicos
        self.doctor1 = Medico.objects.create(
            nombre="Dra. Sofía Martínez",
            matricula="MN12345",
            especialidad=Medico.Especialidad.PEDIATRIA,
        )
        self.doctor2 = Medico.objects.create(
            nombre="Dr. Pedro Gómez",
            matricula="MN67890",
            especialidad=Medico.Especialidad.TRAUMATOLOGIA,
        )

        # Asignar doctores
        AsignacionMedico.objects.create(
            medico=self.doctor1, centro=self.centro, especialidad=self.pediatria
        )
        AsignacionMedico.objects.create(
            medico=self.doctor2, centro=self.centro, especialidad=self.trauma
        )

        # Usuarios con roles
        self.user_admin = User.objects.create_user(
            username="admin@test.com", email="admin@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_admin, rol=PerfilExtendido.Rol.ADMIN
        )

        self.user_paciente = User.objects.create_user(
            username="paciente@test.com", email="paciente@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_paciente, rol=PerfilExtendido.Rol.PACIENTE
        )

        # Tokens
        self.token_admin = str(RefreshToken.for_user(self.user_admin).access_token)
        self.token_paciente = str(RefreshToken.for_user(self.user_paciente).access_token)

    def test_get_especialidades_de_centro_publico(self):
        """GET /centros/{id}/especialidades/ devuelve la lista de especialidades (200)."""
        url = f"/api/v1/centros/{self.centro.id}/especialidades/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        nombres = [item["nombre"] for item in response.data]
        self.assertIn("Pediatría", nombres)
        self.assertIn("Traumatología", nombres)

    def test_post_especialidad_como_admin_crea_o_asocia(self):
        """POST /centros/{id}/especialidades/ con rol ADMIN permite agregar una especialidad (201)."""
        url = f"/api/v1/centros/{self.centro.id}/especialidades/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_admin}")

        payload = {
            "nombre": "Cardiología",
            "codigo": "cardiologia",
            "descripcion": "Enfermedades cardíacas",
            "icono": "heart",
        }
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["nombre"], "Cardiología")
        self.assertEqual(response.data["codigo"], "cardiologia")

        # Verificar que quedó asociada al centro
        self.assertTrue(
            CentroEspecialidad.objects.filter(
                centro=self.centro, especialidad__codigo="cardiologia"
            ).exists()
        )

    def test_post_especialidad_como_paciente_deniega_403(self):
        """POST /centros/{id}/especialidades/ con rol PACIENTE da 403 Forbidden."""
        url = f"/api/v1/centros/{self.centro.id}/especialidades/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_paciente}")

        payload = {"nombre": "Neurología", "codigo": "neurologia"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_doctores_de_especialidad_en_centro(self):
        """GET /centros/{id}/especialidades/{esp_id}/doctores/ lista los médicos asignados."""
        url = f"/api/v1/centros/{self.centro.id}/especialidades/{self.pediatria.id}/doctores/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["nombre"], "Dra. Sofía Martínez")
        self.assertEqual(response.data[0]["matricula"], "MN12345")

    def test_post_asignar_doctor_como_admin(self):
        """POST /centros/{id}/especialidades/{esp_id}/doctores/ como ADMIN registra o asigna un médico (201)."""
        url = f"/api/v1/centros/{self.centro.id}/especialidades/{self.trauma.id}/doctores/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_admin}")

        payload = {
            "nombre": "Dr. Lionel Messi",
            "matricula": "MN101010",
        }
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["nombre"], "Dr. Lionel Messi")
        self.assertEqual(response.data["matricula"], "MN101010")

        # Verificar asignación en BD
        self.assertTrue(
            AsignacionMedico.objects.filter(
                centro=self.centro,
                especialidad=self.trauma,
                medico__nombre="Dr. Lionel Messi",
            ).exists()
        )

    def test_post_asignar_doctor_como_no_admin_deniega_403(self):
        """POST doctores sin rol ADMIN retorna 403 Forbidden."""
        url = f"/api/v1/centros/{self.centro.id}/especialidades/{self.trauma.id}/doctores/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_paciente}")

        payload = {"nombre": "Dr. Falso", "matricula": "MN999"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_centro_inexistente_retorna_404(self):
        """Centro inexistente retorna 404."""
        url = "/api/v1/centros/9999/especialidades/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
