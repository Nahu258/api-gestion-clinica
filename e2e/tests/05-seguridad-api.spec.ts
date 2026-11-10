import { test, expect } from '@playwright/test'
import { USUARIOS, tokenDe } from './helpers'

/**
 * 05 — Seguridad activa a nivel API (lo que pide la consigna del AE4):
 * JWT por el encabezado Authorization, autorización por rol, validación de
 * entrada y cabeceras de seguridad (nosniff, DENY).
 */
test.describe('Seguridad de la API', () => {
  test('sin JWT, /auth/me responde 401', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me/')
    expect(res.status()).toBe(401)
  })

  test('un JWT adulterado se rechaza con 401', async ({ request }) => {
    const token = await tokenDe(request, USUARIOS.paciente)
    const [header, payload] = token.split('.')
    const res = await request.get('/api/v1/auth/me/', {
      headers: { Authorization: `Bearer ${header}.${payload}.firmaFalsa` },
    })
    expect(res.status()).toBe(401)
  })

  test('el JWT válido viaja en Authorization y devuelve el perfil', async ({ request }) => {
    const token = await tokenDe(request, USUARIOS.paciente)
    const res = await request.get('/api/v1/auth/me/', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status()).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('PACIENTE')
  })

  test('un paciente no accede a endpoints de administración (403)', async ({ request }) => {
    const token = await tokenDe(request, USUARIOS.paciente)
    const auth = { Authorization: `Bearer ${token}` }
    expect((await request.get('/api/v1/admin/resumen/', { headers: auth })).status()).toBe(403)
    expect((await request.get('/api/v1/admin/usuarios/', { headers: auth })).status()).toBe(403)
  })

  test('un paciente no puede derivar solicitudes (403)', async ({ request }) => {
    const token = await tokenDe(request, USUARIOS.paciente)
    const res = await request.post('/api/v1/atencion/solicitudes/1/derivar/', {
      headers: { Authorization: `Bearer ${token}` },
      data: { especialidad_id: 1, medico_id: 1 },
    })
    expect(res.status()).toBe(403)
  })

  test('entrada maliciosa se valida con 400, sin errores 500', async ({ request }) => {
    const res = await request.get("/api/v1/centros/cercanos/?lat=1' OR '1'='1&lon=<script>")
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined() // formato de error unificado
  })

  test('IDOR: una solicitud solo se lee con su código secreto o el JWT del dueño', async ({ request }) => {
    const creada = await request.post('/api/v1/atencion/solicitudes/', {
      data: { centro_id: 1, modo: 'aviso', motivo: 'Prueba IDOR E2E', nombre_invitado: 'IDOR', usuario_id: 1 },
    })
    expect(creada.status()).toBe(201)
    const { id, codigo_seguimiento: codigo, usuario_id } = await creada.json()
    expect(usuario_id).toBeNull() // el usuario_id del cuerpo se ignora: manda el JWT
    const url = `/api/v1/atencion/solicitudes/${id}/`

    // Solo con el id (correlativo, adivinable) no alcanza: 404 para no confirmar que existe.
    expect((await request.get(url)).status()).toBe(404)
    expect((await request.get(url, { headers: { 'X-Codigo-Seguimiento': 'adivinado' } })).status()).toBe(404)
    expect((await request.patch(url, { data: { estado: 'cancelado' } })).status()).toBe(404)

    // Con el código, el invitado la ve y solo puede cancelarla.
    const conCodigo = { 'X-Codigo-Seguimiento': codigo }
    expect((await request.get(url, { headers: conCodigo })).status()).toBe(200)
    expect((await request.patch(url, { headers: conCodigo, data: { estado: 'aceptado' } })).status()).toBe(404)
    expect((await request.patch(url, { headers: conCodigo, data: { estado: 'cancelado' } })).status()).toBe(200)
  })

  test('las respuestas llevan cabeceras nosniff y DENY', async ({ request }) => {
    const res = await request.get('/api/v1/salud')
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(res.headers()['x-frame-options']).toBe('DENY')
  })
})
