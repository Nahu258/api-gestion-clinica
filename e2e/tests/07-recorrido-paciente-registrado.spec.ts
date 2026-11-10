import { test, expect } from '@playwright/test'
import { USUARIOS, ingresar, marcaUnica, medicoAtiende, nuevoActor, operadorDeriva, tokenDe } from './helpers'

/**
 * 07 — Segundo recorrido crítico: paciente CON cuenta.
 *
 *   1. Rocío ingresa con su cuenta y avisa al Sanatorio Boratti.
 *   2. Control de propiedad (IDOR/BOLA): ni otro paciente ni un anónimo
 *      pueden leer o cancelar esa solicitud conociendo solo su id.
 *   3. El operador deriva y el médico cierra la consulta (otros navegadores).
 *   4. La atención queda en el historial clínico de Rocío, y no en el de otro.
 */
test('paciente registrado avisa, lo atienden y lo ve en su historial', async ({ page, browser, request }) => {
  const motivo = marcaUnica('Fiebre de 39 °C y dolor de garganta desde ayer')
  const diagnostico = marcaUnica('Faringitis viral. Sin placas ni adenopatías.')
  let solicitudId = ''

  await test.step('1. Rocío ingresa con su cuenta y avisa que va en camino', async () => {
    await ingresar(page, USUARIOS.pacienteRocio)
    await page.goto('/mapa')
    await page.getByRole('button', { name: /Ver detalles y avisar a Sanatorio Boratti/ }).click()
    await page.getByRole('button', { name: /Voy en camino/ }).click()
    const modal = page.getByRole('dialog', { name: 'Avisar que voy en camino' })
    await modal.locator('#input-motivo-consulta').fill(motivo)
    // Con cuenta no se piden datos de invitado: la identidad sale del JWT.
    await expect(modal.getByLabel(/Tu nombre y apellido/)).toHaveCount(0)
    await modal.getByRole('button', { name: 'Confirmar y enviar aviso' }).click()
    await expect(page).toHaveURL(/\/seguimiento\/\d+/)
    solicitudId = page.url().match(/seguimiento\/(\d+)/)![1]
  })

  await test.step('2. Otro paciente y un anónimo no pueden verla ni cancelarla (IDOR/BOLA)', async () => {
    const url = `/api/v1/atencion/solicitudes/${solicitudId}/`
    expect((await request.get(url)).status()).toBe(404)
    const tokenJorge = await tokenDe(request, USUARIOS.pacienteJorge)
    const auth = { Authorization: `Bearer ${tokenJorge}` }
    expect((await request.get(url, { headers: auth })).status()).toBe(404)
    expect((await request.patch(url, { headers: auth, data: { estado: 'cancelado' } })).status()).toBe(404)
    // La dueña sí la ve con su JWT, y sigue activa.
    const tokenRocio = await tokenDe(request, USUARIOS.pacienteRocio)
    const propia = await request.get(url, { headers: { Authorization: `Bearer ${tokenRocio}` } })
    expect(propia.status()).toBe(200)
    expect((await propia.json()).estado).toBe('pendiente')
  })

  const operador = await nuevoActor(browser, USUARIOS.operador)
  await test.step('3. El operador deriva a Clínica Médica', async () => {
    await operadorDeriva(operador.page, motivo, 'T 39,1 °C, FC 96. Orofaringe congestiva.')
  })

  const medico = await nuevoActor(browser, USUARIOS.medicoClinica)
  await test.step('4. El médico la atiende y cierra la consulta', async () => {
    await medicoAtiende(medico.page, motivo, diagnostico, 'Paracetamol 1 g cada 8 h. Control en 48 h.')
  })

  await test.step('5. La atención aparece en el historial clínico de Rocío', async () => {
    await page.bringToFront()
    await page.goto('/mi-historial')
    await expect(page.getByRole('heading', { level: 1, name: 'Mi historial clínico' })).toBeVisible()
    await expect(page.getByText(diagnostico)).toBeVisible()
  })

  await test.step('6. Y no aparece en el historial de otro paciente', async () => {
    const jorge = await nuevoActor(browser, USUARIOS.pacienteJorge)
    await expect(jorge.page.getByRole('heading', { level: 1, name: 'Mi historial clínico' })).toBeVisible()
    await expect(jorge.page.getByText(diagnostico)).toHaveCount(0)
    await jorge.context.close()
  })

  await operador.context.close()
  await medico.context.close()
})
