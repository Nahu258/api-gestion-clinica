"""
Tests de autenticación con Google OAuth2 — Épica 2, issue #13.

Cubre los criterios de aceptación:
  ✓ POST /api/v1/auth/google/ con id_token válido devuelve JWT (201)
  ✓ id_token inválido o expirado devuelve 401
  ✓ Un segundo login con el mismo Google account recupera el mismo usuario
  ✓ GET /api/v1/auth/me/ requiere Authorization: Bearer <token> y devuelve email, nombre, foto
  ✓ POST /api/v1/auth/refresh/ renueva el access_token

Usa mock de google.oauth2.id_token.verify_oauth2_token para no requerir
conexión a Google en CI/CD.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

PAYLOAD_GOOGLE_VALIDO = {
    "sub": "google-uid-12345",
    "email": "juan@example.com",
    "name": "Juan Pérez",
    "picture": "https://lh3.googleusercontent.com/foto.jpg",
    "email_verified": True,
    "aud": "mi-client-id.apps.googleusercontent.com",
}


class GoogleLoginTests(APITestCase):
    """Tests para POST /api/v1/auth/google/"""

    URL = "/api/v1/auth/google/"

    @patch("apps.auth_usuarios.services.google_id_token.verify_oauth2_token")
    def test_login_exitoso_devuelve_jwt_201(self, mock_verify):
        """Token válido de Google → 201 + access_token + refresh_token."""
        mock_verify.return_value = PAYLOAD_GOOGLE_VALIDO

        response = self.client.post(self.URL, {"id_token": "token-valido-de-google"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access_token", response.data)
        self.assertIn("refresh_token", response.data)
        self.assertEqual(response.data["token_type"], "Bearer")
        self.assertEqual(response.data["usuario"]["email"], "juan@example.com")

    @patch("apps.auth_usuarios.services.google_id_token.verify_oauth2_token")
    def test_segundo_login_recupera_mismo_usuario(self, mock_verify):
        """Dos logins con el mismo Google account NO duplican el usuario."""
        mock_verify.return_value = PAYLOAD_GOOGLE_VALIDO

        self.client.post(self.URL, {"id_token": "token-1"}, format="json")
        self.client.post(self.URL, {"id_token": "token-2"}, format="json")

        self.assertEqual(User.objects.filter(username="juan@example.com").count(), 1)

    @patch("apps.auth_usuarios.services.google_id_token.verify_oauth2_token")
    def test_token_invalido_devuelve_401(self, mock_verify):
        """Token inválido o expirado → 401."""
        from google.auth.exceptions import GoogleAuthError
        mock_verify.side_effect = GoogleAuthError("Token expirado")

        response = self.client.post(self.URL, {"id_token": "token-invalido"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("error", response.data)

    def test_sin_id_token_devuelve_400(self):
        """Body sin id_token → 400 Bad Request."""
        response = self.client.post(self.URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MeEndpointTests(APITestCase):
    """Tests para GET /api/v1/auth/me/"""

    URL = "/api/v1/auth/me/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="test@example.com",
            email="test@example.com",
            first_name="Test",
            last_name="User",
            password="unused",
        )
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def test_me_con_token_valido_devuelve_perfil(self):
        """GET /me/ con Bearer token válido → 200 + email, nombre, foto_url."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.get(self.URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "test@example.com")
        self.assertEqual(response.data["nombre"], "Test User")
        self.assertIn("foto_url", response.data)

    def test_me_sin_token_devuelve_401(self):
        """GET /me/ sin Authorization header → 401."""
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RefreshTokenTests(APITestCase):
    """Tests para POST /api/v1/auth/refresh/"""

    URL = "/api/v1/auth/refresh/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="refresh@example.com",
            email="refresh@example.com",
            password="unused",
        )
        refresh = RefreshToken.for_user(self.user)
        self.refresh_token = str(refresh)

    def test_refresh_valido_devuelve_nuevo_access_token(self):
        """Refresh token válido → 200 + access_token nuevo."""
        response = self.client.post(self.URL, {"refresh": self.refresh_token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access_token", response.data)

    def test_refresh_invalido_devuelve_401(self):
        """Refresh token inválido → 401."""
        response = self.client.post(self.URL, {"refresh": "token-falso"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sin_refresh_token_devuelve_400(self):
        """Body vacío → 400."""
        response = self.client.post(self.URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
