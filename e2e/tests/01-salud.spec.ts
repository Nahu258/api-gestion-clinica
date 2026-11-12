import { test, expect } from '@playwright/test'

/**
 * 01 — Infraestructura: antes de mostrar los recorridos, se verifica que el
 * frontend responde y que la API llega a PostgreSQL, Redis y RabbitMQ.
 */
test.describe('Salud del sistema distribuido', () => {
  test('la API ve la base, Redis y RabbitMQ', async ({ request }) => {
    const res = await request.get('/api/v1/salud')
    expect(res.status()).toBe(200)
    const salud = await res.json()
    expect(salud).toMatchObject({ base_de_datos: 'ok', redis: 'ok', rabbitmq: 'ok' })
  })

  test('el frontend carga la portada', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/EmergenciAPP/i)
    await expect(page.getByRole('link', { name: /ingresar|avisar|guardia/i }).first()).toBeVisible()
  })
})
