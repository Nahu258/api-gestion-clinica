import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { USUARIOS } from './helpers'

/**
 * 06 — Accesibilidad digital (consigna AE4): contraste mínimo 4.5:1,
 * <label for> asociado a cada campo y navegación completa por teclado.
 */
const REGLAS = ['color-contrast', 'label', 'button-name', 'link-name', 'image-alt']

for (const ruta of ['/', '/ingreso']) {
  test(`axe: ${ruta} sin violaciones de contraste ni etiquetas`, async ({ page }) => {
    await page.goto(ruta)
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withRules(REGLAS).analyze()
    const resumen = violations.map((v) => `${v.id}: ${v.nodes.length} nodo(s) — ${v.help}`)
    expect(resumen, resumen.join('\n')).toEqual([])
  })
}

test('el ingreso se completa solo con teclado', async ({ page }) => {
  await page.goto('/ingreso')
  const email = page.getByLabel('Email')
  await email.focus()
  await page.keyboard.type(USUARIOS.paciente.email)
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Contraseña')).toBeFocused()
  await page.keyboard.type(USUARIOS.paciente.password)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/mi-historial/)
})
