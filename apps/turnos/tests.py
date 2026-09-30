"""
Tests automaticos de la API de turnos e historial clinico.

Ejecutar con:  python manage.py test

Cada test levanta una base de datos temporal, corre y la borra. Sirven para
demostrar que los codigos de estado HTTP son los correctos sin depender de
Postman.

Los tests no necesitan Redis ni RabbitMQ corriendo:
  * la cache usa memoria local (misma API que Redis: get/set/add/delete),
  * publicar_evento se reemplaza por un mock que registra las llamadas.
"""

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clinica.services import registrar_medico, registrar_paciente
from apps.turnos import eventos, services
from apps.turnos.models import Turno
from core.exceptions import ReglaDeNegocioViolada

CACHE_EN_MEMORIA = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
}


@override_settings(CACHES=CACHE_EN_MEMORIA)
class BaseTurnosTest(APITestCase):
    """Datos comunes: un paciente, dos medicos y el publicador de eventos simulado."""

    def setUp(self):
        cache.clear()
        parche = patch("apps.turnos.services.publicar_evento", return_value="evento-test")
        self.publicar_evento = parche.start()
        self.addCleanup(parche.stop)

        self.paciente = registrar_paciente(
            dni="30111222", nombre="Maria Gomez", telefono="3764551122", obra_social="IOSFA"
        )
        self.medico = registrar_medico(nombre="Dra. Laura Benitez", especialidad="clinica_medica")
        self.otro_medico = registrar_medico(nombre="Dr. Martin Aguirre", especialidad="traumatologia")
        self.url_lista = reverse("turnos:turno-lista")

    def _turno_valido(self, **cambios) -> dict:
        """Payload base de un turno correcto; se le pueden pisar campos."""
        datos = {
            "paciente_id": self.paciente.id,
            "medico_id": self.medico.id,
            "fecha_hora": (timezone.now() + timedelta(days=3)).isoformat(),
            "motivo_consulta": "Control anual.",
        }
        datos.update(cambios)
        return datos

    def _url_detalle(self, turno_id):
        return reverse("turnos:turno-detalle", kwargs={"turno_id": turno_id})

    def _crear_turno(self, estado=Turno.Estado.PENDIENTE, fecha_hora=None, **extra):
        return Turno.objects.create(
            paciente_id=self.paciente.id,
            medico_id=self.medico.id,
            estado=estado,
            fecha_hora=fecha_hora or timezone.now() + timedelta(days=1),
            **extra,
        )

    def _crear_turno_atendido(self, dias_atras=30):
        return self._crear_turno(
            estado=Turno.Estado.ATENDIDO,
            fecha_hora=timezone.now() - timedelta(days=dias_atras),
            diagnostico="Faringitis viral.",
            indicaciones="Reposo 48 hs.",
        )


class TurnoAPITests(BaseTurnosTest):
    # ---------------- GET listado ----------------
    def test_listado_devuelve_200_y_json(self):
        respuesta = self.client.get(self.url_lista)
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIn("resultados", respuesta.data)
        self.assertEqual(respuesta.data["cantidad"], 0)

    # ---------------- POST ----------------
    def test_crear_turno_devuelve_201_y_header_location(self):
        respuesta = self.client.post(self.url_lista, self._turno_valido(), format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertIn("Location", respuesta.headers)
        self.assertEqual(Turno.objects.count(), 1)
        # Los datos de persona los completa el modulo Clinica a partir de los IDs.
        self.assertEqual(respuesta.data["paciente_nombre"], "Maria Gomez")
        self.assertEqual(respuesta.data["medico_nombre"], "Dra. Laura Benitez")
        self.assertEqual(respuesta.data["especialidad_legible"], "Clinica medica")

    def test_crear_turno_publica_evento_turno_creado(self):
        respuesta = self.client.post(self.url_lista, self._turno_valido(), format="json")
        self.publicar_evento.assert_called_once()
        tipo, payload = self.publicar_evento.call_args.args
        self.assertEqual(tipo, "TurnoCreado")
        self.assertEqual(payload["turno_id"], respuesta.data["id"])

    def test_crear_turno_sin_campos_obligatorios_devuelve_400(self):
        respuesta = self.client.post(self.url_lista, {}, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(respuesta.data["error"]["codigo"], "DATOS_INVALIDOS")
        self.assertIn("paciente_id", respuesta.data["error"]["detalles"])
        self.assertIn("medico_id", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_paciente_inexistente_devuelve_400(self):
        respuesta = self.client.post(
            self.url_lista, self._turno_valido(paciente_id=9999), format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("paciente_id", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_medico_inexistente_devuelve_400(self):
        respuesta = self.client.post(
            self.url_lista, self._turno_valido(medico_id=9999), format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("medico_id", respuesta.data["error"]["detalles"])

    def test_medico_de_especialidad_otra_exige_motivo_400(self):
        medico_otra = registrar_medico(nombre="Dra. Paula Rios", especialidad="otra")
        payload = self._turno_valido(medico_id=medico_otra.id, motivo_consulta="")
        respuesta = self.client.post(self.url_lista, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("motivo_consulta", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_fecha_pasada_devuelve_400(self):
        payload = self._turno_valido(
            fecha_hora=(timezone.now() - timedelta(days=1)).isoformat()
        )
        respuesta = self.client.post(self.url_lista, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("fecha_hora", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_medico_ocupado_devuelve_409(self):
        payload = self._turno_valido()
        self.client.post(self.url_lista, payload, format="json")
        respuesta = self.client.post(self.url_lista, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(respuesta.data["error"]["codigo"], "CONFLICTO")

    def test_otro_medico_puede_atender_en_el_mismo_horario(self):
        payload = self._turno_valido()
        self.client.post(self.url_lista, payload, format="json")

        otro = self._turno_valido(medico_id=self.otro_medico.id)
        respuesta = self.client.post(self.url_lista, otro, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)

    # ---------------- GET por id ----------------
    def test_obtener_turno_existente_devuelve_200(self):
        creado = self.client.post(self.url_lista, self._turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.get(self._url_detalle(turno_id))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["paciente_id"], self.paciente.id)
        self.assertEqual(respuesta.data["paciente_nombre"], "Maria Gomez")

    def test_obtener_turno_inexistente_devuelve_404_estandarizado(self):
        respuesta = self.client.get(self._url_detalle(9999))
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(respuesta.data["error"]["codigo"], "RECURSO_NO_ENCONTRADO")

    # ---------------- PUT / PATCH ----------------
    def test_modificar_turno_devuelve_200(self):
        creado = self.client.post(self.url_lista, self._turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.patch(
            self._url_detalle(turno_id),
            {"estado": Turno.Estado.CONFIRMADO},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["estado"], "confirmado")

    def test_marcar_atendido_sin_diagnostico_devuelve_400(self):
        creado = self.client.post(self.url_lista, self._turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.patch(
            self._url_detalle(turno_id),
            {"estado": Turno.Estado.ATENDIDO},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("diagnostico", respuesta.data["error"]["detalles"])

    def test_turno_atendido_no_se_puede_modificar_409(self):
        turno = self._crear_turno_atendido()
        respuesta = self.client.patch(
            self._url_detalle(turno.id), {"indicaciones": "Otra cosa"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_409_CONFLICT)

    # ---------------- DELETE ----------------
    def test_eliminar_turno_devuelve_204(self):
        creado = self.client.post(self.url_lista, self._turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.delete(self._url_detalle(turno_id))
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Turno.objects.count(), 0)

    # ---------------- Verbos no permitidos ----------------
    def test_metodo_no_permitido_devuelve_405(self):
        respuesta = self.client.delete(self.url_lista)
        self.assertEqual(respuesta.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(respuesta.data["error"]["codigo"], "METODO_NO_PERMITIDO")

    # ---------------- Filtros ----------------
    def test_filtro_con_estado_invalido_devuelve_400(self):
        respuesta = self.client.get(self.url_lista, {"estado": "inventado"})
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(respuesta.data["error"]["codigo"], "DATOS_INVALIDOS")

    def test_filtro_por_especialidad_usa_la_del_medico(self):
        self.client.post(self.url_lista, self._turno_valido(), format="json")
        self.client.post(
            self.url_lista, self._turno_valido(medico_id=self.otro_medico.id), format="json"
        )
        respuesta = self.client.get(self.url_lista, {"especialidad": "traumatologia"})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["cantidad"], 1)
        self.assertEqual(respuesta.data["resultados"][0]["medico_nombre"], "Dr. Martin Aguirre")

    def test_filtro_con_especialidad_invalida_devuelve_400(self):
        respuesta = self.client.get(self.url_lista, {"especialidad": "inventada"})
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(respuesta.data["error"]["codigo"], "DATOS_INVALIDOS")

    def test_buscar_por_dni_del_paciente(self):
        self.client.post(self.url_lista, self._turno_valido(), format="json")
        respuesta = self.client.get(self.url_lista, {"buscar": "30111"})
        self.assertEqual(respuesta.data["cantidad"], 1)

    def test_listado_no_consulta_clinica_por_cada_turno(self):
        # 1 consulta de turnos + 2 a Clinica (pacientes y medicos en bloque),
        # sin importar cuantos turnos haya: se evita el problema N+1.
        for dias in (3, 4, 5, 6):
            self._crear_turno(fecha_hora=timezone.now() + timedelta(days=dias))
        with self.assertNumQueries(3):
            respuesta = self.client.get(self.url_lista)
        self.assertEqual(respuesta.data["cantidad"], 4)


class HistorialClinicoAPITests(BaseTurnosTest):
    """Endpoint de historial: solo devuelve consultas ya atendidas."""

    def _url_historial(self, dni):
        return reverse("turnos:paciente-historial", kwargs={"dni": dni})

    def test_historial_con_consultas_atendidas_devuelve_200(self):
        self._crear_turno_atendido()

        respuesta = self.client.get(self._url_historial("30111222"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["cantidad_consultas"], 1)
        self.assertEqual(respuesta.data["paciente_nombre"], "Maria Gomez")

    def test_historial_de_paciente_inexistente_devuelve_404(self):
        respuesta = self.client.get(self._url_historial("99999999"))
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(respuesta.data["error"]["codigo"], "RECURSO_NO_ENCONTRADO")

    def test_historial_de_paciente_sin_consultas_devuelve_404(self):
        respuesta = self.client.get(self._url_historial("30111222"))
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    # ---------------- Cache en Redis ----------------
    def test_historial_se_guarda_en_cache(self):
        turno = self._crear_turno_atendido()
        self.client.get(self._url_historial("30111222"))
        self.assertEqual(cache.get("historial_paciente_30111222"), [turno.id])

        # Con la cache cargada no se vuelve a filtrar por paciente y estado:
        # un turno atendido insertado "por fuera" de la API no aparece.
        self._crear_turno_atendido(dias_atras=10)
        respuesta = self.client.get(self._url_historial("30111222"))
        self.assertEqual(respuesta.data["cantidad_consultas"], 1)

    def test_atender_un_turno_invalida_la_cache_del_historial(self):
        self._crear_turno_atendido()
        self.client.get(self._url_historial("30111222"))
        self.assertIsNotNone(cache.get("historial_paciente_30111222"))

        nuevo = self._crear_turno(
            estado=Turno.Estado.EN_ATENCION,
            fecha_hora=timezone.now() - timedelta(hours=1),
        )
        respuesta = self.client.patch(
            self._url_detalle(nuevo.id),
            {"estado": "atendido", "diagnostico": "Gripe.", "version": 0},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIsNone(cache.get("historial_paciente_30111222"))
        self.publicar_evento.assert_called_once()
        self.assertEqual(self.publicar_evento.call_args.args[0], "TurnoAtendido")

        respuesta = self.client.get(self._url_historial("30111222"))
        self.assertEqual(respuesta.data["cantidad_consultas"], 2)

    def test_historial_funciona_si_la_cache_no_responde(self):
        self._crear_turno_atendido()
        redis_caido = ConnectionError("Redis no responde")
        with patch("apps.turnos.services.cache.get", side_effect=redis_caido), patch(
            "apps.turnos.services.cache.set", side_effect=redis_caido
        ) as escritura, self.assertLogs("apps.turnos.services", level="WARNING"):
            respuesta = self.client.get(self._url_historial("30111222"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["cantidad_consultas"], 1)
        # Si la lectura ya fallo, no se espera otro timeout intentando escribir.
        escritura.assert_not_called()


class ConcurrenciaOptimistaTests(BaseTurnosTest):
    """Dos profesionales editan el mismo turno: el segundo no pisa al primero."""

    def setUp(self):
        super().setUp()
        self.turno = self._crear_turno(estado=Turno.Estado.EN_ATENCION)

    def test_version_desactualizada_devuelve_409(self):
        # A y B leyeron el turno en version 0. A guarda primero.
        respuesta_a = self.client.patch(
            self._url_detalle(self.turno.id),
            {"indicaciones": "Indicaciones de A", "version": 0},
            format="json",
        )
        self.assertEqual(respuesta_a.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta_a.data["version"], 1)

        # B guarda con la version vieja: se rechaza y lo de A queda intacto.
        respuesta_b = self.client.patch(
            self._url_detalle(self.turno.id),
            {"indicaciones": "Indicaciones de B", "version": 0},
            format="json",
        )
        self.assertEqual(respuesta_b.status_code, status.HTTP_409_CONFLICT)
        self.turno.refresh_from_db()
        self.assertEqual(self.turno.indicaciones, "Indicaciones de A")
        self.assertEqual(self.turno.version, 1)

    def test_escritura_concurrente_entre_la_lectura_y_el_update(self):
        # La carrera real: B cargo el turno en version 0 y, antes de su UPDATE,
        # otra request ya lo guardo (version 1 en la base). Aunque B no envie
        # version, su UPDATE ... WHERE version = 0 no afecta filas.
        turno_de_b = services.obtener_turno(self.turno.id)
        Turno.objects.filter(pk=self.turno.id).update(indicaciones="Guardado por A", version=1)

        with self.assertRaises(ReglaDeNegocioViolada):
            services.actualizar_turno(turno_de_b, {"indicaciones": "Guardado por B"})

        self.turno.refresh_from_db()
        self.assertEqual(self.turno.indicaciones, "Guardado por A")

    def test_cada_modificacion_incrementa_la_version(self):
        for esperada in (1, 2):
            respuesta = self.client.patch(
                self._url_detalle(self.turno.id),
                {"motivo_consulta": f"cambio {esperada}"},
                format="json",
            )
            self.assertEqual(respuesta.data["version"], esperada)


class ConsumidorIdempotenteTests(BaseTurnosTest):
    """El mismo evento TurnoAtendido entregado dos veces se aplica una sola vez."""

    def setUp(self):
        super().setUp()
        self.turno = self._crear_turno(
            estado=Turno.Estado.EN_ATENCION,
            fecha_hora=timezone.now() - timedelta(minutes=30),
        )

    def _evento(self, **cambios):
        evento = {
            "evento_id": "evt-123",
            "tipo": "TurnoAtendido",
            "turno_id": self.turno.id,
            "diagnostico": "Hipertension leve.",
            "indicaciones": "Control en 30 dias.",
        }
        evento.update(cambios)
        return evento

    def test_evento_repetido_se_aplica_una_sola_vez(self):
        self.assertEqual(eventos.procesar_evento(self._evento()), eventos.PROCESADO)
        self.turno.refresh_from_db()
        self.assertEqual(self.turno.estado, Turno.Estado.ATENDIDO)
        self.assertEqual(self.turno.diagnostico, "Hipertension leve.")
        self.assertEqual(self.turno.version, 1)

        # Reentrega del mismo mensaje: se detecta por evento_id y no se aplica.
        self.assertEqual(eventos.procesar_evento(self._evento()), eventos.DUPLICADO)
        self.turno.refresh_from_db()
        self.assertEqual(self.turno.version, 1)

    def test_consumidor_no_vuelve_a_publicar_el_evento(self):
        eventos.procesar_evento(self._evento())
        self.publicar_evento.assert_not_called()

    def test_otro_evento_sobre_turno_ya_atendido_no_lo_modifica(self):
        eventos.procesar_evento(self._evento())
        resultado = eventos.procesar_evento(
            self._evento(evento_id="evt-456", diagnostico="Otro diagnostico")
        )
        self.assertEqual(resultado, eventos.SIN_CAMBIOS)
        self.turno.refresh_from_db()
        self.assertEqual(self.turno.diagnostico, "Hipertension leve.")

    def test_si_falla_se_libera_la_marca_para_reintentar(self):
        with self.assertRaises(Exception):
            eventos.procesar_evento(self._evento(turno_id=9999))
        self.assertIsNone(cache.get("procesado_evt-123"))

    def test_evento_sin_diagnostico_se_rechaza(self):
        with self.assertRaises(Exception):
            eventos.procesar_evento(self._evento(diagnostico=""))
        self.turno.refresh_from_db()
        self.assertEqual(self.turno.estado, Turno.Estado.EN_ATENCION)

    def test_tipos_desconocidos_se_ignoran(self):
        self.assertEqual(eventos.procesar_evento({"tipo": "Otro"}), eventos.IGNORADO)


class PublicadorDeEventosTests(APITestCase):
    def test_si_rabbitmq_no_responde_no_rompe_la_operacion(self):
        with patch(
            "apps.turnos.eventos.pika.BlockingConnection", side_effect=OSError("sin broker")
        ), self.assertLogs("apps.turnos.eventos", level="ERROR"):
            self.assertIsNone(eventos.publicar_evento("TurnoCreado", {"turno_id": 1}))

    def test_mensaje_lleva_evento_id_y_es_persistente(self):
        with patch("apps.turnos.eventos.pika.BlockingConnection") as conexion:
            evento_id = eventos.publicar_evento("TurnoCreado", {"turno_id": 7})
        canal = conexion.return_value.channel.return_value
        argumentos = canal.basic_publish.call_args.kwargs
        self.assertEqual(argumentos["routing_key"], eventos.COLA_EVENTOS)
        self.assertIn(evento_id, argumentos["body"])
        self.assertEqual(argumentos["properties"].delivery_mode, 2)


class MiddlewareDeErroresTests(BaseTurnosTest):
    """Verifica que un fallo IMPREVISTO se convierta en un 500 JSON."""

    def test_excepcion_no_controlada_devuelve_500_json(self):
        # El test client, por defecto, vuelve a levantar la excepcion.
        # Lo desactivamos para poder inspeccionar la respuesta del middleware.
        self.client.raise_request_exception = False

        # assertLogs captura el log de error del middleware: verifica que se
        # registro el incidente y ademas evita ensuciar la salida del test.
        with self.assertLogs("core.errores", level="ERROR"):
            with patch(
                "apps.turnos.services.listar_turnos",
                side_effect=RuntimeError("fallo simulado de la base de datos"),
            ):
                respuesta = self.client.get(reverse("turnos:turno-lista"))

        self.assertEqual(respuesta.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["error"]["codigo"], "ERROR_INTERNO")
        self.assertIn("id_incidente", cuerpo["error"]["detalles"])
