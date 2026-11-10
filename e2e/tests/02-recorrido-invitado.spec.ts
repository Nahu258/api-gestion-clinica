import { test, expect } from '@playwright/test'
import { USUARIOS, marcaUnica, nuevoActor } from './helpers'

/**
 * 02 — Recorrido crítico de punta a punta con tres actores, cada uno en su
 * propio navegador (sesiones independientes):
 *
 *   1. Paciente SIN cuenta  → busca la guardia en el mapa y avisa que va en camino.
 *   2. Operador del centro  → ve el aviso en su bandeja (polling) y lo deriva a un médico.
 *   3. Médico de guardia    → lo ve en su cola, lo llama y cierra la consulta con diagnóstico.
 *   4. Paciente             → su pantalla de seguimiento pasa sola a "Atención completada".
 *
 * Por debajo intervienen: REST + JWT/token de invitado, permisos por rol,
 * lock en Redis al derivar, eventos en RabbitMQ y PostgreSQL.
 */
test('invitado avisa, el centro deriva y el médico atiende', async ({ page, browser }) => {
  const motivo = marcaUnica('Dolor fuerte en el tobillo después de una caída')
  const diagnostico = marcaUnica('Esguince de tobillo grado I. Radiografía sin fractura.')

  await test.step('1. El paciente entra sin cuenta y elige el Sanatorio Boratti', async () => {
    await page.goto('/ingreso')
    await page.getByRole('button', { name: 'Continuar sin cuenta' }).click()
    await expect(page).toHaveURL(/\/mapa/)
    await page.getByRole('button', { name: /Ver detalles y avisar a Sanatorio Boratti/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Sanatorio Boratti/ })).toBeVisible()
  })

  await test.step('2. Avisa que va en camino', async () => {
    await page.getByRole('button', { name: /Voy en camino/ }).click()
    const modal = page.getByRole('dialog', { name: 'Avisar que voy en camino' })
    await expect(modal).toBeVisible()
    await modal.locator('#input-motivo-consulta').fill(motivo)
    await modal.getByLabel(/Tu nombre y apellido/).fill('Paciente Demo E2E')
    await modal.getByLabel(/Teléfono de contacto/).fill('3764-000000')
    await modal.getByRole('button', { name: 'Confirmar y enviar aviso' }).click()

    await expect(page).toHaveURL(/\/seguimiento\/\d+/)
    await expect(page.getByRole('heading', { name: 'Aviso enviado al centro de salud' })).toBeVisible()
  })

  // ── Operador del centro (otro navegador) ─────────────────────────────────
  const operador = await nuevoActor(browser, USUARIOS.operador)
  await test.step('3. El operador recibe el aviso y lo deriva a Clínica Médica', async () => {
    const p = operador.page
    await expect(p).toHaveURL(/\/panel-centro/)
    const fila = p.locator('article.ui-row', { hasText: motivo })
    await expect(fila).toBeVisible({ timeout: 20_000 }) // la bandeja se refresca cada 6 s
    await fila.getByRole('button', { name: 'Derivar' }).click()

    const dialogo = p.getByRole('dialog', { name: 'Derivar a especialista' })
    await dialogo.getByLabel('Especialidad').selectOption({ label: 'Clínica Médica' })
    const selectMedico = dialogo.getByLabel('Médico')
    await expect(selectMedico.locator('option', { hasText: 'Sosa' })).toHaveCount(1)
    const valorSosa = await selectMedico.locator('option', { hasText: 'Sosa' }).getAttribute('value')
    await selectMedico.selectOption(valorSosa!)
    await dialogo.getByLabel('Notas de triage').fill('TA 120/80, FC 88. Edema en tobillo derecho.')
    await dialogo.getByRole('button', { name: 'Derivar', exact: true }).click()
    await expect(dialogo).toBeHidden()
  })

  // ── Médico de guardia (otro navegador) ───────────────────────────────────
  const medico = await nuevoActor(browser, USUARIOS.medicoClinica)
  await test.step('4. El médico lo llama y cierra la consulta', async () => {
    const p = medico.page
    await expect(p).toHaveURL(/\/portal-medico/)
    const fila = p.locator('article.ui-row', { hasText: motivo })
    await expect(fila).toBeVisible({ timeout: 20_000 })
    await expect(fila).toContainText('Edema en tobillo derecho')
    await fila.getByRole('button', { name: 'Llamar' }).click()

    await expect(p).toHaveURL(/\/portal-medico\/atencion\/\d+/)
    await p.getByLabel('Diagnóstico (obligatorio)').fill(diagnostico)
    await p.getByLabel('Indicaciones y pautas de alarma').fill('Hielo 20 min cada 4 h. Ibuprofeno 400 mg cada 8 h.')
    await p.getByRole('button', { name: 'Finalizar atención' }).click()
    await expect(p.getByRole('dialog', { name: 'Atención finalizada' })).toBeVisible()
  })

  await test.step('5. El seguimiento del paciente se actualiza solo', async () => {
    await page.bringToFront()
    // La pantalla consulta el estado cada 10 s, sin recargar.
    await expect(page.getByRole('heading', { name: 'Atención médica completada' })).toBeVisible({ timeout: 25_000 })
  })

  await test.step('6. La atención aparece en "Atenciones cerradas" del centro', async () => {
    const p = operador.page
    await p.bringToFront()
    await p.reload()
    await p.getByRole('tab', { name: /Atenciones cerradas/ }).click()
    await expect(p.getByRole('cell', { name: diagnostico })).toBeVisible()
  })

  await operador.context.close()
  await medico.context.close()
})
