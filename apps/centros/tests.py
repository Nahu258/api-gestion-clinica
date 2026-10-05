"""
Tests del módulo Centros de Emergencia (issues #8, #9, #10).

Ejecutar con:  python manage.py test apps.centros

Cubre:
- Modelo CentroEmergencia: creación, defaults, __str__, tipos, validación, queries
- Comando seed_centros: idempotencia, tipos cubiertos, coordenadas
- Endpoint GET /api/v1/centros/cercanos/: respuestas 200 y 400, filtros, ordenamiento
- Choices del campo tipo
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import CentroEmergencia


class CentroEmergenciaCreacionTest(TestCase):
    """Creación exitosa y valores por defecto."""

    def _centro_valido(self, **cambios) -> dict:
        """Payload mínimo correcto para un CentroEmergencia."""
        datos = {
            "nombre": "Hospital SAMIC Madariaga",
            "tipo": CentroEmergencia.Tipo.HOSPITAL,
            "direccion": "Av. Marconi 45, Posadas",
            "latitud": Decimal("-27.3621000"),
            "longitud": Decimal("-55.9009000"),
        }
        datos.update(cambios)
        return datos

    def test_creacion_exitosa(self):
        """Un centro con todos los campos mínimos se guarda sin errores."""
        centro = CentroEmergencia.objects.create(**self._centro_valido())
        self.assertIsNotNone(centro.pk)

    def test_valores_por_defecto(self):
        """Ciudad, provincia, pais, activo y atiende_24h tienen defaults correctos."""
        centro = CentroEmergencia.objects.create(**self._centro_valido())
        self.assertEqual(centro.ciudad, "Posadas")
        self.assertEqual(centro.provincia, "Misiones")
        self.assertEqual(centro.pais, "Argentina")
        self.assertTrue(centro.activo)
        self.assertTrue(centro.atiende_24h)
        self.assertEqual(centro.telefono, "")

    def test_str_retorna_formato_correcto(self):
        """__str__ devuelve '{nombre} ({tipo legible}) - {ciudad}'."""
        centro = CentroEmergencia.objects.create(**self._centro_valido())
        esperado = "Hospital SAMIC Madariaga (Hospital público) - Posadas"
        self.assertEqual(str(centro), esperado)

    def test_str_con_tipo_upa(self):
        centro = CentroEmergencia.objects.create(
            **self._centro_valido(tipo=CentroEmergencia.Tipo.UPA, nombre="UPA Norte")
        )
        self.assertIn("UPA / Sala de primeros auxilios", str(centro))

    def test_creado_en_se_setea_automaticamente(self):
        """El campo creado_en se asigna al guardar sin pasarlo explícitamente."""
        centro = CentroEmergencia.objects.create(**self._centro_valido())
        self.assertIsNotNone(centro.creado_en)


class CentroEmergenciaTiposTest(TestCase):
    """Verifica que todos los tipos definidos en la issue sean válidos."""

    def test_todos_los_tipos_se_pueden_guardar(self):
        tipos = [
            CentroEmergencia.Tipo.HOSPITAL,
            CentroEmergencia.Tipo.UPA,
            CentroEmergencia.Tipo.SAME,
            CentroEmergencia.Tipo.BOMBEROS,
            CentroEmergencia.Tipo.POLICIA,
            CentroEmergencia.Tipo.OTRO,
        ]
        for tipo in tipos:
            centro = CentroEmergencia.objects.create(
                nombre=f"Centro {tipo}",
                tipo=tipo,
                direccion="Calle Falsa 123",
                latitud=Decimal("-27.0000000"),
                longitud=Decimal("-55.0000000"),
            )
            self.assertEqual(centro.tipo, tipo)


class CentroEmergenciaValidacionTest(TestCase):
    """Validación de campos obligatorios."""

    def test_nombre_vacio_falla_validacion(self):
        centro = CentroEmergencia(
            nombre="",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Calle Falsa 123",
            latitud=Decimal("-27.0"),
            longitud=Decimal("-55.0"),
        )
        with self.assertRaises(ValidationError):
            centro.full_clean()

    def test_direccion_vacia_falla_validacion(self):
        centro = CentroEmergencia(
            nombre="Hospital Test",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="",
            latitud=Decimal("-27.0"),
            longitud=Decimal("-55.0"),
        )
        with self.assertRaises(ValidationError):
            centro.full_clean()

    def test_tipo_invalido_falla_validacion(self):
        centro = CentroEmergencia(
            nombre="Hospital Test",
            tipo="tipo_inexistente",
            direccion="Calle Falsa 123",
            latitud=Decimal("-27.0"),
            longitud=Decimal("-55.0"),
        )
        with self.assertRaises(ValidationError):
            centro.full_clean()


class CentroEmergenciaQueryTest(TestCase):
    """Consultas y filtros básicos."""

    def setUp(self):
        CentroEmergencia.objects.create(
            nombre="Hospital A", tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Dir A", latitud=Decimal("-27.1"), longitud=Decimal("-55.1"),
            activo=True,
        )
        CentroEmergencia.objects.create(
            nombre="Comisaria B", tipo=CentroEmergencia.Tipo.POLICIA,
            direccion="Dir B", latitud=Decimal("-27.2"), longitud=Decimal("-55.2"),
            activo=False,
        )

    def test_filtrar_solo_activos(self):
        activos = CentroEmergencia.objects.filter(activo=True)
        self.assertEqual(activos.count(), 1)
        self.assertEqual(activos.first().nombre, "Hospital A")

    def test_filtrar_por_tipo(self):
        hospitales = CentroEmergencia.objects.filter(tipo=CentroEmergencia.Tipo.HOSPITAL)
        self.assertEqual(hospitales.count(), 1)

    def test_orden_por_nombre(self):
        """El ordering por defecto del Meta es alfabético por nombre."""
        nombres = list(
            CentroEmergencia.objects.values_list("nombre", flat=True)
        )
        self.assertEqual(nombres, sorted(nombres))


class SeedCentrosCommandTest(TestCase):
    """Tests del comando de management seed_centros."""

    def _run_seed(self, limpiar=False):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command("seed_centros", limpiar=limpiar, stdout=out)
        return out.getvalue()

    def test_seed_carga_centros(self):
        """El comando crea centros en la base de datos."""
        self._run_seed()
        self.assertGreater(CentroEmergencia.objects.count(), 0)

    def test_seed_es_idempotente(self):
        """Correr el seed dos veces no duplica registros."""
        self._run_seed()
        cantidad_primera_vez = CentroEmergencia.objects.count()
        self._run_seed()
        self.assertEqual(CentroEmergencia.objects.count(), cantidad_primera_vez)

    def test_seed_con_limpiar_resetea(self):
        """Con --limpiar, los centros anteriores se borran y se vuelven a cargar."""
        self._run_seed()
        cantidad = CentroEmergencia.objects.count()
        self._run_seed(limpiar=True)
        self.assertEqual(CentroEmergencia.objects.count(), cantidad)

    def test_seed_incluye_todos_los_tipos(self):
        """El seedeo carga al menos un centro de cada tipo."""
        self._run_seed()
        tipos_cargados = set(CentroEmergencia.objects.values_list("tipo", flat=True))
        tipos_esperados = {
            CentroEmergencia.Tipo.HOSPITAL,
            CentroEmergencia.Tipo.UPA,
            CentroEmergencia.Tipo.SAME,
            CentroEmergencia.Tipo.BOMBEROS,
            CentroEmergencia.Tipo.POLICIA,
        }
        self.assertTrue(tipos_esperados.issubset(tipos_cargados))

    def test_seed_centros_tienen_coordenadas_validas(self):
        """Todos los centros cargados tienen latitud y longitud no nulos."""
        self._run_seed()
        sin_coords = CentroEmergencia.objects.filter(
            latitud__isnull=True
        ).count()
        self.assertEqual(sin_coords, 0)

    def test_seed_output_indica_creados(self):
        """La salida del comando menciona cuántos registros se crearon."""
        output = self._run_seed()
        self.assertIn("creados", output)


# ---------------------------------------------------------------------------
# Tests del endpoint GET /api/v1/centros/cercanos/  (issue #10)
# ---------------------------------------------------------------------------

class CentrosCercanosEndpointTest(APITestCase):
    """Tests de integración del endpoint de búsqueda por proximidad."""

    URL = "/api/v1/centros/cercanos/"

    # Coordenadas del centro de Posadas (Plaza 9 de Julio ~)
    LAT_POSADAS = -27.3676
    LON_POSADAS = -55.8977

    def _crear_centro(self, nombre="Hospital Test", tipo=None, lat=-27.3680, lon=-55.8985, activo=True):
        return CentroEmergencia.objects.create(
            nombre=nombre,
            tipo=tipo or CentroEmergencia.Tipo.HOSPITAL,
            direccion="Calle Falsa 123",
            latitud=lat,
            longitud=lon,
            activo=activo,
        )

    # ── Casos exitosos (200) ────────────────────────────────────────────────

    def test_200_con_resultados(self):
        """Devuelve 200 y una lista cuando hay centros dentro del radio."""
        self._crear_centro()
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": 5})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreater(resp.data["cantidad"], 0)

    def test_200_sin_resultados_fuera_de_radio(self):
        """Devuelve 200 con lista vacía si no hay centros en el radio."""
        # Centro en Buenos Aires, búsqueda en Posadas
        self._crear_centro(lat=-34.6037, lon=-58.3816)
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": 5})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["cantidad"], 0)

    def test_200_ordenado_por_distancia(self):
        """Los resultados vienen de más cercano a más lejano."""
        self._crear_centro(nombre="Lejos",  lat=-27.4000, lon=-55.9200)  # ~4 km
        self._crear_centro(nombre="Cerca",  lat=-27.3680, lon=-55.8985)  # ~0.1 km
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": 10})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        nombres = [r["nombre"] for r in resp.data["resultados"]]
        self.assertEqual(nombres[0], "Cerca")
        self.assertEqual(nombres[-1], "Lejos")

    def test_200_filtro_por_tipo(self):
        """El parámetro tipo filtra correctamente."""
        self._crear_centro(nombre="Hospital A", tipo=CentroEmergencia.Tipo.HOSPITAL)
        self._crear_centro(nombre="Bomberos B", tipo=CentroEmergencia.Tipo.BOMBEROS)
        resp = self.client.get(self.URL, {
            "lat": self.LAT_POSADAS, "lon": self.LON_POSADAS,
            "radio_km": 5, "tipo": "hospital",
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        tipos = {r["tipo"] for r in resp.data["resultados"]}
        self.assertEqual(tipos, {"hospital"})

    def test_200_no_devuelve_centros_inactivos(self):
        """Centros con activo=False no aparecen en los resultados."""
        self._crear_centro(nombre="Inactivo", activo=False)
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": 5})
        nombres = [r["nombre"] for r in resp.data["resultados"]]
        self.assertNotIn("Inactivo", nombres)

    def test_200_respuesta_incluye_distancia_km(self):
        """Cada resultado tiene el campo distancia_km."""
        self._crear_centro()
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": 5})
        self.assertIn("distancia_km", resp.data["resultados"][0])

    def test_200_radio_km_default_es_10(self):
        """Sin radio_km, el default es 10 km y no falla."""
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ── Errores de validación (400) ─────────────────────────────────────────

    def test_400_sin_lat(self):
        resp = self.client.get(self.URL, {"lon": self.LON_POSADAS})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lat", resp.data["error"]["mensaje"])

    def test_400_sin_lon(self):
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lon", resp.data["error"]["mensaje"])

    def test_400_lat_no_numerico(self):
        resp = self.client.get(self.URL, {"lat": "abc", "lon": self.LON_POSADAS})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_400_lat_fuera_de_rango(self):
        resp = self.client.get(self.URL, {"lat": 999, "lon": self.LON_POSADAS})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_400_radio_negativo(self):
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": -1})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_400_radio_supera_maximo(self):
        resp = self.client.get(self.URL, {"lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "radio_km": 999})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_400_tipo_desconocido(self):
        resp = self.client.get(self.URL, {
            "lat": self.LAT_POSADAS, "lon": self.LON_POSADAS, "tipo": "farmacia",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_405_metodo_no_permitido(self):
        """POST no está soportado en este endpoint."""
        resp = self.client.post(self.URL, {})
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class CentroDetalleAPITestCase(APITestCase):
    """Tests del endpoint GET /api/v1/centros/{id}/."""

    def setUp(self):
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital Madariaga",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Av. Marconi 45",
            ciudad="Posadas",
            telefono="(0376) 447-7000",
            latitud=Decimal("-27.3621"),
            longitud=Decimal("-55.9009"),
            activo=True,
        )

    def test_200_obtener_centro_existente(self):
        resp = self.client.get(f"/api/v1/centros/{self.centro.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], self.centro.pk)
        self.assertEqual(resp.data["nombre"], "Hospital Madariaga")
        self.assertEqual(resp.data["telefono"], "(0376) 447-7000")

    def test_404_centro_inexistente(self):
        resp = self.client.get("/api/v1/centros/99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_centro_inactivo(self):
        self.centro.activo = False
        self.centro.save()
        resp = self.client.get(f"/api/v1/centros/{self.centro.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
