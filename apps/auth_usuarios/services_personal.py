"""
Capa de servicios — Gestión de usuarios del personal.

Épica 5, issue AE5-02 (#32).

Crea y administra cuentas `User` + `PerfilExtendido` de operadores de centro
(administradores de institución) y médicos. Para los médicos además crea o
vincula la ficha `Medico`, de modo que puedan entrar a /portal-medico.

Reglas de alcance:
  - ADMIN: gestiona cualquier usuario de cualquier centro.
  - OPERADOR_CENTRO: sólo médicos de SU centro; no puede crear otros roles
    ni mover usuarios a otro centro.

Esta capa no conoce HTTP: levanta ValidationError (400 por campo),
PermissionDenied (403) o RecursoNoEncontrado (404).
"""

import secrets
import string

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, QuerySet
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.auth_usuarios.models import PerfilExtendido
from apps.auth_usuarios.permissions import obtener_rol_usuario
from core.exceptions import DatosInvalidos, RecursoNoEncontrado

User = get_user_model()

Rol = PerfilExtendido.Rol
ROLES_PERSONAL = (Rol.ADMIN, Rol.OPERADOR_CENTRO, Rol.MEDICO)
ROLES_GESTIONABLES = (Rol.OPERADOR_CENTRO, Rol.MEDICO)

LARGO_PASSWORD_TEMPORAL = 12


# ---------------------------------------------------------------------------
# Alcance del actor
# ---------------------------------------------------------------------------

def es_admin(actor) -> bool:
    return obtener_rol_usuario(actor) == Rol.ADMIN


def centro_del_operador(actor) -> int:
    """Centro del operador autenticado; 403 si no tiene uno asignado."""
    perfil = getattr(actor, "perfil", None)
    centro_id = getattr(perfil, "centro_id", None)
    if not centro_id:
        raise PermissionDenied("Tu cuenta de operador no tiene un centro asignado.")
    return centro_id


def _verificar_alcance(actor, usuario) -> None:
    """403 si el actor no puede gestionar a `usuario`."""
    if es_admin(actor):
        if usuario.is_superuser and not actor.is_superuser:
            raise PermissionDenied("No podés modificar una cuenta de superusuario.")
        return

    perfil = usuario.perfil
    if perfil.rol != Rol.MEDICO or perfil.centro_id != centro_del_operador(actor):
        raise PermissionDenied("Sólo podés gestionar médicos de tu centro.")


# ---------------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------------

def queryset_personal(actor) -> QuerySet:
    """Usuarios del personal visibles para el actor."""
    qs = (
        User.objects.filter(perfil__rol__in=ROLES_PERSONAL)
        .select_related("perfil", "perfil__centro", "perfil__medico")
        .order_by("first_name", "last_name", "email")
    )
    if not es_admin(actor):
        qs = qs.filter(perfil__rol=Rol.MEDICO, perfil__centro_id=centro_del_operador(actor))
    return qs


def listar_personal(actor, params) -> QuerySet:
    """Filtros: rol, centro_id, q (nombre, email, matrícula), activo."""
    from apps.centros.services import _parsear_bool  # noqa: PLC0415

    qs = queryset_personal(actor)

    rol = (params.get("rol") or "").strip().upper()
    if rol:
        if rol not in ROLES_PERSONAL:
            raise DatosInvalidos(
                f"Rol '{rol}' no reconocido. Opciones: {', '.join(ROLES_PERSONAL)}."
            )
        qs = qs.filter(perfil__rol=rol)

    centro_id = (params.get("centro_id") or "").strip()
    if centro_id:
        if not centro_id.isdigit():
            raise DatosInvalidos("'centro_id' debe ser un número entero.")
        qs = qs.filter(perfil__centro_id=int(centro_id))

    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(email__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(perfil__medico__nombre__icontains=q)
            | Q(perfil__medico__matricula__icontains=q)
        )

    activo = params.get("activo")
    if activo not in (None, ""):
        qs = qs.filter(is_active=_parsear_bool(activo, "activo"))

    return qs


def obtener_personal(actor, usuario_id: int):
    """Usuario del personal dentro del alcance del actor (404/403)."""
    usuario = (
        User.objects.filter(pk=usuario_id, perfil__rol__in=ROLES_PERSONAL)
        .select_related("perfil", "perfil__centro", "perfil__medico")
        .first()
    )
    if usuario is None:
        raise RecursoNoEncontrado(f"No existe un usuario del personal con id {usuario_id}.")
    _verificar_alcance(actor, usuario)
    return usuario


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------

def generar_password_temporal() -> str:
    """Contraseña aleatoria con letras y dígitos (garantiza ambos)."""
    alfabeto = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alfabeto) for _ in range(LARGO_PASSWORD_TEMPORAL))
        if any(c.isdigit() for c in password) and any(c.isalpha() for c in password):
            return password


def crear_personal(actor, datos: dict) -> tuple:
    """
    Crea la cuenta del personal. Devuelve (usuario, password_temporal),
    donde password_temporal es None si la contraseña vino en el payload.
    """
    rol = datos["rol"]
    centro_id = datos.get("centro_id")

    if not es_admin(actor):
        if rol != Rol.MEDICO:
            raise PermissionDenied("Un operador sólo puede registrar médicos.")
        propio = centro_del_operador(actor)
        if centro_id and centro_id != propio:
            raise PermissionDenied("Sólo podés registrar médicos en tu centro.")
        centro_id = propio

    if not centro_id:
        raise ValidationError({"centro_id": ["Este campo es requerido."]})
    centro = _obtener_centro(centro_id)

    email = datos["email"].strip().lower()
    _validar_email_unico(email)

    password = datos.get("password") or ""
    password_temporal = None
    if password:
        _validar_password(password)
    else:
        password = password_temporal = generar_password_temporal()

    nombre, apellido = _partir_nombre(datos["nombre"])

    with transaction.atomic():
        usuario = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=nombre,
            last_name=apellido,
        )
        perfil = PerfilExtendido.objects.create(usuario=usuario, rol=rol, centro=centro)

        if rol == Rol.MEDICO:
            perfil.medico = _crear_o_vincular_medico(datos, usuario=usuario)
            perfil.save(update_fields=["medico"])
            _asignar_especialidades(perfil.medico, centro, datos.get("especialidad_ids") or [])

    return usuario, password_temporal


def actualizar_personal(actor, usuario_id: int, datos: dict):
    """Edición parcial: nombre, rol, centro_id, activo, matricula."""
    usuario = obtener_personal(actor, usuario_id)
    perfil = usuario.perfil
    admin = es_admin(actor)

    if "rol" in datos and datos["rol"] != perfil.rol:
        if not admin:
            raise PermissionDenied("Un operador no puede cambiar el rol de un usuario.")
        if perfil.rol == Rol.ADMIN:
            raise ValidationError({"rol": ["No se puede cambiar el rol de un administrador."]})

    if "centro_id" in datos and datos["centro_id"] != perfil.centro_id:
        if not admin:
            raise PermissionDenied("Un operador no puede mover usuarios a otro centro.")

    if datos.get("activo") is False and usuario.pk == actor.pk:
        raise ValidationError({"activo": ["No podés desactivar tu propia cuenta."]})

    with transaction.atomic():
        campos_usuario = []
        if "nombre" in datos:
            usuario.first_name, usuario.last_name = _partir_nombre(datos["nombre"])
            campos_usuario += ["first_name", "last_name"]
        if "activo" in datos:
            usuario.is_active = datos["activo"]
            campos_usuario.append("is_active")
        if campos_usuario:
            usuario.save(update_fields=campos_usuario)

        campos_perfil = []
        if "rol" in datos and datos["rol"] != perfil.rol:
            perfil.rol = datos["rol"]
            campos_perfil.append("rol")
        if "centro_id" in datos and datos["centro_id"] != perfil.centro_id:
            perfil.centro = _obtener_centro(datos["centro_id"]) if datos["centro_id"] else None
            campos_perfil.append("centro")
        if perfil.rol == Rol.MEDICO and perfil.medico_id is None:
            perfil.medico = _crear_o_vincular_medico(datos, usuario=usuario)
            campos_perfil.append("medico")
        if campos_perfil:
            perfil.save(update_fields=campos_perfil)

        if perfil.rol in ROLES_GESTIONABLES and not perfil.centro_id:
            raise ValidationError({"centro_id": ["Operadores y médicos necesitan un centro."]})

        medico = perfil.medico
        if medico is not None:
            campos_medico = []
            if "nombre" in datos:
                medico.nombre = _nombre_completo(usuario)
                campos_medico.append("nombre")
            if "matricula" in datos:
                medico.matricula = datos["matricula"]
                campos_medico.append("matricula")
            if campos_medico:
                medico.save(update_fields=campos_medico)

    return obtener_personal(actor, usuario_id)


def resetear_password(actor, usuario_id: int) -> tuple:
    """Genera una contraseña temporal nueva. Devuelve (usuario, password)."""
    usuario = obtener_personal(actor, usuario_id)
    password = generar_password_temporal()
    usuario.set_password(password)
    usuario.save(update_fields=["password"])
    return usuario, password


# ---------------------------------------------------------------------------
# Representación
# ---------------------------------------------------------------------------

def serializar_personal(usuario, password_temporal: str | None = None) -> dict:
    perfil = usuario.perfil
    centro = perfil.centro
    medico = perfil.medico

    especialidades = []
    if medico is not None and centro is not None:
        especialidades = [
            {"id": a.especialidad_id, "nombre": a.especialidad.nombre}
            for a in medico.asignaciones_centro.filter(centro=centro, activo=True)
            .select_related("especialidad")
            .order_by("especialidad__nombre")
        ]

    datos = {
        "id": usuario.pk,
        "email": usuario.email,
        "nombre": _nombre_completo(usuario),
        "rol": perfil.rol,
        "rol_legible": perfil.get_rol_display(),
        "centro_id": perfil.centro_id,
        "centro_nombre": centro.nombre if centro else "",
        "medico_id": perfil.medico_id,
        "matricula": medico.matricula if medico else "",
        "especialidades": especialidades,
        "activo": usuario.is_active,
        "ultimo_acceso": usuario.last_login,
        "creado_en": usuario.date_joined,
    }
    if password_temporal:
        datos["password_temporal"] = password_temporal
    return datos


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------

def _obtener_centro(centro_id: int):
    from apps.centros.models import CentroEmergencia  # noqa: PLC0415

    centro = CentroEmergencia.objects.filter(pk=centro_id).first()
    if centro is None:
        raise ValidationError({"centro_id": [f"No existe un centro con id {centro_id}."]})
    return centro


def _validar_email_unico(email: str) -> None:
    if User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exists():
        raise ValidationError({"email": ["Ya existe una cuenta con este email."]})


def _validar_password(password: str) -> None:
    try:
        validate_password(password)
    except DjangoValidationError as exc:
        raise ValidationError({"password": list(exc.messages)}) from exc


def _partir_nombre(nombre: str) -> tuple[str, str]:
    partes = nombre.strip().split(" ", 1)
    return partes[0], (partes[1].strip() if len(partes) > 1 else "")


def _nombre_completo(usuario) -> str:
    return f"{usuario.first_name} {usuario.last_name}".strip() or usuario.email


def _crear_o_vincular_medico(datos: dict, usuario):
    """Vincula la ficha `medico_id` (si no tiene cuenta) o crea una nueva."""
    from apps.clinica.models import Medico  # noqa: PLC0415

    medico_id = datos.get("medico_id")
    if medico_id:
        medico = Medico.objects.filter(pk=medico_id).first()
        if medico is None:
            raise ValidationError({"medico_id": [f"No existe un médico con id {medico_id}."]})
        if medico.perfiles.exclude(usuario=usuario).exists():
            raise ValidationError({"medico_id": ["Esa ficha de médico ya tiene una cuenta."]})
        if datos.get("matricula"):
            medico.matricula = datos["matricula"]
            medico.save(update_fields=["matricula"])
        return medico

    return Medico.objects.create(
        nombre=_nombre_completo(usuario),
        matricula=datos.get("matricula", ""),
    )


def _asignar_especialidades(medico, centro, especialidad_ids: list[int]) -> None:
    """Asigna el médico a especialidades ACTIVAS del centro."""
    from apps.centros.models import AsignacionMedico  # noqa: PLC0415
    from apps.centros.services_plantel import (  # noqa: PLC0415
        sincronizar_especialidad_legacy,
        validar_especialidades_activas,
    )

    ids = list(dict.fromkeys(especialidad_ids))
    if not ids:
        return
    validar_especialidades_activas(centro, ids)

    for especialidad_id in ids:
        asignacion, _ = AsignacionMedico.objects.get_or_create(
            medico=medico, centro=centro, especialidad_id=especialidad_id
        )
        if not asignacion.activo:
            asignacion.activo = True
            asignacion.save(update_fields=["activo"])

    sincronizar_especialidad_legacy(medico)
