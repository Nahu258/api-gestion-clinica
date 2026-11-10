import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de sistema (E2E) de EmergenciaYA.
 *
 * Corren contra el stack completo (frontend + API + PostgreSQL + Redis + RabbitMQ):
 *   - local:      docker compose up -d --build   →  http://localhost:5173 (default)
 *   - producción: E2E_BASE_URL=https://emergenciaya.duckdns.org npm test
 *
 * DEMO=1 abre el navegador visible y frena cada acción para mostrarlo en el coloquio.
 */
const DEMO = process.env.DEMO === '1'
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',
  // Los recorridos comparten la base de la demo: se corren en serie.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: DEMO ? 180_000 : 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    // Centro de Posadas: el mapa busca guardias cercanas con esta ubicación.
    geolocation: { latitude: -27.3671, longitude: -55.8961 },
    permissions: ['geolocation'],
    headless: !DEMO,
    launchOptions: { slowMo: DEMO ? 700 : 0 },
    viewport: { width: 1366, height: 820 },
    // Evidencia para el portafolio: traza, video y captura de cada prueba.
    trace: 'retain-on-failure',
    video: DEMO ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
})
