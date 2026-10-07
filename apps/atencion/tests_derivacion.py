"""
Tests para el Flujo de Derivación a Especialista con Redis y RabbitMQ — Épica 4, issue #24 (AE4-14).
"""

from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import CentroEmergencia, Especialidad, CentroEspecialidad, AsignacionMedico
from apps.clinica.models import Medico
from apps.clinica.disponibilidad import set_disponibilidad_medico
from apps.atencion.models import SolicitudAtencion
from apps.atencion.services import lock_derivacion_medico
from core.exceptions import ServicioNoDisponible

User = get_user_model()


class DerivacionSolicitudTests(APITestCase):
    def setUp(self):
        # 1. Centro
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital SAMIC Oberá",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Av. Pincen 100",
            latitud=-27.48,
            longitud=-55.12,
            activo=True,
        )

        # 2. Especialidad y Médico
        self.especialidad = Especialidad.objects.create(
            nombre="Cardiología",
            codigo="cardiologia",
            descripcion="Salud cardiovascular",
            icono="heart",
        )
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=self.especialidad)

        self.medico = Medico.objects.create(
            nombre="Dr. René Favaloro",
            matricula="MN99999",
            especialidad=Medico.Especialidad.CARDIOLOGIA,
        )
        AsignacionMedico.objects.create(
            medico=self.medico,
            centro=self.centro,
            especialidad=self.especialidad,
        )

        # Habilitar médico como DISPONIBLE en Redis
        set_disponibilidad_medico(self.medico.id, "DISPONIBLE")

        # 3. Usuarios con roles
        self.operador = User.objects.create_user(
            username="operador@test.com", email="operador@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.operador,
            rol=PerfilExtendido.Rol.OPERADOR_CENTRO,
            centro=self.centro,
        )

        self.admin = User.objects.create_user(
            username="admin@test.com", email="admin@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.admin,
            rol=PerfilExtendido.Rol.ADMIN,
        )

        self.paciente = User.objects.create_user(
            username="paciente@test.com", email="paciente@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.paciente,
            rol=PerfilExtendido.Rol.PACIENTE,
        )

        self.token_operador = str(RefreshToken.for_user(self.operador).access_token)
        self.token_admin = str(RefreshToken.for_user(self.admin).access_token)
        self.token_paciente = str(RefreshToken.for_user(self.paciente).access_token)

        # 4. Solicitud de atención
        self.solicitud = SolicitudAtencion.objects.create(
            centro=self.centro,
            modo=SolicitudAtencion.Modo.SOLICITUD,
            motivo="Dolor agudo en el pecho",
            nombre_invitado="Carlos Paciente",
            telefono_invitado="11223344",
        )

    @override_settings(EVENTOS_HABILITADOS=True)
    @patch("apps.atencion.eventos.publicar_evento")
    def test_operador_puede_derivar_solicitud_exitosamente(self, mock_publicar):
        """OPERADOR_CENTRO deriva a especialista: pasa a DERIVADO y publica evento."""
        mock_publicar.return_value = "msg-derivada-123"
        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/derivar/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_operador}")

        payload = {
            "especialidad_id": self.especialidad.id,
            "medico_id": self.medico.id,
            "prioridad": "alta",
            "observaciones": "Sospecha de síndrome coronario agudo",
        }
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estado"], SolicitudAtencion.Estado.DERIVADO)
        self.assertEqual(response.data["especialidad_id"], self.especialidad.id)
        self.assertEqual(response.data["medico_id"], self.medico.id)
        self.assertEqual(response.data["prioridad"], "alta")
        self.assertEqual(
            response.data["observaciones_triage"],
            "Sospecha de síndrome coronario agudo",
        )

        # Verificar BD
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, SolicitudAtencion.Estado.DERIVADO)
        self.assertEqual(self.solicitud.medico_asignado, self.medico)
        self.assertEqual(self.solicitud.especialidad_asignada, self.especialidad)
        self.assertEqual(self.solicitud.derivado_por, self.operador)
        self.assertIsNotNone(self.solicitud.fecha_derivacion)

        # Verificar evento en RabbitMQ
        mock_publicar.assert_called_once()
        args, kwargs = mock_publicar.call_args
        self.assertEqual(kwargs["tipo"], "solicitud.derivada")
        self.assertEqual(kwargs["payload"]["solicitud_id"], self.solicitud.id)
        self.assertEqual(kwargs["payload"]["medico_id"], self.medico.id)
        self.assertEqual(kwargs["payload"]["especialidad_id"], self.especialidad.id)

    def test_paciente_no_puede_derivar_solicitud(self):
        """Usuario con rol PACIENTE recibe 403 Forbidden."""
        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/derivar/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_paciente}")

        payload = {
            "especialidad_id": self.especialidad.id,
            "medico_id": self.medico.id,
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sin_autenticacion_retorna_401(self):
        """Petición anónima es rechazada."""
        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/derivar/"
        self.client.credentials()  # Sin token

        payload = {
            "especialidad_id": self.especialidad.id,
            "medico_id": self.medico.id,
        }
        response = self.client.post(url, payload, format="json")
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_no_se_puede_derivar_medico_fuera_de_guardia(self):
        """Si el médico está FUERA_DE_GUARDIA se rechaza la derivación."""
        set_disponibilidad_medico(self.medico.id, "FUERA_DE_GUARDIA")

        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/derivar/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_operador}")

        payload = {
            "especialidad_id": self.especialidad.id,
            "medico_id": self.medico.id,
        }
        response = self.client.post(url, payload, format="json")
        self.assertIn(response.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT])

    def test_lock_derivacion_medico_previene_carreras(self):
        """Verifica que el lock en Redis protege al médico durante la asignación."""
        with lock_derivacion_medico(self.medico.id):
            # Con el lock ya tomado por el primer contexto, otro intento debe fallar cuando se agota el tiempo
            def mock_time():
                mock_time.val += 6.0
                return mock_time.val

            mock_time.val = 0.0

            with patch("apps.atencion.services.time.monotonic", side_effect=mock_time):
                with self.assertRaises(ServicioNoDisponible):
                    with lock_derivacion_medico(self.medico.id):
                        pass
