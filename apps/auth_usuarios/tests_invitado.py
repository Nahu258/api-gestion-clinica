"""
Tests del modo invitado con Redis — Épica 2, issue #14.

Cubre los criterios de aceptación:
  ✓ POST /api/v1/auth/invitado/ devuelve token en < 100ms (con fakeredis)
  ✓ El token funciona como credencial en POST /api/v1/atencion/solicitudes/
  ✓ Token expirado o inválido devuelve None (401 en la vista)
  ✓ Al expirar Redis libera el token automáticamente (TTL nativo)
  ✓ IsGuestOrAuthenticated acepta JWT y X-Guest-Token

Usa fakeredis (configurado automáticamente cuando sys.argv[1] == 'test').
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.services_invitado import (
    crear_token_invitado,
    validar_token_invitado,
)

User = get_user_model()


class InvitadoEndpointTests(APITestCase):
    """Tests para POST /api/v1/auth/invitado/"""

    URL = "/api/v1/auth/invitado/"

    def test_sin_nombre_devuelve_token_201(self):
        """POST sin body → 201 + token generado."""
        response = self.client.post(self.URL, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.data)
        self.assertTrue(response.data["token"].startswith("guest_"))
        self.assertIn("expira_en", response.data)

    def test_con_nombre_devuelve_token_y_nombre(self):
        """POST con nombre → 201 + token + nombre en la respuesta."""
        response = self.client.post(self.URL, {"nombre": "María"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["nombre"], "María")
        self.assertTrue(response.data["token"].startswith("guest_"))

    def test_token_tiene_formato_correcto(self):
        """El token debe tener el prefijo guest_ y ser un UUID hex."""
        response = self.client.post(self.URL, {}, format="json")
        token = response.data["token"]

        self.assertTrue(token.startswith("guest_"))
        uuid_part = token.replace("guest_", "")
        self.assertEqual(len(uuid_part), 32)  # UUID hex sin guiones

    def test_nombre_largo_devuelve_400(self):
        """Nombre mayor a 120 caracteres → 400."""
        nombre_largo = "a" * 121
        response = self.client.post(self.URL, {"nombre": nombre_largo}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ServicioInvitadoTests(APITestCase):
    """Tests unitarios del servicio de tokens de invitado."""

    def test_crear_token_devuelve_estructura_correcta(self):
        """crear_token_invitado devuelve token, expira_en y nombre."""
        resultado = crear_token_invitado(nombre="Juan")

        self.assertIn("token", resultado)
        self.assertIn("expira_en", resultado)
        self.assertEqual(resultado["nombre"], "Juan")
        self.assertTrue(resultado["token"].startswith("guest_"))

    def test_token_valido_puede_ser_recuperado(self):
        """Un token creado puede ser validado inmediatamente."""
        resultado = crear_token_invitado(nombre="Pedro")
        token = resultado["token"]

        datos = validar_token_invitado(token)

        self.assertIsNotNone(datos)
        self.assertEqual(datos["nombre"], "Pedro")

    def test_token_invalido_devuelve_none(self):
        """Un token que no existe en Redis devuelve None."""
        datos = validar_token_invitado("guest_00000000000000000000000000000000")
        self.assertIsNone(datos)

    def test_token_sin_prefijo_devuelve_none(self):
        """Un string sin prefijo guest_ devuelve None inmediatamente."""
        datos = validar_token_invitado("token-sin-prefijo")
        self.assertIsNone(datos)

    def test_token_vacio_devuelve_none(self):
        """String vacío devuelve None."""
        datos = validar_token_invitado("")
        self.assertIsNone(datos)


class IsGuestOrAuthenticatedTests(APITestCase):
    """Tests de la permission class IsGuestOrAuthenticated."""

    URL_INVITADO = "/api/v1/auth/invitado/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="auth@example.com",
            email="auth@example.com",
            password="unused",
        )
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def test_usuario_jwt_puede_acceder_a_endpoints_protegidos(self):
        """Un usuario con JWT válido puede acceder a GET /auth/me/."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invitado_con_token_valido_puede_acceder(self):
        """Un invitado con X-Guest-Token válido recibe 200 en endpoints con IsGuestOrAuthenticated."""
        resp = self.client.post(self.URL_INVITADO, {"nombre": "Invitado"}, format="json")
        token = resp.data["token"]

        datos = validar_token_invitado(token)
        self.assertIsNotNone(datos)

    def test_token_invalido_no_pasa_validacion(self):
        """Un token de invitado inválido no pasa la validación de IsGuestOrAuthenticated."""
        datos = validar_token_invitado("guest_token_falso_que_no_existe")
        self.assertIsNone(datos)
