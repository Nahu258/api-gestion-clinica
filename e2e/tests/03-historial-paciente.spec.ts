import { test, expect } from '@playwright/test'
import { USUARIOS, ingresar } from './helpers'

/**
 * 03 — Paciente registrado: consulta su historial clínico (servido con caché
 * en Redis) y solo ve sus propias atenciones.
 */
test.describe('Historial clínico del paciente', () => {
  test('ve sus atenciones con diagnóstico e indicaciones', async ({ page }) => {
    await ingresar(page, USUARIOS.paciente)
    await expect(page).toHaveURL(/\/mi-historial/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mi historial clínico' })).toBeVisible()

    // Atenciones de Camila Benítez cargadas por seed_demo
    await expect(page.getByText('Faringoamigdalitis aguda bacteriana.')).toBeVisible()
    await expect(page.getByText(/Quiste ovárico funcional derecho/)).toBeVisible()
  })

  test('no ve atenciones de otros pacientes', async ({ page }) => {
    await ingresar(page, USUARIOS.paciente)
    await expect(page.getByText('Faringoamigdalitis aguda bacteriana.')).toBeVisible()
    // Diagnósticos de Jorge Szymanski (otro paciente)
    await expect(page.getByText(/Angina de pecho estable/)).toHaveCount(0)
    await expect(page.getByText(/Fibrilación auricular/)).toHaveCount(0)
  })
})
