"""
Capa de servicios — Autenticación con Google OAuth2.

Flujo completo:
  1. Frontend abre popup de Google Identity Services
  2. Google devuelve un id_token al frontend
  3. Frontend hace POST /api/v1/auth/google/ con el id_token
  4. Este servicio verifica el token con google-auth
  5. Crea o recupera el User de Django con los datos del token
  6. Devuelve access_token + refresh_token (JWT propios via simplejwt)

Dependencias en requirements.txt:
  - google-auth==2.40.0
  - djangorestframework-simplejwt==5.5.0
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth.exceptions import GoogleAuthError
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)

User = get_user_model()


class TokenGoogleInvalidoError(Exception):
    """El id_token de Google es inválido, expirado o no corresponde a nuestra app."""
    pass


def verificar_id_token_google(id_token: str) -> dict:
    """
    Verifica el id_token de Google y devuelve el payload con los datos del usuario.

    Lanza TokenGoogleInvalidoError si el token es inválido, expirado o
    el audience no coincide con GOOGLE_CLIENT_ID.

    Parámetros:
        id_token (str): JWT firmado por Google.

    Retorna:
        dict con al menos: sub, email, name, picture.
    """
    client_id = settings.GOOGLE_CLIENT_ID
    if not client_id or client_id == "TU_GOOGLE_CLIENT_ID_ACA":
        raise TokenGoogleInvalidoError("GOOGLE_CLIENT_ID no está configurado.")

    try:
        payload = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            client_id,
        )
    except (GoogleAuthError, ValueError) as exc:
        logger.warning("id_token de Google rechazado: %s", exc)
        raise TokenGoogleInvalidoError(str(exc)) from exc

    return payload


def obtener_o_crear_usuario(payload: dict) -> User:
    """
    Dado el payload verificado de Google, crea o recupera el User de Django.

    Usa el email como identificador único; si el usuario ya existe NO duplica
    la cuenta (criterio de aceptación: un segundo login recupera el mismo user).
    """
    email = payload.get("email", "").lower()
    nombre_completo = payload.get("name", "")
    partes = nombre_completo.split(" ", 1)
    first_name = partes[0] if partes else ""
    last_name = partes[1] if len(partes) > 1 else ""

    user, created = User.objects.get_or_create(
        username=email,
        defaults={
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
        },
    )

    if not created:
        user.first_name = first_name
        user.last_name = last_name
        user.save(update_fields=["first_name", "last_name"])

    foto_url = payload.get("picture", "")
    _guardar_foto_si_existe(user, foto_url)

    logger.info(
        "Usuario %s (%s) — %s",
        user.pk,
        email,
        "creado" if created else "recuperado",
    )
    return user


def _guardar_foto_si_existe(user: User, foto_url: str) -> None:
    """Guarda foto_url en PerfilExtendido si ese modelo existe en la DB."""
    try:
        from apps.auth_usuarios.models import PerfilExtendido  # noqa: PLC0415
        perfil, _ = PerfilExtendido.objects.get_or_create(usuario=user)
        if foto_url and perfil.foto_url != foto_url:
            perfil.foto_url = foto_url
            perfil.save(update_fields=["foto_url"])
    except Exception:  # noqa: BLE001
        pass


def generar_jwt_para_usuario(user: User) -> dict:
    """
    Genera un par de tokens JWT (access + refresh) para el usuario dado.

    Retorna:
        {
            "access_token": str,
            "refresh_token": str,
            "token_type": "Bearer",
        }
    """
    refresh = RefreshToken.for_user(user)
    return {
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
        "token_type": "Bearer",
    }


def autenticar_con_google(id_token: str) -> dict:
    """
    Función de entrada: verifica el token, obtiene/crea el usuario y devuelve JWT.

    Lanza TokenGoogleInvalidoError si el token no es válido.
    """
    payload = verificar_id_token_google(id_token)
    user = obtener_o_crear_usuario(payload)
    tokens = generar_jwt_para_usuario(user)

    return {
        **tokens,
        "usuario": {
            "id": user.pk,
            "email": user.email,
            "nombre": f"{user.first_name} {user.last_name}".strip(),
            "foto_url": payload.get("picture", ""),
        },
    }
