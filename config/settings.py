"""
Configuracion central del proyecto Django.

Todo lo que cambia entre "mi notebook" y "el server" vive en el archivo .env,
no aca. Este archivo solo LEE esas variables.
"""

from pathlib import Path

from dotenv import load_dotenv
import os
import sys

# BASE_DIR apunta a la carpeta que contiene manage.py
BASE_DIR = Path(__file__).resolve().parent.parent

# Carga las variables definidas en .env dentro de os.environ
load_dotenv(BASE_DIR / ".env")


def env(clave: str, por_defecto: str = "") -> str:
    """Lee una variable de entorno como texto."""
    return os.environ.get(clave, por_defecto)


def env_bool(clave: str, por_defecto: bool = False) -> bool:
    """Lee una variable de entorno como booleano ('True', '1', 'yes'...)."""
    valor = os.environ.get(clave)
    if valor is None:
        return por_defecto
    return valor.strip().lower() in ("1", "true", "yes", "on", "si")


def env_list(clave: str, por_defecto: str = "") -> list[str]:
    """Lee una variable separada por comas y la devuelve como lista."""
    crudo = os.environ.get(clave, por_defecto)
    return [item.strip() for item in crudo.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Seguridad y modo de ejecucion
# ---------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY", "clave-insegura-solo-para-desarrollo")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost")

# ---------------------------------------------------------------------------
# Aplicaciones instaladas
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    # Apps que trae Django
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Librerias de terceros
    "rest_framework",
    "corsheaders",
    "rest_framework_simplejwt",
    "apps.turnos",
    "apps.clinica",
    "apps.centros",
    "apps.atencion",
    # Épica 2: autenticación
    "apps.auth_usuarios",
]

# ---------------------------------------------------------------------------
# Middleware: cadena de funciones por la que pasa TODA request y TODA response.
# El orden importa: se ejecutan de arriba hacia abajo en la entrada.
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Middleware propio: captura cualquier excepcion no controlada y responde
    # un JSON 500 estandarizado en vez de un HTML de error.
    "core.middleware.ManejadorCentralizadoDeErroresMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Base de datos (capa de persistencia)
# ---------------------------------------------------------------------------
# AE2: si DATABASE_ENGINE=postgres se usa PostgreSQL (el que levanta
# docker-compose). Si no, queda SQLite como en el AE1, asi los tests y el
# arranque rapido siguen funcionando sin Docker.
if env("DATABASE_ENGINE", "sqlite").lower() == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "clinica"),
            "USER": env("POSTGRES_USER", "clinica"),
            "PASSWORD": env("POSTGRES_PASSWORD", "clinica"),
            "HOST": env("POSTGRES_HOST", "localhost"),
            "PORT": env("POSTGRES_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / env("DATABASE_NAME", "db.sqlite3"),
        }
    }

# ---------------------------------------------------------------------------
# AE2: Redis (cache / estado temporal) y RabbitMQ (mensajeria asincronica)
# ---------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")
RABBITMQ_URL = env("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
# Si es False, la API no publica eventos (util para correr sin RabbitMQ).
EVENTOS_HABILITADOS = env_bool("EVENTOS_HABILITADOS", True)

# Los tests usan un Redis en memoria y no publican en RabbitMQ, asi corren
# en cualquier compu sin tener los contenedores levantados.
if len(sys.argv) > 1 and sys.argv[1] == "test":
    REDIS_URL = "fakeredis://"
    EVENTOS_HABILITADOS = False

# ---------------------------------------------------------------------------
# Épica 2: Google OAuth2
# ---------------------------------------------------------------------------
# El frontend usa Google Identity Services para obtener un id_token;
# el backend lo verifica con esta Client ID. Sin ella, el endpoint
# POST /api/v1/auth/google/ devuelve 401 (hasta que se configure).
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", "TU_GOOGLE_CLIENT_ID_ACA")

# Archivos generados (comprobantes PDF)
MEDIA_ROOT = BASE_DIR / env("MEDIA_DIR", "media")

# ---------------------------------------------------------------------------
# Validadores de contrasena (solo aplican al admin de Django)
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# Internacionalizacion
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Buenos_Aires"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    # Todas las respuestas de error de DRF (400, 404, 405...) pasan por
    # nuestro handler para tener SIEMPRE el mismo formato JSON.
    "EXCEPTION_HANDLER": "core.exceptions.manejador_de_excepciones",
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        # API navegable en el browser: comoda para la demo en vivo.
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_PAGINATION_CLASS": None,
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%S%z",
    # Épica 2: autenticación JWT via simplejwt
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        # Por defecto todas las vistas son abiertas; las que necesitan auth
        # declaran permission_classes=[IsAuthenticated] explicitamente.
        "rest_framework.permissions.AllowAny",
    ],
}

# ---------------------------------------------------------------------------
# CORS: que origenes (front-ends) pueden consumir esta API
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = False

# ---------------------------------------------------------------------------
# Cache y estado efimero (Redis): historial clinico y eventos ya procesados
# ---------------------------------------------------------------------------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", "redis://127.0.0.1:6379/1"),
        # Si Redis no responde, no colgar la request: se cae a la base.
        "OPTIONS": {"socket_connect_timeout": 1, "socket_timeout": 1},
    }
}

# ---------------------------------------------------------------------------
# Mensajeria (RabbitMQ): eventos TurnoCreado / TurnoAtendido
# ---------------------------------------------------------------------------
RABBITMQ_URL = env(
    "RABBITMQ_URL",
    "amqp://guest:guest@127.0.0.1:5672/%2F?connection_attempts=1&socket_timeout=2",
)

# ---------------------------------------------------------------------------
# Logs: los errores de cache y mensajeria se ven en consola
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"consola": {"class": "logging.StreamHandler"}},
    "loggers": {"apps": {"handlers": ["consola"], "level": "INFO"}},
}
