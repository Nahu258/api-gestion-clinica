"""
AE2 - Demostracion del modulo Turnos (juan30871).

Con todo levantado (docker compose up -d), correr:

    docker compose exec api python scripts/demo_ae2.py

Muestra, paso a paso: reserva temporal con TTL, conflicto 409, confirmacion
con token, idempotencia, concurrencia (10 pedidos a la vez) y el comprobante
PDF generado por el worker a traves de RabbitMQ.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta

BASE = os.environ.get("DEMO_URL", "http://localhost:8000/api/v1")
PROFESIONAL = f"Dr. Demo {uuid.uuid4().hex[:4]}"   # uno nuevo en cada corrida


def pedir(metodo, ruta, cuerpo=None, headers=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(
        BASE + ruta, data=datos, method=metodo,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            contenido = r.read()
            return r.status, dict(r.headers), contenido
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def js(contenido):
    try:
        return json.loads(contenido)
    except ValueError:
        return {}


def titulo(texto):
    print(f"\n{'=' * 64}\n{texto}\n{'=' * 64}")


def fecha(horas):
    base = (datetime.now() + timedelta(days=7)).replace(hour=9, minute=0, second=0, microsecond=0)
    return (base + timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%S-03:00")


def turno(fecha_hora, **extra):
    return {
        "paciente_nombre": "Ana Paz", "paciente_dni": "30111222",
        "paciente_telefono": "3764551122", "profesional": PROFESIONAL,
        "especialidad": "clinica_medica", "fecha_hora": fecha_hora, **extra,
    }


def main():
    print(f"Profesional de la demo: {PROFESIONAL}")

    titulo("1) Reserva temporal: se aparta un horario por 5 minutos (Redis TTL)")
    s, _, c = pedir("POST", "/turnos/reservas-temporales",
                    {"profesional": PROFESIONAL, "fecha_hora": fecha(0)})
    reserva = js(c)
    print(s, reserva)
    token = reserva.get("token")

    titulo("2) Otra persona intenta apartar el MISMO horario -> 409")
    s, _, c = pedir("POST", "/turnos/reservas-temporales",
                    {"profesional": PROFESIONAL, "fecha_hora": fecha(0)})
    print(s, js(c).get("error", {}).get("mensaje"))

    titulo("3) Sin el token, nadie puede confirmar ese horario -> 409")
    s, _, c = pedir("POST", "/turnos", turno(fecha(0)))
    print(s, js(c).get("error", {}).get("mensaje"))

    titulo("4) El dueño confirma con su token + Idempotency-Key -> 201")
    clave = str(uuid.uuid4())
    s, h, c = pedir("POST", "/turnos", turno(fecha(0), reserva_token=token),
                    {"Idempotency-Key": clave})
    creado = js(c)
    print(s, "id:", creado.get("id"), "| Idempotent-Replay:", h.get("Idempotent-Replay"))

    titulo("5) Se corta la conexion y el cliente REINTENTA con la misma clave")
    s, h, c = pedir("POST", "/turnos", turno(fecha(0), reserva_token=token),
                    {"Idempotency-Key": clave})
    print(s, "id:", js(c).get("id"), "| Idempotent-Replay:", h.get("Idempotent-Replay"))
    print("-> mismo id: NO se creo un turno duplicado")

    titulo("6) Misma clave con OTROS datos -> 422")
    s, _, c = pedir("POST", "/turnos", turno(fecha(1)), {"Idempotency-Key": clave})
    print(s, js(c).get("error", {}).get("mensaje"))

    titulo("7) Concurrencia: 10 pedidos EXACTAMENTE al mismo tiempo por el mismo horario")
    barrera = threading.Barrier(10)
    codigos = []

    def disparar(i):
        barrera.wait()
        codigos.append(pedir("POST", "/turnos", turno(fecha(2), paciente_dni=f"3011122{i}"))[0])

    hilos = [threading.Thread(target=disparar, args=(i,)) for i in range(10)]
    [h.start() for h in hilos]
    [h.join() for h in hilos]
    print("Codigos:", sorted(codigos))
    print(f"-> {codigos.count(201)} creado, {codigos.count(409)} rechazados con 409")

    titulo("8) Comprobante PDF con QR (lo genera el worker al recibir TurnoReservado)")
    turno_id = creado.get("id")
    for _ in range(10):
        s, h, c = pedir("GET", f"/turnos/{turno_id}/comprobante")
        if s == 200:
            break
        time.sleep(1)
    if s == 200:
        print(s, h.get("Content-Type"), f"{len(c)} bytes")
        print(f"Abrilo en el navegador: http://localhost:8000/api/v1/turnos/{turno_id}/comprobante")
    else:
        print(s, "todavia no se genero: revisar `docker compose logs worker`")


if __name__ == "__main__":
    main()
