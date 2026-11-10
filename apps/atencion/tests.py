"""
Tests del módulo Atención de Emergencias (issue AE4-04 / #11).

Ejecutar con:  python manage.py test apps.atencion

Cubre:
- Modelo SolicitudAtencion: creación como invitado y autenticado, __str__, es_invitado
- services.crear_solicitud: casos OK, centro inactivo, centro inexistente
- services.actualizar_estado: transiciones válidas e inválidas
- Endpoint POST /api/v1/atencion/solicitudes/: 201, 400
- Endpoint GET  /api/v1/atencion/solicitudes/{id}/: 200, 404
- Endpoint PATCH /api/v1/atencion/solicitudes/{id}/: 200, 400 (transición inválida), 404
"""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.centros.models import CentroEmergencia
from apps.atencion.models import SolicitudAtencion
from apps.atencion import services


# ---------------------------------------------------------------------------
# Fixtures comunes
# ---------------------------------------------------------------------------

def crear_centro(**kwargs) -> CentroEmergencia:
    defaults = {
        "nombre": "Hospital Test",
        "tipo": CentroEmergencia.Tipo.HOSPITAL,
        "direccion": "Calle Falsa 123",
        "latitud": Decimal("-27.3676"),
        "longitud": Decimal("-55.8977"),
        "activo": True,
    }
    defaults.update(kwargs)
    return CentroEmergencia.objects.create(**defaults)


# ---------------------------------------------------------------------------
# Tests del modelo
# ---------------------------------------------------------------------------

class SolicitudAtencionModelTest(TestCase):

    def setUp(self):
        self.centro = crear_centro()

    def test_creacion_como_invitado(self):
        """usuario_id=None → es_invitado=True."""
        s = SolicitudAtencion.objects.create(
            centro=self.centro,
            modo=SolicitudAtencion.Modo.SOLICITUD,
            nombre_invitado="Juan",
        )
        self.assertIsNotNone(s.pk)
        self.assertTrue(s.es_invitado)
        self.assertIsNone(s.usuario_id)

    def test_creacion_como_usuario_registrado(self):
        """usuario_id distinto de None → es_invitado=False."""
        s = SolicitudAtencion.objects.create(
            centro=self.centro,
            modo=SolicitudAtencion.Modo.AVISO,
            usuario_id=42,
        )
        self.assertFalse(s.es_invitado)

    def test_estado_default_es_pendiente(self):
        s = SolicitudAtencion.objects.create(centro=self.centro, modo=SolicitudAtencion.Modo.SOLICITUD)
        self.assertEqual(s.estado, SolicitudAtencion.Estado.PENDIENTE)

    def test_str_formato_invitado(self):
        s = SolicitudAtencion.objects.create(
            centro=self.centro, modo=SolicitudAtencion.Modo.SOLICITUD, nombre_invitado="María"
        )
        self.assertIn("María", str(s))
        self.assertIn("Hospital Test", str(s))

    def test_str_formato_usuario_registrado(self):
        s = SolicitudAtencion.objects.create(
            centro=self.centro, modo=SolicitudAtencion.Modo.SOLICITUD, usuario_id=7
        )
        self.assertIn("usuario 7", str(s))

    def test_ordering_mas_reciente_primero(self):
        """El ordering por defecto es -creado_en."""
        s1 = SolicitudAtencion.objects.create(centro=self.centro, modo=SolicitudAtencion.Modo.SOLICITUD)
        s2 = SolicitudAtencion.objects.create(centro=self.centro, modo=SolicitudAtencion.Modo.AVISO)
        primera = SolicitudAtencion.objects.first()
        self.assertEqual(primera.pk, s2.pk)


# ---------------------------------------------------------------------------
# Tests de la capa de servicios
# ---------------------------------------------------------------------------

class SolicitudServicesTest(TestCase):

    def setUp(self):
        self.centro = crear_centro()
        # Deshabilitar publicación de eventos RabbitMQ
        patcher = patch("apps.atencion.services.settings.EVENTOS_HABILITADOS", False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _datos_base(self, **cambios) -> dict:
        datos = {
            "centro_id": self.centro.pk,
            "modo": SolicitudAtencion.Modo.SOLICITUD,
        }
        datos.update(cambios)
        return datos

    def test_crear_solicitud_exitosa(self):
        s = services.crear_solicitud(self._datos_base())
        self.assertIsNotNone(s.pk)
        self.assertEqual(s.estado, SolicitudAtencion.Estado.PENDIENTE)
        self.assertEqual(s.centro, self.centro)

    def test_crear_solicitud_como_invitado(self):
        s = services.crear_solicitud(self._datos_base(nombre_invitado="Juan", telefono_invitado="3764-111"))
        self.assertTrue(s.es_invitado)
        self.assertEqual(s.nombre_invitado, "Juan")

    def test_crear_solicitud_con_usuario_registrado(self):
        s = services.crear_solicitud(self._datos_base(usuario_id=99))
        self.assertFalse(s.es_invitado)
        self.assertEqual(s.usuario_id, 99)

    def test_crear_solicitud_centro_inexistente_falla(self):
        from core.exceptions import DatosInvalidos
        with self.assertRaises(DatosInvalidos):
            services.crear_solicitud(self._datos_base(centro_id=9999))

    def test_crear_solicitud_centro_inactivo_falla(self):
        from core.exceptions import DatosInvalidos
        inactivo = crear_centro(nombre="Inactivo", activo=False)
        with self.assertRaises(DatosInvalidos):
            services.crear_solicitud(self._datos_base(centro_id=inactivo.pk))

    def test_obtener_solicitud_existente(self):
        s = services.crear_solicitud(self._datos_base())
        obtenida = services.obtener_solicitud(s.pk)
        self.assertEqual(obtenida.pk, s.pk)

    def test_obtener_solicitud_inexistente_lanza_404(self):
        from core.exceptions import RecursoNoEncontrado
        with self.assertRaises(RecursoNoEncontrado):
            services.obtener_solicitud(9999)

    def test_transicion_valida_pendiente_a_aceptado(self):
        s = services.crear_solicitud(self._datos_base())
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.ACEPTADO)
        self.assertEqual(s.estado, SolicitudAtencion.Estado.ACEPTADO)

    def test_transicion_completa_hasta_atendido(self):
        s = services.crear_solicitud(self._datos_base())
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.ACEPTADO)
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.EN_CAMINO)
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.ATENDIDO)
        self.assertEqual(s.estado, SolicitudAtencion.Estado.ATENDIDO)

    def test_transicion_invalida_lanza_409(self):
        from core.exceptions import ReglaDeNegocioViolada
        s = services.crear_solicitud(self._datos_base())
        # No se puede pasar de PENDIENTE a ATENDIDO directamente
        with self.assertRaises(ReglaDeNegocioViolada):
            services.actualizar_estado(s, SolicitudAtencion.Estado.ATENDIDO)

    def test_estado_terminal_atendido_no_se_puede_modificar(self):
        from core.exceptions import ReglaDeNegocioViolada
        s = services.crear_solicitud(self._datos_base())
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.ACEPTADO)
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.EN_CAMINO)
        s = services.actualizar_estado(s, SolicitudAtencion.Estado.ATENDIDO)
        with self.assertRaises(ReglaDeNegocioViolada):
            services.actualizar_estado(s, SolicitudAtencion.Estado.CANCELADO)

    def test_estado_invalido_lanza_400(self):
        from core.exceptions import DatosInvalidos
        s = services.crear_solicitud(self._datos_base())
        with self.assertRaises(DatosInvalidos):
            services.actualizar_estado(s, "estado_fantasma")


# ---------------------------------------------------------------------------
# Tests de los endpoints (integración)
# ---------------------------------------------------------------------------

class SolicitudEndpointTest(APITestCase):

    URL_LISTA = "/api/v1/atencion/solicitudes/"

    def url_detalle(self, pk):
        return f"/api/v1/atencion/solicitudes/{pk}/"

    def setUp(self):
        self.centro = crear_centro()
        # Deshabilitar publicación de eventos RabbitMQ
        patcher = patch("apps.atencion.services.settings.EVENTOS_HABILITADOS", False)
        patcher.start()
        self.addCleanup(patcher.stop)

    @staticmethod
    def _codigo(resp_post) -> dict:
        return {"HTTP_X_CODIGO_SEGUIMIENTO": resp_post.data["codigo_seguimiento"]}

    def _operador(self):
        from django.contrib.auth import get_user_model
        from apps.auth_usuarios.models import PerfilExtendido as PerfilUsuario
        user = get_user_model().objects.create_user("oper", "oper@x.com", "Clave12345!")
        PerfilUsuario.objects.update_or_create(
            usuario=user, defaults={"rol": "OPERADOR_CENTRO", "centro": self.centro}
        )
        return user

    def _payload_base(self, **cambios) -> dict:
        datos = {
            "centro_id": self.centro.pk,
            "modo": "solicitud",
        }
        datos.update(cambios)
        return datos

    # ── POST ────────────────────────────────────────────────────────────────

    def test_post_201_invitado(self):
        resp = self.client.post(self.URL_LISTA, self._payload_base(nombre_invitado="Ana"), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("Location", resp.headers)
        self.assertEqual(resp.data["estado"], "pendiente")

    def test_post_201_usuario_registrado_toma_id_del_jwt(self):
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.create_user("pac", "pac@x.com", "Clave12345!")
        self.client.force_authenticate(user)
        resp = self.client.post(self.URL_LISTA, self._payload_base(usuario_id=5), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        # El usuario_id del cuerpo se ignora: manda el JWT.
        self.assertEqual(resp.data["usuario_id"], user.id)

    def test_post_invitado_ignora_usuario_id_del_cliente(self):
        resp = self.client.post(self.URL_LISTA, self._payload_base(usuario_id=5), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(resp.data["usuario_id"])

    def test_post_devuelve_codigo_seguimiento_y_get_no(self):
        resp = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        codigo = resp.data["codigo_seguimiento"]
        self.assertGreaterEqual(len(codigo), 40)
        get = self.client.get(self.url_detalle(resp.data["id"]), HTTP_X_CODIGO_SEGUIMIENTO=codigo)
        self.assertNotIn("codigo_seguimiento", get.data)

    def test_post_201_con_coordenadas(self):
        resp = self.client.post(
            self.URL_LISTA,
            self._payload_base(lat_usuario=-27.3676, lon_usuario=-55.8977),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_post_400_sin_centro_id(self):
        resp = self.client.post(self.URL_LISTA, {"modo": "solicitud"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_400_sin_modo(self):
        resp = self.client.post(self.URL_LISTA, {"centro_id": self.centro.pk}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_400_modo_invalido(self):
        resp = self.client.post(self.URL_LISTA, self._payload_base(modo="urgente"), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_400_centro_inexistente(self):
        resp = self.client.post(self.URL_LISTA, self._payload_base(centro_id=9999), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ── GET detalle ─────────────────────────────────────────────────────────

    def test_get_200_solicitud_existente(self):
        resp_post = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        pk = resp_post.data["id"]
        resp = self.client.get(self.url_detalle(pk), **self._codigo(resp_post))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], pk)
        self.assertIn("centro_nombre", resp.data)

    def test_get_404_solicitud_inexistente(self):
        resp = self.client.get(self.url_detalle(9999))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── PATCH estado ────────────────────────────────────────────────────────

    def test_patch_200_transicion_valida(self):
        resp_post = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        pk = resp_post.data["id"]
        self.client.force_authenticate(self._operador())
        resp = self.client.patch(self.url_detalle(pk), {"estado": "aceptado"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["estado"], "aceptado")

    def test_patch_409_transicion_invalida(self):
        resp_post = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        pk = resp_post.data["id"]
        # Saltar de pendiente a atendido sin pasar por aceptado/en_camino
        self.client.force_authenticate(self._operador())
        resp = self.client.patch(self.url_detalle(pk), {"estado": "atendido"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_patch_400_estado_invalido(self):
        resp_post = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        pk = resp_post.data["id"]
        self.client.force_authenticate(self._operador())
        resp = self.client.patch(self.url_detalle(pk), {"estado": "turbiado"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_404_solicitud_inexistente(self):
        resp = self.client.patch(self.url_detalle(9999), {"estado": "aceptado"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── IDOR / BOLA ─────────────────────────────────────────────────────────

    def test_get_sin_codigo_ni_jwt_responde_404(self):
        pk = self.client.post(self.URL_LISTA, self._payload_base(), format="json").data["id"]
        self.assertEqual(self.client.get(self.url_detalle(pk)).status_code, 404)

    def test_get_con_codigo_ajeno_responde_404(self):
        a = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        b = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        resp = self.client.get(self.url_detalle(a.data["id"]), **self._codigo(b))
        self.assertEqual(resp.status_code, 404)

    def test_paciente_no_ve_solicitud_de_otro_paciente(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        duenio = User.objects.create_user("duenio", "d@x.com", "Clave12345!")
        intruso = User.objects.create_user("intruso", "i@x.com", "Clave12345!")
        self.client.force_authenticate(duenio)
        pk = self.client.post(self.URL_LISTA, self._payload_base(), format="json").data["id"]
        self.assertEqual(self.client.get(self.url_detalle(pk)).status_code, 200)
        self.client.force_authenticate(intruso)
        self.assertEqual(self.client.get(self.url_detalle(pk)).status_code, 404)
        resp = self.client.patch(self.url_detalle(pk), {"estado": "cancelado"}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_patch_sin_codigo_no_puede_cancelar(self):
        pk = self.client.post(self.URL_LISTA, self._payload_base(), format="json").data["id"]
        resp = self.client.patch(self.url_detalle(pk), {"estado": "cancelado"}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_invitado_con_codigo_cancela_pero_no_acepta(self):
        post = self.client.post(self.URL_LISTA, self._payload_base(), format="json")
        pk = post.data["id"]
        resp = self.client.patch(self.url_detalle(pk), {"estado": "aceptado"}, format="json", **self._codigo(post))
        self.assertEqual(resp.status_code, 404)
        resp = self.client.patch(self.url_detalle(pk), {"estado": "cancelado"}, format="json", **self._codigo(post))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["estado"], "cancelado")

    def test_operador_de_otro_centro_no_accede(self):
        from django.contrib.auth import get_user_model
        from apps.auth_usuarios.models import PerfilExtendido as PerfilUsuario
        otro_centro = crear_centro(nombre="Otro Centro")
        user = get_user_model().objects.create_user("oper2", "o2@x.com", "Clave12345!")
        PerfilUsuario.objects.update_or_create(usuario=user, defaults={"rol": "OPERADOR_CENTRO", "centro": otro_centro})
        pk = self.client.post(self.URL_LISTA, self._payload_base(), format="json").data["id"]
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(self.url_detalle(pk)).status_code, 404)

    def test_405_get_en_lista(self):
        """GET en la colección no está soportado."""
        resp = self.client.get(self.URL_LISTA)
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
