"""
AE2 - Coordinacion de la agenda con Redis.

Dos mecanismos:

1) RESERVA TEMPORAL (estado temporal con TTL)
   Cuando alguien elige un horario, se "aparta" por unos minutos mientras
   completa sus datos. Si no confirma, Redis borra la clave solo al vencer
   el TTL y el horario vuelve a quedar libre. No hace falta ningun proceso
   de limpieza.

      turno:hold:<profesional>:<fecha_hora>  ->  <token>   (EX 300)
      turno:hold-token:<token>               ->  <clave del hold>

2) LOCK POR PROFESIONAL (concurrencia)
   Verificar "esta libre?" y despues "guardar" son dos pasos. Si dos pedidos
   llegan juntos, los dos pueden ver el horario libre y guardar ambos.
   El lock hace que, para un mismo profesional, solo un pedido a la vez
   pueda estar entre la verificacion y el guardado.

      turno:lock:<profesional>  ->  <token>   (SET NX EX 10)
"""

import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone as dt_timezone

from core.exceptions import ReglaDeNegocioViolada, ServicioNoDisponible
from core.redis_client import redis_o_503

TTL_RESERVA_TEMPORAL = 300      # 5 minutos para confirmar
TTL_LOCK = 10                   # un lock nunca queda trabado mas de 10 s
ESPERA_MAXIMA_LOCK = 5          # cuanto espera un pedido para tomar el lock


def _normalizar_profesional(profesional: str) -> str:
    return "_".join((profesional or "").lower().split())


def _normalizar_fecha(fecha_hora: datetime) -> str:
    return fecha_hora.astimezone(dt_timezone.utc).replace(microsecond=0).isoformat()


def clave_hold(profesional: str, fecha_hora: datetime) -> str:
    return f"turno:hold:{_normalizar_profesional(profesional)}:{_normalizar_fecha(fecha_hora)}"


# ---------------------------------------------------------------------------
# Reserva temporal
# ---------------------------------------------------------------------------
def crear_reserva_temporal(profesional: str, fecha_hora: datetime) -> dict:
    r = redis_o_503()
    clave = clave_hold(profesional, fecha_hora)
    token = uuid.uuid4().hex

    # SET NX: solo se guarda si la clave NO existe. Es atomico en Redis,
    # asi que si dos personas piden el mismo horario, gana una sola.
    if not r.set(clave, token, nx=True, ex=TTL_RESERVA_TEMPORAL):
        restante = r.ttl(clave)
        raise ReglaDeNegocioViolada(
            f"Ese horario esta reservado temporalmente por otra persona. "
            f"Se libera en {max(restante, 0)} segundos si no se confirma."
        )
    r.set(f"turno:hold-token:{token}", clave, ex=TTL_RESERVA_TEMPORAL)
    return {"token": token, "expira_en_segundos": TTL_RESERVA_TEMPORAL}


def consultar_reserva_temporal(token: str) -> dict | None:
    r = redis_o_503()
    clave = r.get(f"turno:hold-token:{token}")
    if not clave or r.get(clave) != token:
        return None
    return {"token": token, "expira_en_segundos": max(r.ttl(clave), 0)}


def liberar_reserva_temporal(token: str) -> bool:
    r = redis_o_503()
    clave = r.get(f"turno:hold-token:{token}")
    if not clave:
        return False
    if r.get(clave) == token:
        r.delete(clave)
    r.delete(f"turno:hold-token:{token}")
    return True


def verificar_reserva_temporal(profesional: str, fecha_hora: datetime, token: str | None) -> str | None:
    """
    Antes de guardar un turno: si ese horario esta apartado por OTRA persona,
    se rechaza. Devuelve la clave del hold propio (para borrarlo despues).
    """
    r = redis_o_503()
    clave = clave_hold(profesional, fecha_hora)
    dueno = r.get(clave)
    if dueno is None:
        return None
    if dueno != token:
        raise ReglaDeNegocioViolada(
            "Ese horario esta reservado temporalmente por otra persona. "
            "Intente con otro horario o espere a que se libere."
        )
    return clave


def borrar_hold(clave: str | None, token: str | None) -> None:
    if not clave:
        return
    r = redis_o_503()
    r.delete(clave)
    if token:
        r.delete(f"turno:hold-token:{token}")


# ---------------------------------------------------------------------------
# Lock por profesional
# ---------------------------------------------------------------------------
@contextmanager
def lock_de_agenda(profesional: str):
    r = redis_o_503()
    clave = f"turno:lock:{_normalizar_profesional(profesional)}"
    token = uuid.uuid4().hex
    limite = time.monotonic() + ESPERA_MAXIMA_LOCK

    while not r.set(clave, token, nx=True, ex=TTL_LOCK):
        if time.monotonic() > limite:
            raise ServicioNoDisponible(
                "La agenda de este profesional esta ocupada procesando otra "
                "reserva. Reintente en unos segundos."
            )
        time.sleep(0.05)

    try:
        yield
    finally:
        # Solo se borra si el lock sigue siendo nuestro (pudo vencer el TTL).
        if r.get(clave) == token:
            r.delete(clave)
