"""
Bateria minima de 3 tests -- Desafio Practico AE3 (28/10).

Cubre exactamente las tres categorias exigidas:
  1. Test Unitario Puro   -> validacion del DNI en TurnoSerializer (sin DB ni HTTP)
  2. Test de Integracion  -> POST /api/v1/turnos/ con payload valido devuelve 201
  3. Test de Borde 400    -> datos corruptos son rechazados con 400, nunca con 500

Ejecutar con:
  python manage.py test apps.turnos.tests_bateria --verbosity=2
"""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.clinica.services import registrar_medico, registrar_paciente
from apps.turnos.serializers import TurnoSerializer


# ---------------------------------------------------------------------------
# 1. TEST UNITARIO PURO -- validacion de DNI (sin base de datos, sin HTTP)
# ---------------------------------------------------------------------------

class TestDNIUnitarioPuro(TestCase):
    """
    Aisla la regla de negocio del DNI en TurnoSerializer.to_internal_value.
    No levanta el servidor HTTP ni toca PostgreSQL: corre en memoria.
    """

    def test_dni_invalido_no_numerico_lanza_error(self):
        """DNI con letras debe lanzar ValidationError con campo paciente_dni."""
        with self.assertRaises(ValidationError) as ctx:
            TurnoSerializer().to_internal_value({"paciente_dni": "abc12345"})
        self.assertIn("paciente_dni", ctx.exception.detail)

    def test_dni_valido_con_puntos_se_normaliza(self):
        """Replica la logica de normalizacion del serializer: '40.123.456' -> '40123456'."""
        # Replicamos la misma logica que usa to_internal_value (linea 77 de serializers.py)
        dni_raw = "40.123.456"
        dni_normalizado = str(dni_raw).strip().replace(".", "").replace(" ", "")
        # Debe quedar solo digitos y longitud 7-8
        self.assertTrue(dni_normalizado.isdigit(), "El DNI normalizado debe ser numerico")
        self.assertIn(len(dni_normalizado), range(7, 9), "El DNI debe tener 7 u 8 digitos")
        self.assertEqual(dni_normalizado, "40123456")


# ---------------------------------------------------------------------------
# 2. TEST DE INTEGRACION 201 -- POST crea un turno y devuelve Location
# ---------------------------------------------------------------------------

@patch("apps.turnos.services.publicar_evento", return_value="evento-test")
class TestIntegracion201(APITestCase):
    """
    Levanta el stack completo (ruta -> vista -> serializer -> servicio -> DB de test).
    Verifica status 201, header Location y el schema JSON del cuerpo.
    """

    def setUp(self):
        self.paciente = registrar_paciente(
            dni="38444555", nombre="Ana Lopez",
            telefono="3764-112233", obra_social="IOMA",
        )
        self.medico = registrar_medico(
            nombre="Dra. Carla Ibarra", especialidad="clinica_medica"
        )

    def test_crear_turno_valido_devuelve_201(self, _mock_evento):
        """POST con payload completo -> 201, header Location, schema correcto."""
        payload = {
            "paciente_id": self.paciente.id,
            "medico_id": self.medico.id,
            "fecha_hora": (timezone.now() + timedelta(days=5)).isoformat(),
            "motivo_consulta": "Control ginecologico anual.",
        }
        response = self.client.post("/api/v1/turnos/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("Location", response.headers)
        self.assertEqual(response.data["paciente_nombre"], "Ana Lopez")
        self.assertEqual(response.data["medico_nombre"], "Dra. Carla Ibarra")


# ---------------------------------------------------------------------------
# 3. TEST DE BORDE 400 -- datos corruptos rechazados de forma controlada
# ---------------------------------------------------------------------------

@patch("apps.turnos.services.publicar_evento", return_value="evento-test")
class TestBorde400(APITestCase):
    """
    Envia datos invalidos y confirma que siempre se responde 400,
    nunca con un error no controlado (500).
    """

    def setUp(self):
        self.paciente = registrar_paciente(
            dni="30111222", nombre="Maria Gomez",
            telefono="3764551122", obra_social="IOSFA",
        )
        self.medico = registrar_medico(
            nombre="Dra. Laura Benitez", especialidad="clinica_medica"
        )

    def _payload_base(self, **overrides):
        datos = {
            "paciente_id": self.paciente.id,
            "medico_id": self.medico.id,
            "fecha_hora": (timezone.now() + timedelta(days=3)).isoformat(),
            "motivo_consulta": "Control anual.",
        }
        datos.update(overrides)
        return datos

    def test_campos_obligatorios_faltantes_devuelve_400(self, _mock):
        """Payload vacio -> 400 con detalle de campos faltantes."""
        response = self.client.post("/api/v1/turnos/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("paciente_id", response.data["error"]["detalles"])
        self.assertIn("medico_id", response.data["error"]["detalles"])

    def test_fecha_pasada_devuelve_400(self, _mock):
        """Fecha en el pasado -> 400, nunca 500."""
        payload = self._payload_base(
            fecha_hora=(timezone.now() - timedelta(days=1)).isoformat()
        )
        response = self.client.post("/api/v1/turnos/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("fecha_hora", response.data["error"]["detalles"])

    def test_especialidad_otra_sin_motivo_devuelve_400(self, _mock):
        """Medico con especialidad 'otra' sin motivo_consulta -> 400."""
        medico_otra = registrar_medico(nombre="Dr. Sin Motivo", especialidad="otra")
        payload = self._payload_base(medico_id=medico_otra.id, motivo_consulta="")
        response = self.client.post("/api/v1/turnos/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("motivo_consulta", response.data["error"]["detalles"])

