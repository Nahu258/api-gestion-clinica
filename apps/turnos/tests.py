"""
Tests automaticos de la API de turnos e historial clinico.

Ejecutar con:  python manage.py test

Cada test levanta una base de datos temporal, corre y la borra. Sirven para
demostrar que los codigos de estado HTTP son los correctos sin depender de
Postman.
"""

from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.turnos.models import Turno


def _turno_valido(**cambios) -> dict:
    """Payload base de un turno correcto; se le pueden pisar campos."""
    datos = {
        "paciente_nombre": "Maria Gomez",
        "paciente_dni": "30111222",
        "paciente_telefono": "3764551122",
        "obra_social": "IOSFA",
        "profesional": "Dra. Laura Benitez",
        "especialidad": Turno.Especialidad.CLINICA_MEDICA,
        "fecha_hora": (timezone.now() + timedelta(days=3)).isoformat(),
        "motivo_consulta": "Control anual.",
    }
    datos.update(cambios)
    return datos


class TurnoAPITests(APITestCase):
    def setUp(self):
        self.url_lista = reverse("turnos:turno-lista")

    def _url_detalle(self, turno_id):
        return reverse("turnos:turno-detalle", kwargs={"turno_id": turno_id})

    # ---------------- GET listado ----------------
    def test_listado_devuelve_200_y_json(self):
        respuesta = self.client.get(self.url_lista)
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIn("resultados", respuesta.data)
        self.assertEqual(respuesta.data["cantidad"], 0)

    # ---------------- POST ----------------
    def test_crear_turno_devuelve_201_y_header_location(self):
        respuesta = self.client.post(self.url_lista, _turno_valido(), format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertIn("Location", respuesta.headers)
        self.assertEqual(Turno.objects.count(), 1)

    def test_crear_turno_sin_campos_obligatorios_devuelve_400(self):
        respuesta = self.client.post(self.url_lista, {}, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(respuesta.data["error"]["codigo"], "DATOS_INVALIDOS")
        self.assertIn("paciente_nombre", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_dni_invalido_devuelve_400(self):
        respuesta = self.client.post(
            self.url_lista, _turno_valido(paciente_dni="ABC123"), format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("paciente_dni", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_fecha_pasada_devuelve_400(self):
        payload = _turno_valido(
            fecha_hora=(timezone.now() - timedelta(days=1)).isoformat()
        )
        respuesta = self.client.post(self.url_lista, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("fecha_hora", respuesta.data["error"]["detalles"])

    def test_crear_turno_con_profesional_ocupado_devuelve_409(self):
        payload = _turno_valido()
        self.client.post(self.url_lista, payload, format="json")
        respuesta = self.client.post(self.url_lista, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(respuesta.data["error"]["codigo"], "CONFLICTO")

    def test_otro_profesional_puede_atender_en_el_mismo_horario(self):
        payload = _turno_valido()
        self.client.post(self.url_lista, payload, format="json")

        otro = _turno_valido(profesional="Dr. Martin Aguirre")
        respuesta = self.client.post(self.url_lista, otro, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)

    # ---------------- GET por id ----------------
    def test_obtener_turno_existente_devuelve_200(self):
        creado = self.client.post(self.url_lista, _turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.get(self._url_detalle(turno_id))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["paciente_dni"], "30111222")

    def test_obtener_turno_inexistente_devuelve_404_estandarizado(self):
        respuesta = self.client.get(self._url_detalle(9999))
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(respuesta.data["error"]["codigo"], "RECURSO_NO_ENCONTRADO")

    # ---------------- PUT / PATCH ----------------
    def test_modificar_turno_devuelve_200(self):
        creado = self.client.post(self.url_lista, _turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.patch(
            self._url_detalle(turno_id),
            {"estado": Turno.Estado.CONFIRMADO},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["estado"], "confirmado")

    def test_marcar_atendido_sin_diagnostico_devuelve_400(self):
        creado = self.client.post(self.url_lista, _turno_valido(), format="json")
        turno_id = creado.data["id"]

        respuesta = self.client.patch(
            self._url_detalle(turno_id),
            {"estado": Turno.Estado.ATENDIDO},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("diagnostico", respuesta.data["error"]["detalles"])

    # ---------------- DELETE ----------------
    def test_eliminar_turno_devuelve_204(self):
        creado = self.client.post(self.url_lista, _turno_valido(), format="json")
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


class HistorialClinicoAPITests(APITestCase):
    """Endpoint de historial: solo devuelve consultas ya atendidas."""

    def _url_historial(self, dni):
        return reverse("turnos:paciente-historial", kwargs={"dni": dni})

    def test_historial_con_consultas_atendidas_devuelve_200(self):
        Turno.objects.create(
            paciente_nombre="Maria Gomez",
            paciente_dni="30111222",
            paciente_telefono="3764551122",
            profesional="Dra. Laura Benitez",
            especialidad=Turno.Especialidad.CLINICA_MEDICA,
            estado=Turno.Estado.ATENDIDO,
            fecha_hora=timezone.now() - timedelta(days=30),
            diagnostico="Faringitis viral.",
            indicaciones="Reposo 48 hs.",
        )

        respuesta = self.client.get(self._url_historial("30111222"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["cantidad_consultas"], 1)
        self.assertEqual(respuesta.data["paciente_nombre"], "Maria Gomez")

    def test_historial_de_paciente_sin_consultas_devuelve_404(self):
        respuesta = self.client.get(self._url_historial("99999999"))
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(respuesta.data["error"]["codigo"], "RECURSO_NO_ENCONTRADO")


class MiddlewareDeErroresTests(APITestCase):
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
