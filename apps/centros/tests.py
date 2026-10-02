"""
Tests unitarios del modelo CentroEmergencia (issue AE4-01 / #8).

Ejecutar con:  python manage.py test apps.centros

Cubre:
- Creación exitosa con campos obligatorios
- Validación de campos obligatorios (latitud/longitud/nombre)
- Comportamiento de __str__
- Valores por defecto (activo=True, atiende_24h=True, ciudad, provincia, pais)
- Choices del campo tipo
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

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
