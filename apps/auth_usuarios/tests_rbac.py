"""
Tests para RBAC (Control de acceso basado en roles) — Épica 4, issue #21 (AE4-11).
"""

from unittest.mock import patch
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.auth_usuarios.permissions import (
    IsAdminUserRole,
    IsMedicoEspecialista,
    IsOperadorCentro,
    IsPacienteRegistrado,
    IsStaffOrOwner,
)
from apps.auth_usuarios.services import generar_jwt_para_usuario
from apps.centros.models import CentroEmergencia
from apps.clinica.models import Medico

User = get_user_model()


class DummyAdminView(APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        return Response({"ok": True})


class DummyOperadorView(APIView):
    permission_classes = [IsOperadorCentro]

    def get(self, request):
        return Response({"ok": True})


class DummyMedicoView(APIView):
    permission_classes = [IsMedicoEspecialista]

    def get(self, request):
        return Response({"ok": True})


class DummyPacienteView(APIView):
    permission_classes = [IsPacienteRegistrado]

    def get(self, request):
        return Response({"ok": True})


class DummyOwnerObject:
    def __init__(self, usuario):
        self.usuario = usuario


class DummyOwnerView(APIView):
    permission_classes = [IsStaffOrOwner]

    def get(self, request):
        target_user_id = request.query_params.get("user_id")
        owner = User.objects.get(pk=target_user_id) if target_user_id else request.user
        obj = DummyOwnerObject(owner)
        self.check_object_permissions(request, obj)
        return Response({"ok": True})


class RBACTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

        # Centro y médico de prueba
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital SAMIC Test",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Av. Test 123",
            latitud=-27.36,
            longitud=-55.90,
        )
        self.medico = Medico.objects.create(
            nombre="Dr. Gregory House",
            especialidad=Medico.Especialidad.CLINICA_MEDICA,
        )

        # Usuarios con distintos roles
        self.paciente = User.objects.create_user(
            username="paciente@test.com", email="paciente@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.paciente, rol=PerfilExtendido.Rol.PACIENTE
        )

        self.otro_paciente = User.objects.create_user(
            username="otro_paciente@test.com", email="otro_paciente@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.otro_paciente, rol=PerfilExtendido.Rol.PACIENTE
        )

        self.operador = User.objects.create_user(
            username="operador@test.com", email="operador@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.operador,
            rol=PerfilExtendido.Rol.OPERADOR_CENTRO,
            centro=self.centro,
        )

        self.doctor = User.objects.create_user(
            username="doctor@test.com", email="doctor@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.doctor,
            rol=PerfilExtendido.Rol.MEDICO,
            centro=self.centro,
            medico=self.medico,
        )

        self.admin = User.objects.create_user(
            username="admin@test.com", email="admin@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.admin, rol=PerfilExtendido.Rol.ADMIN
        )

    def test_claims_jwt_contienen_rol_centro_y_medico(self):
        """Los tokens JWT emitidos contienen rol, centro_id y medico_id."""
        tokens = generar_jwt_para_usuario(self.doctor)
        access_token_str = tokens["access_token"]
        token = AccessToken(access_token_str)

        self.assertEqual(token["rol"], "MEDICO")
        self.assertEqual(token["centro_id"], self.centro.id)
        self.assertEqual(token["medico_id"], self.medico.id)

    def test_get_me_devuelve_rol_y_asociaciones(self):
        """GET /api/v1/auth/me/ devuelve el rol, centro_id y medico_id."""
        tokens = generar_jwt_para_usuario(self.operador)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["rol"], "OPERADOR_CENTRO")
        self.assertEqual(response.data["centro_id"], self.centro.id)
        self.assertIsNone(response.data["medico_id"])

    @patch("apps.auth_usuarios.services.google_id_token.verify_oauth2_token")
    def test_login_google_asigna_rol_paciente_por_defecto(self, mock_verify):
        """Al autenticarse por primera vez con Google se crea el perfil con rol PACIENTE."""
        mock_verify.return_value = {
            "sub": "google-uid-new",
            "email": "nuevo_paciente@example.com",
            "name": "Nuevo Paciente",
            "picture": "https://lh3.googleusercontent.com/foto_new.jpg",
            "email_verified": True,
            "aud": "mi-client-id.apps.googleusercontent.com",
        }

        response = self.client.post(
            "/api/v1/auth/google/",
            {"id_token": "token-nuevo-google"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["usuario"]["rol"], "PACIENTE")

        usuario_db = User.objects.get(email="nuevo_paciente@example.com")
        self.assertEqual(usuario_db.perfil.rol, PerfilExtendido.Rol.PACIENTE)

    def test_is_admin_user_role_permisos(self):
        """IsAdminUserRole solo permite acceso a rol ADMIN."""
        view = DummyAdminView.as_view()

        # Admin -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.admin)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Paciente -> 403
        req = self.factory.get("/")
        force_authenticate(req, user=self.paciente)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Médico -> 403
        req = self.factory.get("/")
        force_authenticate(req, user=self.doctor)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_is_operador_centro_permisos(self):
        """IsOperadorCentro permite acceso a OPERADOR_CENTRO y ADMIN, pero deniega a otros."""
        view = DummyOperadorView.as_view()

        # Operador -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.operador)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Admin -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.admin)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Médico -> 403
        req = self.factory.get("/")
        force_authenticate(req, user=self.doctor)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Paciente -> 403
        req = self.factory.get("/")
        force_authenticate(req, user=self.paciente)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_is_medico_especialista_permisos(self):
        """IsMedicoEspecialista permite acceso a MEDICO y ADMIN, pero deniega a otros."""
        view = DummyMedicoView.as_view()

        # Doctor -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.doctor)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Admin -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.admin)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Operador -> 403
        req = self.factory.get("/")
        force_authenticate(req, user=self.operador)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Paciente -> 403
        req = self.factory.get("/")
        force_authenticate(req, user=self.paciente)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_is_paciente_registrado_permisos(self):
        """IsPacienteRegistrado permite PACIENTE y ADMIN."""
        view = DummyPacienteView.as_view()

        # Paciente -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.paciente)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Admin -> 200
        req = self.factory.get("/")
        force_authenticate(req, user=self.admin)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_is_staff_or_owner_permisos(self):
        """IsStaffOrOwner permite al dueño del recurso o a personal médico/operativo."""
        view = DummyOwnerView.as_view()

        # Dueño accediendo a su propio recurso -> 200
        req = self.factory.get(f"/?user_id={self.paciente.id}")
        force_authenticate(req, user=self.paciente)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Otro paciente intentando acceder al recurso de otro -> 403
        req = self.factory.get(f"/?user_id={self.paciente.id}")
        force_authenticate(req, user=self.otro_paciente)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Médico accediendo al recurso del paciente -> 200
        req = self.factory.get(f"/?user_id={self.paciente.id}")
        force_authenticate(req, user=self.doctor)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Operador accediendo al recurso del paciente -> 200
        req = self.factory.get(f"/?user_id={self.paciente.id}")
        force_authenticate(req, user=self.operador)
        res = view(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

