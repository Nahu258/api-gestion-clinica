"""
Tests de la API de gestión de instituciones — Épica 5, issue AE5-01 (#31).
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import (
    AsignacionMedico,
    CentroEmergencia,
    CentroEspecialidad,
    Especialidad,
)
from apps.clinica.models import Medico

User = get_user_model()

URL_LISTADO = "/api/v1/admin/centros/"


def _usuario(email: str, rol: str, centro=None):
    user = User.objects.create_user(username=email, email=email, password="pass")
    PerfilExtendido.objects.create(usuario=user, rol=rol, centro=centro)
    return user


def _token(user) -> str:
    return str(RefreshToken.for_user(user).access_token)


class AdminCentrosTests(APITestCase):
    def setUp(self):
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital Madariaga",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Av. López Torres 1177",
            ciudad="Posadas",
            latitud=-27.371,
            longitud=-55.891,
        )
        self.inactivo = CentroEmergencia.objects.create(
            nombre="UPA Cerrada",
            tipo=CentroEmergencia.Tipo.UPA,
            direccion="Calle 1",
            ciudad="Oberá",
            latitud=-27.48,
            longitud=-55.12,
            activo=False,
        )

        pediatria = Especialidad.objects.create(nombre="Pediatría", codigo="pediatria")
        trauma = Especialidad.objects.create(nombre="Traumatología", codigo="trauma")
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=pediatria)
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=trauma, activo=False)
        medico = Medico.objects.create(nombre="Dra. Sofía")
        AsignacionMedico.objects.create(medico=medico, centro=self.centro, especialidad=pediatria)
        AsignacionMedico.objects.create(medico=medico, centro=self.centro, especialidad=trauma)

        self.admin = _usuario("admin@test.com", PerfilExtendido.Rol.ADMIN)
        self.operador = _usuario(
            "operador@test.com", PerfilExtendido.Rol.OPERADOR_CENTRO, centro=self.centro
        )

    def _como(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(user)}")

    def _payload(self, **extra):
        datos = {
            "nombre": "Sanatorio Nuevo",
            "tipo": "clinica",
            "direccion": "Av. Uruguay 2000",
            "ciudad": "Posadas",
            "provincia": "Misiones",
            "pais": "Argentina",
            "latitud": "-27.3700000",
            "longitud": "-55.9000000",
            "telefono": "3764-000000",
            "atiende_24h": True,
        }
        datos.update(extra)
        return datos

    # ── Permisos ───────────────────────────────────────────────────────────
    def test_sin_autenticar_rechaza(self):
        response = self.client.get(URL_LISTADO)
        self.assertIn(response.status_code, (401, 403))

    def test_operador_recibe_403(self):
        self._como(self.operador)
        self.assertEqual(self.client.get(URL_LISTADO).status_code, 403)
        self.assertEqual(
            self.client.post(URL_LISTADO, self._payload(), format="json").status_code, 403
        )
        url = f"{URL_LISTADO}{self.centro.id}/desactivar/"
        self.assertEqual(self.client.post(url).status_code, 403)

    def test_superuser_sin_perfil_tiene_acceso(self):
        root = User.objects.create_superuser("root", "root@test.com", "pass")
        self._como(root)
        self.assertEqual(self.client.get(URL_LISTADO).status_code, 200)

    # ── Listado ────────────────────────────────────────────────────────────
    def test_listado_incluye_inactivos_y_conteos(self):
        self._como(self.admin)
        response = self.client.get(URL_LISTADO)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        por_id = {c["id"]: c for c in response.data["results"]}
        self.assertIn(self.inactivo.id, por_id)
        self.assertFalse(por_id[self.inactivo.id]["activo"])

        madariaga = por_id[self.centro.id]
        self.assertEqual(madariaga["especialidades_activas"], 1)
        self.assertEqual(madariaga["medicos_asignados"], 1)
        self.assertEqual(madariaga["operadores"], 1)

    def test_listado_filtros(self):
        self._como(self.admin)
        casos = {
            "?q=madariaga": [self.centro.id],
            "?q=calle": [self.inactivo.id],
            "?tipo=upa": [self.inactivo.id],
            "?ciudad=posadas": [self.centro.id],
            "?activo=false": [self.inactivo.id],
            "?activo=true": [self.centro.id],
        }
        for query, esperado in casos.items():
            with self.subTest(query=query):
                response = self.client.get(URL_LISTADO + query)
                self.assertEqual(response.status_code, 200)
                self.assertEqual([c["id"] for c in response.data["results"]], esperado)

    def test_listado_filtro_tipo_invalido_400(self):
        self._como(self.admin)
        self.assertEqual(self.client.get(URL_LISTADO + "?tipo=spa").status_code, 400)

    def test_listado_paginado(self):
        self._como(self.admin)
        response = self.client.get(URL_LISTADO + "?page_size=1")
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIsNotNone(response.data["next"])

    # ── Alta ───────────────────────────────────────────────────────────────
    def test_alta_de_centro(self):
        self._como(self.admin)
        response = self.client.post(URL_LISTADO, self._payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["nombre"], "Sanatorio Nuevo")
        self.assertTrue(response.data["activo"])
        self.assertEqual(response.data["especialidades_activas"], 0)
        self.assertTrue(CentroEmergencia.objects.filter(nombre="Sanatorio Nuevo").exists())

    def test_alta_valida_coordenadas_y_tipo(self):
        self._como(self.admin)
        casos = [
            ({"latitud": "-91"}, "latitud"),
            ({"latitud": "90.5"}, "latitud"),
            ({"longitud": "180.1"}, "longitud"),
            ({"longitud": "-200"}, "longitud"),
            ({"tipo": "spa"}, "tipo"),
            ({"nombre": "   "}, "nombre"),
        ]
        for extra, campo in casos:
            with self.subTest(campo=campo, extra=extra):
                response = self.client.post(URL_LISTADO, self._payload(**extra), format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(campo, response.data["error"]["detalles"])

    def test_alta_acepta_limites_de_coordenadas(self):
        self._como(self.admin)
        response = self.client.post(
            URL_LISTADO, self._payload(latitud="90", longitud="-180"), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)

    # ── Detalle y edición ──────────────────────────────────────────────────
    def test_detalle_de_centro_inactivo(self):
        self._como(self.admin)
        response = self.client.get(f"{URL_LISTADO}{self.inactivo.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["provincia"], "Misiones")
        self.assertFalse(response.data["activo"])

    def test_detalle_inexistente_404(self):
        self._como(self.admin)
        self.assertEqual(self.client.get(f"{URL_LISTADO}9999/").status_code, 404)

    def test_edicion_parcial(self):
        self._como(self.admin)
        response = self.client.patch(
            f"{URL_LISTADO}{self.centro.id}/",
            {"telefono": "0376-111", "atiende_24h": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.centro.refresh_from_db()
        self.assertEqual(self.centro.telefono, "0376-111")
        self.assertFalse(self.centro.atiende_24h)
        self.assertEqual(self.centro.nombre, "Hospital Madariaga")

    def test_edicion_valida_coordenadas(self):
        self._como(self.admin)
        response = self.client.patch(
            f"{URL_LISTADO}{self.centro.id}/", {"latitud": "120"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_edicion_no_cambia_activo(self):
        """`activo` sólo se cambia con los endpoints de activar/desactivar."""
        self._como(self.admin)
        self.client.patch(f"{URL_LISTADO}{self.centro.id}/", {"activo": False}, format="json")
        self.centro.refresh_from_db()
        self.assertTrue(self.centro.activo)

    # ── Baja lógica ────────────────────────────────────────────────────────
    def test_desactivar_lo_quita_de_cercanos_y_conserva_historial(self):
        from apps.atencion.models import SolicitudAtencion

        solicitud = SolicitudAtencion.objects.create(centro=self.centro, motivo="Fiebre")
        cercanos = f"/api/v1/centros/cercanos/?lat=-27.371&lon=-55.891&radio_km=5"
        self.assertEqual(self.client.get(cercanos).data["cantidad"], 1)

        self._como(self.admin)
        response = self.client.post(f"{URL_LISTADO}{self.centro.id}/desactivar/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["activo"])

        self.client.credentials()
        self.assertEqual(self.client.get(cercanos).data["cantidad"], 0)
        self.assertTrue(CentroEmergencia.objects.filter(pk=self.centro.id).exists())
        self.assertTrue(SolicitudAtencion.objects.filter(pk=solicitud.pk).exists())

    def test_activar_reactiva(self):
        self._como(self.admin)
        response = self.client.post(f"{URL_LISTADO}{self.inactivo.id}/activar/")
        self.assertEqual(response.status_code, 200)
        self.inactivo.refresh_from_db()
        self.assertTrue(self.inactivo.activo)
