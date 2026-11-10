"""
AE4 - Tests de resiliencia (circuit breaker, reintentos, caída de RabbitMQ)
y de observabilidad (correlación, logs JSON, métricas Prometheus).
"""

import json
import logging
import threading
import time
from unittest.mock import MagicMock, patch

import pika
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from apps.atencion.tests import crear_centro
from apps.turnos import eventos as eventos_turnos
from core import observabilidad
from core.resiliencia import (
    ABIERTO,
    CERRADO,
    SEMIABIERTO,
    CircuitBreaker,
    CircuitoAbierto,
    circuito_rabbitmq,
    con_reintentos,
    resolver_con_timeout,
)

CAIDO = pika.exceptions.AMQPConnectionError("RabbitMQ caído")


class CircuitBreakerTests(SimpleTestCase):
    def setUp(self):
        self.breaker = CircuitBreaker("prueba", umbral_fallas=3, tiempo_abierto=30)

    def _fallar(self):
        with self.assertRaises(ValueError):
            self.breaker.llamar(lambda: (_ for _ in ()).throw(ValueError("x")))

    def test_se_abre_despues_de_n_fallas_seguidas(self):
        for _ in range(2):
            self._fallar()
        self.assertEqual(self.breaker.estado, CERRADO)
        self._fallar()
        self.assertEqual(self.breaker.estado, ABIERTO)

    def test_abierto_rechaza_sin_llamar_a_la_dependencia(self):
        for _ in range(3):
            self._fallar()
        dependencia = MagicMock()
        with self.assertRaises(CircuitoAbierto):
            self.breaker.llamar(dependencia)
        dependencia.assert_not_called()

    def test_un_exito_reinicia_el_contador(self):
        self._fallar()
        self._fallar()
        self.breaker.llamar(lambda: "ok")
        self._fallar()
        self.assertEqual(self.breaker.estado, CERRADO)

    def test_semiabierto_tras_el_tiempo_y_se_cierra_si_la_prueba_sale_bien(self):
        for _ in range(3):
            self._fallar()
        with patch("core.resiliencia.time.monotonic", return_value=time.monotonic() + 31):
            self.assertEqual(self.breaker.estado, SEMIABIERTO)
            self.assertEqual(self.breaker.llamar(lambda: "ok"), "ok")
        self.assertEqual(self.breaker.estado, CERRADO)

    def test_semiabierto_vuelve_a_abrirse_si_la_prueba_falla(self):
        for _ in range(3):
            self._fallar()
        with patch("core.resiliencia.time.monotonic", return_value=time.monotonic() + 31):
            self._fallar()
            self.assertEqual(self.breaker._estado, ABIERTO)


@patch("core.resiliencia.time.sleep")
class ReintentosTests(SimpleTestCase):
    def test_falla_transitoria_se_recupera_al_segundo_intento(self, sleep):
        funcion = MagicMock(side_effect=[ConnectionError("corte"), "ok"])
        self.assertEqual(con_reintentos(funcion, intentos=3), "ok")
        self.assertEqual(funcion.call_count, 2)
        sleep.assert_called_once()

    def test_agota_los_intentos_y_propaga_el_error(self, sleep):
        funcion = MagicMock(side_effect=ConnectionError("caído"))
        with self.assertRaises(ConnectionError):
            con_reintentos(funcion, intentos=3)
        self.assertEqual(funcion.call_count, 3)

    def test_backoff_exponencial(self, sleep):
        funcion = MagicMock(side_effect=ConnectionError("caído"))
        with self.assertRaises(ConnectionError):
            con_reintentos(funcion, intentos=3, espera_base=0.2)
        esperas = [c.args[0] for c in sleep.call_args_list]
        self.assertTrue(0.2 <= esperas[0] <= 0.3)
        self.assertTrue(0.4 <= esperas[1] <= 0.6)


class ResolucionDNSTests(SimpleTestCase):
    def test_dns_lento_falla_rapido(self):
        """Con el contenedor detenido el DNS de Docker tarda ~4 s: no se espera tanto."""
        def dns_lento(*args, **kwargs):
            threading.Event().wait(2)
            return []

        with patch("core.resiliencia.socket.getaddrinfo", side_effect=dns_lento):
            inicio = time.perf_counter()
            with self.assertRaises(ConnectionError):
                resolver_con_timeout("rabbitmq", 5672, timeout=0.2)
            self.assertLess(time.perf_counter() - inicio, 1.0)

    def test_nombre_inexistente_es_error_de_conexion(self):
        with patch("core.resiliencia.socket.getaddrinfo", side_effect=OSError("no existe")):
            with self.assertRaises(ConnectionError):
                resolver_con_timeout("rabbitmq", 5672)


@patch("core.resiliencia.time.sleep")
class CaidaDeRabbitMQTests(APITestCase):
    """
    Prueba de caída de un servicio crítico: con RabbitMQ caído la API sigue
    atendiendo avisos (201) y, una vez abierto el circuito, deja de intentar
    conectarse, así la latencia no se degrada.
    """

    def setUp(self):
        circuito_rabbitmq.reiniciar()
        self.addCleanup(circuito_rabbitmq.reiniciar)
        self.centro = crear_centro()

    def _avisar(self):
        return self.client.post(
            "/api/v1/atencion/solicitudes/",
            {"centro_id": self.centro.pk, "modo": "aviso", "nombre_invitado": "Caída"},
            format="json",
        )

    @override_settings(EVENTOS_HABILITADOS=True)
    def test_la_api_sigue_respondiendo_y_el_circuito_se_abre(self, sleep):
        with patch("apps.turnos.eventos.pika.BlockingConnection", side_effect=CAIDO) as conexion:
            for _ in range(3):
                self.assertEqual(self._avisar().status_code, 201)
            # 3 avisos x 2 intentos cada uno: el circuito ya está abierto.
            self.assertEqual(conexion.call_count, 6)
            self.assertEqual(circuito_rabbitmq.estado, ABIERTO)

            inicio = time.perf_counter()
            self.assertEqual(self._avisar().status_code, 201)
            # Con el circuito abierto ni siquiera se intenta conectar.
            self.assertEqual(conexion.call_count, 6)
            self.assertLess(time.perf_counter() - inicio, 1.0)

    def test_cuando_rabbitmq_vuelve_el_circuito_se_cierra(self, sleep):
        with patch("apps.turnos.eventos.pika.BlockingConnection", side_effect=CAIDO):
            for _ in range(3):
                self.assertIsNone(eventos_turnos.publicar_evento("prueba", {}))
        self.assertEqual(circuito_rabbitmq.estado, ABIERTO)
        with patch("core.resiliencia.time.monotonic", return_value=time.monotonic() + 31), \
             patch("apps.turnos.eventos.pika.BlockingConnection"):
            self.assertIsNotNone(eventos_turnos.publicar_evento("prueba", {}))
        self.assertEqual(circuito_rabbitmq.estado, CERRADO)


class ObservabilidadTests(APITestCase):
    def setUp(self):
        circuito_rabbitmq.reiniciar()

    def test_cada_respuesta_lleva_un_request_id(self):
        r = self.client.get("/api/v1/")
        self.assertRegex(r["X-Request-ID"], r"^[0-9a-f]{32}$")

    def test_se_respeta_el_request_id_entrante_valido(self):
        r = self.client.get("/api/v1/", HTTP_X_REQUEST_ID="demo-coloquio-0001")
        self.assertEqual(r["X-Request-ID"], "demo-coloquio-0001")

    def test_un_request_id_malicioso_se_reemplaza(self):
        r = self.client.get("/api/v1/", HTTP_X_REQUEST_ID="x\n{inyeccion en logs}")
        self.assertNotIn("inyeccion", r["X-Request-ID"])

    def test_metrics_expone_las_series_de_la_api(self):
        self.client.get("/api/v1/")
        r = self.client.get("/metrics")
        self.assertEqual(r.status_code, 200)
        cuerpo = r.content.decode()
        self.assertIn("emergenciaya_http_peticiones_total", cuerpo)
        self.assertIn("emergenciaya_http_duracion_segundos_bucket", cuerpo)
        self.assertIn('emergenciaya_circuit_breaker_estado{dependencia="rabbitmq"}', cuerpo)

    def test_la_ruta_de_la_metrica_es_el_patron_sin_anclas_ni_ids(self):
        self.client.get("/api/v1/atencion/solicitudes/999999/")
        cuerpo = self.client.get("/metrics").content.decode()
        self.assertIn('ruta="api/v1/atencion/solicitudes/<solicitud_id>/"', cuerpo)
        self.assertNotIn('?$"', cuerpo)

    @override_settings(METRICS_TOKEN="secreto")
    def test_metrics_exige_token_si_esta_configurado(self):
        self.assertEqual(self.client.get("/metrics").status_code, 403)
        r = self.client.get("/metrics", HTTP_AUTHORIZATION="Bearer secreto")
        self.assertEqual(r.status_code, 200)

    @override_settings(EVENTOS_HABILITADOS=True)
    def test_el_evento_lleva_el_trace_id_de_la_peticion(self):
        """Correlación: el mensaje en RabbitMQ lleva el mismo id que la respuesta HTTP."""
        with patch("apps.turnos.eventos.pika.BlockingConnection") as conexion:
            r = self.client.post(
                "/api/v1/atencion/solicitudes/",
                {"centro_id": crear_centro().pk, "modo": "aviso", "nombre_invitado": "Traza"},
                format="json",
                HTTP_X_REQUEST_ID="traza-de-prueba-42",
            )
        self.assertEqual(r.status_code, 201)
        publicado = conexion.return_value.channel.return_value.basic_publish.call_args.kwargs
        self.assertEqual(json.loads(publicado["body"])["trace_id"], "traza-de-prueba-42")
        self.assertEqual(publicado["properties"].correlation_id, "traza-de-prueba-42")

    def test_el_log_json_incluye_trace_y_span(self):
        registro = logging.LogRecord("apps.prueba", logging.INFO, __file__, 1, "hola %s", ("mundo",), None)
        with observabilidad.contexto_de_traza("traza-json-0001"):
            observabilidad.FiltroDeTraza().filter(registro)
        linea = json.loads(observabilidad.FormatoJSON().format(registro))
        self.assertEqual(linea["mensaje"], "hola mundo")
        self.assertEqual(linea["trace_id"], "traza-json-0001")
        self.assertEqual(linea["nivel"], "INFO")
