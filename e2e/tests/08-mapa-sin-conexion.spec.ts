import { test, expect, type Page } from '@playwright/test'
import { USUARIOS, ingresar } from './helpers'

/**
 * 08 — El aviso de "Sin conexión" del mapa dice la verdad.
 *
 * El mapa sigue funcionando sin internet (muestra los centros guardados), pero
 * el aviso tiene que aparecer solo cuando corresponde:
 *   - Con la sesión vencida y con internet, el paciente ve los centros reales.
 *   - Sin red: "Sin conexión" y, al volver la red, el aviso desaparece solo.
 *   - Si la API responde con error, el aviso no culpa a la conexión.
 */
const CERCANOS = '**/api/v1/centros/cercanos/**'
const AVISO_SIN_CONEXION = /Sin conexión: se muestran los centros/
const AVISO_ERROR_SERVIDOR = /No pudimos actualizar los centros/

function aviso(page: Page) {
  return page.locator('aside.offline-alert-banner')
}

async function abrirMapaComoInvitado(page: Page) {
  await page.goto('/ingreso')
  await page.getByRole('button', { name: 'Continuar sin cuenta' }).click()
  await expect(page).toHaveURL(/\/mapa/)
}

test('paciente con el token vencido ve los centros reales, sin el aviso de "Sin conexión"', async ({ page }) => {
  await ingresar(page, USUARIOS.paciente)
  // El access token venció mientras la app estaba abierta; el refresh sigue vigente.
  await page.evaluate(() => localStorage.setItem('emergenciaya_jwt', 'token.vencido.x'))

  const respuestas: number[] = []
  page.on('response', (r) => {
    if (r.url().includes('/centros/cercanos/')) respuestas.push(r.status())
  })

  await page.goto('/mapa')
  await expect(page.getByRole('button', { name: /Ver detalles y avisar a Sanatorio Boratti/ })).toBeVisible()
  await expect(aviso(page)).toHaveCount(0)

  // Primero la API rechazó el token vencido y después respondió bien con el renovado.
  expect(respuestas).toContain(401)
  expect(respuestas.at(-1)).toBe(200)
  const jwt = await page.evaluate(() => localStorage.getItem('emergenciaya_jwt'))
  expect(jwt).not.toBe('token.vencido.x')
})

test('sin red muestra "Sin conexión" y el aviso se va solo cuando vuelve la red', async ({ page }) => {
  await page.route(CERCANOS, (route) => route.abort('internetdisconnected'))
  await abrirMapaComoInvitado(page)

  await expect(aviso(page)).toHaveText(AVISO_SIN_CONEXION)
  // Igual se pueden elegir centros: el catálogo de Posadas está en el dispositivo.
  await expect(page.getByRole('button', { name: /Ver detalles y avisar a/ }).first()).toBeVisible()

  // Vuelve la red: el navegador dispara "online" y el mapa recarga los centros reales.
  await page.unroute(CERCANOS)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(aviso(page)).toHaveCount(0)
})

test('si la API responde con error, el aviso no dice "Sin conexión"', async ({ page }) => {
  await page.route(CERCANOS, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"falla"}' }),
  )
  await abrirMapaComoInvitado(page)

  await expect(aviso(page)).toHaveText(AVISO_ERROR_SERVIDOR)
  await expect(page.getByRole('button', { name: /Ver detalles y avisar a/ }).first()).toBeVisible()
})

test('con conexión normal no aparece ningún aviso', async ({ page }) => {
  await abrirMapaComoInvitado(page)
  await expect(page.getByRole('button', { name: /Ver detalles y avisar a Sanatorio Boratti/ })).toBeVisible()
  await expect(aviso(page)).toHaveCount(0)
})
