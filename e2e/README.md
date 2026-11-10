# Pruebas de sistema (E2E) — Playwright

Corren contra el stack completo: frontend, API, PostgreSQL, Redis, RabbitMQ y los workers.

```powershell
# 1. Levantar todo (desde la raíz del repo)
docker compose up -d --build

# 2. Instalar una sola vez
cd e2e
npm install
npm run install-browsers

# 3. Correr
npm test                  # toda la suite, sin ventana (~1 min)
npm run demo              # navegador visible y en cámara lenta, graba video
npm run demo:recorrido    # solo el recorrido crítico de 3 actores
npm run report            # abre el reporte HTML con trazas y videos
```

Contra el despliegue: `$env:E2E_BASE_URL="https://emergenciaya.duckdns.org"; npm test`

| Spec | Qué demuestra |
|---|---|
| `01-salud` | La API llega a PostgreSQL, Redis y RabbitMQ; el frontend carga |
| `02-recorrido-invitado` | Recorrido de punta a punta con 3 navegadores: invitado avisa → operador deriva → médico atiende → el seguimiento del paciente se actualiza solo |
| `03-historial-paciente` | El paciente ve su historial y no el de otros |
| `04-roles-y-acceso` | RBAC: cada rol entra a su pantalla y no a las ajenas; login inválido |
| `05-seguridad-api` | JWT en `Authorization`, JWT adulterado → 401, 403 por rol, entrada maliciosa → 400, cabeceras `nosniff` y `DENY` |
| `06-accesibilidad` | axe-core: contraste 4.5:1, `<label for>`, nombres accesibles; login completo solo con teclado |

Los usuarios salen de `python manage.py seed_demo` (el `docker compose` lo corre al arrancar).
