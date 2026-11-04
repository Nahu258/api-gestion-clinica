"""
Tests de especialidades y plantel médico por institución — Épica 5, AE5-03 (#33).
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.atencion.models import SolicitudAtencion
from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import (
    AsignacionMedico,
    CentroEmergencia,
    CentroEspecialidad,
    Especialidad,
)
from apps.clinica.models import Medico
from core.redis_client import get_redis

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


class BasePlantel(APITestCase):
    def setUp(self):
        get_redis().flushall()
        self.centro_a = _centro("Hospital A")
        self.centro_b = _centro("Hospital B")

        self.pediatria = Especialidad.objects.create(nombre="Pediatría", codigo="pediatria")
        self.trauma = Especialidad.objects.create(nombre="Traumatología", codigo="traumatologia")
        self.neuro = Especialidad.objects.create(nombre="Neurología", codigo="neurologia")
        CentroEspecialidad.objects.create(centro=self.centro_a, especialidad=self.pediatria)
        CentroEspecialidad.objects.create(centro=self.centro_a, especialidad=self.trauma)
        CentroEspecialidad.objects.create(centro=self.centro_b, especialidad=self.pediatria)

        self.medico = Medico.objects.create(nombre="Dra. Sofía", matricula="MN 1")
        AsignacionMedico.objects.create(medico=self.medico, centro=self.centro_a, especialidad=self.pediatria)

        self.admin = _usuario("admin@test.com", Rol.ADMIN)
        self.operador_a = _usuario("op.a@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_a)
        self.operador_b = _usuario("op.b@test.com", Rol.OPERADOR_CENTRO, centro=self.centro_b)
        self.paciente = _usuario("pac@test.com", Rol.PACIENTE)

    def _como(self, user):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
        )


class CatalogoEspecialidadesTests(BasePlantel):
    URL = "/api/v1/especialidades/"

    def test_admin_crea_con_codigo_generado(self):
        self._como(self.admin)
        response = self.client.post(self.URL, {"nombre": "Clínica Médica", "icono": "stethoscope"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["codigo"], "clinica-medica")

    def test_codigo_y_nombre_unicos_por_campo(self):
        self._como(self.admin)
        r1 = self.client.post(self.URL, {"nombre": "Otra", "codigo": "pediatria"}, format="json")
        self.assertEqual(r1.status_code, 400)
        self.assertIn("codigo", r1.data["error"]["detalles"])
        r2 = self.client.post(self.URL, {"nombre": "Pediatría", "codigo": "ped-2"}, format="json")
        self.assertEqual(r2.status_code, 400)
        self.assertIn("nombre", r2.data["error"]["detalles"])
        r3 = self.client.post(self.URL, {"nombre": "Pediatria"}, format="json")  # slug repetido
        self.assertEqual(r3.status_code, 400)
        self.assertIn("codigo", r3.data["error"]["detalles"])

    def test_admin_edita(self):
        self._como(self.admin)
        response = self.client.patch(
            f"{self.URL}{self.neuro.id}/", {"descripcion": "Sistema nervioso"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.neuro.refresh_from_db()
        self.assertEqual(self.neuro.descripcion, "Sistema nervioso")

    def test_listado_con_conteos_y_detalle_con_centros(self):
        self._como(self.operador_a)
        data = {e["codigo"]: e for e in self.client.get(self.URL).data}
        self.assertEqual(data["pediatria"]["centros"], 2)
        self.assertEqual(data["pediatria"]["medicos"], 1)
        self.assertEqual(data["neurologia"]["centros"], 0)

        detalle = self.client.get(f"{self.URL}{self.pediatria.id}/").data
        self.assertEqual(
            {c["centro_nombre"] for c in detalle["centros_detalle"]}, {"Hospital A", "Hospital B"}
        )

    def test_operador_no_crea_ni_edita_catalogo(self):
        self._como(self.operador_a)
        self.assertEqual(self.client.post(self.URL, {"nombre": "X"}, format="json").status_code, 403)
        self.assertEqual(
            self.client.patch(f"{self.URL}{self.neuro.id}/", {"nombre": "Y"}, format="json").status_code, 403
        )

    def test_paciente_sin_acceso(self):
        self._como(self.paciente)
        self.assertEqual(self.client.get(self.URL).status_code, 403)


class EspecialidadesDelCentroTests(BasePlantel):
    def _url(self, centro, esp=None):
        base = f"/api/v1/centros/{centro.id}/especialidades/"
        return f"{base}{esp.id}/" if esp else base

    def test_operador_vincula_especialidad_del_catalogo_en_su_centro(self):
        self._como(self.operador_a)
        response = self.client.post(self._url(self.centro_a), {"especialidad_id": self.neuro.id}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            CentroEspecialidad.objects.filter(centro=self.centro_a, especialidad=self.neuro, activo=True).exists()
        )

    def test_operador_no_crea_especialidad_nueva(self):
        self._como(self.operador_a)
        response = self.client.post(
            self._url(self.centro_a), {"nombre": "Dermatología", "codigo": "dermato"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Especialidad.objects.filter(codigo="dermato").exists())

    def test_operador_de_otro_centro_recibe_403(self):
        self._como(self.operador_b)
        self.assertEqual(
            self.client.post(self._url(self.centro_a), {"especialidad_id": self.neuro.id}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(self._url(self.centro_a, self.trauma), {"activo": False}, format="json").status_code,
            403,
        )
        self.assertEqual(self.client.get(f"/api/v1/centros/{self.centro_a.id}/medicos/").status_code, 403)
        self.assertEqual(self.client.get(self._url(self.centro_a) + "?incluir_inactivas=true").status_code, 403)

    def test_desactivar_la_quita_del_selector_de_derivacion(self):
        self._como(self.operador_a)
        response = self.client.patch(self._url(self.centro_a, self.pediatria), {"activo": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["activo"])

        self.client.credentials()
        publicas = self.client.get(self._url(self.centro_a)).data
        self.assertNotIn("pediatria", [e["codigo"] for e in publicas])

        disponibles = self.client.get(
            f"/api/v1/centros/{self.centro_a.id}/especialistas-disponibles/"
        ).data
        self.assertEqual(disponibles["cantidad"], 0)

        # El operador la sigue viendo (inactiva) en su gestión
        self._como(self.operador_a)
        gestion = {e["codigo"]: e for e in self.client.get(self._url(self.centro_a) + "?incluir_inactivas=true").data}
        self.assertFalse(gestion["pediatria"]["activo"])
        self.assertEqual(gestion["pediatria"]["medicos"], 1)

    def test_desactivar_con_derivaciones_abiertas_devuelve_409(self):
        solicitud = SolicitudAtencion.objects.create(
            centro=self.centro_a,
            especialidad_asignada=self.pediatria,
            medico_asignado=self.medico,
            estado=SolicitudAtencion.Estado.DERIVADO,
        )
        self._como(self.operador_a)
        url = self._url(self.centro_a, self.pediatria)

        response = self.client.patch(url, {"activo": False}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["detalles"]["derivaciones_abiertas"], 1)
        self.assertEqual(response.data["error"]["detalles"]["solicitudes"][0]["id"], solicitud.id)
        self.assertTrue(CentroEspecialidad.objects.get(centro=self.centro_a, especialidad=self.pediatria).activo)

        forzado = self.client.patch(url, {"activo": False, "forzar": True}, format="json")
        self.assertEqual(forzado.status_code, 200)
        self.assertFalse(CentroEspecialidad.objects.get(centro=self.centro_a, especialidad=self.pediatria).activo)

    def test_derivaciones_cerradas_no_bloquean(self):
        SolicitudAtencion.objects.create(
            centro=self.centro_a, especialidad_asignada=self.pediatria,
            estado=SolicitudAtencion.Estado.ATENDIDO,
        )
        self._como(self.operador_a)
        response = self.client.patch(self._url(self.centro_a, self.pediatria), {"activo": False}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_especialidad_no_vinculada_404(self):
        self._como(self.admin)
        response = self.client.patch(self._url(self.centro_a, self.neuro), {"activo": True}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_operador_asigna_doctor_en_su_centro_y_deriva_especialidad_legacy(self):
        self._como(self.operador_a)
        response = self.client.post(
            f"/api/v1/centros/{self.centro_a.id}/especialidades/{self.trauma.id}/doctores/",
            {"nombre": "Dr. Hueso", "matricula": "MP 5"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Medico.objects.get(nombre="Dr. Hueso").especialidad, "traumatologia")


class PlantelMedicoTests(BasePlantel):
    def _url(self, centro, medico=None):
        base = f"/api/v1/centros/{centro.id}/medicos/"
        return f"{base}{medico.id}/" if medico else base

    def test_plantel_agrupado_incluye_inactivos_y_medicos_con_cuenta(self):
        AsignacionMedico.objects.create(
            medico=self.medico, centro=self.centro_a, especialidad=self.trauma, activo=False
        )
        sin_asignacion = Medico.objects.create(nombre="Dr. Recién Registrado")
        _usuario("nuevo@test.com", Rol.MEDICO, centro=self.centro_a, medico=sin_asignacion)
        baja = Medico.objects.create(nombre="Dr. Baja")
        AsignacionMedico.objects.create(medico=baja, centro=self.centro_a, especialidad=self.trauma, activo=False)
        otro_centro = Medico.objects.create(nombre="Dr. Otro Centro")
        AsignacionMedico.objects.create(medico=otro_centro, centro=self.centro_b, especialidad=self.pediatria)

        self._como(self.operador_a)
        response = self.client.get(self._url(self.centro_a))
        self.assertEqual(response.status_code, 200)
        por_nombre = {m["nombre"]: m for m in response.data["resultados"]}
        self.assertEqual(set(por_nombre), {"Dra. Sofía", "Dr. Recién Registrado", "Dr. Baja"})

        sofia = por_nombre["Dra. Sofía"]
        self.assertTrue(sofia["activo"])
        self.assertEqual(
            {(e["nombre"], e["activo"]) for e in sofia["especialidades"]},
            {("Pediatría", True), ("Traumatología", False)},
        )
        self.assertIsNone(sofia["cuenta"])
        self.assertEqual(por_nombre["Dr. Recién Registrado"]["cuenta"]["email"], "nuevo@test.com")
        self.assertFalse(por_nombre["Dr. Baja"]["activo"])

        filtros = {
            "?activo=false": {"Dr. Recién Registrado", "Dr. Baja"},
            f"?especialidad_id={self.pediatria.id}": {"Dra. Sofía"},
            "?q=baja": {"Dr. Baja"},
        }
        for query, esperado in filtros.items():
            with self.subTest(query=query):
                data = self.client.get(self._url(self.centro_a) + query).data
                self.assertEqual({m["nombre"] for m in data["resultados"]}, esperado)

    def test_editar_datos_y_especialidades(self):
        self._como(self.operador_a)
        response = self.client.patch(
            self._url(self.centro_a, self.medico),
            {"nombre": "Dra. Sofía Pérez", "matricula": "MN 2", "especialidad_ids": [self.trauma.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["nombre"], "Dra. Sofía Pérez")
        activas = {e["nombre"] for e in response.data["especialidades"] if e["activo"]}
        self.assertEqual(activas, {"Traumatología"})
        self.medico.refresh_from_db()
        self.assertEqual(self.medico.matricula, "MN 2")
        self.assertEqual(self.medico.especialidad, "traumatologia")
        # La asignación anterior queda como baja lógica (no se borra)
        self.assertTrue(
            AsignacionMedico.objects.filter(
                medico=self.medico, centro=self.centro_a, especialidad=self.pediatria, activo=False
            ).exists()
        )

    def test_no_asigna_especialidad_inactiva_o_ajena(self):
        CentroEspecialidad.objects.filter(centro=self.centro_a, especialidad=self.trauma).update(activo=False)
        self._como(self.operador_a)
        for ids in ([self.trauma.id], [self.neuro.id]):
            with self.subTest(ids=ids):
                response = self.client.patch(
                    self._url(self.centro_a, self.medico), {"especialidad_ids": ids}, format="json"
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("especialidad_ids", response.data["error"]["detalles"])

    def test_baja_del_centro_lo_saca_de_derivacion_y_conserva_historial(self):
        solicitud = SolicitudAtencion.objects.create(
            centro=self.centro_a, medico_asignado=self.medico,
            estado=SolicitudAtencion.Estado.ATENDIDO,
        )
        self._como(self.operador_a)
        response = self.client.patch(self._url(self.centro_a, self.medico), {"activo": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["activo"])

        disponibles = self.client.get(f"/api/v1/centros/{self.centro_a.id}/especialistas-disponibles/").data
        self.assertEqual(disponibles["cantidad"], 0)
        self.assertTrue(SolicitudAtencion.objects.filter(pk=solicitud.pk, medico_asignado=self.medico).exists())

        reactivado = self.client.patch(self._url(self.centro_a, self.medico), {"activo": True}, format="json")
        self.assertTrue(reactivado.data["activo"])

    def test_editar_nombre_sincroniza_cuenta(self):
        user = _usuario("sofia@test.com", Rol.MEDICO, centro=self.centro_a, medico=self.medico)
        self._como(self.admin)
        self.client.patch(self._url(self.centro_a, self.medico), {"nombre": "Sofía Gómez"}, format="json")
        user.refresh_from_db()
        self.assertEqual((user.first_name, user.last_name), ("Sofía", "Gómez"))

    def test_medico_de_otro_centro_404_y_operador_ajeno_403(self):
        self._como(self.operador_a)
        self.assertEqual(self.client.get(self._url(self.centro_b, self.medico)).status_code, 403)
        self._como(self.admin)
        self.assertEqual(self.client.get(self._url(self.centro_b, self.medico)).status_code, 404)
        self._como(self.operador_b)
        self.assertEqual(
            self.client.patch(self._url(self.centro_a, self.medico), {"activo": False}, format="json").status_code,
            403,
        )
        self.assertTrue(AsignacionMedico.objects.get(medico=self.medico, centro=self.centro_a).activo)
