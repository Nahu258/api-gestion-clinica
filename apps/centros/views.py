"""
CAPA DE CONTROLADORES — Módulo Centros de Emergencia.

Responsabilidad única: leer query params, delegar a services, devolver
el código HTTP y el JSON correctos. Sin lógica de negocio acá adentro.
"""

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import DatosInvalidos
from apps.centros import services
from apps.centros.models import CentroEmergencia
from apps.centros.serializers import CentroEmergenciaSerializer


class CentrosCercanosAPIView(APIView):
    """
    Búsqueda de centros de emergencia por proximidad geográfica.

    GET /api/v1/centros/cercanos/?lat=<float>&lon=<float>[&radio_km=<float>][&tipo=<str>]

    Parámetros de query:
        lat       (requerido) Latitud del usuario, ej. -27.3621
        lon       (requerido) Longitud del usuario, ej. -55.9009
        radio_km  (opcional)  Radio de búsqueda en km. Default: 10. Máximo: 50.
        tipo      (opcional)  Tipo de centro: hospital | upa | same | bomberos | policia | otro

    Respuestas:
        200 OK      Lista de centros dentro del radio, ordenados por distancia.
        400 Bad Request si lat/lon faltan o son inválidos, radio fuera de rango
                        o tipo no reconocido.
    """

    def get(self, request: Request) -> Response:
        lat, lon, radio_km, tipo = self._parsear_params(request)

        resultados = services.buscar_centros_cercanos(
            lat=lat,
            lon=lon,
            radio_km=radio_km,
            tipo=tipo,
        )

        datos = [
            CentroEmergenciaSerializer(centro, context={"distancia_km": distancia}).data
            for centro, distancia in resultados
        ]

        return Response(
            {"cantidad": len(datos), "resultados": datos},
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Helpers privados
    # ------------------------------------------------------------------

    def _parsear_params(self, request: Request) -> tuple:
        """
        Extrae y convierte los query params. Lanza DatosInvalidos (→ 400)
        si alguno obligatorio falta o no es un número válido.
        """
        lat_raw = request.query_params.get("lat")
        lon_raw = request.query_params.get("lon")
        radio_raw = request.query_params.get("radio_km", "10")
        tipo = request.query_params.get("tipo") or None

        if lat_raw is None:
            raise DatosInvalidos("El parámetro 'lat' es obligatorio.")
        if lon_raw is None:
            raise DatosInvalidos("El parámetro 'lon' es obligatorio.")

        try:
            lat = float(lat_raw)
        except ValueError:
            raise DatosInvalidos(f"'lat' debe ser un número decimal. Recibido: '{lat_raw}'.")

        try:
            lon = float(lon_raw)
        except ValueError:
            raise DatosInvalidos(f"'lon' debe ser un número decimal. Recibido: '{lon_raw}'.")

        try:
            radio_km = float(radio_raw)
        except ValueError:
            raise DatosInvalidos(f"'radio_km' debe ser un número decimal. Recibido: '{radio_raw}'.")

        return lat, lon, radio_km, tipo


class CentroDetalleAPIView(APIView):
    """
    Detalle de un centro de emergencia específico por ID.

    GET /api/v1/centros/{id}/
    """

    def get(self, request: Request, pk: int) -> Response:
        try:
            centro = CentroEmergencia.objects.get(pk=pk, activo=True)
        except CentroEmergencia.DoesNotExist:
            return Response(
                {"error": f"Centro de emergencia #{pk} no encontrado o inactivo."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            CentroEmergenciaSerializer(centro).data,
            status=status.HTTP_200_OK,
        )


class CentroEspecialidadesAPIView(APIView):
    """
    GET  /api/v1/centros/{centro_id}/especialidades/[?incluir_inactivas=true]
         Retorna las especialidades activas del centro (público; lo usa el
         selector de derivación). Con `incluir_inactivas=true` (ADMIN u
         operador del centro) devuelve todas, con estado y conteos.

    POST /api/v1/centros/{centro_id}/especialidades/
         Vincula una especialidad del catálogo al centro (ADMIN u operador
         del centro). Crear una especialidad nueva queda reservado a ADMIN.
    """

    def get_permissions(self):
        from core.permissions import IsAdminOOperadorDelCentro

        if self.request.method == "POST":
            return [IsAdminOOperadorDelCentro()]
        return []

    def get(self, request: Request, centro_id: int) -> Response:
        from apps.centros.models import Especialidad
        from apps.centros.serializers import EspecialidadSerializer

        if request.query_params.get("incluir_inactivas", "").lower() in ("true", "1"):
            return self._get_gestion(request, centro_id)

        try:
            centro = CentroEmergencia.objects.get(pk=centro_id, activo=True)
        except CentroEmergencia.DoesNotExist:
            return Response(
                {"error": f"Centro de emergencia #{centro_id} no encontrado o inactivo."},
                status=status.HTTP_404_NOT_FOUND,
            )

        especialidades = Especialidad.objects.filter(
            centros_adheridos__centro=centro,
            centros_adheridos__activo=True,
        ).distinct()
        data = EspecialidadSerializer(especialidades, many=True).data
        return Response(data, status=status.HTTP_200_OK)

    def _get_gestion(self, request: Request, centro_id: int) -> Response:
        from apps.centros import services_plantel
        from core.permissions import IsAdminOOperadorDelCentro

        if not IsAdminOOperadorDelCentro().has_permission(request, self):
            self.permission_denied(request, message=IsAdminOOperadorDelCentro.message)

        centro = services_plantel.obtener_centro(centro_id)
        return Response(
            services_plantel.especialidades_del_centro_gestion(centro),
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request, centro_id: int) -> Response:
        from apps.centros import services_plantel
        from apps.centros.models import Especialidad
        from apps.centros.serializers import (
            CrearEspecialidadCentroSerializer,
            EspecialidadSerializer,
        )
        from core.permissions import obtener_rol_usuario

        centro = services_plantel.obtener_centro(centro_id)

        serializer = CrearEspecialidadCentroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        if not datos.get("especialidad_id") and obtener_rol_usuario(request.user) != "ADMIN":
            self.permission_denied(
                request,
                message=(
                    "Sólo podés vincular especialidades del catálogo. "
                    "Pedile al administrador general que cree la especialidad."
                ),
            )

        if datos.get("especialidad_id"):
            try:
                especialidad = Especialidad.objects.get(pk=datos["especialidad_id"])
            except Especialidad.DoesNotExist:
                return Response(
                    {"error": f"Especialidad #{datos['especialidad_id']} no encontrada."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            especialidad, _ = Especialidad.objects.get_or_create(
                codigo=datos["codigo"],
                defaults={
                    "nombre": datos["nombre"],
                    "descripcion": datos.get("descripcion", ""),
                    "icono": datos.get("icono", ""),
                },
            )

        services_plantel.vincular_especialidad(centro, especialidad)

        return Response(
            EspecialidadSerializer(especialidad).data,
            status=status.HTTP_201_CREATED,
        )


class CentroEspecialidadDoctoresAPIView(APIView):
    """
    GET  /api/v1/centros/{centro_id}/especialidades/{especialidad_id}/doctores/
         Retorna los doctores asignados a ese centro y especialidad.

    POST /api/v1/centros/{centro_id}/especialidades/{especialidad_id}/doctores/
         Asigna o registra un doctor en el centro y especialidad
         (ADMIN u operador del centro).
    """

    def get_permissions(self):
        from core.permissions import IsAdminOOperadorDelCentro

        if self.request.method == "POST":
            return [IsAdminOOperadorDelCentro()]
        return []

    def get(self, request: Request, centro_id: int, especialidad_id: int) -> Response:
        from apps.centros.models import Especialidad, AsignacionMedico
        from apps.centros.serializers import DoctorEspecialidadSerializer

        try:
            centro = CentroEmergencia.objects.get(pk=centro_id, activo=True)
        except CentroEmergencia.DoesNotExist:
            return Response(
                {"error": f"Centro de emergencia #{centro_id} no encontrado o inactivo."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            especialidad = Especialidad.objects.get(pk=especialidad_id)
        except Especialidad.DoesNotExist:
            return Response(
                {"error": f"Especialidad #{especialidad_id} no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        asignaciones = AsignacionMedico.objects.filter(
            centro=centro,
            especialidad=especialidad,
            activo=True,
        ).select_related("medico", "especialidad")

        data = DoctorEspecialidadSerializer(asignaciones, many=True).data
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request: Request, centro_id: int, especialidad_id: int) -> Response:
        from apps.centros.models import Especialidad, CentroEspecialidad, AsignacionMedico
        from apps.centros.serializers import (
            AsignarDoctorSerializer,
            DoctorEspecialidadSerializer,
        )

        try:
            centro = CentroEmergencia.objects.get(pk=centro_id, activo=True)
        except CentroEmergencia.DoesNotExist:
            return Response(
                {"error": f"Centro de emergencia #{centro_id} no encontrado o inactivo."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            especialidad = Especialidad.objects.get(pk=especialidad_id)
        except Especialidad.DoesNotExist:
            return Response(
                {"error": f"Especialidad #{especialidad_id} no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Vincular especialidad al centro si aún no estaba
        CentroEspecialidad.objects.get_or_create(
            centro=centro, especialidad=especialidad, defaults={"activo": True}
        )

        serializer = AsignarDoctorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        if datos.get("medico_id"):
            try:
                from apps.clinica.models import Medico

                medico = Medico.objects.get(pk=datos["medico_id"])
            except Exception:
                return Response(
                    {"error": f"Médico #{datos['medico_id']} no encontrado."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            from apps.clinica.models import Medico

            from apps.centros.services_plantel import especialidad_legacy

            medico = Medico.objects.create(
                nombre=datos["nombre"],
                matricula=datos.get("matricula", ""),
                especialidad=especialidad_legacy(especialidad),
            )

        asignacion, _ = AsignacionMedico.objects.get_or_create(
            medico=medico,
            centro=centro,
            especialidad=especialidad,
        )
        asignacion.activo = True
        asignacion.save(update_fields=["activo"])

        from apps.centros.services_plantel import sincronizar_especialidad_legacy

        sincronizar_especialidad_legacy(medico)

        return Response(
            DoctorEspecialidadSerializer(asignacion).data,
            status=status.HTTP_201_CREATED,
        )


class CentroEspecialistasDisponiblesAPIView(APIView):
    """
    GET /api/v1/centros/{centro_id}/especialistas-disponibles/?especialidad_id=X
    Lista los médicos asignados al centro ordenados por disponibilidad en tiempo real (prioridad DISPONIBLE).
    """

    def get(self, request: Request, centro_id: int) -> Response:
        from apps.centros.models import CentroEmergencia
        from apps.clinica.disponibilidad import listar_especialistas_disponibles_centro

        try:
            centro = CentroEmergencia.objects.get(pk=centro_id, activo=True)
        except CentroEmergencia.DoesNotExist:
            return Response(
                {"error": f"Centro de emergencia #{centro_id} no encontrado o inactivo."},
                status=status.HTTP_404_NOT_FOUND,
            )

        esp_raw = request.query_params.get("especialidad_id")
        especialidad_id = int(esp_raw) if esp_raw and esp_raw.isdigit() else None

        resultados = listar_especialistas_disponibles_centro(
            centro_id=centro.id, especialidad_id=especialidad_id
        )

        return Response(
            {
                "centro_id": centro.id,
                "centro_nombre": centro.nombre,
                "cantidad": len(resultados),
                "resultados": resultados,
            },
            status=status.HTTP_200_OK,
        )


class CentroSolicitudesAPIView(APIView):
    """
    GET /api/v1/centros/{centro_id}/solicitudes/?estado=PENDIENTE,ACEPTADO&modo=solicitud

    Bandeja de emergencias del centro de salud para el operador de guardia.
    Permiso: OPERADOR_CENTRO o ADMIN.
    """

    def get(self, request: Request, centro_id: int) -> Response:
        from apps.atencion.models import SolicitudAtencion
        from apps.atencion.serializers import SolicitudAtencionSerializer
        from core.permissions import IsOperadorCentro

        # Validar permisos
        permiso = IsOperadorCentro()
        if not permiso.has_permission(request, self):
            return Response(
                {"error": "Se requiere rol de Operador de Centro o Administrador."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = SolicitudAtencion.objects.filter(centro_id=centro_id).select_related(
            "centro", "especialidad_asignada", "medico_asignado"
        )

        estado = request.query_params.get("estado")
        if estado:
            estados = [e.strip() for e in estado.split(",") if e.strip()]
            qs = qs.filter(estado__in=estados)

        modo = request.query_params.get("modo")
        if modo:
            qs = qs.filter(modo=modo)

        qs = qs.order_by("-creado_en")
        serializer = SolicitudAtencionSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


