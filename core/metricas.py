"""
AE4 - Métricas Prometheus de la API (expuestas en GET /metrics).

Convención: nombres en snake_case con prefijo `emergenciaya_`, etiquetas de
baja cardinalidad (la RUTA es el patrón `atencion/solicitudes/<int:id>/`,
nunca la URL con el id, para no crear una serie por solicitud).
"""

from prometheus_client import Counter, Gauge, Histogram

# ── HTTP (las llena el middleware de observabilidad) ─────────────────────────
peticiones = Counter(
    "emergenciaya_http_peticiones_total",
    "Peticiones HTTP atendidas",
    ["metodo", "ruta", "estado"],
)
duracion = Histogram(
    "emergenciaya_http_duracion_segundos",
    "Latencia de las peticiones HTTP",
    ["metodo", "ruta"],
    buckets=(0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.5, 5.0),
)
en_curso = Gauge("emergenciaya_http_en_curso", "Peticiones HTTP en curso")

# ── Eventos de dominio (RabbitMQ) ────────────────────────────────────────────
eventos_publicados = Counter(
    "emergenciaya_eventos_publicados_total",
    "Eventos publicados en RabbitMQ por resultado",
    ["tipo", "resultado"],  # resultado: ok | error | circuito_abierto
)
eventos_consumidos = Counter(
    "emergenciaya_eventos_consumidos_total",
    "Eventos procesados por los consumidores",
    ["consumidor", "resultado"],
)

# ── Resiliencia ──────────────────────────────────────────────────────────────
estado_circuito = Gauge(
    "emergenciaya_circuit_breaker_estado",
    "Estado del circuit breaker: 0 cerrado, 1 semiabierto, 2 abierto",
    ["dependencia"],
)
transiciones_circuito = Counter(
    "emergenciaya_circuit_breaker_transiciones_total",
    "Cambios de estado del circuit breaker",
    ["dependencia", "hacia"],
)
llamadas_rechazadas = Counter(
    "emergenciaya_circuit_breaker_rechazos_total",
    "Llamadas no intentadas porque el circuito estaba abierto",
    ["dependencia"],
)
reintentos = Counter(
    "emergenciaya_reintentos_total",
    "Reintentos ante fallas transitorias",
    ["dependencia"],
)

# ── Negocio ──────────────────────────────────────────────────────────────────
solicitudes_creadas = Counter(
    "emergenciaya_solicitudes_creadas_total",
    "Avisos/solicitudes de atención creados",
    ["modo", "tipo_paciente"],  # tipo_paciente: invitado | registrado
)
