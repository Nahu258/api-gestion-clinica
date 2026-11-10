import { test, expect } from '@playwright/test'
import { USUARIOS, ingresar } from './helpers'

/**
 * 04 — Control de acceso por rol (RBAC) visto desde el navegador.
 * Cada rol aterriza en su pantalla y no puede entrar a las de otros.
 */
test.describe('Roles y acceso', () => {
  for (const [rol, credenciales, destino, titulo] of [
    ['superadmin', USUARIOS.admin, /\/admin/, 'Resumen de la red'],
    ['operador de centro', USUARIOS.operador, /\/panel-centro/, 'Sanatorio Boratti'],
    ['médico', USUARIOS.medicoClinica, /\/portal-medico/, /Sosa/],
    ['paciente', USUARIOS.paciente, /\/mi-historial/, 'Mi historial clínico'],
  ] as const) {
    test(`el ${rol} entra a su pantalla de inicio`, async ({ page }) => {
      await ingresar(page, credenciales)
      await expect(page).toHaveURL(destino)
      await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
    })
  }

  test('sin sesión, una ruta protegida redirige al ingreso', async ({ page }) => {
    await page.goto('/portal-medico')
    await expect(page).toHaveURL(/\/ingreso/)
  })

  test('un paciente no puede abrir el panel del centro', async ({ page }) => {
    await ingresar(page, USUARIOS.paciente)
    await page.goto('/panel-centro')
    await expect(page.getByText('No tenés acceso a esta sección')).toBeVisible()
  })

  test('un médico no puede abrir la consola del superadmin', async ({ page }) => {
    await ingresar(page, USUARIOS.medicoClinica)
    await page.goto('/admin')
    await expect(page.getByText('No tenés acceso a esta sección')).toBeVisible()
  })

  test('una contraseña incorrecta muestra un error y no entra', async ({ page }) => {
    await page.goto('/ingreso')
    await page.getByLabel('Email').fill(USUARIOS.paciente.email)
    await page.getByLabel('Contraseña').fill('incorrecta')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/ingreso/)
  })
})
