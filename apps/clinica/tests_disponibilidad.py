"""
Tests de Horarios y Disponibilidad en tiempo real con Redis — Épica 4, issue #23 (AE4-13).
"""

from datetime import time
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_usuarios.models import PerfilExtendido
from apps.centros.models import AsignacionMedico, CentroEmergencia, CentroEspecialidad, Especialidad
from apps.clinica.disponibilidad import (
    get_disponibilidad_medico,
    listar_especialistas_disponibles_centro,
    set_disponibilidad_medico,
)
from apps.clinica.models import DisponibilidadMedico, Medico
from core.redis_client import get_redis

User = get_user_model()


class DisponibilidadRedisTests(APITestCase):
    def setUp(self):
        self.redis = get_redis()
        self.redis.flushall()

        # Centro y especialidad
        self.centro = CentroEmergencia.objects.create(
            nombre="Hospital SAMIC Madariaga",
            tipo=CentroEmergencia.Tipo.HOSPITAL,
            direccion="Av. López Torres 1177",
            latitud=-27.371,
            longitud=-55.891,
        )
        self.especialidad = Especialidad.objects.create(
            nombre="Cardiología", codigo="cardiologia"
        )
        CentroEspecialidad.objects.create(centro=self.centro, especialidad=self.especialidad)

        # Médicos
        self.doctor = Medico.objects.create(
            nombre="Dr. René Favaloro",
            matricula="MN1111",
            especialidad=Medico.Especialidad.CARDIOLOGIA,
        )
        self.doctor2 = Medico.objects.create(
            nombre="Dr. House",
            matricula="MN2222",
            especialidad=Medico.Especialidad.CARDIOLOGIA,
        )

        AsignacionMedico.objects.create(
            medico=self.doctor, centro=self.centro, especialidad=self.especialidad
        )
        AsignacionMedico.objects.create(
            medico=self.doctor2, centro=self.centro, especialidad=self.especialidad
        )

        # Usuario doctor con rol MEDICO
        self.user_doctor = User.objects.create_user(
            username="doc@test.com", email="doc@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_doctor,
            rol=PerfilExtendido.Rol.MEDICO,
            centro=self.centro,
            medico=self.doctor,
        )
        self.token_doctor = str(RefreshToken.for_user(self.user_doctor).access_token)

        # Usuario paciente con rol PACIENTE
        self.user_paciente = User.objects.create_user(
            username="pac@test.com", email="pac@test.com", password="pass"
        )
        PerfilExtendido.objects.create(
            usuario=self.user_paciente, rol=PerfilExtendido.Rol.PACIENTE
        )
        self.token_paciente = str(RefreshToken.for_user(self.user_paciente).access_token)

    def test_set_y_get_disponibilidad_en_redis(self):
        """set_disponibilidad_medico guarda en Redis y get_disponibilidad_medico lo recupera."""
        set_disponibilidad_medico(self.doctor.id, "DISPONIBLE")
        estado = get_disponibilidad_medico(self.doctor.id)
        self.assertEqual(estado, "DISPONIBLE")

        set_disponibilidad_medico(self.doctor.id, "EN_ATENCION")
        estado2 = get_disponibilidad_medico(self.doctor.id)
        self.assertEqual(estado2, "EN_ATENCION")

    def test_inferir_de_bd_si_no_esta_en_redis(self):
        """Si no hay clave en Redis, se infiere según el horario de guardia en BD."""
        ahora = timezone.localtime()
        dia_hoy = ahora.weekday()

        # Crear guardia que cubre la hora actual
        DisponibilidadMedico.objects.create(
            medico=self.doctor,
            centro=self.centro,
            dia_semana=dia_hoy,
            hora_inicio=time(0, 0),
            hora_fin=time(23, 59),
            en_guardia_activa=True,
        )

        estado = get_disponibilidad_medico(self.doctor.id, ahora=ahora)
        self.assertEqual(estado, "DISPONIBLE")

        # Otro médico sin guardia -> FUERA_DE_GUARDIA
        estado_sin_guardia = get_disponibilidad_medico(self.doctor2.id, ahora=ahora)
        self.assertEqual(estado_sin_guardia, "FUERA_DE_GUARDIA")

    def test_api_mi_disponibilidad_get_y_patch(self):
        """GET y PATCH /api/v1/medicos/mi-disponibilidad/ para el médico autenticado."""
        url = "/api/v1/medicos/mi-disponibilidad/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_doctor}")

        # PATCH a DISPONIBLE
        res_patch = self.client.patch(url, {"estado": "DISPONIBLE"}, format="json")
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch.data["disponibilidad_actual"], "DISPONIBLE")

        # GET consulta estado
        res_get = self.client.get(url)
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.data["medico_id"], self.doctor.id)
        self.assertEqual(res_get.data["disponibilidad_actual"], "DISPONIBLE")

    def test_api_mi_disponibilidad_deniega_a_paciente(self):
        """PATCH /api/v1/medicos/mi-disponibilidad/ retorna 403 Forbidden para PACIENTE."""
        url = "/api/v1/medicos/mi-disponibilidad/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_paciente}")

        res = self.client.patch(url, {"estado": "DISPONIBLE"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_endpoint_especialistas_disponibles_ordena_por_prioridad(self):
        """
        GET /api/v1/centros/{id}/especialistas-disponibles/
        Muestra médicos con prioridad DISPONIBLE arriba y EN_ATENCION / FUERA_DE_GUARDIA abajo.
        """
        # Doctor 1 está DISPONIBLE
        set_disponibilidad_medico(self.doctor.id, "DISPONIBLE")
        # Doctor 2 está EN_ATENCION
        set_disponibilidad_medico(self.doctor2.id, "EN_ATENCION")

        url = f"/api/v1/centros/{self.centro.id}/especialistas-disponibles/?especialidad_id={self.especialidad.id}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["cantidad"], 2)

        docs = response.data["resultados"]
        # El primero debe ser Dr. René Favaloro con DISPONIBLE y prioritario=True
        self.assertEqual(docs[0]["id"], self.doctor.id)
        self.assertEqual(docs[0]["disponibilidad"], "DISPONIBLE")
        self.assertTrue(docs[0]["prioritario_para_derivar"])

        # El segundo debe ser Dr. House con EN_ATENCION y prioritario=False
        self.assertEqual(docs[1]["id"], self.doctor2.id)
        self.assertEqual(docs[1]["disponibilidad"], "EN_ATENCION")
        self.assertFalse(docs[1]["prioritario_para_derivar"])
