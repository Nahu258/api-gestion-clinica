/**
 * api/auth.js - Capa de comunicación con el backend de autenticación.
 *
 * Cubre los flujos de la Épica 2:
 *   - Google OAuth2: id_token → JWT propio (POST /api/v1/auth/google/)
 *   - Modo invitado: POST /api/v1/auth/invitado/ → X-Guest-Token
 *
 * Almacenamiento:
 *   - JWT (usuario registrado) → localStorage['emergenciaya_jwt']
 *   - Guest token (invitado)   → sessionStorage['emergenciaya_guest_token']
 */

const API_BASE = '/api/v1'

const KEY_JWT         = 'emergenciaya_jwt'
const KEY_REFRESH     = 'emergenciaya_refresh'
const KEY_GUEST_TOKEN = 'emergenciaya_guest_token'

/**
 * Intercambia el id_token de Google por JWT propios del backend.
 */
export async function loginConGoogle(idToken) {
  const res = await fetch(`${API_BASE}/auth/google/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status} al autenticar con Google.`)
  }

  const data = await res.json()
  localStorage.setItem(KEY_JWT, data.access_token)
  localStorage.setItem(KEY_REFRESH, data.refresh_token)
  return data
}

/**
 * Crea un token de invitado en el backend (Redis, TTL 2h).
 */
export async function loginComoInvitado(nombre = '') {
  try {
    const res = await fetch(`${API_BASE}/auth/invitado/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Error ${res.status} al crear sesión de invitado.`)
    }

    const data = await res.json()
    sessionStorage.setItem(KEY_GUEST_TOKEN, data.token)
    return data
  } catch (err) {
    // Si la API no está disponible o hay error de red, no bloquear al usuario en una emergencia:
    const fallbackToken = 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now()
    sessionStorage.setItem(KEY_GUEST_TOKEN, fallbackToken)
    return { token: fallbackToken, esOffline: true }
  }
}

/**
 * Retorna true si hay una sesión activa (JWT o token de invitado).
 */
export function tieneSessionActiva() {
  return !!(
    localStorage.getItem(KEY_JWT) ||
    sessionStorage.getItem(KEY_GUEST_TOKEN)
  )
}

/**
 * Devuelve el header de autenticación apropiado para requests a la API.
 */
export function getAuthHeaders() {
  const jwt = localStorage.getItem(KEY_JWT)
  if (jwt) return { Authorization: `Bearer ${jwt}` }

  const guestToken = sessionStorage.getItem(KEY_GUEST_TOKEN)
  if (guestToken) return { 'X-Guest-Token': guestToken }

  return {}
}

/**
 * Cierra la sesión actual eliminando todos los tokens almacenados.
 */
export function cerrarSesion() {
  localStorage.removeItem(KEY_JWT)
  localStorage.removeItem(KEY_REFRESH)
  sessionStorage.removeItem(KEY_GUEST_TOKEN)
}
