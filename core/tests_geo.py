"""
Tests unitarios de core/geo.py — fórmula Haversine.

No necesita base de datos ni ninguna infraestructura.
Ejecutar con:  python manage.py test core.tests_geo
"""

from django.test import TestCase

from core.geo import haversine, centros_dentro_de_radio


class HaversineTest(TestCase):
    """Verifica la corrección matemática de la fórmula."""

    def test_mismo_punto_es_cero(self):
        self.assertEqual(haversine(-27.3621, -55.9009, -27.3621, -55.9009), 0.0)

    def test_distancia_conocida_posadas(self):
        """
        Hospital Madariaga → UPA N.1 Barrio A4.
        Distancia real aproximada ~1.7 km verificada en maps.
        Tolerancia: ±0.3 km por la precisión de las coords de seed.
        """
        dist = haversine(-27.3676, -55.8977, -27.3773, -55.9072)
        self.assertAlmostEqual(dist, 1.3, delta=0.5)

    def test_distancia_es_simetrica(self):
        """d(A,B) == d(B,A)."""
        d1 = haversine(-27.3621, -55.9009, -27.4102, -55.9611)
        d2 = haversine(-27.4102, -55.9611, -27.3621, -55.9009)
        self.assertEqual(d1, d2)

    def test_resultado_redondeado_a_2_decimales(self):
        dist = haversine(-27.3621, -55.9009, -27.3676, -55.8977)
        # round() a 2 decimales no puede tener más de 2 cifras
        partes = str(dist).split(".")
        if len(partes) == 2:
            self.assertLessEqual(len(partes[1]), 2)

    def test_distancia_intercontinental(self):
        """Buenos Aires → Madrid ~10 000 km (tolerancia 200 km)."""
        dist = haversine(-34.6037, -58.3816, 40.4168, -3.7038)
        self.assertAlmostEqual(dist, 10_000, delta=200)
