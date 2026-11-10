"""
AE4 - Observabilidad: correlación, logs estructurados, trazas y métricas.

  * Correlación: cada petición lleva un trace_id. Se toma del header
    X-Request-ID (si lo manda un proxy o el cliente) o se genera; se devuelve
    en la respuesta y viaja dentro de cada evento de RabbitMQ, así el log del
    consumidor se puede unir con el de la petición que lo originó.

  * Logs estructurados: una línea JSON por registro, con trace_id y span_id.
    `docker compose logs api consumidor | grep <trace_id>` reconstruye el
    recorrido completo de un aviso.

  * Trazas: `span("nombre")` mide una operación y registra su duración con
    su span padre (modelo de OpenTelemetry, emitido como log JSON).

  * Métricas: el middleware alimenta core.metricas; GET /metrics las expone
    en formato Prometheus.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import time
import uuid
from contextlib import contextmanager

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from core import metricas

logger = logging.getLogger("emergenciaya.http")
logger_trazas = logging.getLogger("emergenciaya.trazas")

trace_id_actual: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="-")
span_id_actual: contextvars.ContextVar[str] = contextvars.ContextVar("span_id", default="-")

HEADER_REQUEST_ID = "X-Request-ID"
_ID_VALIDO = re.compile(r"^[A-Za-z0-9\-_.]{8,64}$")  # no se aceptan valores arbitrarios en los logs


def nuevo_id() -> str:
    return uuid.uuid4().hex


def _nuevo_span_id() -> str:
    return uuid.uuid4().hex[:16]


# ─────────────────────────────────────────────────────────────────────────────
# Trazas
# ─────────────────────────────────────────────────────────────────────────────
@contextmanager
def span(nombre: str, **atributos):
    """Mide una operación como un span hijo del span actual."""
    padre = span_id_actual.get()
    propio = _nuevo_span_id()
    token = span_id_actual.set(propio)
    inicio = time.perf_counter()
    estado = "ok"
    try:
        yield
    except Exception:
        estado = "error"
        raise
    finally:
        span_id_actual.reset(token)
        logger_trazas.info(
            "span %s", nombre,
            extra={
                "span": nombre, "span_id": propio, "span_padre": padre,
                "duracion_ms": round((time.perf_counter() - inicio) * 1000, 2),
                "estado": estado, **atributos,
            },
        )


@contextmanager
def contexto_de_traza(trace_id: str | None):
    """Restaura la traza que trae un mensaje (lado consumidor de RabbitMQ)."""
    t1 = trace_id_actual.set(trace_id if trace_id and _ID_VALIDO.match(trace_id) else nuevo_id())
    t2 = span_id_actual.set("-")
    try:
        yield
    finally:
        trace_id_actual.reset(t1)
        span_id_actual.reset(t2)


# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
class FiltroDeTraza(logging.Filter):
    """Agrega trace_id y span_id a todos los registros."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = trace_id_actual.get()
        if not hasattr(record, "span_id"):
            record.span_id = span_id_actual.get()
        return True


_CAMPOS_ESTANDAR = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {"message", "asctime"}


class FormatoJSON(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        datos = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}",
            "nivel": record.levelname,
            "logger": record.name,
            "mensaje": record.getMessage(),
            "servicio": getattr(settings, "NOMBRE_SERVICIO", "api"),
        }
        for clave, valor in vars(record).items():
            if clave not in _CAMPOS_ESTANDAR and not clave.startswith("_"):
                datos[clave] = valor
        if record.exc_info:
            datos["excepcion"] = self.formatException(record.exc_info)
        return json.dumps(datos, ensure_ascii=False, default=str)


# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────
class ObservabilidadMiddleware:
    """Asigna el trace_id, mide la petición y escribe el log de acceso."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/metrics":
            return self.get_response(request)

        entrante = request.headers.get(HEADER_REQUEST_ID, "")
        trace_id = entrante if _ID_VALIDO.match(entrante) else nuevo_id()
        t_trace = trace_id_actual.set(trace_id)
        t_span = span_id_actual.set(_nuevo_span_id())
        metricas.en_curso.inc()
        inicio = time.perf_counter()
        estado = 500
        try:
            response = self.get_response(request)
            estado = response.status_code
            response[HEADER_REQUEST_ID] = trace_id
            return response
        finally:
            duracion = time.perf_counter() - inicio
            metricas.en_curso.dec()
            ruta = _ruta(request)
            metricas.peticiones.labels(request.method, ruta, str(estado)).inc()
            metricas.duracion.labels(request.method, ruta).observe(duracion)
            usuario = getattr(request, "user", None)
            logger.info(
                "%s %s %s", request.method, request.path, estado,
                extra={
                    "metodo": request.method, "ruta": ruta, "estado": estado,
                    "duracion_ms": round(duracion * 1000, 2),
                    "usuario_id": usuario.id if usuario is not None and usuario.is_authenticated else None,
                },
            )
            trace_id_actual.reset(t_trace)
            span_id_actual.reset(t_span)


def _ruta(request) -> str:
    """Patrón de la URL (baja cardinalidad); 'sin_ruta' para los 404."""
    match = getattr(request, "resolver_match", None)
    if match is None:
        return "sin_ruta"
    if not match.route:
        return match.view_name or "sin_ruta"
    # Las rutas de re_path traen la regex: ^solicitudes/(?P<solicitud_id>\d+)/?$
    # -> solicitudes/<solicitud_id>/
    ruta = _GRUPO_REGEX.sub(r"<\1>", match.route)
    return _ANCLAS_REGEX.sub("", ruta) or "/"


_GRUPO_REGEX = re.compile(r"\(\?P<(\w+)>[^)]*\)")
_ANCLAS_REGEX = re.compile(r"\^|\?\$$|\$$")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint /metrics
# ─────────────────────────────────────────────────────────────────────────────
def vista_metricas(request):
    """
    Formato de texto de Prometheus. Si METRICS_TOKEN está configurado
    (producción), exige `Authorization: Bearer <token>`: las métricas
    revelan rutas y volumen de tráfico y no deben quedar públicas.
    """
    token = getattr(settings, "METRICS_TOKEN", "")
    if token and request.headers.get("Authorization", "") != f"Bearer {token}":
        return HttpResponseForbidden("metrics: token requerido")
    return HttpResponse(generate_latest(), content_type=CONTENT_TYPE_LATEST)
