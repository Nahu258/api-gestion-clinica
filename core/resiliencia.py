"""
AE4 - Resiliencia frente a fallas parciales de dependencias externas.

Dos patrones, combinados en `llamada_protegida`:

  * Reintentos con backoff exponencial y jitter: absorben fallas transitorias
    (un reinicio de RabbitMQ, un corte de red de un segundo).

  * Circuit Breaker: si la dependencia falla varias veces seguidas, el
    circuito se ABRE y durante `tiempo_abierto` segundos las llamadas fallan
    al instante, sin esperar timeouts. Así una dependencia caída no arrastra
    la latencia de toda la API (cada aviso esperaría varios segundos).

        CERRADO ──(N fallas seguidas)──> ABIERTO ──(pasa tiempo_abierto)──> SEMIABIERTO
           ^                                                                    │
           └──────────────(la llamada de prueba sale bien)──────────────────────┘
                          (si falla, vuelve a ABIERTO)

El estado es por proceso, igual que en librerías como pybreaker o resilience4j:
cada réplica de la API aprende por su cuenta que la dependencia está caída.
"""

from __future__ import annotations

import logging
import random
import socket
import threading
import time
from typing import Callable, TypeVar

from core import metricas

logger = logging.getLogger(__name__)

T = TypeVar("T")

CERRADO = "cerrado"
ABIERTO = "abierto"
SEMIABIERTO = "semiabierto"
VALOR_ESTADO = {CERRADO: 0, SEMIABIERTO: 1, ABIERTO: 2}


class CircuitoAbierto(Exception):
    """La dependencia está marcada como caída: no se intenta la llamada."""


class CircuitBreaker:
    def __init__(self, nombre: str, umbral_fallas: int = 3, tiempo_abierto: float = 30.0):
        self.nombre = nombre
        self.umbral_fallas = umbral_fallas
        self.tiempo_abierto = tiempo_abierto
        self._lock = threading.Lock()
        self._estado = CERRADO
        self._fallas_seguidas = 0
        self._abierto_desde = 0.0
        metricas.estado_circuito.labels(dependencia=nombre).set(0)

    # ── estado ──────────────────────────────────────────────────────────────
    @property
    def estado(self) -> str:
        with self._lock:
            return self._estado_actual()

    def _estado_actual(self) -> str:
        if self._estado == ABIERTO and time.monotonic() - self._abierto_desde >= self.tiempo_abierto:
            self._cambiar(SEMIABIERTO)
        return self._estado

    def _cambiar(self, nuevo: str) -> None:
        if nuevo != self._estado:
            logger.warning(
                "Circuit breaker %s: %s -> %s", self.nombre, self._estado, nuevo,
                extra={"dependencia": self.nombre, "estado_circuito": nuevo},
            )
            self._estado = nuevo
            metricas.estado_circuito.labels(dependencia=self.nombre).set(VALOR_ESTADO[nuevo])
            metricas.transiciones_circuito.labels(dependencia=self.nombre, hacia=nuevo).inc()

    # ── uso ─────────────────────────────────────────────────────────────────
    def llamar(self, funcion: Callable[[], T]) -> T:
        with self._lock:
            if self._estado_actual() == ABIERTO:
                metricas.llamadas_rechazadas.labels(dependencia=self.nombre).inc()
                raise CircuitoAbierto(f"{self.nombre} no disponible (circuito abierto)")
        try:
            resultado = funcion()
        except Exception:
            self._registrar_falla()
            raise
        self._registrar_exito()
        return resultado

    def _registrar_exito(self) -> None:
        with self._lock:
            self._fallas_seguidas = 0
            self._cambiar(CERRADO)

    def _registrar_falla(self) -> None:
        with self._lock:
            self._fallas_seguidas += 1
            if self._estado == SEMIABIERTO or self._fallas_seguidas >= self.umbral_fallas:
                self._abierto_desde = time.monotonic()
                self._cambiar(ABIERTO)

    def reiniciar(self) -> None:
        """Vuelve a CERRADO (para los tests)."""
        with self._lock:
            self._fallas_seguidas = 0
            self._cambiar(CERRADO)


def con_reintentos(
    funcion: Callable[[], T],
    intentos: int = 3,
    espera_base: float = 0.2,
    reintentar_si: tuple[type[BaseException], ...] = (Exception,),
    nombre: str = "",
) -> T:
    """
    Ejecuta `funcion` hasta `intentos` veces. Entre intento e intento espera
    espera_base * 2^n más un jitter aleatorio (evita que todas las réplicas
    reintenten exactamente al mismo tiempo).
    """
    for intento in range(1, intentos + 1):
        try:
            return funcion()
        except reintentar_si as error:
            if intento == intentos:
                raise
            espera = espera_base * (2 ** (intento - 1)) * (1 + random.random() * 0.5)
            metricas.reintentos.labels(dependencia=nombre or "desconocida").inc()
            logger.warning(
                "Falla transitoria en %s (intento %d/%d): %s. Reintento en %.2f s",
                nombre, intento, intentos, error.__class__.__name__, espera,
            )
            time.sleep(espera)
    raise AssertionError("inalcanzable")


def resolver_con_timeout(host: str, puerto: int, timeout: float = 1.0) -> None:
    """
    Resuelve el nombre del host con un tiempo máximo.

    El socket_timeout de pika no cubre la resolución DNS: con el contenedor de
    RabbitMQ detenido, el DNS interno de Docker tarda ~4 s en contestar que el
    nombre no existe, y cada intento de publicar quedaba bloqueado ese tiempo.
    Se resuelve en un hilo aparte y, si no contesta a tiempo, se falla rápido.
    """
    resultado: list = []

    def _resolver():
        try:
            resultado.append(socket.getaddrinfo(host, puerto, type=socket.SOCK_STREAM))
        except OSError as error:
            resultado.append(error)

    hilo = threading.Thread(target=_resolver, daemon=True, name=f"dns-{host}")
    hilo.start()
    hilo.join(timeout)
    if not resultado:
        raise ConnectionError(f"DNS de {host}: sin respuesta en {timeout:.1f} s")
    if isinstance(resultado[0], OSError):
        raise ConnectionError(f"DNS de {host}: {resultado[0]}")


# Un breaker por dependencia externa. Se comparte entre todos los productores.
circuito_rabbitmq = CircuitBreaker("rabbitmq", umbral_fallas=3, tiempo_abierto=30.0)


def llamada_protegida(breaker: CircuitBreaker, funcion: Callable[[], T], intentos: int = 2) -> T:
    """Reintentos DENTRO del breaker: una operación con todos sus reintentos fallidos cuenta como 1 falla."""
    return breaker.llamar(lambda: con_reintentos(funcion, intentos=intentos, nombre=breaker.nombre))
