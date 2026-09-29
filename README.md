# AE1 — API RESTful de Gestión de Turnos e Historial Clínico

**Materia:** Paradigmas y Lenguajes de Programación III — UCP / FAITA
**Stack:** Python 3.13 · Django 6.1 · Django REST Framework 3.18 · SQLite

> **Estado: andamiaje inicial.** Está el esqueleto completo funcionando de punta
> a punta con la entidad principal (`Turno`). Lo que falta es tuyo: el informe
> técnico, el repositorio público propio y las entidades secundarias.

## Dominio

Sistema de gestión para un **centro médico**: reserva y seguimiento de turnos
con profesionales de distintas especialidades, y registro del **historial
clínico** del paciente (diagnóstico e indicaciones de cada consulta atendida).

---

## 1. Arranque rápido

Desde esta carpeta, en la terminal de VS Code (PowerShell):

```powershell
.\venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py seed_turnos
python manage.py runserver
```

Abrí <http://127.0.0.1:8000/api/v1> y vas a ver el mapa de rutas.

> Si PowerShell bloquea el script de activación, corré una sola vez:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

Comandos útiles:

| Comando | Para qué sirve |
|---|---|
| `python manage.py runserver` | Levanta el servidor (toma el puerto de `.env`) |
| `python manage.py test` | Corre los 17 tests automáticos |
| `python manage.py makemigrations` | Traduce cambios de `models.py` a migraciones |
| `python manage.py migrate` | Aplica esas migraciones a la base |
| `python manage.py seed_turnos --limpiar` | Recarga datos de ejemplo |
| `python manage.py createsuperuser` | Crea el usuario del panel `/admin` |

---

## 2. Por qué existe cada archivo

La consigna exige **arquitectura en capas** y prohíbe archivos monolíticos.
La regla es: *cada capa hace una sola cosa y solo conoce a la de abajo*.

```
AE1 - Paradigmas/
├── manage.py                   ← puerta de entrada a todos los comandos
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
│   └── turnos/
│       ├── models.py           ← CAPA DE DATOS       (cómo se guarda)
│       ├── serializers.py      ← CAPA DE VALIDACIÓN  (JSON ↔ Python)
│       ├── services.py         ← CAPA DE NEGOCIO     (qué hace el sistema)
│       ├── views.py            ← CAPA DE CONTROLADOR (traduce HTTP)
│       ├── urls.py             ← CAPA DE RUTAS       (qué URL va a qué vista)
│       ├── admin.py            ← panel de carga manual de datos
│       ├── tests.py            ← pruebas automáticas
│       └── management/commands/seed_turnos.py  ← carga datos de ejemplo
│
└── docs/
    └── peticiones.http         ← colección de pruebas para el live testing
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
*Por qué:* es donde vive el **400 Bad Request** que pide la consigna. Si el DNI
trae letras o falta un campo, el serializer corta ahí y devuelve el error
indicando exactamente qué campo falló.

**`apps/turnos/services.py` — Capa de Lógica de Negocio.**
Acá está el "qué hace" el sistema: buscar, crear, actualizar, borrar, armar el
historial de un paciente, y las reglas propias de la clínica (un profesional no
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
17 tests que verifican cada código de estado (200, 201, 204, 400, 404, 405,
409, 500) y las reglas de negocio.
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
| `POST` | `/turnos` | `201 Created` + `Location` | `400` campos, `409` profesional ocupado |
| `GET` | `/turnos/{id}` | `200 OK` | `404 Not Found` |
| `PUT` | `/turnos/{id}` | `200 OK` | `400`, `404`, `409` |
| `PATCH` | `/turnos/{id}` | `200 OK` | `400`, `404`, `409` |
| `DELETE` | `/turnos/{id}` | `204 No Content` | `404`, `409` si está en atención o ya atendido |
| `GET` | `/pacientes/{dni}/historial` | `200 OK` | `400` DNI inválido, `404` sin consultas |

Cualquier verbo no soportado devuelve `405 Method Not Allowed`, y cualquier
fallo imprevisto `500 Internal Server Error` — los dos en el mismo formato JSON.

Para probarlos: abrí `docs/peticiones.http` en VS Code con la extensión
**REST Client**, o replicá esas mismas peticiones en Postman / Thunder Client.

---

## 5. Modelo de dominio

**Entidad principal del AE1: `Turno`** (la única implementada, como pide la consigna).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | entero | autogenerado |
| `paciente_nombre` | texto (120) | obligatorio, mín. 3 caracteres |
| `paciente_dni` | texto (10) | obligatorio, 7–8 dígitos; se normaliza (`38.444.555` → `38444555`) |
| `paciente_telefono` | texto (30) | obligatorio, mín. 6 dígitos |
| `obra_social` | texto (80) | opcional |
| `profesional` | texto (120) | obligatorio |
| `especialidad` | opciones | `clinica_medica`, `pediatria`, `cardiologia`, `traumatologia`, `ginecologia`, `otra` |
| `fecha_hora` | fecha y hora | obligatorio, debe ser futura al crear |
| `estado` | opciones | `pendiente`, `confirmado`, `en_atencion`, `atendido`, `cancelado`, `ausente` |
| `motivo_consulta` | texto largo | obligatorio si `especialidad = otra` |
| `diagnostico` | texto largo | historial clínico; obligatorio para pasar a `atendido` |
| `indicaciones` | texto largo | historial clínico: tratamiento indicado |
| `creado_en` / `actualizado_en` | fecha y hora | los completa Django solo |

### Reglas de negocio implementadas

1. Un **profesional** no puede tener dos turnos dentro de los mismos 20 minutos
   → `409 Conflict`. Dos profesionales distintos **sí** pueden atender a la misma
   hora: la clínica tiene varios consultorios.
2. Para marcar un turno como `atendido` hay que cargar el `diagnostico`
   → si no, `400 Bad Request`.
3. Un turno `atendido` no se puede modificar ni eliminar: ya forma parte del
   historial clínico del paciente → `409 Conflict`.
4. `GET /pacientes/{dni}/historial` devuelve **solo** las consultas atendidas,
   de la más reciente a la más antigua.

### Entidades del dominio completo

Para describir en el informe y desarrollar en el AE2: `Paciente`, `Medico`,
`Especialidad`, `ObraSocial`, `HistoriaClinica`, `Receta`.

Hoy los datos del paciente y del profesional viven **dentro** de `Turno` a
propósito, para mantener acotado el primer hito. En el AE2 se extraen a sus
propias tablas y `Turno` pasa a tener claves foráneas (`ForeignKey`) hacia
ellas — ese es justamente el "próximo paso" que pide el informe.

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

## 7. Lo que falta para entregar el AE1

- [ ] Crear el **repositorio público propio** en GitHub con nombre representativo
      (ej. `api-gestion-clinica`).
- [ ] Commits semánticos **de los dos integrantes** (`feat:`, `fix:`, `docs:`).
- [ ] Informe técnico en PDF (máx. 2 páginas de cuerpo) con los 9 apartados.
- [ ] Mínimo 4 requerimientos funcionales y 4 no funcionales.
- [ ] Diagrama de capas / entidad-relación / mapa de rutas.
- [ ] Justificar el modelo de ejecución (WSGI síncrono vs. ASGI asíncrono).
- [ ] Capturas del live testing y del historial de commits para el anexo.
- [ ] Subir el PDF a Moodle como `AE1_GrupoX_[Nombres]`.

### Sobre el apartado de concurrencia

Es el punto que más se olvida. Para fundamentarlo: este proyecto corre hoy
sobre **WSGI**, un modelo **síncrono y bloqueante**, donde el servidor atiende
cada request en un hilo de un pool. Django también soporta **ASGI** (ya está
generado `config/asgi.py`), que habilita vistas `async` y un modelo **no
bloqueante**, conveniente cuando hay mucha espera de I/O. Para un CRUD contra
SQLite, WSGI es la elección correcta, y esa es la justificación a escribir.

### Nota sobre datos sensibles

El historial clínico es información de salud. Para el AE1 los datos son
ficticios, pero es un buen argumento para el apartado de **requerimientos no
funcionales**: autenticación, control de acceso por rol (recepción vs. médico)
y registro de auditoría son deuda explícita a resolver en el AE2.

---

## AE2 — Infraestructura con Docker

Rama: `ae2/juan30871`. Se agregan PostgreSQL, Redis y RabbitMQ como contenedores.

### Levantar todo

1. Tener **Docker Desktop** abierto (tiene que decir *Engine running*).
2. Copiar `.env.example` a `.env` (si no existe).
3. Desde la carpeta del proyecto:

```powershell
docker compose up -d --build
docker compose ps
```

| Servicio | Puerto | Para qué |
|---|---|---|
| `api` | 8000 | La API de Django, usando PostgreSQL |
| `postgres` | 5432 | Base de datos |
| `redis` | 6379 | Caché y estado temporal |
| `rabbitmq` | 5672 / 15672 | Mensajería asincrónica / panel web (`guest` / `guest`) |

### Verificar

Abrir <http://localhost:8000/api/v1/salud>. Si todo está conectado responde `200`:

```json
{"base_de_datos": "ok", "motor": "postgresql", "redis": "ok", "rabbitmq": "ok"}
```

Si algún servicio no responde, devuelve `503` e indica cuál falla.

### Comandos útiles

| Comando | Para qué sirve |
|---|---|
| `docker compose up -d` | Levanta los servicios |
| `docker compose logs -f api` | Ver los logs de la API |
| `docker compose exec api python manage.py test` | Correr los tests dentro del contenedor |
| `docker compose exec api python manage.py seed_turnos` | Cargar datos de prueba |
| `docker compose down` | Apagar todo (los datos de Postgres se conservan) |

Sin Docker el proyecto sigue funcionando como en el AE1 (SQLite), porque
`DATABASE_ENGINE=sqlite` es el valor por defecto.
