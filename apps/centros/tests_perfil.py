"""
Tests de la ficha del centro editable por su operador — Épica 5, AE5-13 (#43).
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import CentroEmergencia

User = get_user_model()
Rol = PerfilExtendido.Rol


def _usuario(email, rol, centro=None):
    user = User.objects.create_user(username=email, email=email, password="pass")
    PerfilExtendido.objects.create(usuario=user, rol=rol, centro=centro)
    return user


def _centro(nombre):
    return CentroEmergencia.objects.create(
        nombre=nombre, tipo="hospital", direccion="Calle 1", latitud=-27.37, longitud=-55.9,
        telefono="111", atiende_24h=False,
    )


class PerfilCentroTests(APITestCase):
    def setUp(self):
        self.centro = _centro("Hospital A")
        self.otro = _centro("Hospital B")
        self.admin = _usuario("admin@test.com", Rol.ADMIN)
        self.operador = _usuario("op@test.com", Rol.OPERADOR_CENTRO, centro=self.centro)
        self.paciente = _usuario("pac@test.com", Rol.PACIENTE)
        self.url = f"/api/v1/centros/{self.centro.id}/perfil/"

    def _como(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")

    def test_operador_ve_y_edita_datos_permitidos(self):
        self._como(self.operador)
        ficha = self.client.get(self.url).data
        self.assertEqual(ficha["nombre"], "Hospital A")
        self.assertEqual([a["email"] for a in ficha["administradores"]], ["op@test.com"])

        response = self.client.patch(
            self.url,
            {"telefono": "0376 444-5555", "atiende_24h": True, "direccion": "Av. Nueva 123",
             "latitud": "-27.3800000", "longitud": "-55.9100000"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.centro.refresh_from_db()
        self.assertEqual(self.centro.telefono, "0376 444-5555")
        self.assertTrue(self.centro.atiende_24h)
        self.assertEqual(self.centro.direccion, "Av. Nueva 123")

        # La vista pública refleja el cambio
        publico = self.client.get(f"/api/v1/centros/{self.centro.id}/")
        self.assertEqual(publico.data["telefono"], "0376 444-5555")

    def test_operador_no_puede_tocar_nombre_tipo_ni_activo(self):
        self._como(self.operador)
        response = self.client.patch(self.url, {"nombre": "Otro", "telefono": "999", "activo": False}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["codigo"], "CAMPOS_NO_PERMITIDOS")
        self.assertEqual(set(response.data["error"]["detalles"]), {"activo", "nombre"})
        self.centro.refresh_from_db()
        self.assertEqual(self.centro.nombre, "Hospital A")
        self.assertEqual(self.centro.telefono, "111")

    def test_admin_puede_cambiar_nombre(self):
        self._como(self.admin)
        response = self.client.patch(self.url, {"nombre": "Hospital Renombrado"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["nombre"], "Hospital Renombrado")

    def test_valida_coordenadas(self):
        self._como(self.operador)
        response = self.client.patch(self.url, {"latitud": "120"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("latitud", response.data["error"]["detalles"])

    def test_solo_su_centro(self):
        self._como(self.operador)
        otro = f"/api/v1/centros/{self.otro.id}/perfil/"
        self.assertEqual(self.client.get(otro).status_code, 403)
        self.assertEqual(self.client.patch(otro, {"telefono": "1"}, format="json").status_code, 403)
        self._como(self.paciente)
        self.assertEqual(self.client.get(self.url).status_code, 403)
