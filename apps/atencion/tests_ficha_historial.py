"""
Tests para Ficha Clínica e Historial de Atenciones Protegido por Roles — Épica 4, issue #25 (AE4-15).
"""

from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import CentroEmergencia, Especialidad, CentroEspecialidad, AsignacionMedico
from apps.clinica.models import Medico
from apps.clinica.disponibilidad import get_disponibilidad_medico, set_disponibilidad_medico
from apps.atencion.models import SolicitudAtencion

User = get_user_model()


class FichaHistorialTests(APITestCase):
    def setUp(self):
        # 1. Centro
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital SAMIC Eldorado",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Km 10",
            latitud=-26.40,
            longitud=-54.63,
            activo=True,
        )

        # 2. Especialidad y Médicos
        self.especialidad = Especialidad.objects.create(
            nombre="Traumatología",
            codigo="traumatologia",
            descripcion="Huesos y articulaciones",
            icono="bone",
        )
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=self.especialidad)

        self.medico1 = Medico.objects.create(
            nombre="Dr. Javier Mascherano",
            matricula="MN11111",
            especialidad=Medico.Especialidad.TRAUMATOLOGIA,
        )
        self.medico2 = Medico.objects.create(
            nombre="Dr. Lionel Scaloni",
            matricula="MN22222",
            especialidad=Medico.Especialidad.TRAUMATOLOGIA,
        )
        AsignacionMedico.objects.create(medico=self.medico1, centro=self.centro, especialidad=self.especialidad)
        AsignacionMedico.objects.create(medico=self.medico2, centro=self.centro, especialidad=self.especialidad)

        set_disponibilidad_medico(self.medico1.id, "DISPONIBLE")
        set_disponibilidad_medico(self.medico2.id, "DISPONIBLE")

        # 3. Usuarios y Perfiles
        # Médico 1 asignado
        self.user_medico1 = User.objects.create_user(
            username="medico1@test.com", email="medico1@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_medico1,
            rol=PerfilExtendido.Rol.MEDICO,
            medico=self.medico1,
            centro=self.centro,
        )

        # Médico 2 no asignado a esta solicitud
        self.user_medico2 = User.objects.create_user(
            username="medico2@test.com", email="medico2@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_medico2,
            rol=PerfilExtendido.Rol.MEDICO,
            medico=self.medico2,
            centro=self.centro,
        )

        # Operador del centro
        self.user_operador = User.objects.create_user(
            username="operador@test.com", email="operador@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_operador,
            rol=PerfilExtendido.Rol.OPERADOR_CENTRO,
            centro=self.centro,
        )

        # Paciente registrado con cuenta
        self.user_paciente = User.objects.create_user(
            username="paciente@test.com", email="paciente@test.com", password="pass", first_name="Ana", last_name="García"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_paciente,
            rol=PerfilExtendido.Rol.PACIENTE,
        )

        # Otro paciente registrado ajeno
        self.user_otro_paciente = User.objects.create_user(
            username="otro@test.com", email="otro@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_otro_paciente,
            rol=PerfilExtendido.Rol.PACIENTE,
        )

        # Tokens
        self.token_medico1 = str(RefreshToken.for_user(self.user_medico1).access_token)
        self.token_medico2 = str(RefreshToken.for_user(self.user_medico2).access_token)
        self.token_operador = str(RefreshToken.for_user(self.user_operador).access_token)
        self.token_paciente = str(RefreshToken.for_user(self.user_paciente).access_token)
        self.token_otro_paciente = str(RefreshToken.for_user(self.user_otro_paciente).access_token)

        # 4. Solicitud derivada a Medico 1 para Paciente Registrado
        self.solicitud = SolicitudAtencion.objects.create(
            centro=self.centro,
            modo=SolicitudAtencion.Modo.SOLICITUD,
            motivo="Esguince de tobillo severo",
            usuario_id=self.user_paciente.id,
            estado=SolicitudAtencion.Estado.DERIVADO,
            especialidad_asignada=self.especialidad,
            medico_asignado=self.medico1,
            fecha_derivacion=timezone.now(),
            prioridad="alta",
            observaciones_triage="Paciente no puede apoyar el pie",
        )

    def test_iniciar_atencion_medico_asignado_exitoso(self):
        """El médico asignado pasa la solicitud a EN_ATENCION y su estado a EN_ATENCION."""
        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/iniciar-atencion/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_medico1}")

        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estado"], SolicitudAtencion.Estado.EN_ATENCION)

        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, SolicitudAtencion.Estado.EN_ATENCION)
        self.assertEqual(get_disponibilidad_medico(self.medico1.id), "EN_ATENCION")

    def test_iniciar_atencion_medico_no_asignado_retorna_403(self):
        """Un médico diferente al asignado no puede iniciar la atención."""
        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/iniciar-atencion/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_medico2}")

        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(EVENTOS_HABILITADOS=True)
    @patch("apps.atencion.eventos.publicar_evento")
    def test_completar_atencion_con_diagnostico_exitoso(self, mock_publicar):
        """Médico asignado completa la atención con diagnóstico y se emite evento solicitud.atendida."""
        mock_publicar.return_value = "msg-atendida-123"
        # Primero pasamos a EN_ATENCION
        self.solicitud.estado = SolicitudAtencion.Estado.EN_ATENCION
        self.solicitud.save()
        set_disponibilidad_medico(self.medico1.id, "EN_ATENCION")

        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/completar/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_medico1}")

        payload = {
            "diagnostico": "Fractura no desplazada de peroné distal",
            "indicaciones": "Inmovilización con bota walker por 3 semanas, analgesia según dolor",
        }
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estado"], SolicitudAtencion.Estado.ATENDIDO)

        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, SolicitudAtencion.Estado.ATENDIDO)
        self.assertEqual(self.solicitud.diagnostico, payload["diagnostico"])
        self.assertEqual(self.solicitud.indicaciones, payload["indicaciones"])
        self.assertIsNotNone(self.solicitud.atendido_en)

        # El médico vuelve a estar DISPONIBLE
        self.assertEqual(get_disponibilidad_medico(self.medico1.id), "DISPONIBLE")

        # Verifica evento RabbitMQ
        mock_publicar.assert_called_once()
        args, kwargs = mock_publicar.call_args
        self.assertEqual(kwargs["tipo"], "solicitud.atendida")
        self.assertEqual(kwargs["payload"]["solicitud_id"], self.solicitud.id)
        self.assertEqual(kwargs["payload"]["medico_id"], self.medico1.id)

    def test_completar_atencion_sin_diagnostico_es_rechazado(self):
        """Completar atención sin diagnóstico retorna 400 Bad Request."""
        self.solicitud.estado = SolicitudAtencion.Estado.EN_ATENCION
        self.solicitud.save()

        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/completar/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_medico1}")

        payload = {"diagnostico": "", "indicaciones": "Solo reposo"}
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ficha_clinica_paciente_registrado_devuelve_historial_previo(self):
        """Médico o personal autorizado ve ficha y antecedentes registrados previos."""
        # Creamos una consulta previa finalizada
        SolicitudAtencion.objects.create(
            centro=self.centro,
            modo=SolicitudAtencion.Modo.SOLICITUD,
            usuario_id=self.user_paciente.id,
            estado=SolicitudAtencion.Estado.ATENDIDO,
            diagnostico="Esguince previo grado 1",
            indicaciones="Hielo y vendaje",
            atendido_en=timezone.now(),
        )

        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/ficha-clinica/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_medico1}")

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["paciente"]["es_invitado"])
        self.assertEqual(response.data["paciente"]["nombre"], "Ana García")
        self.assertEqual(len(response.data["historial_previo"]), 1)
        self.assertEqual(response.data["historial_previo"][0]["diagnostico"], "Esguince previo grado 1")

    def test_ficha_clinica_paciente_ajeno_denegado(self):
        """Un paciente no puede acceder a la ficha clínica (403)."""
        url = f"/api/v1/atencion/solicitudes/{self.solicitud.id}/ficha-clinica/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_otro_paciente}")

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_ficha_clinica_invitado_indica_sin_historial(self):
        """Para invitados, la ficha muestra mensaje aclaratorio y sin historial previo."""
        solicitud_invitado = SolicitudAtencion.objects.create(
            centro=self.centro,
            modo=SolicitudAtencion.Modo.SOLICITUD,
            nombre_invitado="Mario Gómez",
            telefono_invitado="12345",
            estado=SolicitudAtencion.Estado.DERIVADO,
            medico_asignado=self.medico1,
        )

        url = f"/api/v1/atencion/solicitudes/{solicitud_invitado.id}/ficha-clinica/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_medico1}")

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["paciente"]["es_invitado"])
        self.assertEqual(response.data["paciente"]["nombre"], "Mario Gómez")
        self.assertIn("no posee historial", response.data["mensaje"].lower())
        self.assertEqual(response.data["historial_previo"], [])

    def test_mi_historial_paciente_registrado_exitoso(self):
        """GET /pacientes/mi-historial/ devuelve todas las atenciones del paciente autenticado."""
        url = "/api/v1/pacientes/mi-historial/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_paciente}")

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.solicitud.id)
        self.assertEqual(response.data[0]["motivo"], "Esguince de tobillo severo")

    def test_mi_historial_sin_autenticacion_retorna_401_o_403(self):
        """Sin credenciales se rechaza el acceso al historial."""
        url = "/api/v1/pacientes/mi-historial/"
        self.client.credentials()  # Sin token

        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])
