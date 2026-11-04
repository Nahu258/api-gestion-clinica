"""
Tests de la API de guardias programadas — Épica 5, issue AE5-04 (#34).
"""

from datetime import time

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import AsignacionMedico, CentroEmergencia, CentroEspecialidad, Especialidad
from apps.clinica.models import DisponibilidadMedico, Medico

User = get_user_model()
Rol = PerfilExtendido.Rol


def _usuario(email, rol, centro=None, medico=None):
    user = User.objects.create_user(username=email, email=email, password="pass")
    PerfilExtendido.objects.create(usuario=user, rol=rol, centro=centro, medico=medico)
    return user


def _centro(nombre):
    return CentroEmergencia.objects.create(
        nombre=nombre, direccion="Calle 1", latitud=-27.37, longitud=-55.9
    )


class GuardiasTests(APITestCase):
    def setUp(self):
        self.centro_a = _centro("Hospital A")
        self.centro_b = _centro("Hospital B")
        self.pediatria = Especialidad.objects.create(nombre="Pediatría", codigo="pediatria")
        self.trauma = Especialidad.objects.create(nombre="Traumatología", codigo="traumatologia")
        for centro in (self.centro_a, self.centro_b):
            CentroEspecialidad.objects.create(centro=centro, especialidad=self.pediatria)
        CentroEspecialidad.objects.create(centro=self.centro_a, especialidad=self.trauma)

        self.sofia = Medico.objects.create(nombre="Dra. Sofía")
        self.pedro = Medico.objects.create(nombre="Dr. Pedro")
        AsignacionMedico.objects.create(medico=self.sofia, centro=self.centro_a, especialidad=self.pediatria)
        AsignacionMedico.objects.create(medico=self.sofia, centro=self.centro_b, especialidad=self.pediatria)
        AsignacionMedico.objects.create(medico=self.pedro, centro=self.centro_a, especialidad=self.trauma)

        self.admin = _usuario("admin@test.com", Rol.ADMIN)
        self.operador_a = _usuario("op.a@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_a)
        self.operador_b = _usuario("op.b@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_b)
        self.user_sofia = _usuario("sofia@test.com", Rol.MEDICO, centro=self.centro_a, medico=self.sofia)

        self.guardia_lunes = DisponibilidadMedico.objects.create(
            medico=self.sofia, centro=self.centro_a, dia_semana=0,
            hora_inicio=time(8, 0), hora_fin=time(14, 0),
        )

    def _como(self, user):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
        )

    def _url(self, centro, guardia=None):
        base = f"/api/v1/centros/{centro.id}/guardias/"
        return f"{base}{guardia.id}/" if guardia else base

    def _alta(self, centro=None, **extra):
        datos = {"medico_id": self.pedro.id, "dia_semana": 2, "hora_inicio": "20:00", "hora_fin": "23:59"}
        datos.update(extra)
        return self.client.post(self._url(centro or self.centro_a), datos, format="json")

    # ── Lectura ────────────────────────────────────────────────────────────
    def test_cronograma_del_centro_con_filtros(self):
        DisponibilidadMedico.objects.create(
            medico=self.pedro, centro=self.centro_a, dia_semana=1,
            hora_inicio=time(14, 0), hora_fin=time(20, 0),
        )
        DisponibilidadMedico.objects.create(
            medico=self.sofia, centro=self.centro_b, dia_semana=1,
            hora_inicio=time(8, 0), hora_fin=time(12, 0),
        )
        self._como(self.operador_a)
        response = self.client.get(self._url(self.centro_a))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cantidad"], 2)
        primera = response.data["guardias"][0]
        self.assertEqual(primera["medico_nombre"], "Dra. Sofía")
        self.assertEqual(primera["hora_inicio"], "08:00")
        self.assertEqual(primera["dia_nombre"], "Lunes")
        self.assertEqual(primera["especialidades"], [{"id": self.pediatria.id, "nombre": "Pediatría"}])

        filtros = {
            f"?medico_id={self.pedro.id}": ["Dr. Pedro"],
            f"?especialidad_id={self.pediatria.id}": ["Dra. Sofía"],
            "?dia_semana=1": ["Dr. Pedro"],
        }
        for query, esperado in filtros.items():
            with self.subTest(query=query):
                data = self.client.get(self._url(self.centro_a) + query).data
                self.assertEqual([g["medico_nombre"] for g in data["guardias"]], esperado)

    # ── Permisos ───────────────────────────────────────────────────────────
    def test_permisos_por_centro(self):
        self._como(self.operador_b)
        self.assertEqual(self.client.get(self._url(self.centro_a)).status_code, 403)
        self.assertEqual(self._alta().status_code, 403)
        self.assertEqual(
            self.client.delete(self._url(self.centro_a, self.guardia_lunes)).status_code, 403
        )

    def test_medico_no_escribe_ni_lee_el_cronograma_del_centro(self):
        self._como(self.user_sofia)
        self.assertEqual(self.client.get(self._url(self.centro_a)).status_code, 403)
        self.assertEqual(self._alta().status_code, 403)
        self.assertEqual(
            self.client.patch(self._url(self.centro_a, self.guardia_lunes), {"hora_fin": "15:00"}, format="json").status_code,
            403,
        )

    # ── Alta / edición / baja ──────────────────────────────────────────────
    def test_operador_crea_edita_y_borra(self):
        self._como(self.operador_a)
        creada = self._alta()
        self.assertEqual(creada.status_code, 201, creada.data)
        self.assertEqual(creada.data["hora_fin"], "23:59")
        self.assertTrue(creada.data["en_guardia_activa"])

        url = f"{self._url(self.centro_a)}{creada.data['id']}/"
        editada = self.client.patch(url, {"hora_inicio": "18:00", "en_guardia_activa": False}, format="json")
        self.assertEqual(editada.status_code, 200, editada.data)
        self.assertEqual(editada.data["hora_inicio"], "18:00")
        self.assertFalse(editada.data["en_guardia_activa"])

        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(DisponibilidadMedico.objects.filter(pk=creada.data["id"]).exists())

    def test_admin_opera_cualquier_centro(self):
        self._como(self.admin)
        self.assertEqual(self._alta(centro=self.centro_b, medico_id=self.sofia.id).status_code, 201)

    def test_guardia_de_otro_centro_404(self):
        self._como(self.operador_b)
        response = self.client.patch(
            f"{self._url(self.centro_b)}{self.guardia_lunes.id}/", {"hora_fin": "15:00"}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    # ── Validaciones ───────────────────────────────────────────────────────
    def test_hora_fin_debe_ser_posterior(self):
        self._como(self.operador_a)
        for inicio, fin in (("20:00", "08:00"), ("10:00", "10:00")):
            with self.subTest(inicio=inicio, fin=fin):
                response = self._alta(hora_inicio=inicio, hora_fin=fin)
                self.assertEqual(response.status_code, 400)
                self.assertIn("hora_fin", response.data["error"]["detalles"])

    def test_medico_no_asignado_al_centro(self):
        self._como(self.operador_b)
        response = self._alta(centro=self.centro_b, medico_id=self.pedro.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("medico_id", response.data["error"]["detalles"])

    def test_asignacion_inactiva_no_cuenta(self):
        AsignacionMedico.objects.filter(medico=self.pedro).update(activo=False)
        self._como(self.operador_a)
        self.assertEqual(self._alta().status_code, 400)

    def test_campos_invalidos(self):
        self._como(self.operador_a)
        casos = [({"dia_semana": 7}, "dia_semana"), ({"hora_inicio": "25:00"}, "hora_inicio"),
                 ({"medico_id": 9999}, "medico_id")]
        for extra, campo in casos:
            with self.subTest(campo=campo):
                response = self._alta(**extra)
                self.assertEqual(response.status_code, 400)
                self.assertIn(campo, response.data["error"]["detalles"])

    def test_rechaza_solapamiento_del_mismo_medico_incluso_en_otro_centro(self):
        self._como(self.admin)
        response = self._alta(centro=self.centro_b, medico_id=self.sofia.id,
                              dia_semana=0, hora_inicio="13:00", hora_fin="18:00")
        self.assertEqual(response.status_code, 400)
        conflictos = response.data["error"]["detalles"]["solapamiento"]
        self.assertEqual(conflictos[0]["id"], self.guardia_lunes.id)
        self.assertEqual(conflictos[0]["centro_nombre"], "Hospital A")
        self.assertIn("08:00 a 14:00", response.data["error"]["mensaje"])

    def test_permite_bloques_contiguos_y_otros_medicos(self):
        self._como(self.operador_a)
        contiguo = self._alta(medico_id=self.sofia.id, dia_semana=0, hora_inicio="14:00", hora_fin="20:00")
        self.assertEqual(contiguo.status_code, 201, contiguo.data)
        otro_medico = self._alta(dia_semana=0, hora_inicio="09:00", hora_fin="12:00")
        self.assertEqual(otro_medico.status_code, 201, otro_medico.data)

    def test_editar_no_choca_consigo_misma_pero_si_con_otra(self):
        DisponibilidadMedico.objects.create(
            medico=self.sofia, centro=self.centro_a, dia_semana=0,
            hora_inicio=time(16, 0), hora_fin=time(20, 0),
        )
        self._como(self.operador_a)
        url = self._url(self.centro_a, self.guardia_lunes)
        self.assertEqual(self.client.patch(url, {"hora_fin": "15:00"}, format="json").status_code, 200)
        choque = self.client.patch(url, {"hora_fin": "17:00"}, format="json")
        self.assertEqual(choque.status_code, 400)
        self.assertIn("solapamiento", choque.data["error"]["detalles"])

    # ── Mis guardias ───────────────────────────────────────────────────────
    def test_medico_lee_sus_guardias_de_todos_los_centros(self):
        DisponibilidadMedico.objects.create(
            medico=self.sofia, centro=self.centro_b, dia_semana=3,
            hora_inicio=time(8, 0), hora_fin=time(12, 0),
        )
        DisponibilidadMedico.objects.create(
            medico=self.pedro, centro=self.centro_a, dia_semana=3,
            hora_inicio=time(8, 0), hora_fin=time(12, 0),
        )
        self._como(self.user_sofia)
        response = self.client.get("/api/v1/medicos/mis-guardias/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cantidad"], 2)
        self.assertEqual(
            [(g["dia_nombre"], g["centro_nombre"]) for g in response.data["guardias"]],
            [("Lunes", "Hospital A"), ("Jueves", "Hospital B")],
        )
        self.assertIn(response.data["hoy"], range(7))

    def test_mis_guardias_exige_rol_medico(self):
        self._como(self.operador_a)
        self.assertEqual(self.client.get("/api/v1/medicos/mis-guardias/").status_code, 403)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/v1/medicos/mis-guardias/").status_code, 401)
