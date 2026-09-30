# API RESTful de Gestión de Turnos e Historial Clínico — AE2

**Materia:** Paradigmas y Lenguajes de Programación III — UCP / FAITA
**Stack:** Python 3.13 · Django 6.1 · Django REST Framework 3.18 · SQLite · Redis · RabbitMQ

> **AE1 → AE2.** La versión grupal de AE1 es el commit `8ebf707` de `main`.
> Esta rama (`ae2/nahuel`) es la evolución individual: módulos Clínica y Turnos
> desacoplados, caché con Redis, eventos con RabbitMQ y control de concurrencia.
> Lo nuevo de AE2 está resumido en la sección 5.

## Dominio

Sistema de gestión para un **centro médico**: reserva y seguimiento de turnos
con profesionales de distintas especialidades, y registro del **historial
clínico** del paciente (diagnóstico e indicaciones de cada consulta atendida).

---

## 1. Arranque rápido

### Opción A: Docker (API + consumidor + Redis + RabbitMQ)

```powershell
docker compose up --build
```

Levanta cuatro contenedores, aplica las migraciones y carga datos de ejemplo.
API en <http://localhost:8000/api/v1>; panel de RabbitMQ en
<http://localhost:15672> (usuario y contraseña `guest`).

### Opción B: local, con entorno virtual

Necesitás Redis en `127.0.0.1:6379` y RabbitMQ en `127.0.0.1:5672`. La forma
más simple es levantar solo esos dos con Docker:
`docker compose up redis rabbitmq`.

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_turnos
python manage.py runserver
# en otra terminal: el consumidor de eventos
python manage.py consume_rabbitmq
```

Abrí <http://127.0.0.1:8000/api/v1> y vas a ver el mapa de rutas.

> Si PowerShell bloquea el script de activación, corré una sola vez:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

> **Base de AE1 existente.** La migración `turnos/0002_desacoplar_clinica`
> mueve los pacientes y profesionales de los turnos viejos a las tablas de
> Clínica. Si tu `db.sqlite3` se creó con una versión intermedia de esta rama
> (con la `0001` reescrita), borrala y corré `migrate` de nuevo.

Si Redis o RabbitMQ no están levantados, la API **sigue respondiendo**: el
historial se lee directo de la base y los eventos que no se pueden publicar
quedan registrados en el log.

Comandos útiles:

| Comando | Para qué sirve |
|---|---|
| `python manage.py runserver` | Levanta el servidor |
| `python manage.py consume_rabbitmq` | Consumidor de la cola `eventos_clinica` |
| `python manage.py test` | Corre los 40 tests (no necesitan Redis ni RabbitMQ) |
| `python manage.py makemigrations` | Traduce cambios de `models.py` a migraciones |
| `python manage.py migrate` | Aplica esas migraciones a la base |
| `python manage.py seed_turnos --limpiar` | Recarga pacientes, médicos y turnos de ejemplo |
| `python manage.py createsuperuser` | Crea el usuario del panel `/admin` |

---

## 2. Por qué existe cada archivo

La consigna exige **arquitectura en capas** y prohíbe archivos monolíticos.
La regla es: *cada capa hace una sola cosa y solo conoce a la de abajo*.

```
api-gestion-clinica/
├── manage.py                   ← puerta de entrada a todos los comandos
├── Dockerfile                  ← imagen de la API (y del consumidor)
├── docker-compose.yml          ← API + consumidor + Redis + RabbitMQ
├── .env                        ← configuración que cambia según la máquina
├── .env.example                ← plantilla del .env (esta SÍ va a Git)
├── .gitignore                  ← qué NO subir al repo
├── requirements.txt            ← lista de dependencias
├── db.sqlite3                  ← la base de datos (archivo local)
│
├── config/                     ← CONFIGURACIÓN DEL PROYECTO
│   ├── settings.py             ← lee el .env y configura todo Django
│   ├── urls.py                 ← tabla de ruteo principal (/api/v1/ → apps)
│   └── wsgi.py / asgi.py       ← puntos de entrada para el servidor real
│
├── core/                       ← CÓDIGO TRANSVERSAL (lo usan todas las apps)
│   ├── exceptions.py           ← excepciones de dominio + formato único de error
│   ├── middleware.py           ← middleware que convierte fallos en 500 JSON
│   └── handlers.py             ← respuestas JSON para rutas inexistentes
│
├── apps/                       ← MÓDULOS DE DOMINIO
│   ├── clinica/                ← AE2: dueño de Paciente y Medico
│   │   ├── models.py           ← tablas pacientes y medicos
│   │   └── services.py         ← ÚNICA puerta de entrada para otros módulos
│   └── turnos/
│       ├── models.py           ← CAPA DE DATOS       (cómo se guarda)
│       ├── serializers.py      ← CAPA DE VALIDACIÓN  (JSON ↔ Python)
│       ├── services.py         ← CAPA DE NEGOCIO     (qué hace el sistema)
│       ├── eventos.py          ← AE2: productor y lógica del consumidor (RabbitMQ)
│       ├── views.py            ← CAPA DE CONTROLADOR (traduce HTTP)
│       ├── urls.py             ← CAPA DE RUTAS       (qué URL va a qué vista)
│       ├── admin.py            ← panel de carga manual de datos
│       ├── tests.py            ← pruebas automáticas
│       └── management/commands/
│           ├── seed_turnos.py      ← carga datos de ejemplo
│           └── consume_rabbitmq.py ← AE2: consumidor de la cola
│
└── docs/
    ├── peticiones.http         ← colección de pruebas (extensión REST Client)
    └── coleccion-postman.json  ← la misma colección para Postman
```

### El detalle, capa por capa

**`.env` — Variables de entorno.**
La consigna lo pide explícitamente. Guarda lo que cambia entre tu notebook, la
de tu compañero y un servidor: puerto, modo debug, credenciales.
*Por qué:* si esos valores estuvieran escritos dentro del código, subirías tus
claves a GitHub y tendrías que editar código para cambiar de entorno.
`.env` está en `.gitignore`; lo que se sube es `.env.example` como plantilla.

**`config/settings.py` — Configuración.**
Único lugar que lee el `.env`. Registra las apps instaladas, la cadena de
middleware, la base de datos y la configuración de DRF.
*Por qué:* Django necesita un punto central desde donde descubrir todo.

**`config/urls.py` — Ruteo principal.**
Solo reparte: `/admin/` va al panel, `/api/v1/` se delega a cada app.
*Por qué:* agregar un recurso nuevo mañana (ej. `medicos`) es una línea acá,
no reescribir un archivo gigante.

**`apps/turnos/models.py` — Capa de Datos.**
Una clase de Python = una tabla de la base. Cada atributo = una columna.
Django genera el SQL solo, a través de las migraciones.
*Por qué:* no escribís SQL a mano y la estructura de datos queda versionada en
Git junto al código.

**`apps/turnos/serializers.py` — Capa de Validación.**
Traduce en las dos direcciones: objeto `Turno` → JSON de salida, y JSON de
entrada → datos limpios y validados.
*Por qué:* es donde vive el **400 Bad Request** que pide la consigna. Si falta un
campo o el `paciente_id` no existe, el serializer corta ahí y devuelve el error
indicando exactamente qué campo falló.

**`apps/turnos/services.py` — Capa de Lógica de Negocio.**
Acá está el "qué hace" el sistema: buscar, crear, actualizar, borrar, armar el
historial de un paciente, y las reglas propias de la clínica (un médico no
puede tener dos turnos solapados, una consulta atendida no se borra).
*Por qué:* **esta capa no sabe qué es HTTP.** No recibe `request` ni devuelve
`Response`. Gracias a eso, la misma lógica sirve para la API, para un comando
de consola o para un test, sin tocar una línea. Es lo primero que el profesor
va a mirar para verificar la separación en capas.

**`apps/turnos/views.py` — Capa de Controlador.**
El traductor entre HTTP y tu lógica. Lee la request, le pide al serializer que
valide, delega en `services`, y devuelve el **código de estado y los headers**
correctos.
*Por qué:* está escrito con `APIView` y no con `ModelViewSet` **a propósito**.
Un `ModelViewSet` te resuelve el CRUD entero en 3 líneas mágicas… y después no
podés explicar en el coloquio por qué devuelve 201 ni de dónde sale el header
`Location`. Acá hay un método por cada verbo HTTP y cada `status=` está escrito
a mano y visible.

**`apps/turnos/urls.py` — Capa de Rutas.**
Mapea URL → vista. Usa expresiones regulares con `/?` para que funcionen tanto
`/api/v1/turnos` como `/api/v1/turnos/`.

**`core/exceptions.py` — Errores de dominio + formato único.**
Define excepciones propias (`RecursoNoEncontrado`, `DatosInvalidos`,
`ReglaDeNegocioViolada`) y un *handler* que traduce cualquier error al mismo
JSON:

```json
{ "error": { "codigo": "...", "mensaje": "...", "detalles": {} } }
```

*Por qué:* así `services.py` puede levantar `RecursoNoEncontrado("...")` sin
saber que eso se convierte en un 404. La traducción a HTTP pasa en un solo
lugar, y el front siempre recibe errores con la misma forma.

**`core/middleware.py` — Middleware centralizado de errores.**
Un *middleware* es código que envuelve a **todas** las vistas. Si una vista
revienta con algo que nadie previó (la base se cayó, un `None` inesperado),
este middleware lo atrapa, lo registra en el log con un `id_incidente` y
responde un **500 Internal Server Error** en JSON, en vez del HTML de error de
Django.
*Por qué:* es un requisito explícito de la consigna, y en producción evita
filtrarle el stack trace al cliente.

**`apps/turnos/tests.py` — Pruebas automáticas.**
40 tests que verifican cada código de estado (200, 201, 204, 400, 404, 405,
409, 500), las reglas de negocio y, desde AE2, la caché, los eventos, la
idempotencia del consumidor y el control de concurrencia.
*Por qué:* si algo se rompe media hora antes de la defensa, un
`python manage.py test` te dice qué exactamente. Además es evidencia concreta
de calidad para la rúbrica.

---

## 3. Cómo viaja una request (el circuito completo)

```
   Cliente (Postman / navegador / fetch)
        │  POST /api/v1/turnos  { JSON }
        ▼
   config/urls.py ──────────► ¿qué vista atiende esta URL?
        ▼
   apps/turnos/urls.py ─────► TurnoListaAPIView
        ▼
   views.py  .post()          "soy el controlador"
        │
        ├─► serializers.py    valida el JSON ──✗──► 400 Bad Request
        │                                           (formato de core/exceptions.py)
        ├─► services.py       aplica reglas  ──✗──► 404 / 409
        │        │
        │        └─► models.py ──► INSERT en la base
        ▼
   Response 201 Created + header Location
        │
        └─ si algo explotó sin control ──► core/middleware.py ──► 500 JSON
```

---

## 4. Endpoints implementados

Base: `http://127.0.0.1:8000/api/v1`

| Verbo | Ruta | Éxito | Errores posibles |
|---|---|---|---|
| `GET` | `/turnos` | `200 OK` | `400` filtro inválido |
| `GET` | `/turnos?estado=&especialidad=&buscar=` | `200 OK` | `400` |
| `POST` | `/turnos` | `201 Created` + `Location` | `400` campos o paciente/médico inexistente, `409` médico ocupado |
| `GET` | `/turnos/{id}` | `200 OK` | `404 Not Found` |
| `PUT` | `/turnos/{id}` | `200 OK` | `400`, `404`, `409` médico ocupado, turno atendido o `version` desactualizada |
| `PATCH` | `/turnos/{id}` | `200 OK` | `400`, `404`, `409` (ídem PUT) |
| `DELETE` | `/turnos/{id}` | `204 No Content` | `404`, `409` si está en atención o ya atendido |
| `GET` | `/pacientes/{dni}/historial` | `200 OK` | `400` DNI inválido, `404` paciente inexistente o sin consultas |

Cualquier verbo no soportado devuelve `405 Method Not Allowed`, y cualquier
fallo imprevisto `500 Internal Server Error` — los dos en el mismo formato JSON.

Para probarlos: abrí `docs/peticiones.http` en VS Code con la extensión
**REST Client**, o importá `docs/coleccion-postman.json` en Postman. Los IDs
de los ejemplos son los que crea `seed_turnos` sobre una base nueva.

### Cuerpo de un turno (AE2)

```json
{
  "paciente_id": 1,
  "medico_id": 3,
  "fecha_hora": "2027-03-15T14:00:00-03:00",
  "estado": "pendiente",
  "motivo_consulta": "Control pediatrico anual.",
  "diagnostico": "",
  "indicaciones": "",
  "version": 0
}
```

La respuesta agrega, calculados a partir del módulo Clínica y de solo lectura:
`paciente_nombre`, `medico_nombre`, `especialidad_legible` y `estado_legible`.

> **Cambio de contrato respecto de AE1.** Los campos `paciente_nombre`,
> `paciente_dni`, `paciente_telefono`, `obra_social`, `profesional` y
> `especialidad` ya no se envían: se reemplazan por `paciente_id` y `medico_id`.

### Reglas de negocio

1. Un **médico** no puede tener dos turnos dentro de los mismos 20 minutos
   → `409 Conflict`. Dos médicos distintos **sí** pueden atender a la misma hora.
2. Para marcar un turno como `atendido` hay que cargar el `diagnostico` → `400`.
3. Un turno `atendido` no se puede modificar ni eliminar: ya forma parte del
   historial clínico del paciente → `409 Conflict`.
4. Si el médico es de especialidad `otra`, el `motivo_consulta` es obligatorio → `400`.
5. `paciente_id` y `medico_id` tienen que existir en el módulo Clínica → `400`.
6. `GET /pacientes/{dni}/historial` devuelve **solo** las consultas atendidas,
   de la más reciente a la más antigua.

---

## 5. AE2: arquitectura y comunicación

### Módulos y propiedad de datos

| Módulo | Datos que administra | Cómo accede a datos ajenos |
|---|---|---|
| Clínica (`apps/clinica`) | tablas `pacientes` y `medicos` | — |
| Turnos (`apps/turnos`) | tabla `turnos` (`paciente_id`, `medico_id`, `version`) | Solo por `apps/clinica/services.py`, nunca por sus modelos o tablas |

`Turno` guarda IDs sin `ForeignKey`: el esquema de Turnos no depende del de
Clínica y cada módulo puede pasar a su propia base (AE4) sin cambiar el modelo.
Hoy comparten la instancia SQLite (separación lógica, no física). Al listar,
los nombres de pacientes y médicos se piden a Clínica en bloque (2 consultas
en total, no 3 por turno).

### Eventos (RabbitMQ)

Cola `eventos_clinica`, durable, mensajes JSON persistentes. Cada mensaje
lleva un `evento_id` (UUID) único.

| Evento | Productor | Payload | Consumidor |
|---|---|---|---|
| `TurnoCreado` | `services.crear_turno` | `evento_id`, `turno_id`, `paciente_id`, `medico_id`, `fecha_hora` | — (disponible para notificaciones) |
| `TurnoAtendido` | `services.actualizar_turno`, al pasar a `atendido` | `evento_id`, `turno_id`, `paciente_id`, `diagnostico`, `indicaciones` | `consume_rabbitmq` |
| `TurnoAtendido` externo | otro sistema (ej. consultorio) | ídem | `consume_rabbitmq`: marca el turno como atendido |

Reintentos y fallos:

- Si RabbitMQ no responde al publicar, el error va al log y la request termina
  bien (el turno ya se guardó). No hay outbox: ese evento se pierde.
- El consumidor procesa de a un mensaje (`prefetch_count=1`) y confirma con
  `ack` recién después de procesar.
- Si el procesamiento falla, el mensaje vuelve a la cola una vez (`nack` con
  `requeue`); si falla en la reentrega, se descarta. Un JSON inválido se
  descarta directamente.
- Un mensaje repetido no se aplica dos veces (ver idempotencia).
- El consumidor aplica el evento sin volver a publicarlo.

### Redis

| Clave | Contenido | TTL | Invalidación |
|---|---|---|---|
| `historial_paciente_{dni}` | IDs de los turnos atendidos | 1 h | Se borra cuando un turno de ese paciente pasa a `atendido` |
| `procesado_{evento_id}` | marca de evento procesado | 24 h | Por expiración; se borra si el procesamiento falla |

Si Redis no responde, el historial se consulta directo en la base.

### Concurrencia e idempotencia

- **Edición concurrente de un turno (bloqueo optimista).** Cada turno tiene
  `version`. El guardado es un `UPDATE ... WHERE id = ? AND version = ?` que
  incrementa la versión; si otra request lo modificó antes, no afecta filas y
  la API responde `409`. El cliente puede enviar la `version` que leyó; si no
  la envía, se usa la que tenía el turno al cargarlo.
- **Mensaje repetido.** El consumidor toma la marca `procesado_{evento_id}`
  con `cache.add` (`SET NX` en Redis, atómico): solo un consumidor la obtiene.
  Además, un turno que ya está `atendido` no se vuelve a modificar.

---

## 6. Glosario mínimo de Django

| Término | Qué es |
|---|---|
| **Proyecto** | Todo el conjunto (`config/` + apps). Se crea con `startproject`. |
| **App** | Un módulo con su propio dominio (`apps/turnos`). |
| **Modelo** | Clase Python que representa una tabla. |
| **Migración** | Archivo que registra un cambio en los modelos y sabe aplicarlo al SQL. |
| **ORM** | El traductor Python ↔ SQL. `Turno.objects.filter(...)` en vez de escribir SQL. |
| **Vista (view)** | Función o clase que recibe una request y devuelve una response. |
| **Middleware** | Código que envuelve a todas las vistas (entrada y salida). |
| **Serializer** | Pieza de DRF que valida y convierte JSON ↔ objetos. |
| **QuerySet** | Consulta perezosa a la base; no toca la DB hasta que la recorrés. |

---

## 7. Modelo de ejecución

Este proyecto corre sobre **WSGI**, un modelo **síncrono y bloqueante**, donde
el servidor atiende cada request en un hilo de un pool. Django también soporta
**ASGI** (ya está generado `config/asgi.py`), que habilita vistas `async` y un
modelo **no bloqueante**. En AE2, lo que no necesita bloquear al usuario (los
efectos posteriores a atender un turno) sale del flujo principal por RabbitMQ
y lo procesa un consumidor en otro proceso.

### Nota sobre datos sensibles

El historial clínico es información de salud. Los datos de ejemplo son
ficticios. Autenticación, control de acceso por rol (recepción vs. médico) y
registro de auditoría siguen siendo deuda explícita: quedaron fuera del
alcance de AE2 y se planifican para AE4.
