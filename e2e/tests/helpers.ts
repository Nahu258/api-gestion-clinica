import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'

/** Usuarios que carga `python manage.py seed_demo`. */
export const USUARIOS = {
  admin: { email: 'admin@emergenciaya.com.ar', password: 'Admin2026!' },
  operador: { email: 'administracion@boratti.com.ar', password: 'Boratti2026!' },
  medicoClinica: { email: 'federico.sosa@boratti.com.ar', password: 'Medico2026!' },
  paciente: { email: 'camila.benitez@gmail.com', password: 'Paciente2026!' },
  pacienteRocio: { email: 'rocio.alegre@gmail.com', password: 'Paciente2026!' },
  pacienteJorge: { email: 'jorge.szymanski@gmail.com', password: 'Paciente2026!' },
} as const

export type Credenciales = { email: string; password: string }

/** Ingresa por la pantalla /ingreso con email y contraseña. */
export async function ingresar(page: Page, { email, password }: Credenciales) {
  await page.goto('/ingreso')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/ingreso/)
}

/** Abre un navegador aislado (otro actor del sistema) ya logueado. */
export async function nuevoActor(browser: Browser, credenciales: Credenciales) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await ingresar(page, credenciales)
  return { context, page }
}

/** Obtiene un JWT por la API, para las pruebas de seguridad. */
export async function tokenDe(request: APIRequestContext, { email, password }: Credenciales) {
  const res = await request.post('/api/v1/auth/login/', { data: { email, password } })
  expect(res.status(), `login de ${email}`).toBe(200)
  const body = await res.json()
  return body.access_token as string
}

/** Texto único para encontrar "nuestra" solicitud entre las de la demo. */
export function marcaUnica(prefijo: string) {
  return `${prefijo} [E2E ${Date.now().toString(36)}]`
}

/** Operador: encuentra la solicitud en su bandeja y la deriva a Sosa (Clínica Médica). */
export async function operadorDeriva(p: Page, motivo: string, notas: string) {
  await expect(p).toHaveURL(/\/panel-centro/)
  const fila = p.locator('article.ui-row', { hasText: motivo })
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Derivar' }).click()
  const dialogo = p.getByRole('dialog', { name: 'Derivar a especialista' })
  await dialogo.getByLabel('Especialidad').selectOption({ label: 'Clínica Médica' })
  const sosa = dialogo.getByLabel('Médico').locator('option', { hasText: 'Sosa' })
  await expect(sosa).toHaveCount(1)
  await dialogo.getByLabel('Médico').selectOption((await sosa.getAttribute('value'))!)
  await dialogo.getByLabel('Notas de triage').fill(notas)
  await dialogo.getByRole('button', { name: 'Derivar', exact: true }).click()
  await expect(dialogo).toBeHidden()
}

/** Médico: llama al paciente y cierra la consulta con diagnóstico. */
export async function medicoAtiende(p: Page, motivo: string, diagnostico: string, indicaciones: string) {
  await expect(p).toHaveURL(/\/portal-medico/)
  const fila = p.locator('article.ui-row', { hasText: motivo })
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Llamar' }).click()
  await expect(p).toHaveURL(/\/portal-medico\/atencion\/\d+/)
  await p.getByLabel('Diagnóstico (obligatorio)').fill(diagnostico)
  await p.getByLabel('Indicaciones y pautas de alarma').fill(indicaciones)
  await p.getByRole('button', { name: 'Finalizar atención' }).click()
  await expect(p.getByRole('dialog', { name: 'Atención finalizada' })).toBeVisible()
}
