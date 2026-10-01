# AE2 — Módulo Turnos (juan30871)

Rama: `ae2/juan30871` · Base: versión entregada del AE1 (`main`, commit `8ebf707`).

## Qué se agregó

| Requerimiento | Cómo se resolvió | Dónde está |
|---|---|---|
| Reserva temporal que se libera sola | Redis `SET NX EX 300`: el horario queda apartado 5 minutos. Si no se confirma, Redis borra la clave al vencer el TTL. | `apps/turnos/agenda.py` |
| Evitar doble reserva simultánea | Tres capas: lock en Redis por profesional, verificación de agenda y restricción única en la base. | `agenda.py`, `services.crear_turno`, migración `0002` |
| Evitar turnos duplicados por reintentos | Header `Idempotency-Key`: el resultado se guarda 24 h en Redis y un reintento devuelve la misma respuesta. | `apps/turnos/idempotencia.py` |
| Evento `TurnoReservado` | Se publica en RabbitMQ (exchange `clinica.eventos`, routing key `turno.reservado`) después del commit. | `core/eventos.py` |
| Comprobante PDF con QR | Un worker consume la cola `turnos.comprobantes` y genera el PDF. El QR lleva un código firmado. | `apps/turnos/consumidor.py`, `comprobantes.py` |

## Endpoints nuevos

| Método y ruta | Respuestas |
|---|---|
| `POST /api/v1/turnos/reservas-temporales` | 201 con `token` · 409 ocupado o apartado · 503 Redis caído |
| `GET /api/v1/turnos/reservas-temporales/{token}` | 200 con segundos restantes · 404 vencida |
| `DELETE /api/v1/turnos/reservas-temporales/{token}` | 204 liberada · 404 |
| `POST /api/v1/turnos` (cambios) | Acepta `reserva_token` en el body y el header `Idempotency-Key` · 422 si la clave se reutiliza con otros datos |
| `GET /api/v1/turnos/{id}/comprobante` | 200 PDF · 404 si todavía no se generó |

## Flujo

```
Cliente ──POST /reservas-temporales──> API ──SET NX EX 300──> Redis
Cliente ──POST /turnos + token + Idempotency-Key──> API
        API: lock (Redis) → verifica → INSERT (Postgres, restricción única) → commit
        API ──TurnoReservado──> RabbitMQ ──> cola turnos.comprobantes ──> worker ──> PDF + QR
```

## Decisiones y alternativas

**Concurrencia.** Una alternativa era usar `select_for_update` sobre la base, pero no hay una fila que bloquear, porque el turno todavía no existe. Se eligió un lock en Redis por profesional, que ordena los pedidos, más una **restricción única parcial** en la base (profesional + horario, sin contar los cancelados). La restricción es la garantía final: el test `test_sin_lock_la_restriccion_de_la_base_igual_evita_la_doble_reserva` desactiva el lock y demuestra que la base igual impide el duplicado.

**Idempotencia.** La clave se guarda con una huella (hash) del body:
- Misma clave con otro body: 422.
- Misma clave con el primer pedido todavía en proceso: 409.
- Si el pedido falla (400 o 409), la clave se libera para poder corregir y reintentar.

**Evento síncrono o asíncrono.** Generar el PDF dentro del POST lo haría lento y, si fallara la librería de PDF, se perdería la reserva. Con RabbitMQ la API responde enseguida y el PDF se genera en segundo plano. Si RabbitMQ está caído, la reserva igual se guarda y el error queda en el log. La mejora pendiente es el patrón *outbox* para reintentar esas publicaciones.

**Entrega "al menos una vez".** RabbitMQ puede entregar dos veces el mismo mensaje. El consumidor registra cada `event_id` en Redis (`SET NX`) y descarta los repetidos. Si la generación falla, se reintenta una vez; si vuelve a fallar, el mensaje va a la cola `turnos.comprobantes.dlq` y no se pierde.

## Tests

`apps/turnos/tests_ae2.py`: 27 tests nuevos, más los 17 del AE1.

```
docker compose exec api python manage.py test
```

Los dos tests de concurrencia (10 hilos pidiendo el mismo horario al mismo tiempo) necesitan PostgreSQL. Por eso se corren dentro del contenedor; sin Docker se saltean.

## Demo

```
docker compose exec api python scripts/demo_ae2.py
```

## Fuera del alcance

- Pacientes y médicos como módulo propio: es la parte del otro integrante.
- Patrón outbox para eventos no publicados.
- Autenticación.
