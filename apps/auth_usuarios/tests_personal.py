"""
Tests de la API de usuarios del personal — Épica 5, issue AE5-02 (#32).
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import AsignacionMedico, CentroEmergencia, CentroEspecialidad, Especialidad
from apps.clinica.models import Medico

User = get_user_model()
Rol = PerfilExtendido.Rol

URL = "/api/v1/admin/usuarios/"


def _usuario(email, rol, centro=None, medico=None, password="pass"):
    user = User.objects.create_user(username=email, email=email, password=password)
    PerfilExtendido.objects.create(usuario=user, rol=rol, centro=centro, medico=medico)
    return user


def _centro(nombre):
    return CentroEmergencia.objects.create(
        nombre=nombre, direccion="Calle 1", latitud=-27.37, longitud=-55.9
    )


class PersonalTests(APITestCase):
    def setUp(self):
        self.centro_a = _centro("Hospital A")
        self.centro_b = _centro("Hospital B")
        self.pediatria = Especialidad.objects.create(nombre="Pediatría", codigo="pediatria")
        self.cardio = Especialidad.objects.create(nombre="Cardiología", codigo="cardiologia")
        CentroEspecialidad.objects.create(centro=self.centro_a, especialidad=self.pediatria)
        CentroEspecialidad.objects.create(centro=self.centro_a, especialidad=self.cardio, activo=False)

        self.admin = _usuario("admin@test.com", Rol.ADMIN)
        self.operador_a = _usuario("op.a@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_a)
        self.operador_b = _usuario("op.b@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_b)
        self.medico_b = _usuario(
            "med.b@test.com", Rol.MEDICO, centro=self.centro_b,
            medico=Medico.objects.create(nombre="Dr. B"),
        )
        self.paciente = _usuario("pac@test.com", Rol.PACIENTE)

    def _como(self, user):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
        )

    def _alta_medico(self, **extra):
        datos = {
            "email": "Nueva.Medica@Test.com",
            "nombre": "Ana María López",
            "rol": "MEDICO",
            "centro_id": self.centro_a.id,
            "matricula": "MP 1234",
            "especialidad_ids": [self.pediatria.id],
        }
        datos.update(extra)
        return self.client.post(URL, datos, format="json")

    # ── Alta y login ───────────────────────────────────────────────────────
    def test_medico_creado_puede_loguearse_y_me_devuelve_ficha(self):
        self._como(self.admin)
        response = self._alta_medico()
        self.assertEqual(response.status_code, 201, response.data)
        password = response.data["password_temporal"]
        self.assertEqual(response.data["email"], "nueva.medica@test.com")
        self.assertEqual(response.data["especialidades"], [{"id": self.pediatria.id, "nombre": "Pediatría"}])

        medico = Medico.objects.get(pk=response.data["medico_id"])
        self.assertEqual(medico.nombre, "Ana María López")
        self.assertEqual(medico.matricula, "MP 1234")
        self.assertTrue(
            AsignacionMedico.objects.filter(
                medico=medico, centro=self.centro_a, especialidad=self.pediatria, activo=True
            ).exists()
        )

        self.client.credentials()
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "nueva.medica@test.com", "password": password},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access_token']}")
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.data["rol"], "MEDICO")
        self.assertEqual(me.data["medico_id"], medico.id)
        self.assertEqual(me.data["centro_id"], self.centro_a.id)

    def test_alta_operador_con_password_propia(self):
        self._como(self.admin)
        response = self.client.post(
            URL,
            {
                "email": "op.nuevo@test.com",
                "nombre": "Carlos Pérez",
                "rol": "OPERADOR_CENTRO",
                "centro_id": self.centro_b.id,
                "password": "Guardia-2026!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn("password_temporal", response.data)
        self.assertIsNone(response.data["medico_id"])
        user = User.objects.get(email="op.nuevo@test.com")
        self.assertTrue(user.check_password("Guardia-2026!"))

    def test_vincula_ficha_de_medico_existente(self):
        ficha = Medico.objects.create(nombre="Dr. Sin Cuenta", matricula="MN 1")
        self._como(self.admin)
        response = self._alta_medico(medico_id=ficha.id, matricula="")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["medico_id"], ficha.id)
        self.assertEqual(response.data["matricula"], "MN 1")

    def test_no_vincula_ficha_que_ya_tiene_cuenta(self):
        self._como(self.admin)
        response = self._alta_medico(medico_id=self.medico_b.perfil.medico_id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("medico_id", response.data["error"]["detalles"])

    # ── Validaciones por campo ─────────────────────────────────────────────
    def test_email_unico(self):
        self._como(self.admin)
        response = self._alta_medico(email="MED.B@test.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data["error"]["detalles"])

    def test_errores_por_campo(self):
        self._como(self.admin)
        casos = [
            ({"email": "no-es-email"}, "email"),
            ({"rol": "ADMIN"}, "rol"),
            ({"rol": "PACIENTE"}, "rol"),
            ({"centro_id": 9999}, "centro_id"),
            ({"centro_id": None}, "centro_id"),
            ({"password": "123"}, "password"),
            ({"especialidad_ids": [self.cardio.id]}, "especialidad_ids"),
            ({"nombre": "  "}, "nombre"),
        ]
        for extra, campo in casos:
            with self.subTest(campo=campo, extra=extra):
                response = self._alta_medico(**extra)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(campo, response.data["error"]["detalles"])
        # Ninguna alta fallida dejó usuarios o fichas a medio crear
        self.assertFalse(User.objects.filter(email="nueva.medica@test.com").exists())
        self.assertFalse(Medico.objects.filter(nombre="Ana María López").exists())

    # ── Alcance por rol ────────────────────────────────────────────────────
    def test_paciente_y_anonimo_sin_acceso(self):
        self.assertIn(self.client.get(URL).status_code, (401, 403))
        self._como(self.paciente)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_operador_registra_medico_en_su_centro(self):
        self._como(self.operador_a)
        response = self._alta_medico(centro_id=None)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["centro_id"], self.centro_a.id)

    def test_operador_no_crea_operadores_ni_en_otro_centro(self):
        self._como(self.operador_a)
        self.assertEqual(self._alta_medico(rol="OPERADOR_CENTRO").status_code, 403)
        self.assertEqual(self._alta_medico(centro_id=self.centro_b.id).status_code, 403)

    def test_operador_solo_lista_medicos_de_su_centro(self):
        _usuario("med.a@test.com", Rol.MEDICO, centro=self.centro_a,
                 medico=Medico.objects.create(nombre="Dr. A"))
        self._como(self.operador_a)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([u["email"] for u in response.data["results"]], ["med.a@test.com"])

    def test_operador_no_toca_usuarios_de_otro_centro(self):
        self._como(self.operador_a)
        detalle = f"{URL}{self.medico_b.id}/"
        self.assertEqual(self.client.get(detalle).status_code, 403)
        self.assertEqual(
            self.client.patch(detalle, {"activo": False}, format="json").status_code, 403
        )
        self.assertEqual(self.client.post(f"{detalle}reset-password/").status_code, 403)
        self.medico_b.refresh_from_db()
        self.assertTrue(self.medico_b.is_active)

    def test_operador_no_toca_a_otro_operador(self):
        self._como(self.operador_a)
        otro = _usuario("op.a2@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_a)
        self.assertEqual(self.client.get(f"{URL}{otro.id}/").status_code, 403)

    def test_operador_no_cambia_rol_ni_centro(self):
        medico_a = _usuario("med.a@test.com", Rol.MEDICO, centro=self.centro_a,
                            medico=Medico.objects.create(nombre="Dr. A"))
        self._como(self.operador_a)
        detalle = f"{URL}{medico_a.id}/"
        self.assertEqual(
            self.client.patch(detalle, {"rol": "OPERADOR_CENTRO"}, format="json").status_code, 403
        )
        self.assertEqual(
            self.client.patch(detalle, {"centro_id": self.centro_b.id}, format="json").status_code, 403
        )
        ok = self.client.patch(detalle, {"nombre": "Dr. Alberto A", "matricula": "MP 9"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["nombre"], "Dr. Alberto A")
        self.assertEqual(Medico.objects.get(pk=ok.data["medico_id"]).nombre, "Dr. Alberto A")

    # ── Listado (admin) ────────────────────────────────────────────────────
    def test_admin_lista_personal_con_filtros(self):
        self._como(self.admin)
        response = self.client.get(URL)
        emails = {u["email"] for u in response.data["results"]}
        self.assertNotIn("pac@test.com", emails)
        self.assertEqual(emails, {"admin@test.com", "op.a@test.com", "op.b@test.com", "med.b@test.com"})

        casos = {
            "?rol=MEDICO": {"med.b@test.com"},
            f"?centro_id={self.centro_b.id}": {"op.b@test.com", "med.b@test.com"},
            "?q=op.a": {"op.a@test.com"},
        }
        for query, esperado in casos.items():
            with self.subTest(query=query):
                data = self.client.get(URL + query).data
                self.assertEqual({u["email"] for u in data["results"]}, esperado)

        self.assertEqual(self.client.get(URL + "?rol=JEFE").status_code, 400)

    # ── Edición / desactivación / reset ────────────────────────────────────
    def test_desactivar_invalida_login_y_tokens(self):
        token_previo = RefreshToken.for_user(self.medico_b).access_token
        self._como(self.admin)
        response = self.client.patch(f"{URL}{self.medico_b.id}/", {"activo": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["activo"])

        self.client.credentials()
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "med.b@test.com", "password": "pass"}, format="json"
        )
        self.assertEqual(login.status_code, 401)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_previo}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

        self.client.credentials()
        self._como(self.admin)
        response = self.client.get(URL + "?activo=false")
        self.assertEqual([u["email"] for u in response.data["results"]], ["med.b@test.com"])

    def test_admin_mueve_usuario_de_centro_y_cambia_rol(self):
        self._como(self.admin)
        response = self.client.patch(
            f"{URL}{self.operador_b.id}/",
            {"centro_id": self.centro_a.id, "rol": "MEDICO", "matricula": "MP 77"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["centro_id"], self.centro_a.id)
        self.assertEqual(response.data["rol"], "MEDICO")
        self.assertIsNotNone(response.data["medico_id"])
        self.assertEqual(response.data["matricula"], "MP 77")

    def test_admin_no_se_desactiva_a_si_mismo(self):
        self._como(self.admin)
        response = self.client.patch(f"{URL}{self.admin.id}/", {"activo": False}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("activo", response.data["error"]["detalles"])

    def test_reset_password_genera_temporal(self):
        self._como(self.operador_b)
        response = self.client.post(f"{URL}{self.medico_b.id}/reset-password/")
        self.assertEqual(response.status_code, 200)
        nueva = response.data["password_temporal"]
        self.assertGreaterEqual(len(nueva), 12)
        self.medico_b.refresh_from_db()
        self.assertTrue(self.medico_b.check_password(nueva))
        self.assertFalse(self.medico_b.check_password("pass"))

    def test_login_registra_ultimo_acceso(self):
        self.assertIsNone(self.medico_b.last_login)
        self.client.post(
            "/api/v1/auth/login/", {"email": "med.b@test.com", "password": "pass"}, format="json"
        )
        self._como(self.admin)
        data = self.client.get(f"{URL}{self.medico_b.id}/").data
        self.assertIsNotNone(data["ultimo_acceso"])
