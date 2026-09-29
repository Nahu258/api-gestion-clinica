"""
Tests del AE2 - Modulo Turnos (juan30871).

Cubren: reserva temporal con TTL, idempotencia, restriccion unica,
concurrencia real con hilos, publicacion del evento y el consumidor
que genera el comprobante PDF con QR.

    python manage.py test apps.turnos.tests_ae2

El test de concurrencia con hilos necesita PostgreSQL:
    docker compose exec api python manage.py test apps.turnos.tests_ae2
"""

import json
import tempfile
import threading
import uuid
from contextlib import nullcontext
from datetime import timedelta
from unittest import skipUnless
from unittest.mock import patch

import redis
from django.db import IntegrityError, connection, connections
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.turnos import agenda, services
from apps.turnos.consumidor import EventoInvalido, procesar_mensaje
from apps.turnos.models import Turno
from core import eventos
from core.redis_client import get_redis

PROFESIONAL = "Dra. Laura Benitez"


def _fecha(dias=3, hora=10):
    base = timezone.localtime() + timedelta(days=dias)
    return base.replace(hour=hora, minute=0, second=0, microsecond=0)


def _turno(**cambios) -> dict:
    datos = {
        "paciente_nombre": "Maria Gomez",
        "paciente_dni": "30111222",
        "paciente_telefono": "3764551122",
        "obra_social": "IOSFA",
        "profesional": PROFESIONAL,
        "especialidad": Turno.Especialidad.CLINICA_MEDICA,
        "fecha_hora": _fecha().isoformat(),
        "motivo_consulta": "Control anual.",
    }
    datos.update(cambios)
    return datos


class BaseAE2(APITestCase):
    def setUp(self):
        get_redis().flushall()
        self.url_turnos = reverse("turnos:turno-lista")
        self.url_reserva = reverse("turnos:reserva-temporal")

    def _reservar(self, profesional=PROFESIONAL, fecha=None):
        return self.client.post(
            self.url_reserva,
            {"profesional": profesional, "fecha_hora": (fecha or _fecha()).isoformat()},
            format="json",
        )


# ---------------------------------------------------------------------------
# 1. Reserva temporal con TTL (Redis)
# ---------------------------------------------------------------------------
class ReservaTemporalTests(BaseAE2):
    def test_reservar_horario_devuelve_201_con_token_y_ttl(self):
        r = self._reservar()
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(r.data["token"]), 32)
        self.assertEqual(r.data["expira_en_segundos"], agenda.TTL_RESERVA_TEMPORAL)

        ttl = get_redis().ttl(agenda.clave_hold(PROFESIONAL, _fecha()))
        self.assertTrue(0 < ttl <= agenda.TTL_RESERVA_TEMPORAL)

    def test_mismo_horario_apartado_por_otro_devuelve_409(self):
        self._reservar()
        r = self._reservar()
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(r.data["error"]["codigo"], "CONFLICTO")

    def test_otro_profesional_puede_apartar_el_mismo_horario(self):
        self._reservar()
        r = self._reservar(profesional="Dr. Nicolas Ferreyra")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_no_se_puede_apartar_un_horario_ya_reservado(self):
        self.client.post(self.url_turnos, _turno(), format="json")
        r = self._reservar()
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)

    def test_al_vencer_el_ttl_el_horario_se_libera(self):
        self._reservar()
        # Simula el paso de los 5 minutos: Redis borra la clave solo.
        get_redis().delete(agenda.clave_hold(PROFESIONAL, _fecha()))
        self.assertEqual(self._reservar().status_code, status.HTTP_201_CREATED)

    def test_consultar_y_liberar_reserva(self):
        token = self._reservar().data["token"]
        url = reverse("turnos:reserva-temporal-detalle", kwargs={"token": token})

        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        # Liberado: cualquiera puede volver a tomarlo.
        self.assertEqual(self._reservar().status_code, status.HTTP_201_CREATED)

    def test_confirmar_turno_con_token_propio_devuelve_201_y_borra_la_reserva(self):
        token = self._reservar().data["token"]
        r = self.client.post(self.url_turnos, _turno(reserva_token=token), format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(get_redis().get(agenda.clave_hold(PROFESIONAL, _fecha())))

    def test_confirmar_horario_apartado_por_otro_devuelve_409(self):
        self._reservar()
        r = self.client.post(self.url_turnos, _turno(), format="json")
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        r = self.client.post(self.url_turnos, _turno(reserva_token="f" * 32), format="json")
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Turno.objects.count(), 0)

    def test_redis_caido_devuelve_503(self):
        class RedisCaido:
            def ping(self):
                raise redis.exceptions.ConnectionError("sin conexion")

        with patch("core.redis_client.get_redis", return_value=RedisCaido()):
            r = self._reservar()
        self.assertEqual(r.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(r.data["error"]["codigo"], "SERVICIO_NO_DISPONIBLE")


# ---------------------------------------------------------------------------
# 2. Idempotencia (Idempotency-Key)
# ---------------------------------------------------------------------------
class IdempotenciaTests(BaseAE2):
    def _post(self, datos, clave):
        return self.client.post(
            self.url_turnos, datos, format="json", headers={"Idempotency-Key": clave}
        )

    def test_reintento_con_la_misma_clave_no_duplica_el_turno(self):
        clave = str(uuid.uuid4())
        primera = self._post(_turno(), clave)
        segunda = self._post(_turno(), clave)

        self.assertEqual(primera.status_code, status.HTTP_201_CREATED)
        self.assertEqual(segunda.status_code, status.HTTP_201_CREATED)
        self.assertEqual(primera.data["id"], segunda.data["id"])
        self.assertEqual(primera.headers["Idempotent-Replay"], "false")
        self.assertEqual(segunda.headers["Idempotent-Replay"], "true")
        self.assertEqual(Turno.objects.count(), 1)

    def test_misma_clave_con_otros_datos_devuelve_422(self):
        clave = str(uuid.uuid4())
        self._post(_turno(), clave)
        r = self._post(_turno(paciente_nombre="Otra Persona"), clave)
        self.assertEqual(r.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertEqual(Turno.objects.count(), 1)

    def test_si_el_pedido_falla_la_clave_se_libera_para_reintentar(self):
        clave = str(uuid.uuid4())
        r = self._post(_turno(paciente_dni="abc"), clave)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        # Mismo body corregido... pero es otro body -> la clave quedo libre igual.
        r = self._post(_turno(), clave)
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_claves_distintas_crean_turnos_distintos(self):
        self._post(_turno(), str(uuid.uuid4()))
        self._post(_turno(fecha_hora=_fecha(hora=11).isoformat()), str(uuid.uuid4()))
        self.assertEqual(Turno.objects.count(), 2)

    def test_sin_header_funciona_como_en_el_ae1(self):
        r = self.client.post(self.url_turnos, _turno(), format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("Idempotent-Replay", r.headers)


# ---------------------------------------------------------------------------
# 3. Restriccion unica en la base (ultima defensa)
# ---------------------------------------------------------------------------
class RestriccionUnicaTests(BaseAE2):
    def _crear(self, **cambios):
        datos = {
            "paciente_nombre": "Maria Gomez", "paciente_dni": "30111222",
            "paciente_telefono": "3764551122", "profesional": PROFESIONAL,
            "fecha_hora": _fecha(),
        }
        datos.update(cambios)
        return Turno.objects.create(**datos)

    def test_la_base_rechaza_dos_turnos_iguales(self):
        self._crear()
        with self.assertRaises(IntegrityError):
            self._crear(profesional=PROFESIONAL.upper())  # mayusculas no la engañan

    def test_un_turno_cancelado_no_ocupa_el_horario(self):
        self._crear(estado=Turno.Estado.CANCELADO)
        self._crear()  # no debe fallar
        self.assertEqual(Turno.objects.count(), 2)

    def test_si_falla_la_validacion_la_base_igual_responde_409(self):
        self.client.post(self.url_turnos, _turno(), format="json")
        # Se "apaga" la verificacion previa para probar solo la restriccion.
        with patch.object(services, "_verificar_agenda_libre"):
            r = self.client.post(self.url_turnos, _turno(), format="json")
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Turno.objects.count(), 1)


# ---------------------------------------------------------------------------
# 4. Evento TurnoReservado (RabbitMQ)
# ---------------------------------------------------------------------------
class EventoTurnoReservadoTests(BaseAE2):
    def test_al_crear_un_turno_se_publica_el_evento_despues_del_commit(self):
        with patch.object(eventos, "publicar") as publicar:
            with self.captureOnCommitCallbacks(execute=True):
                r = self.client.post(self.url_turnos, _turno(), format="json")

        publicar.assert_called_once()
        routing_key, evento = publicar.call_args.args
        self.assertEqual(routing_key, "turno.reservado")
        self.assertEqual(evento["tipo"], "TurnoReservado")
        self.assertEqual(evento["datos"]["turno_id"], r.data["id"])
        uuid.UUID(evento["event_id"])  # es un UUID valido

    def test_si_la_reserva_falla_no_se_publica_nada(self):
        self.client.post(self.url_turnos, _turno(), format="json")
        with patch.object(eventos, "publicar") as publicar:
            with self.captureOnCommitCallbacks(execute=True):
                r = self.client.post(self.url_turnos, _turno(), format="json")
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        publicar.assert_not_called()

    @override_settings(EVENTOS_HABILITADOS=True, RABBITMQ_URL="amqp://guest:guest@127.0.0.1:1/")
    def test_rabbitmq_caido_no_rompe_la_reserva(self):
        with self.assertLogs("core.eventos", level="ERROR"):
            with self.captureOnCommitCallbacks(execute=True):
                r = self.client.post(self.url_turnos, _turno(), format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# 5. Consumidor: comprobante PDF con QR + idempotencia del consumidor
# ---------------------------------------------------------------------------
class ConsumidorTests(BaseAE2):
    def setUp(self):
        super().setUp()
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        ajuste = override_settings(MEDIA_ROOT=self.media.name)
        ajuste.enable()
        self.addCleanup(ajuste.disable)

    def _mensaje(self, turno):
        evento = eventos.armar_evento("TurnoReservado", services.datos_del_evento(turno))
        return json.dumps(evento)

    def _turno_guardado(self):
        r = self.client.post(self.url_turnos, _turno(), format="json")
        return Turno.objects.get(pk=r.data["id"])

    def test_el_consumidor_genera_el_pdf(self):
        turno = self._turno_guardado()
        self.assertEqual(procesar_mensaje(self._mensaje(turno)), "procesado")

        url = reverse("turnos:turno-comprobante", kwargs={"turno_id": turno.pk})
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertTrue(b"".join(r.streaming_content).startswith(b"%PDF"))

    def test_mensaje_repetido_se_procesa_una_sola_vez(self):
        turno = self._turno_guardado()
        mensaje = self._mensaje(turno)
        with patch("apps.turnos.consumidor.generar_comprobante") as generar:
            self.assertEqual(procesar_mensaje(mensaje), "procesado")
            self.assertEqual(procesar_mensaje(mensaje), "duplicado")
        generar.assert_called_once()

    def test_si_falla_la_generacion_se_puede_reintentar(self):
        turno = self._turno_guardado()
        mensaje = self._mensaje(turno)
        with patch("apps.turnos.consumidor.generar_comprobante", side_effect=OSError("disco lleno")):
            with self.assertRaises(OSError):
                procesar_mensaje(mensaje)
        self.assertEqual(procesar_mensaje(mensaje), "procesado")

    def test_mensaje_mal_formado_es_invalido(self):
        with self.assertRaises(EventoInvalido):
            procesar_mensaje(b"no es json")
        with self.assertRaises(EventoInvalido):
            procesar_mensaje(json.dumps({"event_id": "1", "tipo": "Otro", "datos": {}}))

    def test_comprobante_todavia_no_generado_devuelve_404(self):
        turno = self._turno_guardado()
        url = reverse("turnos:turno-comprobante", kwargs={"turno_id": turno.pk})
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# 6. Concurrencia real: N pedidos simultaneos por el mismo horario
# ---------------------------------------------------------------------------
@skipUnless(connection.vendor == "postgresql", "Requiere PostgreSQL (docker compose)")
class ConcurrenciaTests(TransactionTestCase):
    PEDIDOS = 10

    def setUp(self):
        get_redis().flushall()

    def _disparar_en_paralelo(self):
        barrera = threading.Barrier(self.PEDIDOS)
        codigos = []

        def pedido(indice):
            cliente = APIClient()
            datos = _turno(paciente_dni=f"3011122{indice}")
            barrera.wait()  # todos salen exactamente al mismo tiempo
            try:
                r = cliente.post(reverse("turnos:turno-lista"), datos, format="json")
                codigos.append(r.status_code)
            finally:
                connections.close_all()

        hilos = [threading.Thread(target=pedido, args=(i,)) for i in range(self.PEDIDOS)]
        for hilo in hilos:
            hilo.start()
        for hilo in hilos:
            hilo.join()
        return codigos

    def test_diez_pedidos_simultaneos_solo_uno_obtiene_el_turno(self):
        codigos = self._disparar_en_paralelo()
        self.assertEqual(codigos.count(201), 1)
        self.assertEqual(codigos.count(409), self.PEDIDOS - 1)
        self.assertEqual(Turno.objects.count(), 1)

    def test_sin_lock_la_restriccion_de_la_base_igual_evita_la_doble_reserva(self):
        # Se desactivan el lock y la verificacion previa: solo queda la base.
        with patch.object(agenda, "lock_de_agenda", lambda profesional: nullcontext()), \
             patch.object(services, "_verificar_agenda_libre"):
            codigos = self._disparar_en_paralelo()
        self.assertEqual(codigos.count(201), 1)
        self.assertEqual(Turno.objects.count(), 1)
